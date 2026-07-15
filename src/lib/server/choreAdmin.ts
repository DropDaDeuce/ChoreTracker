import { and, eq, gte } from 'drizzle-orm';
import { todayLocal } from './dates';
import { db } from './db';
import { choreAssignees, choreInstances, chores } from './db/schema';
import type { DB } from './db/type';
import { generateDueInstances } from './generate';
import type { ChoreInput } from './validation';

/** Map validated form input onto chore table columns. */
export function choreColumnsFromInput(input: ChoreInput) {
	return {
		title: input.title,
		description: input.description,
		frequency: input.frequency,
		interval: input.interval,
		weekdayMask: input.weekdays.reduce((mask, d) => mask | (1 << d), 0),
		dayOfMonth: input.dayOfMonth ?? null,
		monthOfYear: input.monthOfYear ?? null,
		startDate: input.startDate,
		points: input.points,
		allowanceCents: Math.round(input.allowance * 100),
		requiresVerification: input.requiresVerification
	};
}

export function createChore(input: ChoreInput): number {
	const choreId = db.transaction((tx) => {
		const created = tx.insert(chores).values(choreColumnsFromInput(input)).returning().get();
		tx.insert(choreAssignees)
			.values({ choreId: created.id, userId: input.assigneeId, position: 0 })
			.run();
		return created.id;
	});
	generateDueInstances(db);
	return choreId;
}

export function updateChore(choreId: number, input: ChoreInput): void {
	db.transaction((tx) => {
		tx.update(chores).set(choreColumnsFromInput(input)).where(eq(chores.id, choreId)).run();
		tx.delete(choreAssignees).where(eq(choreAssignees.choreId, choreId)).run();
		tx.insert(choreAssignees)
			.values({ choreId, userId: input.assigneeId, position: 0 })
			.run();
		// Recurrence or assignee may have changed: drop future open instances and
		// regenerate. Done/verified history (and overdue items) stays untouched.
		deleteOpenFutureInstances(tx, choreId);
	});
	generateDueInstances(db);
}

export function setChoreActive(choreId: number, isActive: boolean): void {
	db.transaction((tx) => {
		tx.update(chores).set({ isActive }).where(eq(chores.id, choreId)).run();
		if (!isActive) deleteOpenFutureInstances(tx, choreId);
	});
	if (isActive) generateDueInstances(db);
}

function deleteOpenFutureInstances(tx: DB, choreId: number): void {
	tx.delete(choreInstances)
		.where(
			and(
				eq(choreInstances.choreId, choreId),
				eq(choreInstances.status, 'pending'),
				gte(choreInstances.dueDate, todayLocal())
			)
		)
		.run();
}
