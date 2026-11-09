import { AppError } from "./domain";
import { runtime } from "./security";
import type { CalendarExport } from "./types";
const b64url = (data: Uint8Array) => btoa(String.fromCharCode(...data)).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
export async function readCalendar(spreadsheetId: string, tabs: { name: string; sheetId: number }[]): Promise<CalendarExport> {
  const email = runtime("GOOGLE_SERVICE_ACCOUNT_EMAIL"); const pem = runtime("GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY").replaceAll("\\n", "\n");
  if (!email || !pem) throw new AppError("Google Sheetsの接続設定が必要です。設定画面から取込用ファイルも利用できます。", 503);
  if (!/^[\w-]{10,150}$/.test(spreadsheetId) || tabs.length < 1 || tabs.length > 12) throw new AppError("読み込むカレンダーとタブを確認してください。");
  const encode = (v: unknown) => b64url(new TextEncoder().encode(JSON.stringify(v)));
  const now = Math.floor(Date.now() / 1000);
  const unsigned = `${encode({ alg: "RS256", typ: "JWT" })}.${encode({ iss: email, scope: "https://www.googleapis.com/auth/spreadsheets.readonly", aud: "https://oauth2.googleapis.com/token", iat: now, exp: now + 3600 })}`;
  const raw = Uint8Array.from(atob(pem.replace(/-----[^-]+-----|\s/g, "")), c => c.charCodeAt(0));
  const key = await crypto.subtle.importKey("pkcs8", raw, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
  const signature = b64url(new Uint8Array(await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(unsigned))));
  const tokenRes = await fetch("https://oauth2.googleapis.com/token", { method: "POST", body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: `${unsigned}.${signature}` }), signal: AbortSignal.timeout(15_000) });
  const token = await tokenRes.json() as { access_token?: string };
  if (!tokenRes.ok || !token.access_token) throw new AppError("Google Sheetsとの接続情報を確認してください。", 502);
  const metadataResponse=await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=sheets.properties`,{headers:{Authorization:`Bearer ${token.access_token}`},signal:AbortSignal.timeout(15000)});
  if(!metadataResponse.ok) throw new AppError("カレンダーの共有権限を確認してください。",502);
  const metadata=await metadataResponse.json() as {sheets:{properties:{sheetId:number;title:string;gridProperties:{rowCount:number;columnCount:number}}}[]};
  const resolved=tabs.map(tab=>{const p=metadata.sheets.find(s=>s.properties.sheetId===tab.sheetId)?.properties;if(!p||p.gridProperties.columnCount<18)throw new AppError("取り込むタブの構成が変わりました。設定を確認してください。");return {...tab,name:p.title,rows:Math.min(p.gridProperties.rowCount,1500)};});
  const query = new URLSearchParams({ valueRenderOption: "FORMATTED_VALUE" });
  resolved.forEach(t => { query.append("ranges", `'${t.name.replaceAll("'", "''")}'!A1:R${t.rows}`); });
  const res = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values:batchGet?${query}`, { headers: { Authorization: `Bearer ${token.access_token}` }, signal: AbortSignal.timeout(25_000) });
  if (!res.ok) throw new AppError("カレンダーを読み込めません。ファイルの共有権限とタブ名を確認してください。", 502);
  const data = await res.json() as { valueRanges: { values?: (string | null)[][] }[] };
  return { spreadsheetId, tabs: resolved.map((t, i) => ({ name:t.name,sheetId:t.sheetId, rows: data.valueRanges[i]?.values ?? [] })) };
}
