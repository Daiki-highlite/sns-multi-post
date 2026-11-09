import { sqliteTable, text, integer, index } from "drizzle-orm/sqlite-core";
export const posts = sqliteTable("posts", {
 id: text("id").primaryKey(), sourceKey: text("source_key").notNull().unique(),
 document: text("document").notNull(), revision: text("revision").notNull(), version: integer("version").notNull(),
 approvedVersion: integer("approved_version"), plannedAt: text("planned_at").notNull(), updatedAt: text("updated_at").notNull(),
});
export const targets = sqliteTable("targets", {
 id: text("id").primaryKey(), postId: text("post_id").notNull(), version: integer("version").notNull(),
 platform: text("platform").notNull(), sequence: integer("sequence").notNull(), parentId: text("parent_id"),
 state: text("state").notNull(), scheduledAt: text("scheduled_at").notNull(), payload: text("payload").notNull(),
 remoteId: text("remote_id"), url: text("url"), error: text("error"), attempts: integer("attempts").notNull().default(0),
 claimedAt: text("claimed_at"), updatedAt: text("updated_at").notNull(),
}, t => [index("targets_due").on(t.state, t.scheduledAt), index("targets_post").on(t.postId)]);
export const media = sqliteTable("media", { id: text("id").primaryKey(), name: text("name").notNull(), mime: text("mime").notNull(), size: integer("size").notNull(), createdAt: text("created_at").notNull() });
export const connections = sqliteTable("connections", { platform: text("platform").primaryKey(), label: text("label").notNull(), accountId: text("account_id").notNull(), encryptedToken: text("encrypted_token").notNull(), verifiedAt: text("verified_at").notNull() });
export const settings = sqliteTable("settings", { key: text("key").primaryKey(), value: text("value").notNull() });
export const activities = sqliteTable("activities", { id: text("id").primaryKey(), postId: text("post_id"), action: text("action").notNull(), actor: text("actor").notNull(), detail: text("detail").notNull(), createdAt: text("created_at").notNull() });
