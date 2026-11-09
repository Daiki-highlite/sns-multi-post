import { env } from "cloudflare:workers";
import type { Activity, Connection, Media, Post, Target, PreviewReference } from "./types";
import { AppError } from "./domain";
export function database() { if (!env.DB) throw new AppError("共有データベースの初期設定が必要です。", 503); return env.DB; }
export async function allPosts(): Promise<Post[]> {
  const db = database();
  const [posts, targets] = await Promise.all([db.prepare("SELECT document FROM posts ORDER BY planned_at").all<{ document: string }>(), db.prepare("SELECT * FROM targets ORDER BY sequence").all<Record<string, unknown>>()]);
  return posts.results.map(row => { const post = JSON.parse(row.document) as Post; post.targets = targets.results.filter(t => t.post_id === post.id).map(targetFrom); return post; });
}
export async function getPost(id: string): Promise<Post> {
  const row = await database().prepare("SELECT document FROM posts WHERE id = ?").bind(id).first<{ document: string }>();
  if (!row) throw new AppError("投稿が見つかりません。", 404); return JSON.parse(row.document);
}
export function targetFrom(r: Record<string, unknown>): Target {
  return { id: String(r.id), postId: String(r.post_id), version: Number(r.version), platform: r.platform as Target["platform"], sequence: Number(r.sequence), parentId: r.parent_id as string | null, state: r.state as Target["state"], scheduledAt: String(r.scheduled_at), payload: JSON.parse(String(r.payload)), remoteId: r.remote_id as string | null, url: r.url as string | null, error: r.error as string | null, attempts: Number(r.attempts), claimedAt: r.claimed_at as string | null, updatedAt: String(r.updated_at) };
}
export async function activity(action: string, actor: string, detail: string, postId: string | null = null) {
  await database().prepare("INSERT INTO activities(id,post_id,action,actor,detail,created_at) VALUES(?,?,?,?,?,?)").bind(crypto.randomUUID(), postId, action, actor, detail, new Date().toISOString()).run();
}
export async function metadata() {
  const db = database();
  const [media, connections, events, settings] = await Promise.all([
    db.prepare("SELECT id,name,mime,size,created_at AS createdAt FROM media ORDER BY created_at DESC").all<Media>(),
    db.prepare("SELECT platform,label,account_id AS accountId,verified_at AS verifiedAt FROM connections").all<Connection>(),
    db.prepare("SELECT id,post_id AS postId,action,actor,detail,created_at AS createdAt FROM activities ORDER BY created_at DESC LIMIT 80").all<Activity>(),
    db.prepare("SELECT key,value FROM settings").all<{ key: string; value: string }>()
  ]);
  return { previewReferences: settings.results.filter(s => s.key.startsWith("previewReference:")).map(s => JSON.parse(s.value) as PreviewReference), media: media.results, connections: connections.results.map(c => ({ ...c, configured: true })), activities: events.results, settings: Object.fromEntries(settings.results.map(s => [s.key, JSON.parse(s.value)])) };
}
export async function setting(key: string, value: unknown) { await database().prepare("INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").bind(key, JSON.stringify(value)).run(); }
