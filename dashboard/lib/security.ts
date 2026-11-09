import { env } from "cloudflare:workers";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { AppError } from "./domain";
export function runtime(name: string): string { return String((env as unknown as Record<string, unknown>)[name] ?? ""); }
export async function member(request?: Request) {
  const user = await getChatGPTUser();
  if (!user) throw new AppError("ログインしてください。", 401);
  const allowed = runtime("ALLOWED_USER_EMAILS").split(",").map(s => s.trim().toLowerCase()).filter(Boolean);
  if (allowed.length && !allowed.includes(user.email.toLowerCase())) throw new AppError("このダッシュボードへのアクセス権がありません。", 403);
  if (request && !["GET", "HEAD"].includes(request.method)) {
    if (request.headers.get("origin") !== new URL(request.url).origin) throw new AppError("同じ画面から操作してください。", 403);
  }
  return user;
}
export function service(request: Request) {
  const configured = runtime("SCHEDULER_SECRET");
  const supplied = request.headers.get("authorization")?.replace(/^Bearer /, "") ?? "";
  if (!configured || configured.length < 32 || supplied.length !== configured.length) throw new AppError("実行権限がありません。", 403);
  let different = 0; for (let i = 0; i < supplied.length; i++) different |= supplied.charCodeAt(i) ^ configured.charCodeAt(i);
  if (different) throw new AppError("実行権限がありません。", 403);
}
export function json(value: unknown, status = 200) { return Response.json(value, { status, headers: { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } }); }
export function failure(error: unknown) {
  if (error instanceof AppError) return json({ error: error.message }, error.status);
  console.error("Dashboard operation failed", error instanceof Error ? error.name : "unknown");
  return json({ error: "処理できませんでした。時間をおいて再度お試しください。" }, 500);
}
function bytes64(text: string) { return Uint8Array.from(atob(text), c => c.charCodeAt(0)); }
async function key() {
  const raw = runtime("CREDENTIAL_ENCRYPTION_KEY");
  if (!raw) throw new AppError("接続情報を保管するための初期設定が必要です。", 503);
  const bytes = bytes64(raw); if (bytes.length !== 32) throw new AppError("暗号鍵の設定を確認してください。", 503);
  return crypto.subtle.importKey("raw", bytes, "AES-GCM", false, ["encrypt", "decrypt"]);
}
export async function seal(text: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await key(), new TextEncoder().encode(text)));
  return `${btoa(String.fromCharCode(...iv))}.${btoa(String.fromCharCode(...encrypted))}`;
}
export async function unseal(text: string) {
  const [iv, encrypted] = text.split(".");
  return new TextDecoder().decode(await crypto.subtle.decrypt({ name: "AES-GCM", iv: bytes64(iv) }, await key(), bytes64(encrypted)));
}
