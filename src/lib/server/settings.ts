import { eq } from 'drizzle-orm';
import { appSettings } from './db/schema';
import type { DB } from './db/type';

export function getSetting(db: DB, key: string): string | null {
	const row = db.select().from(appSettings).where(eq(appSettings.key, key)).get();
	return row?.value ?? null;
}

export function getSettingInt(db: DB, key: string, fallback: number): number {
	const raw = getSetting(db, key);
	if (raw === null) return fallback;
	const n = Number.parseInt(raw, 10);
	return Number.isFinite(n) ? n : fallback;
}

export function setSetting(db: DB, key: string, value: string): void {
	db.insert(appSettings)
		.values({ key, value })
		.onConflictDoUpdate({ target: appSettings.key, set: { value } })
		.run();
}

/** % taken off the allowance after exactly one reminder (2+ always pays 0). */
export const REMINDER_PENALTY_PERCENT_KEY = 'reminder_penalty_percent';

/** Currency symbol shown wherever money is displayed. */
export const CURRENCY_SYMBOL_KEY = 'currency_symbol';

/** Minutes during which an auto-verified mark-done can still be undone. */
export const UNDO_WINDOW_MINUTES_KEY = 'undo_window_minutes';

/**
 * Any weekday name ('monday' … 'sunday') — the day the week turns over, for
 * the calendar, the leaderboard AND the allowance week.
 */
export const WEEK_START_KEY = 'week_start';

/** How many nightly auto-backups to keep in data/backups (0 disables them). */
export const BACKUP_KEEP_COUNT_KEY = 'backup_keep_count';

/**
 * The household's weekly allowance pot, in cents. ONE number for everyone —
 * what separates two kids is how many days they were around to work, not a
 * per-person rate. 0 turns the whole money model off.
 */
export const WEEKLY_ALLOWANCE_CENTS_KEY = 'weekly_allowance_cents';

/**
 * Days in a "full week" of chores. 0 = auto (the busiest kid sets it). Pin it
 * when auto misbehaves — e.g. an older kid with a 7-day chore would otherwise
 * quietly cap a younger sibling who was never meant to work that many days.
 */
export const FULL_WEEK_DAYS_KEY = 'full_week_days';

/**
 * Days to wait after a week ends before settling it, so the weekend verify
 * queue still counts toward the week it belongs to.
 */
export const SETTLEMENT_GRACE_DAYS_KEY = 'settlement_grace_days';

export const DEFAULT_SETTINGS = {
	[REMINDER_PENALTY_PERCENT_KEY]: '50',
	[CURRENCY_SYMBOL_KEY]: '$',
	[UNDO_WINDOW_MINUTES_KEY]: '15',
	[WEEK_START_KEY]: 'saturday',
	[BACKUP_KEEP_COUNT_KEY]: '14',
	[WEEKLY_ALLOWANCE_CENTS_KEY]: '0',
	[FULL_WEEK_DAYS_KEY]: '0',
	[SETTLEMENT_GRACE_DAYS_KEY]: '1'
} as const;

export function getSettingOr(db: DB, key: keyof typeof DEFAULT_SETTINGS): string {
	return getSetting(db, key) ?? DEFAULT_SETTINGS[key];
}
