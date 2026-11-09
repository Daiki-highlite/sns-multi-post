import { normalizeThreadContent } from "./thread-text.ts";
import type { CalendarExport, Platform, Post } from "./types";

export const PLATFORMS: Platform[] = ["x", "linkedin", "facebook"];
export const PLATFORM_NAMES = { x: "X", linkedin: "LinkedIn", facebook: "Facebook" };
export class AppError extends Error { status: number; constructor(message: string, status = 400) { super(message); this.status = status; } }
export function plannedTime(date: string, time: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) throw new AppError("日付と時刻を確認してください。");
  const parsed = new Date(`${date}T${time}:00+09:00`);
  if (!Number.isFinite(parsed.getTime()) || new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Tokyo" }).format(parsed) !== date) throw new AppError("存在する日付を指定してください。");
  return parsed.toISOString();
}
export function assertApprovable(post: Post, now = Date.now()) {
  if (!post.platforms.length || post.platforms.some(p => !PLATFORMS.includes(p))) throw new AppError("投稿先を選んでください。");
  if (new Date(post.plannedAt).getTime() <= now) throw new AppError("公開日時をこれからの時刻に変更してください。");
  if (post.needsImage && !post.mediaIds.length) throw new AppError("画像を登録するか「画像なし」に変更してください。");
  if (post.mediaIds.length > 4) throw new AppError("画像は4枚までです。");
  for (const platform of post.platforms) {
    const text = platform === "x" ? post.content.x : [post.content[platform]];
    if (!text.length || text.some(t => !t.trim())) throw new AppError(`${PLATFORM_NAMES[platform]}の本文を入力してください。`);
    if (platform === "linkedin" && text.some(t => [...t].length > 3000)) throw new AppError("LinkedInの本文は3,000文字以内にしてください。");
    if (platform === "facebook" && text.some(t => [...t].length > 63206)) throw new AppError("Facebookの本文が長すぎます。");
  }
}
export function importedPosts(input: CalendarExport): Post[] {
  if (!input || !/^[a-zA-Z0-9_-]{10,150}$/.test(input.spreadsheetId) || !Array.isArray(input.tabs) || input.tabs.length > 12) throw new AppError("投稿カレンダーの形式を確認してください。");
  const result: Post[] = [];
  const now = new Date().toISOString();
  const used = new Set<string>();
  for (const tab of input.tabs) {
    if (!tab.name || !Number.isInteger(tab.sheetId) || !Array.isArray(tab.rows) || tab.rows.length > 1500) throw new AppError("タブの形式を確認してください。");
    const header = tab.rows[0] ?? [];
    const required = ["日付（JST）", "主テーマ", "投稿テーマ", "枝番", "X 本文", "LinkedIn 本文", "Facebook 本文", "投稿時刻（案）", "投稿ID"];
    if (required.some((h, i) => header[i] !== h)) throw new AppError(`「${tab.name}」の列名・順番が投稿カレンダーと異なります。`);
    const groups = new Map<string, { row: (string | null)[]; number: number }[]>();
    tab.rows.slice(1).forEach((row, index) => {
      if (!row.some(v => v != null && String(v).trim())) return;
      const sourceId = String(row[8] ?? "").trim();
      if (!sourceId) throw new AppError(`「${tab.name}」${index + 2}行目に投稿IDがありません。`);
      const key = `${input.spreadsheetId}:${tab.sheetId}:${sourceId}`;
      const branchKey = `${key}:${row[3]}`;
      if (used.has(branchKey)) throw new AppError(`「${tab.name}」に同じ投稿ID・枝番があります。`);
      used.add(branchKey);
      const list = groups.get(key) ?? [];
      list.push({ row, number: index + 2 }); groups.set(key, list);
    });
    for (const [sourceKey, raw] of groups) {
      const rows = raw.sort((a, b) => Number(String(a.row[3]).split("/")[0]) - Number(String(b.row[3]).split("/")[0]));
      const first = rows[0]; const row = first.row; const branch = String(row[3]);
      const total = Number(branch.split("/")[1]);
      if (!/^1\/[1-9]\d?$/.test(branch) || total !== rows.length || rows.some((r, i) => r.row[3] !== `${i + 1}/${total}`)) throw new AppError(`「${tab.name}」${row[8]}の枝番が揃っていません。`);
      if (rows.slice(1).some(r => r.row[5]?.trim() || r.row[6]?.trim())) throw new AppError(`「${tab.name}」${row[8]}の続き行にLinkedIn・Facebook本文があります。投稿構成を確認してください。`);
      const date = String(row[0] ?? "").replaceAll("/", "-");
      const time = String(row[7] ?? "");
      const platforms = PLATFORMS.filter(p => p === "x" ? rows.some(r => r.row[4]?.trim()) : !!row[p === "linkedin" ? 5 : 6]?.trim());
      const content = normalizeThreadContent({ x: rows.map(r => String(r.row[4] ?? "")).filter(Boolean), linkedin: String(row[5] ?? ""), facebook: String(row[6] ?? "") });
      const sourceHash = JSON.stringify(rows.map(r => r.row));
      result.push({ id: crypto.randomUUID(), sourceKey, sourceRow: first.number, sourceSheet: tab.name, sourcePostId: String(row[8]), title: String(row[2] ?? ""), category: tab.name, theme: String(row[1] ?? ""), date, time, plannedAt: plannedTime(date, time), content, platforms, mediaIds: [], imageIdea: String(row[12] ?? ""), imagePrompt: String(row[13] ?? ""), notes: String(row[10] ?? ""), source: String(row[11] ?? ""), productionStatus: String(row[14] ?? "未着手"), needsImage: !!row[12], version: 1, revision: crypto.randomUUID(), approvedVersion: null, approvedBy: null, approvedAt: null, status: "review", createdAt: now, updatedAt: now, sourceHash });
    }
  }
  if (result.length > 1000) throw new AppError("1回に取り込める企画は1,000件までです。");
  return result;
}
export function makeTargetPayloads(post: Post, accounts: Partial<Record<Platform,string>> = {}) {
  return post.platforms.flatMap(platform => (platform === "x" ? post.content.x : [post.content[platform]]).map((text, sequence) => ({ id: `${post.id}:v${post.version}:${platform}:${sequence}`, platform, sequence, parentId: sequence ? `${post.id}:v${post.version}:${platform}:${sequence - 1}` : null, payload: { text, mediaIds: sequence ? [] : [...post.mediaIds], accountId: accounts[platform] || "" } })));
}
export function statusOf(post: Post): string {
  const targets = post.targets ?? [];
  if (!targets.length || post.approvedVersion !== post.version) return "review";
  if (targets.some(t => t.state === "unknown")) return "unknown";
  if (targets.some(t => t.state === "sending")) return "sending";
  if (targets.every(t => t.state === "published")) return "published";
  if (targets.some(t => t.state === "published")) return "partial";
  if (targets.some(t => t.state === "failed")) return "failed";
  if (targets.some(t => t.state === "blocked")) return "blocked";
  return "approved";
}
