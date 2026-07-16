import { eq, sql } from 'drizzle-orm';
import { allowanceLedger, choreInstances, chores, reminders, users } from './db/schema';
import type { DB } from './db/type';
import { computePayoutCents, payoutReason } from './payout';
import {
	getSettingInt,
	REMINDER_PENALTY_PERCENT_KEY,
	UNDO_WINDOW_MINUTES_KEY
} from './settings';

/**
 * Instance lifecycle: pending → done → verified | rejected.
 * All mutations validate the transition and throw Error with a user-facing
 * message on bad input; routes surface that via fail(400).
 */

export class InstanceActionError extends Error {}

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
		db.transaction((tx) => {
			// This unwinds a mistake, so the earning is deleted rather than
			// compensated — the ledger should read as if it never happened.
			tx.delete(allowanceLedger).where(eq(allowanceLedger.instanceId, instanceId)).run();
			tx.update(choreInstances).set(revert).where(eq(choreInstances.id, instanceId)).run();
		});
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
	db.transaction((tx) => {
		tx.insert(reminders).values({ instanceId, remindedBy: adultId }).run();
		tx.update(choreInstances)
			.set({ reminderCount: sql`${choreInstances.reminderCount} + 1` })
			.where(eq(choreInstances.id, instanceId))
			.run();
	});
}

/** Adult approves a done chore: freezes the payout and writes the ledger. */
export function verifyInstance(db: DB, instanceId: number, adultId: number): void {
	const { instance } = getInstanceWithChore(db, instanceId);
	if (instance.status !== 'done') {
		throw new InstanceActionError('Only chores marked done can be verified.');
	}
	db.transaction((tx) => finalizeVerification(tx, instanceId, adultId));
}

/** Adult rejects a done chore: back to pending so it can be redone. */
export function rejectInstance(db: DB, instanceId: number, adultId: number, note?: string): void {
	const { instance } = getInstanceWithChore(db, instanceId);
	if (instance.status !== 'done') {
		throw new InstanceActionError('Only chores marked done can be rejected.');
	}
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
 * Shared by verifyInstance and no-verification markDone. Computes the payout
 * from the reminder count, freezes it on the instance, and — when there is
 * money to pay — appends an earning to the ledger.
 */
function finalizeVerification(tx: DB, instanceId: number, verifierId: number): void {
	const { instance, chore } = getInstanceWithChore(tx, instanceId);
	const penaltyPercent = getSettingInt(tx, REMINDER_PENALTY_PERCENT_KEY, 50);
	const payoutCents = computePayoutCents(
		chore.allowanceCents,
		instance.reminderCount,
		penaltyPercent
	);

	tx.update(choreInstances)
		.set({
			status: 'verified',
			verifiedAt: new Date(),
			verifiedBy: verifierId,
			payoutCents,
			pointsAwarded: chore.points
		})
		.where(eq(choreInstances.id, instanceId))
		.run();

	if (payoutCents > 0) {
		const reason = payoutReason(instance.reminderCount);
		tx.insert(allowanceLedger)
			.values({
				userId: instance.assigneeId,
				instanceId,
				type: 'earning',
				amountCents: payoutCents,
				note: `${chore.title} (${instance.dueDate})${reason ? ` — ${reason}` : ''}`,
				createdBy: verifierId
			})
			.run();
	}
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
