import { asc, eq } from 'drizzle-orm';
import { addDays, todayLocal } from './dates';
import { choreAssignees, choreInstances, chores } from './db/schema';
import type { DB } from './db/type';
import { nextOccurrence, occurrencesInRange, type Recurrence } from './recurrence';
import { getLastPosition, nextPosition, setLastPosition } from './rotation';

/** Daily/weekly chores are materialized this many days ahead (today + 13). */
export const ROLLING_WINDOW_DAYS = 14;

/**
 * Materialize due ChoreInstances for every active chore.
 *
 * - daily/weekly: every occurrence in the rolling window.
 * - monthly/yearly: just the next occurrence, however far out.
 * - Idempotent: `UNIQUE(chore_id, due_date)` + insert-or-ignore make re-runs
 *   harmless, so this runs on every boot and every night without guards.
 * - Rotation advances only when a row is actually inserted, so re-runs never
 *   skip anyone's turn.
 *
 * Returns the number of instances created.
 */
export function generateDueInstances(db: DB, today = todayLocal()): number {
	const activeChores = db.select().from(chores).where(eq(chores.isActive, true)).all();
	let created = 0;

	for (const chore of activeChores) {
		const recurrence: Recurrence = chore;
		const dates =
			chore.frequency === 'daily' || chore.frequency === 'weekly'
				? occurrencesInRange(recurrence, today, addDays(today, ROLLING_WINDOW_DAYS - 1))
				: (() => {
						const next = nextOccurrence(recurrence, today);
						return next ? [next] : [];
					})();
		if (dates.length === 0) continue;

		const pool = db
			.select()
			.from(choreAssignees)
			.where(eq(choreAssignees.choreId, chore.id))
			.orderBy(asc(choreAssignees.position))
			.all();
		if (pool.length === 0) continue; // unassigned chore: nothing to schedule

		db.transaction((tx) => {
			for (const dueDate of dates) {
				let assigneeId: number;
				let rotationPick: number | null = null;

				if (chore.assignmentType === 'rotating') {
					rotationPick = nextPosition(getLastPosition(tx, chore.id), pool.length);
					assigneeId = pool[rotationPick].userId;
				} else {
					assigneeId = pool[0].userId;
				}

				const result = tx
					.insert(choreInstances)
					.values({ choreId: chore.id, assigneeId, dueDate })
					.onConflictDoNothing()
					.run();

				if (result.changes > 0) {
					created++;
					if (rotationPick !== null) setLastPosition(tx, chore.id, rotationPick);
				}
			}
		});
	}

	return created;
}
