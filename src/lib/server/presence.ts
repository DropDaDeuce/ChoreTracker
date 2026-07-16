import { and, desc, eq } from 'drizzle-orm';
import { dayOf, daysInMonth, diffDays, isoWeekday, monthOf, yearOf } from './dates';
import { presenceDays, presenceRules } from './db/schema';
import type { DB } from './db/type';

/**
 * Presence reads: which days is a person at home? Drives whether chores are
 * scheduled for them at all (see generate.ts). Mutations live in
 * presenceAdmin.ts (they trigger regeneration, which reads this module).
 *
 * Resolution order for a given day: single-day override → most recently
 * created matching rule → default HOME.
 */

export type PresenceRule = typeof presenceRules.$inferSelect;

export function ruleMatches(rule: PresenceRule, date: string): boolean {
	switch (rule.kind) {
		case 'weekly':
			return isoWeekday(date) === rule.weekday;
		case 'biweekly': {
			if (isoWeekday(date) !== rule.weekday || !rule.anchorDate) return false;
			const weeks = Math.floor(diffDays(rule.anchorDate, date) / 7);
			return ((weeks % 2) + 2) % 2 === 0; // same fortnight parity as the anchor
		}
		case 'monthly': {
			if (!rule.dayOfMonth) return false;
			const clamped = Math.min(rule.dayOfMonth, daysInMonth(yearOf(date), monthOf(date)));
			return dayOf(date) === clamped;
		}
	}
}

export function isHome(db: DB, userId: number, date: string): boolean {
	const override = db
		.select()
		.from(presenceDays)
		.where(and(eq(presenceDays.userId, userId), eq(presenceDays.date, date)))
		.get();
	if (override) return override.isHome;

	const rules = db
		.select()
		.from(presenceRules)
		.where(eq(presenceRules.userId, userId))
		.orderBy(desc(presenceRules.createdAt), desc(presenceRules.id))
		.all();
	for (const rule of rules) {
		if (ruleMatches(rule, date)) return rule.isHome;
	}
	return true;
}
