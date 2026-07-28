import { and, asc, eq, gte } from 'drizzle-orm';
import { todayLocal } from './dates';
import {
	choreAssignees,
	choreInstances,
	chores,
	presenceDays,
	presenceRules,
	swapRequests
} from './db/schema';
import type { DB } from './db/type';
import { generateDueInstances } from './generate';
import { isHome, isHomeByRules } from './presence';

/** Presence mutations — every change re-syncs the scheduled instances. */

/**
 * Flip one day relative to its current effective value. Self-cleaning: when
 * the flipped value is what the patterns already say, the override is DELETED
 * instead of stored — so click-click returns a day to pattern-following
 * rather than silently pinning it against future rule changes.
 */
export function toggleDay(db: DB, userId: number, date: string, today = todayLocal()): void {
	const next = !isHome(db, userId, date);
	if (next === isHomeByRules(db, userId, date)) {
		db.delete(presenceDays)
			.where(and(eq(presenceDays.userId, userId), eq(presenceDays.date, date)))
			.run();
	} else {
		db.insert(presenceDays)
			.values({ userId, date, isHome: next })
			.onConflictDoUpdate({
				target: [presenceDays.userId, presenceDays.date],
				set: { isHome: next }
			})
			.run();
	}
	applyPresenceChange(db, userId, today);
}

/** Drop every override from `today` on — the person follows patterns again. */
export function clearFutureOverrides(db: DB, userId: number, today = todayLocal()): void {
	db.delete(presenceDays)
		.where(and(eq(presenceDays.userId, userId), gte(presenceDays.date, today)))
		.run();
	applyPresenceChange(db, userId, today);
}

/** Remove a single-day override so the day falls back to its pattern. */
export function resetDay(db: DB, userId: number, date: string, today = todayLocal()): void {
	db.delete(presenceDays)
		.where(and(eq(presenceDays.userId, userId), eq(presenceDays.date, date)))
		.run();
	applyPresenceChange(db, userId, today);
}

export function addRule(
	db: DB,
	userId: number,
	rule: {
		kind: 'weekly' | 'biweekly' | 'monthly';
		weekday?: number;
		/** Weekly: bit 0 = Monday … bit 6 = Sunday; covers any set of days. */
		weekdayMask?: number;
		anchorDate?: string;
		dayOfMonth?: number;
		isHome: boolean;
	},
	today = todayLocal()
): void {
	db.insert(presenceRules)
		.values({
			userId,
			kind: rule.kind,
			weekday: rule.weekday ?? null,
			weekdayMask: rule.weekdayMask ?? 0,
			anchorDate: rule.anchorDate ?? null,
			dayOfMonth: rule.dayOfMonth ?? null,
			isHome: rule.isHome
		})
		.run();
	applyPresenceChange(db, userId, today);
}

export function deleteRule(db: DB, userId: number, ruleId: number, today = todayLocal()): void {
	db.delete(presenceRules)
		.where(and(eq(presenceRules.id, ruleId), eq(presenceRules.userId, userId)))
		.run();
	applyPresenceChange(db, userId, today);
}

/**
 * After any presence change: drop this person's future OPEN chores on days
 * they're now away (freeing the unique chore+date slot so rotations can
 * backfill with someone present), tear down the forward schedule of every
 * rotation they're in, then regenerate. Done/verified history and
 * already-overdue items are untouched; flipping back home regenerates.
 */
export function applyPresenceChange(db: DB, userId: number, today = todayLocal()): void {
	const open = db
		.select({ id: choreInstances.id, dueDate: choreInstances.dueDate })
		.from(choreInstances)
		.where(
			and(
				eq(choreInstances.assigneeId, userId),
				eq(choreInstances.status, 'pending'),
				gte(choreInstances.dueDate, today)
			)
		)
		.orderBy(asc(choreInstances.dueDate))
		.all();

	for (const instance of open) {
		if (!isHome(db, userId, instance.dueDate)) {
			db.delete(choreInstances).where(eq(choreInstances.id, instance.id)).run();
		}
	}
	rebuildRotations(db, userId, today);
	generateDueInstances(db, today);
}

/**
 * Clear the forward schedule of every rotation this person belongs to so
 * generation can re-derive it under their new presence.
 *
 * Backfilling only the freed day isn't enough: the rolling window is already
 * materialized, so the turns AFTER an away day are still laid out as if the
 * person were home. Someone would cover the away day and the returning person
 * would sit idle until their old pre-computed slot came round. Wiping the
 * forward window lets least-recently-served rotation put them back on the
 * first day they're available.
 *
 * Only future PENDING turns go — history, overdue work, and anything with an
 * open swap request (deleting the instance would cascade the request away)
 * stay exactly where they are. Re-derivation is deterministic, so days the
 * change doesn't affect land on the same person again.
 */
function rebuildRotations(db: DB, userId: number, today: string): void {
	const rotations = db
		.select({ choreId: choreAssignees.choreId })
		.from(choreAssignees)
		.innerJoin(chores, eq(choreAssignees.choreId, chores.id))
		.where(
			and(
				eq(choreAssignees.userId, userId),
				eq(chores.assignmentType, 'rotating'),
				eq(chores.isActive, true)
			)
		)
		.all();
	if (rotations.length === 0) return;

	const swapped = new Set(
		db
			.select({ instanceId: swapRequests.instanceId })
			.from(swapRequests)
			.where(eq(swapRequests.status, 'pending'))
			.all()
			.map((row) => row.instanceId)
	);

	for (const { choreId } of rotations) {
		const upcoming = db
			.select({ id: choreInstances.id })
			.from(choreInstances)
			.where(
				and(
					eq(choreInstances.choreId, choreId),
					eq(choreInstances.status, 'pending'),
					gte(choreInstances.dueDate, today)
				)
			)
			.all();
		for (const instance of upcoming) {
			if (swapped.has(instance.id)) continue;
			db.delete(choreInstances).where(eq(choreInstances.id, instance.id)).run();
		}
	}
}
