import { and, asc, eq, gte } from 'drizzle-orm';
import { todayLocal } from './dates';
import { choreAssignees, choreInstances, chores } from './db/schema';
import type { DB } from './db/type';
import { generateDueInstances } from './generate';
import { InstanceActionError } from './instances';

/**
 * Person-centric (un)assignment — the "click on a user, hand them chores"
 * flow. Chore-centric editing (the pool builder) lives in choreAdmin.ts.
 */

/**
 * Add someone to a chore. Fixed chores get their (single) assignee replaced;
 * rotations append to the end of the pool.
 */
export function addAssignee(db: DB, choreId: number, userId: number, today = todayLocal()): void {
	db.transaction((tx) => {
		const chore = tx.select().from(chores).where(eq(chores.id, choreId)).get();
		if (!chore) throw new InstanceActionError('Chore not found.');
		const pool = tx
			.select({ userId: choreAssignees.userId, position: choreAssignees.position })
			.from(choreAssignees)
			.where(eq(choreAssignees.choreId, choreId))
			.orderBy(asc(choreAssignees.position))
			.all();
		if (pool.some((p) => p.userId === userId)) {
			throw new InstanceActionError('They already have this chore.');
		}
		if (chore.assignmentType === 'fixed' && pool.length > 0) {
			tx.delete(choreAssignees).where(eq(choreAssignees.choreId, choreId)).run();
			tx.insert(choreAssignees).values({ choreId, userId, position: 0 }).run();
		} else {
			const nextPos = (pool.at(-1)?.position ?? -1) + 1;
			tx.insert(choreAssignees).values({ choreId, userId, position: nextPos }).run();
		}
		deleteOpenFutureInstances(tx, choreId, today);
	});
	generateDueInstances(db, today);
}

/** Take someone off a chore. The chore stays; it just loses this person. */
export function removeAssignee(db: DB, choreId: number, userId: number, today = todayLocal()): void {
	db.transaction((tx) => {
		const gone = tx
			.delete(choreAssignees)
			.where(and(eq(choreAssignees.choreId, choreId), eq(choreAssignees.userId, userId)))
			.run();
		if (gone.changes === 0) throw new InstanceActionError("They don't have this chore.");
		deleteOpenFutureInstances(tx, choreId, today);
	});
	generateDueInstances(db, today);
}

/**
 * Assignment or recurrence changed: drop future OPEN instances so they
 * regenerate under the new setup. Done/verified history and overdue items
 * are untouched.
 */
export function deleteOpenFutureInstances(tx: DB, choreId: number, today = todayLocal()): void {
	tx.delete(choreInstances)
		.where(
			and(
				eq(choreInstances.choreId, choreId),
				eq(choreInstances.status, 'pending'),
				gte(choreInstances.dueDate, today)
			)
		)
		.run();
}
