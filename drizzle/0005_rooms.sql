CREATE TABLE `rooms` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`icon` text DEFAULT '🏠' NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE `chores` ADD `room_id` integer REFERENCES rooms(id);--> statement-breakpoint
ALTER TABLE `chores` ADD `icon` text DEFAULT '' NOT NULL;