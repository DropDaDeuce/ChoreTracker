import { requireAdult } from '$lib/server/auth';
import { db } from '$lib/server/db';
import { WEEKDAY_NAMES } from '$lib/server/dates';
import {
	BACKUP_KEEP_COUNT_KEY,
	CURRENCY_SYMBOL_KEY,
	FULL_WEEK_DAYS_KEY,
	getSettingOr,
	REMINDER_PENALTY_PERCENT_KEY,
	SETTLEMENT_GRACE_DAYS_KEY,
	setSetting,
	UNDO_WINDOW_MINUTES_KEY,
	WEEK_START_KEY,
	WEEKLY_ALLOWANCE_CENTS_KEY
} from '$lib/server/settings';
import { fail } from '@sveltejs/kit';
import { z } from 'zod';
import type { Actions, PageServerLoad } from './$types';

const settingsSchema = z.object({
	currencySymbol: z.string().trim().min(1, 'Currency symbol is required.').max(4),
	reminderPenaltyPercent: z.coerce.number().int().min(0).max(100),
	undoWindowMinutes: z.coerce.number().int().min(0).max(1440),
	weekStart: z.enum(WEEKDAY_NAMES),
	backupKeepCount: z.coerce.number().int().min(0).max(365),
	/** Dollars in the form; stored as cents. */
	weeklyAllowance: z.coerce.number().min(0).max(10000),
	/** 0 = auto: the busiest kid's day count sets it. */
	fullWeekDays: z.coerce.number().int().min(0).max(7),
	settlementGraceDays: z.coerce.number().int().min(0).max(6)
});

export const load: PageServerLoad = ({ locals }) => {
	requireAdult(locals);
	return {
		weekdays: WEEKDAY_NAMES,
		settings: {
			currencySymbol: getSettingOr(db, CURRENCY_SYMBOL_KEY),
			reminderPenaltyPercent: Number(getSettingOr(db, REMINDER_PENALTY_PERCENT_KEY)),
			undoWindowMinutes: Number(getSettingOr(db, UNDO_WINDOW_MINUTES_KEY)),
			weekStart: getSettingOr(db, WEEK_START_KEY),
			backupKeepCount: Number(getSettingOr(db, BACKUP_KEEP_COUNT_KEY)),
			weeklyAllowance: Number(getSettingOr(db, WEEKLY_ALLOWANCE_CENTS_KEY)) / 100,
			fullWeekDays: Number(getSettingOr(db, FULL_WEEK_DAYS_KEY)),
			settlementGraceDays: Number(getSettingOr(db, SETTLEMENT_GRACE_DAYS_KEY))
		}
	};
};

export const actions: Actions = {
	default: async ({ request, locals }) => {
		requireAdult(locals);
		const form = await request.formData();
		const parsed = settingsSchema.safeParse({
			currencySymbol: form.get('currencySymbol'),
			reminderPenaltyPercent: form.get('reminderPenaltyPercent'),
			undoWindowMinutes: form.get('undoWindowMinutes'),
			weekStart: form.get('weekStart'),
			backupKeepCount: form.get('backupKeepCount'),
			weeklyAllowance: form.get('weeklyAllowance') || 0,
			fullWeekDays: form.get('fullWeekDays') || 0,
			settlementGraceDays: form.get('settlementGraceDays') || 0
		});
		if (!parsed.success) {
			return fail(400, { message: parsed.error.issues[0]?.message ?? 'Invalid input.' });
		}

		setSetting(db, CURRENCY_SYMBOL_KEY, parsed.data.currencySymbol);
		setSetting(db, REMINDER_PENALTY_PERCENT_KEY, String(parsed.data.reminderPenaltyPercent));
		setSetting(db, UNDO_WINDOW_MINUTES_KEY, String(parsed.data.undoWindowMinutes));
		setSetting(db, WEEK_START_KEY, parsed.data.weekStart);
		setSetting(db, BACKUP_KEEP_COUNT_KEY, String(parsed.data.backupKeepCount));
		setSetting(
			db,
			WEEKLY_ALLOWANCE_CENTS_KEY,
			String(Math.round(parsed.data.weeklyAllowance * 100))
		);
		setSetting(db, FULL_WEEK_DAYS_KEY, String(parsed.data.fullWeekDays));
		setSetting(db, SETTLEMENT_GRACE_DAYS_KEY, String(parsed.data.settlementGraceDays));
		return { success: true };
	}
};
