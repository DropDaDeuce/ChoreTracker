import { and, asc, eq, gte } from 'drizzle-orm';
import { todayLocal } from './dates';
import { choreInstances, presenceDays, presenceRules } from './db/schema';
import type { DB } from './db/type';
import { generateDueInstances } from './generate';
import { isHome } from './presence';

/** Presence mutations — every change re-syncs the scheduled instances. */

/** Flip one day relative to its current effective value. */
export function toggleDay(db: DB, userId: number, date: string, today = todayLocal()): void {
	const next = !isHome(db, userId, date);
	db.insert(presenceDays)
		.values({ userId, date, isHome: next })
		.onConflictDoUpdate({
			target: [presenceDays.userId, presenceDays.date],
			set: { isHome: next }
		})
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
 * backfill with someone present), then regenerate. Done/verified history and
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
	generateDueInstances(db, today);
}
