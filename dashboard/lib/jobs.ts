import { database, activity, targetFrom } from "./store";
import { deliveryMode } from "./delivery-settings";
import { publish, SendError } from "./providers";
export async function runDueJobs() {
  if(deliveryMode()!=="api")return {checkedAt:new Date().toISOString(),results:[],mode:"browser_agent",message:"SNS画面でエージェントが実行します。有料APIは呼び出しません。"};
  const db = database(), now = new Date().toISOString();
  // A crashed request may already have published; an expired lease is never replayed.
  await db.prepare("UPDATE targets SET state='unknown',error=?,updated_at=? WHERE state='sending' AND claimed_at < ?").bind("処理が中断されました。投稿先で公開結果を確認してください。", now, new Date(Date.now() - 300000).toISOString()).run();
  const rows = await db.prepare("SELECT t.* FROM targets t JOIN posts p ON p.id=t.post_id WHERE t.state IN ('queued','blocked') AND t.scheduled_at<=? AND p.approved_version=t.version AND p.version=t.version ORDER BY t.scheduled_at,t.sequence LIMIT 24").bind(now).all<Record<string, unknown>>();
  const results: { id: string; state: string }[] = [];
  for (const raw of rows.results) {
    const target = targetFrom(raw);
    if(target.payload.accountId.startsWith("web:"))continue;
    if (Date.now() - Date.parse(target.scheduledAt) > 600000) { await db.prepare("UPDATE targets SET state='failed',error=?,updated_at=? WHERE id=? AND state IN ('queued','blocked')").bind("公開予定から10分以上経過しました。日時を確認して再試行してください。", now, target.id).run(); results.push({ id: target.id, state: "failed" }); continue; }
    let parentId: string | undefined;
    if (target.parentId) { const parent = await db.prepare("SELECT state,remote_id FROM targets WHERE id=?").bind(target.parentId).first<{ state: string; remote_id: string }>(); if (parent?.state !== "published" || !parent.remote_id) continue; parentId = parent.remote_id; }
    const claim = await db.prepare("UPDATE targets SET state='sending',claimed_at=?,attempts=attempts+1,updated_at=? WHERE id=? AND state IN ('queued','blocked') AND EXISTS(SELECT 1 FROM posts WHERE id=targets.post_id AND version=targets.version AND approved_version=targets.version)").bind(now, now, target.id).run();
    if (!claim.meta.changes) continue;
    try {
      const sent = await publish(target, parentId);
      await db.prepare("UPDATE targets SET state='published',remote_id=?,url=?,error=NULL,updated_at=? WHERE id=? AND state='sending'").bind(sent.id, sent.url, new Date().toISOString(), target.id).run();
      await activity("published", "予約実行", `${target.platform}に公開しました。`, target.postId); results.push({ id: target.id, state: "published" });
    } catch (error) {
      const known = error instanceof SendError, state = known ? error.uncertain ? "unknown" : error.blocked ? "blocked" : "failed" : "unknown";
      const message = known ? error.message : "投稿結果を確認できません。投稿先で確認してください。";
      await db.prepare("UPDATE targets SET state=?,error=?,updated_at=? WHERE id=? AND state='sending'").bind(state, message, new Date().toISOString(), target.id).run();
      if (target.attempts === 0 || state !== "blocked") await activity(state, "予約実行", message, target.postId);
      results.push({ id: target.id, state });
    }
  }
  return { checkedAt: now, results };
}
