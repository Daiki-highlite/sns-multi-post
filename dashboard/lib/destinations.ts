import { AppError, PLATFORM_NAMES } from "./domain.ts";
import type { Destination, Platform } from "./types.ts";

export function parseDestination(platform: Platform, input: string): Destination {
  let url: URL;
  try { url = new URL(input); } catch { throw new AppError(`${PLATFORM_NAMES[platform]}の投稿先URLを確認してください。`); }
  if (url.protocol !== "https:" || url.username || url.password || url.port) throw new AppError("投稿先はHTTPSの公式プロフィールURLを指定してください。");
  if (platform === "x" && ["x.com", "www.x.com", "twitter.com", "www.twitter.com"].includes(url.hostname)) {
    const username = url.pathname.match(/^\/([A-Za-z0-9_]{1,15})\/?$/)?.[1];
    if (username && !["home", "i", "intent", "share", "search", "explore", "settings"].includes(username.toLowerCase())) return { platform, username, url:`https://x.com/${username}`, label:`@${username}` };
  }
  if (platform === "linkedin" && ["linkedin.com", "www.linkedin.com"].includes(url.hostname)) {
    const accountId = url.pathname.match(/^\/company\/(\d+)(?:\/.*)?$/)?.[1];
    if (accountId) return { platform, accountId, url:`https://www.linkedin.com/company/${accountId}/`, label:`会社ページ ${accountId}` };
  }
  if (platform === "facebook" && ["facebook.com", "www.facebook.com"].includes(url.hostname) && url.pathname === "/profile.php") {
    const accountId = url.searchParams.get("id") || "";
    if (/^\d+$/.test(accountId)) return { platform, accountId, url:`https://www.facebook.com/profile.php?id=${accountId}`, label:`Facebookページ ${accountId}` };
  }
  throw new AppError(`${PLATFORM_NAMES[platform]}の投稿先URLを確認してください。`);
}

export function assertDestinationMatches(expected: Destination | undefined, actual: { accountId: string; username?: string }) {
  if (!expected) return;
  if (expected.accountId ? actual.accountId !== expected.accountId : actual.username?.toLowerCase() !== expected.username?.toLowerCase()) {
    throw new AppError(`指定した投稿先（${expected.label}）と異なります。この投稿先の接続情報を登録してください。`);
  }
}
