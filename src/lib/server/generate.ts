import { and, asc, eq } from 'drizzle-orm';
import { addDays, todayLocal } from './dates';
import { choreAssignees, choreInstances, chores, users } from './db/schema';
import type { DB } from './db/type';
import { isHome } from './presence';
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
 * - Presence-aware: nobody is scheduled on a day they're away (see
 *   presence.ts). Fixed chores simply skip that day; rotations hand the turn
 *   to the next person who IS home, or skip the day if nobody is.
 * - Deactivated people are never scheduled (their pool entries are ignored).
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
			.select({ userId: choreAssignees.userId, position: choreAssignees.position })
			.from(choreAssignees)
			.innerJoin(users, eq(choreAssignees.userId, users.id))
			.where(and(eq(choreAssignees.choreId, chore.id), eq(users.isActive, true)))
			.orderBy(asc(choreAssignees.position))
			.all();
		if (pool.length === 0) continue; // unassigned (or fully deactivated) chore

		db.transaction((tx) => {
			for (const dueDate of dates) {
				let assigneeId: number | null = null;
				let rotationPick: number | null = null;

				if (chore.assignmentType === 'rotating') {
					// Hand the turn to the next pool member who is home that day.
					const last = getLastPosition(tx, chore.id);
					for (let step = 0; step < pool.length; step++) {
						const candidate = (nextPosition(last, pool.length) + step) % pool.length;
						if (isHome(tx, pool[candidate].userId, dueDate)) {
							rotationPick = candidate;
							assigneeId = pool[candidate].userId;
							break;
						}
					}
				} else if (isHome(tx, pool[0].userId, dueDate)) {
					assigneeId = pool[0].userId;
				}
				if (assigneeId === null) continue; // everyone (or the assignee) is away

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
