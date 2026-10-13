CREATE TABLE `datasets` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`metadata` text NOT NULL,
	`object_key` text NOT NULL,
	`published` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`subject` text NOT NULL,
	`payload` text NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `sessions_subject` ON `sessions` (`subject`);