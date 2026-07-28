import { and, eq, sql } from 'drizzle-orm';
import { weekStartFor } from './allowance';
import {
	allowanceLedger,
	choreInstances,
	chores,
	reminders,
	users,
	weeklySettlements
} from './db/schema';
import type { DB } from './db/type';
import { getSettingInt, UNDO_WINDOW_MINUTES_KEY } from './settings';

/**
 * Instance lifecycle: pending → done → verified | rejected.
 * All mutations validate the transition and throw Error with a user-facing
 * message on bad input; routes surface that via fail(400).
 *
 * Money is NOT written here any more. Verifying freezes the points and marks
 * the chore approved; what it pays is only knowable once the week closes and
 * the allowance is divided up (allowance.ts).
 */

export class InstanceActionError extends Error {}

/**
 * A settled week is history. Once the allowance has been paid, changing what
 * happened inside that week would mean the money on record no longer matches
 * the chores on record — so the whole week freezes and adults correct with a
 * bonus instead.
 */
function assertWeekOpen(db: DB, userId: number, dueDate: string): void {
	const settled = db
		.select({ id: weeklySettlements.id })
		.from(weeklySettlements)
		.where(
			and(
				eq(weeklySettlements.userId, userId),
				eq(weeklySettlements.weekStart, weekStartFor(db, dueDate))
			)
		)
		.get();
	if (settled) {
		throw new InstanceActionError(
			"That week's allowance has already been paid — an adult can add a bonus instead."
		);
	}
}

function getInstanceWithChore(db: DB, instanceId: number) {
	const row = db
		.select({ instance: choreInstances, chore: chores })
		.from(choreInstances)
		.innerJoin(chores, eq(choreInstances.choreId, chores.id))
		.where(eq(choreInstances.id, instanceId))
		.get();
	if (!row) throw new InstanceActionError('Chore not found.');
	return row;
}

/**
 * Mark an instance done. Allowed for the assignee themself or any adult.
 * When the chore needs no verification it is finalized (and paid) immediately.
 */
export function markDone(
	db: DB,
	instanceId: number,
	actor: { id: number; role: string },
	photoPath?: string
): void {
	const { instance, chore } = getInstanceWithChore(db, instanceId);
	if (instance.status !== 'pending') {
		throw new InstanceActionError('This chore is not open — it may already be done.');
	}
	if (actor.id !== instance.assigneeId && actor.role !== 'adult') {
		throw new InstanceActionError('Only the assignee (or an adult) can mark this done.');
	}
	if (chore.requiresPhoto && !photoPath) {
		throw new InstanceActionError('This chore needs a photo as proof.');
	}
	assertWeekOpen(db, instance.assigneeId, instance.dueDate);

	db.transaction((tx) => {
		tx.update(choreInstances)
			.set({ status: 'done', doneAt: new Date(), doneBy: actor.id, photoPath: photoPath ?? null })
			.where(eq(choreInstances.id, instanceId))
			.run();
		if (!chore.requiresVerification) {
			finalizeVerification(tx, instanceId, actor.id);
		}
	});
}

/**
 * Undo a mark-done.
 * - `done` (not yet verified): revert to pending any time.
 * - auto-verified (chore needs no verification): revert within the undo
 *   window, unwinding the frozen payout and its ledger earning.
 * - adult-verified: no undo — adults reject instead.
 */
export function undoMarkDone(db: DB, instanceId: number, actor: { id: number; role: string }): void {
	const { instance, chore } = getInstanceWithChore(db, instanceId);
	if (actor.id !== instance.assigneeId && actor.id !== instance.doneBy && actor.role !== 'adult') {
		throw new InstanceActionError('Only the person who did it (or an adult) can undo.');
	}
	assertWeekOpen(db, instance.assigneeId, instance.dueDate);

	const revert = {
		status: 'pending' as const,
		doneAt: null,
		doneBy: null,
		verifiedAt: null,
		verifiedBy: null,
		payoutCents: null,
		pointsAwarded: null,
		photoPath: null
	};

	if (instance.status === 'done') {
		db.update(choreInstances).set(revert).where(eq(choreInstances.id, instanceId)).run();
		return;
	}

	if (instance.status === 'verified' && !chore.requiresVerification) {
		// >= so a window of 0 minutes means auto-verified chores can't be undone.
		const windowMinutes = getSettingInt(db, UNDO_WINDOW_MINUTES_KEY, 15);
		const verifiedAt = instance.verifiedAt?.getTime() ?? 0;
		if (windowMinutes <= 0 || Date.now() - verifiedAt >= windowMinutes * 60_000) {
			throw new InstanceActionError('Too late to undo this one.');
		}
		// No ledger to unwind: the week hasn't been settled (assertWeekOpen
		// guarantees it), so this chore hasn't been paid yet — it simply stops
		// counting toward the week in progress.
		db.update(choreInstances).set(revert).where(eq(choreInstances.id, instanceId)).run();
		return;
	}

	throw new InstanceActionError("This chore can't be undone — ask an adult to reject it.");
}

