import { env } from "cloudflare:workers";
import type { Platform, Target } from "./types";
import { AppError } from "./domain";
import { database } from "./store";
import { runtime, unseal } from "./security";
import { configuredDestinations } from "./destination-settings";
import { assertDestinationMatches } from "./destinations";

type Auth = { token: string; accountId: string; label: string };
export class SendError extends Error { uncertain: boolean; blocked: boolean; constructor(message: string, uncertain = false, blocked = false) { super(message); this.uncertain = uncertain; this.blocked = blocked; } }
export async function credential(platform: Platform): Promise<Auth> {
  const row = await database().prepare("SELECT encrypted_token,account_id,label FROM connections WHERE platform=?").bind(platform).first<{ encrypted_token: string; account_id: string; label: string }>();
  if (!row) throw new SendError("SNSの接続設定が必要です。", false, true);
  try { assertDestinationMatches(configuredDestinations().find(d=>d.platform===platform),{accountId:row.account_id,username:platform==="x"?row.label.replace(/^@/,""):undefined}); } catch(error) { throw new SendError((error as Error).message,false,true); }
  return { token: await unseal(row.encrypted_token), accountId: row.account_id, label: row.label };
}
function linkedHeaders(token: string) { return { Authorization: `Bearer ${token}`, "LinkedIn-Version": runtime("LINKEDIN_API_VERSION") || "202606", "X-Restli-Protocol-Version": "2.0.0", "Content-Type": "application/json" }; }
async function call(url: string, options: RequestInit, publishing = false): Promise<{ data: any; response: Response }> {
  let response: Response;
  try { response = await fetch(url, { ...options, signal: AbortSignal.timeout(25_000) }); }
  catch { throw new SendError(publishing ? "SNSの応答を確認できません。重複を防ぐため投稿先を確認してください。" : "SNSに接続できませんでした。", publishing); }
  const data = await response.json().catch(() => ({})) as any;
  if (!response.ok) throw new SendError(response.status === 401 || response.status === 403 ? "SNSの接続または投稿権限を確認してください。" : response.status === 429 ? "SNSの利用上限に達しました。時間をおいて再試行してください。" : `SNSが処理を受け付けませんでした（${response.status}）。`, publishing && response.status >= 500, response.status === 401 || response.status === 403);
  return { data, response };
}
export async function verifyConnection(platform: Platform, token: string, requestedAccountId: string) {
  if (token.length < 10 || token.length > 12000) throw new AppError("接続情報を確認してください。");
  const expected=configuredDestinations().find(destination=>destination.platform===platform);
  if (platform === "x") {
    const { data } = await call("https://api.x.com/2/users/me", { headers: { Authorization: `Bearer ${token}` } });
    if (!data.data?.id || !data.data?.username) throw new AppError("Xのアカウントを確認できませんでした。");
    assertDestinationMatches(expected,{accountId:String(data.data.id),username:data.data.username});
    return { accountId: String(data.data.id), label: `@${data.data.username}` };
  }
  requestedAccountId=requestedAccountId.trim() || expected?.accountId || "";
  if (!/^\d+$/.test(requestedAccountId)) throw new AppError("数字のページIDを指定してください。");
  assertDestinationMatches(expected,{accountId:requestedAccountId});
  if (platform === "linkedin") {
    const { data } = await call(`https://api.linkedin.com/rest/organizations/${requestedAccountId}`, { headers: linkedHeaders(token) });
    if(String(data.id)!==requestedAccountId) throw new AppError("LinkedInの会社ページを確認できませんでした。");
    return { accountId: requestedAccountId, label: data.localizedName || data.vanityName || "LinkedIn会社ページ" };
  }
  const { data } = await call(`https://graph.facebook.com/v27.0/me?fields=id,name`, { headers: { Authorization: `Bearer ${token}` } });
  if (String(data.id) !== requestedAccountId) throw new AppError("指定したFacebookページのページ用トークンを登録してください。");
  return { accountId: requestedAccountId, label: data.name || "Facebookページ" };
}

