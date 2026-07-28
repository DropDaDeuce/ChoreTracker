CREATE TABLE `goal_achievements` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`goal_id` integer NOT NULL,
	`period_start` text NOT NULL,
	`points_at_achievement` integer NOT NULL,
	`achieved_at` integer NOT NULL,
	FOREIGN KEY (`goal_id`) REFERENCES `goals`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `goal_achievements_goal_period_unique` ON `goal_achievements` (`goal_id`,`period_start`);--> statement-breakpoint
CREATE TABLE `goals` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`scope` text NOT NULL,
	`user_id` integer,
	`period` text NOT NULL,
	`target_points` integer NOT NULL,
	`reward_note` text DEFAULT '' NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `weekly_settlements` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer NOT NULL,
	`week_start` text NOT NULL,
	`days_worked` integer NOT NULL,
	`full_week_days` integer NOT NULL,
	`earned_basis_points` integer NOT NULL,
	`cents` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `weekly_settlements_user_week_unique` ON `weekly_settlements` (`user_id`,`week_start`);--> statement-breakpoint
ALTER TABLE `chore_instances` ADD `weight` integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `chore_instances` ADD `is_bonus` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `chores` ADD `is_bonus` integer DEFAULT false NOT NULL;