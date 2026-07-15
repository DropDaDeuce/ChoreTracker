CREATE TABLE `allowance_ledger` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer NOT NULL,
	`instance_id` integer,
	`type` text NOT NULL,
	`amount_cents` integer NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	`created_by` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`instance_id`) REFERENCES `chore_instances`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `allowance_ledger_user_idx` ON `allowance_ledger` (`user_id`);--> statement-breakpoint
CREATE TABLE `chore_assignees` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`chore_id` integer NOT NULL,
	`user_id` integer NOT NULL,
	`position` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`chore_id`) REFERENCES `chores`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `chore_assignees_chore_user_unique` ON `chore_assignees` (`chore_id`,`user_id`);--> statement-breakpoint
CREATE TABLE `chore_instances` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`chore_id` integer NOT NULL,
	`assignee_id` integer NOT NULL,
	`due_date` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`reminder_count` integer DEFAULT 0 NOT NULL,
	`done_at` integer,
	`done_by` integer,
	`verified_at` integer,
	`verified_by` integer,
	`photo_path` text,
	`payout_cents` integer,
	`note` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`chore_id`) REFERENCES `chores`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`assignee_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`done_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`verified_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `chore_instances_chore_due_unique` ON `chore_instances` (`chore_id`,`due_date`);--> statement-breakpoint
CREATE INDEX `chore_instances_assignee_status_idx` ON `chore_instances` (`assignee_id`,`status`);--> statement-breakpoint
CREATE INDEX `chore_instances_status_due_idx` ON `chore_instances` (`status`,`due_date`);--> statement-breakpoint
CREATE TABLE `chore_rotation_state` (
	`chore_id` integer PRIMARY KEY NOT NULL,
	`last_position` integer DEFAULT -1 NOT NULL,
	FOREIGN KEY (`chore_id`) REFERENCES `chores`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `chores` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`title` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`frequency` text NOT NULL,
	`interval` integer DEFAULT 1 NOT NULL,
	`weekday_mask` integer DEFAULT 0 NOT NULL,
	`day_of_month` integer,
	`month_of_year` integer,
	`start_date` text NOT NULL,
	`points` integer DEFAULT 0 NOT NULL,
	`allowance_cents` integer DEFAULT 0 NOT NULL,
	`assignment_type` text DEFAULT 'fixed' NOT NULL,
	`requires_verification` integer DEFAULT true NOT NULL,
	`requires_photo` integer DEFAULT false NOT NULL,
	`grace_days` integer DEFAULT 0 NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `reminders` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`instance_id` integer NOT NULL,
	`reminded_by` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`instance_id`) REFERENCES `chore_instances`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`reminded_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` integer NOT NULL,
	`expires_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`role` text NOT NULL,
	`pin_hash` text NOT NULL,
	`avatar_color` text DEFAULT '#3b82f6' NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`created_at` integer NOT NULL
);
