CREATE TABLE `activities` (
	`id` text PRIMARY KEY NOT NULL,
	`post_id` text,
	`action` text NOT NULL,
	`actor` text NOT NULL,
	`detail` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `connections` (
	`platform` text PRIMARY KEY NOT NULL,
	`label` text NOT NULL,
	`account_id` text NOT NULL,
	`encrypted_token` text NOT NULL,
	`verified_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `media` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`mime` text NOT NULL,
	`size` integer NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `posts` (
	`id` text PRIMARY KEY NOT NULL,
	`source_key` text NOT NULL,
	`document` text NOT NULL,
	`revision` text NOT NULL,
	`version` integer NOT NULL,
	`approved_version` integer,
	`planned_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `posts_source_key_unique` ON `posts` (`source_key`);--> statement-breakpoint
CREATE TABLE `settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `targets` (
	`id` text PRIMARY KEY NOT NULL,
	`post_id` text NOT NULL,
	`version` integer NOT NULL,
	`platform` text NOT NULL,
	`sequence` integer NOT NULL,
	`parent_id` text,
	`state` text NOT NULL,
	`scheduled_at` text NOT NULL,
	`payload` text NOT NULL,
	`remote_id` text,
	`url` text,
	`error` text,
	`attempts` integer DEFAULT 0 NOT NULL,
	`claimed_at` text,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `targets_due` ON `targets` (`state`,`scheduled_at`);--> statement-breakpoint
CREATE INDEX `targets_post` ON `targets` (`post_id`);