async function asset(id: string) {
  if (!env.BUCKET) throw new SendError("画像保管の初期設定が必要です。", false, true);
  const [row, object] = await Promise.all([database().prepare("SELECT name,mime FROM media WHERE id=?").bind(id).first<{ name: string; mime: string }>(), env.BUCKET.get(id)]);
  if (!row || !object) throw new SendError("添付画像が見つかりません。画像を選び直してください。");
  return { ...row, bytes: new Uint8Array(await object.arrayBuffer()) };
}
async function xImage(id: string, auth: Auth) {
  const file = await asset(id);
  const headers = { Authorization: `Bearer ${auth.token}` };
  const start = await call("https://api.x.com/2/media/upload/initialize", { method: "POST", headers: { ...headers, "Content-Type": "application/json" }, body: JSON.stringify({ media_type: file.mime, total_bytes: file.bytes.length, media_category: "tweet_image" }) });
  const mediaId = start.data.data?.id;
  if (!mediaId) throw new SendError("Xへの画像転送を開始できませんでした。");
  const form = new FormData(); form.set("segment_index", "0"); form.set("media", new Blob([file.bytes], { type: file.mime }), file.name);
  await call(`https://api.x.com/2/media/upload/${mediaId}/append`, { method: "POST", headers, body: form });
  const end = await call(`https://api.x.com/2/media/upload/${mediaId}/finalize`, { method: "POST", headers });
  if (end.data.data?.processing_info && end.data.data.processing_info.state !== "succeeded") throw new SendError("X側で画像の処理が完了していません。少し待って再試行してください。");
  return String(mediaId);
}
async function linkedImage(id: string, auth: Auth) {
  const file = await asset(id);
  const { data } = await call("https://api.linkedin.com/rest/images?action=initializeUpload", { method: "POST", headers: linkedHeaders(auth.token), body: JSON.stringify({ initializeUploadRequest: { owner: `urn:li:organization:${auth.accountId}` } }) });
  const value = data.value; if (!value?.uploadUrl || !value?.image) throw new SendError("LinkedInへの画像転送を開始できませんでした。");
  const url = new URL(value.uploadUrl); if (url.protocol !== "https:" || !/(^|\.)linkedin\.com$/.test(url.hostname)) throw new SendError("画像転送先を確認できませんでした。");
  await call(value.uploadUrl, { method: "PUT", headers: { Authorization: `Bearer ${auth.token}`, "Content-Type": file.mime }, body: file.bytes });
  return String(value.image);
}
export async function publish(target: Target, parentRemoteId?: string): Promise<{ id: string; url: string }> {
  const auth = await credential(target.platform);
  if (!target.payload.accountId || target.payload.accountId !== auth.accountId) throw new SendError("接続した投稿先を確認し、予約を取り消して再承認してください。", false, true);
  if (target.platform === "x") {
    if (target.sequence && runtime("X_THREADS_ENABLED") !== "true") throw new SendError("Xの連続投稿は、自己返信の動作確認後に有効にしてください。", false, true);
    const mediaIds: string[] = []; for (const id of target.payload.mediaIds) mediaIds.push(await xImage(id, auth));
    const body = { text: target.payload.text, ...(mediaIds.length ? { media: { media_ids: mediaIds } } : {}), ...(parentRemoteId ? { reply: { in_reply_to_tweet_id: parentRemoteId } } : {}) };
    const { data } = await call("https://api.x.com/2/tweets", { method: "POST", headers: { Authorization: `Bearer ${auth.token}`, "Content-Type": "application/json" }, body: JSON.stringify(body) }, true);
    if (!data.data?.id) throw new SendError("Xの投稿結果を確認してください。", true);
    return { id: data.data.id, url: `https://x.com/i/status/${data.data.id}` };
  }
  if (target.platform === "linkedin") {
    const images: string[] = []; for (const id of target.payload.mediaIds) images.push(await linkedImage(id, auth));
    const content = images.length > 1 ? { multiImage: { images: images.map(id => ({ id })) } } : images.length ? { media: { id: images[0] } } : undefined;
    const { response } = await call("https://api.linkedin.com/rest/posts", { method: "POST", headers: linkedHeaders(auth.token), body: JSON.stringify({ author: `urn:li:organization:${auth.accountId}`, commentary: target.payload.text, visibility: "PUBLIC", distribution: { feedDistribution: "MAIN_FEED", targetEntities: [], thirdPartyDistributionChannels: [] }, lifecycleState: "PUBLISHED", ...(content ? { content } : {}) }) }, true);
    const id = response.headers.get("x-restli-id"); if (!id) throw new SendError("LinkedInの投稿結果を確認してください。", true);
    return { id, url: `https://www.linkedin.com/feed/update/${encodeURIComponent(id)}/` };
  }
  const attached: { media_fbid: string }[] = [];
  for (const id of target.payload.mediaIds) {
    const file = await asset(id); const form = new FormData(); form.set("source", new Blob([file.bytes], { type: file.mime }), file.name); form.set("published", "false");
    const { data } = await call(`https://graph.facebook.com/v27.0/${auth.accountId}/photos`, { method: "POST", headers: { Authorization: `Bearer ${auth.token}` }, body: form });
    if (!data.id) throw new SendError("Facebookに画像を転送できませんでした。"); attached.push({ media_fbid: data.id });
  }
  const { data } = await call(`https://graph.facebook.com/v27.0/${auth.accountId}/feed`, { method: "POST", headers: { Authorization: `Bearer ${auth.token}`, "Content-Type": "application/json" }, body: JSON.stringify({ message: target.payload.text, ...(attached.length ? { attached_media: attached } : {}) }) }, true);
  if (!data.id) throw new SendError("Facebookの投稿結果を確認してください。", true);
  return { id: data.id, url: `https://www.facebook.com/${data.id}` };
}
