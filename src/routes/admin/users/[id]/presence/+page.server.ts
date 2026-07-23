import { requireAdult } from '$lib/server/auth';
import { daysInMonth, isDateString, todayLocal } from '$lib/server/dates';
import { db } from '$lib/server/db';
import { presenceDays, presenceRules, users } from '$lib/server/db/schema';
import { isHome } from '$lib/server/presence';
import {
	addRule,
	clearFutureOverrides,
	deleteRule,
	resetDay,
	toggleDay
} from '$lib/server/presenceAdmin';
import { getSettingOr, WEEK_START_KEY } from '$lib/server/settings';
import { error, fail } from '@sveltejs/kit';
import { and, between, desc, eq } from 'drizzle-orm';
import { z } from 'zod';
import type { Actions, PageServerLoad } from './$types';

function getPerson(id: number) {
	const person = db.select().from(users).where(eq(users.id, id)).get();
	if (!person) error(404, 'Person not found');
	return person;
}

export const load: PageServerLoad = ({ locals, params, url }) => {
	requireAdult(locals);
	const person = getPerson(Number(params.id));
	const today = todayLocal();

	const monthParam = /^\d{4}-(0[1-9]|1[0-2])$/.test(url.searchParams.get('month') ?? '')
		? url.searchParams.get('month')!
		: today.slice(0, 7);
	const [year, month] = monthParam.split('-').map(Number);
	const dim = daysInMonth(year, month);
	const first = `${monthParam}-01`;
	const last = `${monthParam}-${String(dim).padStart(2, '0')}`;

	const overrides = new Set(
		db
			.select({ date: presenceDays.date })
			.from(presenceDays)
			.where(and(eq(presenceDays.userId, person.id), between(presenceDays.date, first, last)))
			.all()
			.map((r) => r.date)
	);

	const days = Array.from({ length: dim }, (_, i) => {
		const date = `${monthParam}-${String(i + 1).padStart(2, '0')}`;
		return { date, home: isHome(db, person.id, date), override: overrides.has(date) };
	});

	const rules = db
		.select()
		.from(presenceRules)
		.where(eq(presenceRules.userId, person.id))
		.orderBy(desc(presenceRules.createdAt), desc(presenceRules.id))
		.all();

	const prev = month === 1 ? `${year - 1}-12` : `${year}-${String(month - 1).padStart(2, '0')}`;
	const next = month === 12 ? `${year + 1}-01` : `${year}-${String(month + 1).padStart(2, '0')}`;

	return {
		person: { id: person.id, name: person.name, avatarColor: person.avatarColor },
		monthParam,
		year,
		month,
		days,
		rules,
		prev,
		next,
		today,
		weekStart: getSettingOr(db, WEEK_START_KEY) as 'monday' | 'sunday'
	};
};

const ruleSchema = z
	.object({
		kind: z.enum(['weekly', 'biweekly', 'monthly']),
		isHome: z.enum(['true', 'false']).transform((v) => v === 'true'),
		weekday: z.coerce.number().int().min(0).max(6).optional(),
		/** Weekly: any set of days (checkbox chips / presets). */
		weekdays: z.array(z.coerce.number().int().min(0).max(6)).default([]),
		anchorDate: z.string().optional(),
		dayOfMonth: z.coerce.number().int().min(1).max(31).optional()
	})
	.superRefine((r, ctx) => {
		if (r.kind === 'weekly' && r.weekdays.length === 0 && r.weekday === undefined) {
			ctx.addIssue({ code: 'custom', message: 'Pick at least one day.' });
		}
		if (r.kind === 'biweekly' && r.weekday === undefined) {
			ctx.addIssue({ code: 'custom', message: 'Pick a weekday.' });
		}
		if (r.kind === 'biweekly' && !(r.anchorDate && isDateString(r.anchorDate))) {
			ctx.addIssue({ code: 'custom', message: 'Every-other patterns need a starting date.' });
		}
		if (r.kind === 'monthly' && r.dayOfMonth === undefined) {
			ctx.addIssue({ code: 'custom', message: 'Pick a day of the month.' });
		}
	});

export const actions: Actions = {
	toggleDay: async ({ request, locals, params }) => {
		requireAdult(locals);
		const person = getPerson(Number(params.id));
		const date = String((await request.formData()).get('date') ?? '');
		if (!isDateString(date)) return fail(400, { message: 'Bad date.' });
		toggleDay(db, person.id, date);
		return { success: true };
	},

	resetDay: async ({ request, locals, params }) => {
		requireAdult(locals);
		const person = getPerson(Number(params.id));
		const date = String((await request.formData()).get('date') ?? '');
		if (!isDateString(date)) return fail(400, { message: 'Bad date.' });
		resetDay(db, person.id, date);
		return { success: true };
	},

	addRule: async ({ request, locals, params }) => {
		requireAdult(locals);
		const person = getPerson(Number(params.id));
		const form = await request.formData();
		const parsed = ruleSchema.safeParse({
			kind: form.get('kind'),
			isHome: form.get('isHome'),
			weekday: form.get('weekday') ?? undefined,
			weekdays: form.getAll('weekdays'),
			anchorDate: form.get('anchorDate') || undefined,
			dayOfMonth: form.get('dayOfMonth') || undefined
		});
		if (!parsed.success) {
			return fail(400, { message: parsed.error.issues[0]?.message ?? 'Invalid pattern.' });
		}
		// Weekly rules store a mask; the single `weekday` path (context menu)
		// becomes a one-bit mask.
		const r = parsed.data;
		const weekdayMask =
			r.kind === 'weekly'
				? r.weekdays.reduce((mask, d) => mask | (1 << d), 0) ||
					(r.weekday !== undefined ? 1 << r.weekday : 0)
				: 0;
		addRule(db, person.id, {
			...r,
			weekday: r.kind === 'weekly' ? undefined : r.weekday,
			weekdayMask
		});
		return { success: true };
	},

	clearOverrides: async ({ locals, params }) => {
		requireAdult(locals);
		const person = getPerson(Number(params.id));
		clearFutureOverrides(db, person.id);
		return { success: true };
	},

	deleteRule: async ({ request, locals, params }) => {
		requireAdult(locals);
		const person = getPerson(Number(params.id));
		const ruleId = Number((await request.formData()).get('ruleId'));
		deleteRule(db, person.id, ruleId);
		return { success: true };
	}
};