/** Adult nudges someone about an open/unverified chore; reduces the payout. */
export function addReminder(db: DB, instanceId: number, adultId: number): void {
	const { instance } = getInstanceWithChore(db, instanceId);
	if (instance.status !== 'pending' && instance.status !== 'done') {
		throw new InstanceActionError('Reminders only apply to open chores.');
	}
	assertWeekOpen(db, instance.assigneeId, instance.dueDate);
	db.transaction((tx) => {
		tx.insert(reminders).values({ instanceId, remindedBy: adultId }).run();
		tx.update(choreInstances)
			.set({ reminderCount: sql`${choreInstances.reminderCount} + 1` })
			.where(eq(choreInstances.id, instanceId))
			.run();
	});
}

/** Adult approves a done chore: freezes its points and counts it toward the week. */
export function verifyInstance(db: DB, instanceId: number, adultId: number): void {
	const { instance } = getInstanceWithChore(db, instanceId);
	if (instance.status !== 'done') {
		throw new InstanceActionError('Only chores marked done can be verified.');
	}
	assertWeekOpen(db, instance.assigneeId, instance.dueDate);
	db.transaction((tx) => finalizeVerification(tx, instanceId, adultId));
}

/**
 * Adult grants extra points on one occurrence — "you went above and beyond".
 * Sets rather than adds, so a mistyped grant is corrected by entering the
 * right number. Paid at the week's bonus rate when the week settles.
 */
export function grantBonusPoints(db: DB, instanceId: number, points: number): void {
	if (!Number.isInteger(points) || points < 0 || points > 1000) {
		throw new InstanceActionError('Bonus points must be a whole number up to 1000.');
	}
	const { instance } = getInstanceWithChore(db, instanceId);
	assertWeekOpen(db, instance.assigneeId, instance.dueDate);
	db.update(choreInstances)
		.set({ bonusPoints: points })
		.where(eq(choreInstances.id, instanceId))
		.run();
}

/** Adult rejects a done chore: back to pending so it can be redone. */
export function rejectInstance(db: DB, instanceId: number, adultId: number, note?: string): void {
	const { instance } = getInstanceWithChore(db, instanceId);
	if (instance.status !== 'done') {
		throw new InstanceActionError('Only chores marked done can be rejected.');
	}
	assertWeekOpen(db, instance.assigneeId, instance.dueDate);
	db.update(choreInstances)
		.set({
			status: 'pending',
			doneAt: null,
			doneBy: null,
			photoPath: null,
			verifiedAt: new Date(),
			verifiedBy: adultId,
			note: note?.trim() || instance.note
		})
		.where(eq(choreInstances.id, instanceId))
		.run();
}

/**
 * Shared by verifyInstance and no-verification markDone. Freezes the points
 * and marks the chore approved.
 *
 * No money moves here. What this chore is worth depends on how the rest of
 * the week turns out — how many days were worked, how the day it lives on is
 * shared — so the cash is worked out and written once, when the week settles
 * (allowance.ts). `payoutCents` is stamped at that point.
 */
function finalizeVerification(tx: DB, instanceId: number, verifierId: number): void {
	const { chore } = getInstanceWithChore(tx, instanceId);

	tx.update(choreInstances)
		.set({
			status: 'verified',
			verifiedAt: new Date(),
			verifiedBy: verifierId,
			pointsAwarded: chore.points
		})
		.where(eq(choreInstances.id, instanceId))
		.run();
}

/** A user's allowance balance in cents (sum of their ledger). */
export function balanceCents(db: DB, userId: number): number {
	const row = db
		.select({ total: sql<number>`coalesce(sum(${allowanceLedger.amountCents}), 0)` })
		.from(allowanceLedger)
		.where(eq(allowanceLedger.userId, userId))
		.get();
	return row?.total ?? 0;
}

/** Adult grants a bonus or applies a penalty outside the chore flow. */
export function addAdjustment(
	db: DB,
	userId: number,
	adultId: number,
	type: 'bonus' | 'penalty',
	amountCents: number,
	note: string
): void {
	if (!Number.isInteger(amountCents) || amountCents <= 0) {
		throw new InstanceActionError('Amount must be more than zero.');
	}
	const target = db.select().from(users).where(eq(users.id, userId)).get();
	if (!target) throw new InstanceActionError('Person not found.');

	db.insert(allowanceLedger)
		.values({
			userId,
			type,
			amountCents: type === 'bonus' ? amountCents : -amountCents,
			note: note.trim() || (type === 'bonus' ? 'Bonus' : 'Penalty'),
			createdBy: adultId
		})
		.run();
}

/** Adult pays out a kid's full balance: appends a negative `payout` row. */
export function payOutBalance(db: DB, kidId: number, adultId: number): number {
	const kid = db.select().from(users).where(eq(users.id, kidId)).get();
	if (!kid) throw new InstanceActionError('Person not found.');

	return db.transaction((tx) => {
		const balance = balanceCents(tx, kidId);
		if (balance <= 0) throw new InstanceActionError('Nothing to pay out.');
		tx.insert(allowanceLedger)
			.values({
				userId: kidId,
				type: 'payout',
				amountCents: -balance,
				note: 'Balance paid out',
				createdBy: adultId
			})
			.run();
		return balance;
	});
}
