import { statusOf } from "./domain.ts";
import type { Connection, Platform, Post } from "./types.ts";

export type SwipeAction = "approve" | "defer";
export function swipeDecision(x: number, y: number, width: number): SwipeAction | null {
  const threshold = Math.max(80, Math.min(120, width * 0.25));
  if (Math.abs(x) < threshold || Math.abs(x) < Math.abs(y) * 1.4) return null;
  return x > 0 ? "approve" : "defer";
}

export function reviewIsCurrent(snapshot: Post, current: Post | undefined, destinations: Partial<Record<Platform, string>>, connections: Connection[]) {
  if (!current || current.revision !== snapshot.revision || statusOf(current) !== "review") return false;
  return snapshot.platforms.every(platform => (destinations[platform] || "") === (connections.find(connection => connection.platform === platform)?.accountId || ""));
}
