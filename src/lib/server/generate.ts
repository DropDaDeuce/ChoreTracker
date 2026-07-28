import { and, asc, eq } from 'drizzle-orm';
import { addDays, todayLocal } from './dates';
import { choreAssignees, choreInstances, chores, users } from './db/schema';
import type { DB } from './db/type';
import { instanceWeight } from './payout';
import { isHome } from './presence';
import { nextOccurrence, occurrencesInRange, type Recurrence } from './recurrence';
import { pickRotationAssignee, type Turn } from './rotation';

/** Daily/weekly chores are materialized this many days ahead (today + 13). */
export const ROLLING_WINDOW_DAYS = 14;

/**
 * Materialize due ChoreInstances for every active chore.
 *
 * - daily/weekly: every occurrence in the rolling window.
 * - monthly/yearly: just the next occurrence, however far out.
 * - Idempotent: `UNIQUE(chore_id, due_date)` + insert-or-ignore make re-runs
 *   harmless, so this runs on every boot and every night without guards.
 * - Rotation is least-recently-served and derived from the instances that
 *   already exist (rotation.ts), so re-runs are stable and nobody's turn is
 *   consumed by a day they didn't work.
 * - Three ways to assign: `fixed` (one named person), `rotating` (the pool
 *   takes turns), and `everyone` (each person in the pool gets their OWN copy
 *   on every occurrence — "clean your room" is one chore, not one per kid).
 * - Presence-aware: nobody is scheduled on a day they're away (see
 *   presence.ts). Fixed chores simply skip that day; rotations hand the turn
 *   to whoever has gone longest without it and IS home, or skip the day if
 *   nobody is — and the person who was away is first in line when they return;
 *   an `everyone` chore just skips whoever is away and still lands for the
 *   rest.
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

		// Every turn this chore has ever handed out, past and already-scheduled.
		// Rotation reads it to find who's gone longest without it; each insert
		// appends, so picks stay correct across the whole run.
		const turns: Turn[] = db
			.select({ userId: choreInstances.assigneeId, dueDate: choreInstances.dueDate })
			.from(choreInstances)
			.where(eq(choreInstances.choreId, chore.id))
			.all();

		// What already exists. The unique index allows several people on one
		// date (that IS an `everyone` chore), so fixed and rotating chores need
		// the narrower "one per date, whoever holds it" rule enforced here —
		// otherwise a rotation whose derived pick shifted would double up on a
		// date it had already filled.
		const datesTaken = new Set(turns.map((t) => t.dueDate));
		const slotsTaken = new Set(turns.map((t) => `${t.dueDate}|${t.userId}`));

		db.transaction((tx) => {
			for (const dueDate of dates) {
				const homeIn = (userId: number) => isHome(tx, userId, dueDate);

				// Who is due this chore on this date? One person, or all of them.
				let assignees: number[];
				if (chore.assignmentType === 'everyone') {
					assignees = pool.filter((p) => homeIn(p.userId)).map((p) => p.userId);
				} else if (chore.assignmentType === 'rotating') {
					const pick = pickRotationAssignee(pool, turns, dueDate, homeIn);
					assignees = pick ? [pick.userId] : [];
				} else {
					assignees = homeIn(pool[0].userId) ? [pool[0].userId] : [];
				}
				if (assignees.length === 0) continue; // everyone (or the assignee) is away
				if (chore.assignmentType !== 'everyone' && datesTaken.has(dueDate)) continue;

				for (const assigneeId of assignees) {
					if (slotsTaken.has(`${dueDate}|${assigneeId}`)) continue;

					const result = tx
						.insert(choreInstances)
						.values({
							choreId: chore.id,
							assigneeId,
							dueDate,
							// Frozen now: retuning a chore's points mid-week must not
							// move the denominator under a week already in progress.
							weight: instanceWeight(chore.points),
							isBonus: chore.isBonus
						})
						.onConflictDoNothing()
						.run();

					if (result.changes > 0) {
						created++;
						turns.push({ userId: assigneeId, dueDate });
						datesTaken.add(dueDate);
						slotsTaken.add(`${dueDate}|${assigneeId}`);
					}
				}
			}
		});
	}

	return created;
}
