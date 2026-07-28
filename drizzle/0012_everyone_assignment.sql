DROP INDEX `chore_instances_chore_due_unique`;--> statement-breakpoint
CREATE UNIQUE INDEX `chore_instances_chore_due_assignee_unique` ON `chore_instances` (`chore_id`,`due_date`,`assignee_id`);