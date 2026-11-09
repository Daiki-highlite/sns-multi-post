import { env } from "cloudflare:workers";
import twitterText from "twitter-text";
import { member, service, failure, json, runtime, seal } from "@/lib/security";
import { activity, allPosts, database, getPost, metadata, setting } from "@/lib/store";
import { AppError, assertApprovable, importedPosts, makeTargetPayloads, plannedTime, PLATFORMS } from "@/lib/domain";
import { verifyConnection } from "@/lib/providers";
import { configuredDestinations } from "@/lib/destination-settings";
import { readCalendar } from "@/lib/sheets";
import { runDueJobs } from "@/lib/jobs";
import type { CalendarExport, Platform, Post } from "@/lib/types";
import { bulkPlan } from "@/lib/bulk";
export const dynamic = "force-dynamic";
async function body(request: Request) {
  if (Number(request.headers.get("content-length") || 0) > 5000000) throw new AppError("ファイルは5MB以内にしてください。", 413);
  const raw = await request.text(); if (raw.length > 5000000) throw new AppError("ファイルは5MB以内にしてください。", 413);
  try { return JSON.parse(raw); } catch { throw new AppError("入力形式を確認してください。"); }
}
function insert(post: Post) { return database().prepare("INSERT INTO posts(id,source_key,document,revision,version,approved_version,planned_at,updated_at) VALUES(?,?,?,?,?,?,?,?)").bind(post.id, post.sourceKey, JSON.stringify(post), post.revision, post.version, post.approvedVersion, post.plannedAt, post.updatedAt); }
async function importCalendar(data: CalendarExport, apply: boolean, overwrite: Record<string, string>, actor: string) {
  const incoming = importedPosts(data), existing = await allPosts(), byKey = new Map(existing.map(p => [p.sourceKey, p]));
  const added = incoming.filter(p => !byKey.has(p.sourceKey)), changed = incoming.filter(p => byKey.has(p.sourceKey) && byKey.get(p.sourceKey)!.sourceHash !== p.sourceHash);
  if (!apply) return { added: added.length, unchanged: incoming.length - added.length - changed.length, changed: changed.map(p => { const old = byKey.get(p.sourceKey)!; return { id: old.id, title: old.title, revision: old.revision, approved: old.approvedVersion !== null }; }), data };
  const db = database(); let updated = 0, skipped = 0;
  for (let i = 0; i < added.length; i += 30) await db.batch(added.slice(i, i + 30).map(insert));
  for (const p of changed) {
    const old = byKey.get(p.sourceKey)!;
    if (overwrite[old.id] !== old.revision || old.approvedVersion !== null || old.targets?.some(t => ["sending", "published", "unknown"].includes(t.state))) { skipped++; continue; }
    const next = { ...p, id: old.id, mediaIds: old.mediaIds, createdAt: old.createdAt, version: old.version + 1 };
    const res = await db.prepare("UPDATE posts SET document=?,revision=?,version=?,planned_at=?,updated_at=? WHERE id=? AND revision=? AND approved_version IS NULL").bind(JSON.stringify(next), next.revision, next.version, next.plannedAt, next.updatedAt, old.id, old.revision).run();
    if (res.meta.changes) updated++; else skipped++;
  }
  await setting("lastImportAt", new Date().toISOString()); await setting("importedCount", incoming.length); await setting("spreadsheetId", data.spreadsheetId); await setting("tabs", data.tabs.map(t => ({ name: t.name, sheetId: t.sheetId })));
  await activity("imported", actor, `${added.length}件を追加、${updated}件を更新しました。`); return { added: added.length, updated, skipped, importedIds: incoming.map(p=>byKey.get(p.sourceKey)?.id||p.id) };
}
async function api(request: Request) {
 try {
  const path = new URL(request.url).pathname.replace(/^\/api\//, ""), method = request.method;
  if (path === "jobs/run" && method === "POST") { service(request); return json(await runDueJobs()); }
  if (path === "bootstrap" && method === "POST") { service(request); const n = await database().prepare("SELECT count(*) AS n FROM posts").first<{ n: number }>(); if (n?.n) throw new AppError("初回取り込みは完了しています。", 409); return json(await importCalendar(await body(request), true, {}, "初回取り込み")); }
  const user = await member(request), actor = user.displayName;
  if (path === "state" && method === "GET") return json({ posts: await allPosts(), ...await metadata(), destinations:configuredDestinations(), user: { displayName: actor, email: user.email }, sheetsReady: !!runtime("GOOGLE_SERVICE_ACCOUNT_EMAIL") && !!runtime("GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY"), schedulerReady: runtime("SCHEDULER_ENABLED") === "true" });
  if (path === "import" && method === "POST") { const input = await body(request); return json(await importCalendar(input.data, input.apply === true, input.overwrite ?? {}, actor)); }
  if (path === "sheets/read" && method === "POST") { const input = await body(request); return json(await importCalendar(await readCalendar(input.spreadsheetId, input.tabs), false, {}, actor)); }
  if (path === "posts/bulk" && method === "POST") {
    const input=await body(request);
    if(!["draft","approve"].includes(input.mode))throw new AppError("登録方法を選んでください。");
    const db=database(),plan=bulkPlan(await allPosts(),input.options);
    if(input.mode==="approve"&&!input.allowIncomplete&&plan.some(p=>p.errors.length))throw new AppError("確認が必要な原稿があります。下書きに残すか、共通設定を見直してください。");
    const connections=await db.prepare("SELECT platform,account_id FROM connections").all<{platform:Platform;account_id:string}>();
    const accounts=Object.fromEntries(connections.results.map(c=>[c.platform,c.account_id]));
    if(input.mode==="approve"&&input.options.platforms.some((p:Platform)=>(input.destinations?.[p]||"")!==(accounts[p]||"")))throw new AppError("投稿先が変更されました。再読み込みして確認してください。",409);
    const mediaIds=[...new Set<string>(plan.flatMap(p=>p.draft.mediaIds))];
    if(mediaIds.length){const known=await db.prepare("SELECT id FROM media").all<{id:string}>();const valid=new Set(known.results.map(m=>m.id));if(mediaIds.some(id=>!valid.has(id)))throw new AppError("選択した画像が見つかりません。画像を選び直してください。");}
    let approved=0,saved=0,drafts=0;const skipped:{id:string;title:string;reason:string}[]=[];
    for(const entry of plan){
      if(!entry.canSave){skipped.push({id:entry.original.id,title:entry.original.title,reason:entry.errors[0]});continue;}
      const isApproval=input.mode==="approve"&&!entry.errors.length;
      const stamp=new Date().toISOString(),next:Post={...entry.draft,targets:undefined,version:entry.original.version+1,revision:crypto.randomUUID(),approvedVersion:isApproval?entry.original.version+1:null,approvedAt:isApproval?stamp:null,approvedBy:isApproval?actor:null,status:isApproval?"approved":"review",updatedAt:stamp};
      const statements=[db.prepare("UPDATE posts SET document=?,revision=?,version=?,approved_version=?,planned_at=?,updated_at=? WHERE id=? AND revision=? AND approved_version IS NULL AND NOT EXISTS(SELECT 1 FROM targets WHERE post_id=? AND state IN ('sending','published','unknown'))").bind(JSON.stringify(next),next.revision,next.version,next.approvedVersion,next.plannedAt,stamp,next.id,entry.original.revision,next.id),db.prepare("DELETE FROM targets WHERE post_id=? AND EXISTS(SELECT 1 FROM posts WHERE id=? AND revision=?)").bind(next.id,next.id,next.revision)];
      if(isApproval)for(const t of makeTargetPayloads(next,accounts))statements.push(db.prepare("INSERT INTO targets(id,post_id,version,platform,sequence,parent_id,state,scheduled_at,payload,attempts,updated_at) SELECT ?,?,?,?,?,?,'queued',?,?,0,? WHERE EXISTS(SELECT 1 FROM posts WHERE id=? AND revision=?)").bind(t.id,next.id,next.version,t.platform,t.sequence,t.parentId,next.plannedAt,JSON.stringify(t.payload),stamp,next.id,next.revision));
      const results=await db.batch(statements);
      if(!results[0].meta.changes){skipped.push({id:next.id,title:next.title,reason:"他の編集・承認が先に保存されました。"});continue;}
      saved++;if(isApproval)approved++;else drafts++;
    }
    await activity(input.mode==="approve"?"approved":"edited",actor,`一括登録：${approved}件を承認、${drafts}件を下書き保存、${skipped.length}件を保留しました。`);
    return json({approved,saved,drafts,skipped});
  }
  if (path === "posts" && method === "POST") {
    const now = new Date().toISOString(), id = crypto.randomUUID(), input = await body(request);
    const post: Post = { id, sourceKey: `manual:${id}`, sourceRow: 0, sourceSheet: "手動作成", sourcePostId: "", title: "新しい投稿", category: "手動作成", theme: "", date: input.date, time: input.time || "12:00", plannedAt: plannedTime(input.date, input.time || "12:00"), content: { x: [""], linkedin: "", facebook: "" }, platforms: [...PLATFORMS], mediaIds: [], imageIdea: "", imagePrompt: "", notes: "", source: "", productionStatus: "未着手", needsImage: false, version: 1, revision: crypto.randomUUID(), approvedVersion: null, approvedBy: null, approvedAt: null, status: "review", createdAt: now, updatedAt: now, sourceHash: "" };
    await insert(post).run(); await activity("created", actor, "投稿を作成しました。", id); return json({ id });
  }
  const match = path.match(/^posts\/([^/]+)(?:\/(approve|revoke))?$/);
  if (match && method === "DELETE" && !match[2]) {
    const id=decodeURIComponent(match[1]), input=await body(request), db=database();
    const results=await db.batch([
      db.prepare("DELETE FROM posts WHERE id=? AND revision=? AND NOT EXISTS(SELECT 1 FROM targets WHERE post_id=? AND state IN ('sending','published','unknown'))").bind(id,input.revision,id),
      db.prepare("DELETE FROM targets WHERE post_id=? AND NOT EXISTS(SELECT 1 FROM posts WHERE id=?)").bind(id,id)
    ]);
    if(!results[0].meta.changes) throw new AppError("公開済み、処理中、または更新された投稿は削除できません。",409);
    await activity("deleted",actor,"下書きを削除しました。"); return json({deleted:true});
  }
  if (match && ["PATCH", "POST"].includes(method)) {
    const id = decodeURIComponent(match[1]), action = match[2], input = await body(request), old = await getPost(id), db = database();
    if (old.revision !== input.revision) throw new AppError("別の人が更新しました。再読み込みして確認してください。", 409);
    const busy = await db.prepare("SELECT count(*) AS n FROM targets WHERE post_id=? AND state IN ('sending','published','unknown')").bind(id).first<{ n: number }>();
    if (busy?.n) throw new AppError("公開処理中・公開済み・結果確認中の投稿は変更できません。", 409);
    if (action === "approve") {
      assertApprovable(old, input.immediate === true ? -1 : Date.now());
      if (old.platforms.includes("x") && old.content.x.some(text => !twitterText.parseTweet(text).valid)) throw new AppError("Xの文字数・本文を確認してください。日本語やURLは重み付きで数えます。");
      if (old.mediaIds.length) { const found = await db.prepare(`SELECT count(*) AS n FROM media WHERE id IN (${old.mediaIds.map(() => "?").join(",")})`).bind(...old.mediaIds).first<{ n: number }>(); if (found?.n !== old.mediaIds.length) throw new AppError("添付画像を確認してください。"); }
      const connections = await db.prepare("SELECT platform,account_id FROM connections").all<{platform:Platform;account_id:string}>();
      const accounts = Object.fromEntries(connections.results.map(c=>[c.platform,c.account_id]));
      if (old.platforms.some(p=>(input.destinations?.[p]||"")!==(accounts[p]||""))) throw new AppError("投稿先の接続が更新されました。再読み込みして確認してください。",409);
      const instant = new Date(), next: Post = { ...old, ...(input.immediate===true?{plannedAt:instant.toISOString(),date:new Intl.DateTimeFormat("sv-SE",{timeZone:"Asia/Tokyo"}).format(instant),time:new Intl.DateTimeFormat("en-GB",{timeZone:"Asia/Tokyo",hour:"2-digit",minute:"2-digit"}).format(instant)}:{}), approvedVersion: old.version, approvedBy: actor, approvedAt: instant.toISOString(), status: "approved", revision: crypto.randomUUID(), updatedAt: instant.toISOString() };
      const stmts = [db.prepare("UPDATE posts SET document=?,revision=?,approved_version=?,planned_at=?,updated_at=? WHERE id=? AND revision=? AND NOT EXISTS(SELECT 1 FROM targets WHERE post_id=? AND state IN ('sending','published','unknown'))").bind(JSON.stringify(next), next.revision, next.version, next.plannedAt, next.updatedAt, id, old.revision, id)];
      for (const t of makeTargetPayloads(next,accounts)) stmts.push(db.prepare("INSERT INTO targets(id,post_id,version,platform,sequence,parent_id,state,scheduled_at,payload,attempts,updated_at) SELECT ?,?,?,?,?,?,'queued',?,?,0,? WHERE EXISTS(SELECT 1 FROM posts WHERE id=? AND revision=?) ON CONFLICT(id) DO NOTHING").bind(t.id, id, old.version, t.platform, t.sequence, t.parentId, next.plannedAt, JSON.stringify(t.payload), next.updatedAt, id, next.revision));
      const results = await db.batch(stmts); if (!results[0].meta.changes) throw new AppError("投稿が更新されました。再読み込みしてください。", 409);
      await activity("approved", actor, "内容を承認して予約しました。", id); return json({ approved: true, post: next });
    }
    let next: Post;
    if (action === "revoke") next = { ...old, approvedVersion: null, approvedBy: null, approvedAt: null, status: "review", revision: crypto.randomUUID(), updatedAt: new Date().toISOString() };
    else {
      if (!input.title?.trim() || input.title.length > 200 || !Array.isArray(input.platforms) || input.platforms.some((p: Platform) => !PLATFORMS.includes(p)) || !input.content || !Array.isArray(input.content.x) || input.content.x.length > 10 || input.content.x.some((v: unknown) => typeof v !== "string") || typeof input.content.linkedin !== "string" || typeof input.content.facebook !== "string" || JSON.stringify(input.content).length > 200000 || !Array.isArray(input.mediaIds) || input.mediaIds.length > 4 || input.mediaIds.some((v: unknown) => typeof v !== "string")) throw new AppError("投稿内容の形式を確認してください。");
      next = { ...old, title: input.title.trim(), date: input.date, time: input.time, plannedAt: plannedTime(input.date, input.time), platforms: [...new Set<Platform>(input.platforms)], content: input.content, mediaIds: input.mediaIds, needsImage: input.needsImage === true, notes: String(input.notes ?? old.notes).slice(0, 20000), version: old.version + 1, revision: crypto.randomUUID(), approvedVersion: null, approvedBy: null, approvedAt: null, status: "review", updatedAt: new Date().toISOString() };
    }
    const results = await db.batch([
      db.prepare("UPDATE posts SET document=?,revision=?,version=?,approved_version=NULL,planned_at=?,updated_at=? WHERE id=? AND revision=? AND NOT EXISTS(SELECT 1 FROM targets WHERE post_id=? AND state IN ('sending','published','unknown'))").bind(JSON.stringify(next), next.revision, next.version, next.plannedAt, next.updatedAt, id, old.revision, id),
      db.prepare("DELETE FROM targets WHERE post_id=? AND EXISTS(SELECT 1 FROM posts WHERE id=? AND revision=?)").bind(id, id, next.revision)
    ]);
    if (!results[0].meta.changes) throw new AppError("別の編集や公開処理が始まりました。再読み込みしてください。", 409);
    await activity(action === "revoke" ? "revoked" : "edited", actor, action === "revoke" ? "予約を取り消しました。" : "原稿を保存しました。承認待ちです。", id); return json({ saved: true, post: next });
  }
  if (path === "targets/retry" && method === "POST") {
    const input = await body(request), now = new Date().toISOString();
    const result = await database().prepare("UPDATE targets SET state='queued',scheduled_at=?,error=NULL,claimed_at=NULL,updated_at=? WHERE id=? AND state IN ('failed','blocked') AND EXISTS(SELECT 1 FROM posts WHERE id=targets.post_id AND version=targets.version AND approved_version=targets.version)").bind(now, now, input.id).run();
    if (!result.meta.changes) throw new AppError("再試行できません。公開結果が不明な投稿は、先に投稿先を確認してください。", 409);
    await activity("retried", actor, "失敗した送信を再試行に戻しました。"); return json({ queued: true });
  }
  if (path === "targets/resolve" && method === "POST") {
    const input = await body(request), target = await database().prepare("SELECT platform,post_id FROM targets WHERE id=? AND state='unknown'").bind(input.id).first<{ platform: Platform; post_id: string }>();
    if (!target) throw new AppError("確認が必要な投稿がありません。", 409);
    if (input.published !== true || !input.remoteId || !input.url) throw new AppError("公開済みの投稿IDとURLを入力してください。");
    const url = new URL(input.url), domains = { x: ["x.com", "twitter.com"], linkedin: ["www.linkedin.com", "linkedin.com"], facebook: ["www.facebook.com", "facebook.com"] };
    if (url.protocol !== "https:" || !domains[target.platform].includes(url.hostname)) throw new AppError("対象SNSの投稿URLを指定してください。");
    await database().prepare("UPDATE targets SET state='published',remote_id=?,url=?,error=NULL,updated_at=? WHERE id=? AND state='unknown'").bind(String(input.remoteId).slice(0, 200), url.href, new Date().toISOString(), input.id).run();
    await activity("resolved", actor, "投稿先で公開結果を確認しました。", target.post_id); return json({ resolved: true });
  }
  if (path === "connections" && method === "POST") {
    const input = await body(request); if (!PLATFORMS.includes(input.platform)) throw new AppError("SNSを選んでください。");
    const encrypted = await seal(String(input.token)), checked = await verifyConnection(input.platform, String(input.token), String(input.accountId ?? ""));
    await database().prepare("INSERT INTO connections(platform,label,account_id,encrypted_token,verified_at) VALUES(?,?,?,?,?) ON CONFLICT(platform) DO UPDATE SET label=excluded.label,account_id=excluded.account_id,encrypted_token=excluded.encrypted_token,verified_at=excluded.verified_at").bind(input.platform, checked.label, checked.accountId, encrypted, new Date().toISOString()).run();
    await activity("connected", actor, `${input.platform}の接続を登録しました。`); return json({ connected: true });
  }
  if (path.startsWith("connections/") && method === "DELETE") {
    const platform = path.split("/")[1]; if (!PLATFORMS.includes(platform as Platform)) throw new AppError("SNSを選んでください。");
    await database().prepare("DELETE FROM connections WHERE platform=?").bind(platform).run(); await activity("disconnected", actor, `${platform}の接続を解除しました。`); return json({ disconnected: true });
  }
  if (path === "media" && method === "POST") {
    if (!env.BUCKET) throw new AppError("画像保管の初期設定が必要です。", 503);
    if (Number(request.headers.get("content-length") || 0) > 6291456) throw new AppError("画像は1枚5MB以内にしてください。", 413);
    const form = await request.formData(), file = form.get("file");
    if (!(file instanceof File) || file.size > 5242880 || !["image/jpeg", "image/png"].includes(file.type)) throw new AppError("JPEGかPNGの画像を1枚5MB以内で指定してください。");
    const bytes = new Uint8Array(await file.arrayBuffer()), jpeg = bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255, png = [137,80,78,71,13,10,26,10].every((n,i) => bytes[i] === n);
    if ((file.type === "image/jpeg" && !jpeg) || (file.type === "image/png" && !png)) throw new AppError("画像ファイルの形式を確認してください。");
    const id = crypto.randomUUID(); await env.BUCKET.put(id, bytes, { httpMetadata: { contentType: file.type } });
    await database().prepare("INSERT INTO media(id,name,mime,size,created_at) VALUES(?,?,?,?,?)").bind(id, file.name.slice(0, 200), file.type, file.size, new Date().toISOString()).run(); return json({ id });
  }
  if (path.startsWith("media/") && method === "GET") {
    const object = await env.BUCKET?.get(path.split("/")[1]); if (!object) throw new AppError("画像が見つかりません。", 404);
    return new Response(object.body, { headers: { "Content-Type": object.httpMetadata?.contentType || "application/octet-stream", "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
  }
  throw new AppError("操作が見つかりません。", 404);
 } catch (error) { return failure(error); }
}
export const GET = api; export const POST = api; export const PATCH = api; export const DELETE = api;
