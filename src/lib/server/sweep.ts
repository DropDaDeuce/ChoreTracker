import { and, eq, lt } from 'drizzle-orm';
import { addDays, todayLocal } from './dates';
import { choreInstances, chores } from './db/schema';
import type { DB } from './db/type';

/**
 * Mark pending instances past `due_date + grace_days` as `missed`.
 * Missed chores stay visible (and keep their reminder history) but can no
 * longer be marked done and never pay out.
 *
 * Returns the number of instances marked missed.
 */
export function sweepOverdue(db: DB, today = todayLocal()): number {
	const overdue = db
		.select({ instance: choreInstances, chore: chores })
		.from(choreInstances)
		.innerJoin(chores, eq(choreInstances.choreId, chores.id))
		.where(and(eq(choreInstances.status, 'pending'), lt(choreInstances.dueDate, today)))
		.all();

	let missed = 0;
	for (const { instance, chore } of overdue) {
		if (addDays(instance.dueDate, chore.graceDays) < today) {
			db.update(choreInstances)
				.set({ status: 'missed' })
				.where(eq(choreInstances.id, instance.id))
				.run();
			missed++;
		}
	}
	return missed;
}
