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

/** 'monday' | 'sunday' — used by week-based views (calendar, Phase 3). */
export const WEEK_START_KEY = 'week_start';

export const DEFAULT_SETTINGS = {
	[REMINDER_PENALTY_PERCENT_KEY]: '50',
	[CURRENCY_SYMBOL_KEY]: '$',
	[UNDO_WINDOW_MINUTES_KEY]: '15',
	[WEEK_START_KEY]: 'monday'
} as const;

export function getSettingOr(db: DB, key: keyof typeof DEFAULT_SETTINGS): string {
	return getSetting(db, key) ?? DEFAULT_SETTINGS[key];
}
