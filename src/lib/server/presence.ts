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
		case 'weekly': {
			// Mask rules cover any set of days; legacy rows (mask 0) fall back
			// to their single `weekday`.
			const mask =
				rule.weekdayMask || (rule.weekday !== null ? 1 << rule.weekday : 0);
			return (mask & (1 << isoWeekday(date))) !== 0;
		}
		case 'biweekly': {
			// 14-day cycle anchored to the changeover day: the 7 days starting
			// at the anchor are "on", the next 7 "off", repeating both ways.
			// The mask then picks days within the on-week (usually all of them
			// for split-household custody; a single bit for legacy rules).
			if (!rule.anchorDate) return false;
			const mask =
				rule.weekdayMask || (rule.weekday !== null ? 1 << rule.weekday : 0);
			if (!(mask & (1 << isoWeekday(date)))) return false;
			const dayIndex = ((diffDays(rule.anchorDate, date) % 14) + 14) % 14;
			return dayIndex < 7;
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
	return isHomeByRules(db, userId, date);
}

/** What the repeating patterns alone say — ignores single-day overrides. */
export function isHomeByRules(db: DB, userId: number, date: string): boolean {
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
