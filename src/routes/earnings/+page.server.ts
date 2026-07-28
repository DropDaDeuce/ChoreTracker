import { requireAdult, requireUser } from '$lib/server/auth';
import {
	allowanceConfig,
	computeHouseholdWeek,
	isWeekSettled,
	settleWeek,
	settlementHistory,
	weekStartFor,
	type WeekResult
} from '$lib/server/allowance';
import { addDays, todayLocal } from '$lib/server/dates';
import { db } from '$lib/server/db';
import { allowanceLedger, choreInstances, chores, users } from '$lib/server/db/schema';
import {
	addAdjustment,
	balanceCents,
	InstanceActionError,
	payOutBalance
} from '$lib/server/instances';
import { notifyUser } from '$lib/server/push';
import { fail } from '@sveltejs/kit';
import { and, asc, desc, eq, gt, sql } from 'drizzle-orm';
import type { Actions, PageServerLoad } from './$types';

function earningsFor(
	person: { id: number; name: string; avatarColor: string },
	week: WeekResult | null,
	settled: boolean
) {
	const ledger = db
		.select()
		.from(allowanceLedger)
		.where(eq(allowanceLedger.userId, person.id))
		.orderBy(desc(allowanceLedger.createdAt), desc(allowanceLedger.id))
		.limit(50)
		.all();

	// Verified instances including zero payouts — the ledger only records money,
	// but "2 reminders → nothing" should still be visible here.
	const recentChores = db
		.select({
			title: chores.title,
			dueDate: choreInstances.dueDate,
			payoutCents: choreInstances.payoutCents,
			reminderCount: choreInstances.reminderCount,
			verifiedAt: choreInstances.verifiedAt
		})
		.from(choreInstances)
		.innerJoin(chores, eq(choreInstances.choreId, chores.id))
		.where(and(eq(choreInstances.assigneeId, person.id), eq(choreInstances.status, 'verified')))
		.orderBy(desc(choreInstances.verifiedAt))
		.limit(20)
		.all();

	// "This period" = everything earned since the most recent payout.
	const lastPayout = db
		.select({ createdAt: allowanceLedger.createdAt })
		.from(allowanceLedger)
		.where(and(eq(allowanceLedger.userId, person.id), eq(allowanceLedger.type, 'payout')))
		.orderBy(desc(allowanceLedger.createdAt), desc(allowanceLedger.id))
		.limit(1)
		.get();
	const earnedThisPeriod = db
		.select({ total: sql<number>`coalesce(sum(${allowanceLedger.amountCents}), 0)` })
		.from(allowanceLedger)
		.where(
			and(
				eq(allowanceLedger.userId, person.id),
				gt(allowanceLedger.amountCents, 0),
				...(lastPayout ? [gt(allowanceLedger.createdAt, lastPayout.createdAt)] : [])
			)
		)
		.get();

	return {
		...person,
		balance: balanceCents(db, person.id),
		ledger,
		recentChores,
		periodSince: lastPayout?.createdAt.toISOString().slice(0, 10) ?? null,
		periodEarned: earnedThisPeriod?.total ?? 0,
		week,
		weekSettled: settled,
		pastWeeks: settlementHistory(db, person.id)
	};
}

export const load: PageServerLoad = ({ locals }) => {
	const user = requireUser(locals);
	const today = todayLocal();
	const config = allowanceConfig(db);
	const weekStart = weekStartFor(db, today, config);
	const household = computeHouseholdWeek(db, weekStart, config);

	// Adults see every kid; a kid sees only themself. This filter is the whole
	// privacy story on this page — nobody but an adult may see another
	// person's balance, ceiling or week.
	const people =
		user.role === 'adult'
			? db
					.select({ id: users.id, name: users.name, avatarColor: users.avatarColor })
					.from(users)
					.where(and(eq(users.role, 'kid'), eq(users.isActive, true)))
					.orderBy(asc(users.name))
					.all()
			: [{ id: user.id, name: user.name, avatarColor: user.avatarColor }];

	const settledIds = isWeekSettled(
		db,
		people.map((p) => p.id),
		weekStart
	);

	return {
		people: people.map((person) =>
			earningsFor(
				person,
				household.people.find((p) => p.userId === person.id)?.week ?? null,
				settledIds.has(person.id)
			)
		),
		isAdult: user.role === 'adult',
		weekStart,
		// Only ever true once the week is genuinely over — an adult shouldn't be
		// able to freeze a week that people are still working.
		canSettle: user.role === 'adult' && today > addDays(weekStart, 6)
	};
};

export const actions: Actions = {
	payout: async ({ request, locals }) => {
		const adult = requireAdult(locals);
		const form = await request.formData();
		const kidId = Number(form.get('kidId'));
		try {
			const paid = payOutBalance(db, kidId, adult.id);
			return { success: true, paid };
		} catch (err) {
			if (err instanceof InstanceActionError) return fail(400, { message: err.message });
			throw err;
		}
	},

	/**
	 * Close and pay a finished week by hand, instead of waiting for the
	 * nightly job. Only offered once the week is actually over — settling
	 * freezes it, and a frozen week can't be marked done or verified again.
	 */
	settle: async ({ request, locals }) => {
		const adult = requireAdult(locals);
		const form = await request.formData();
		const kidId = Number(form.get('kidId'));
		const config = allowanceConfig(db);
		const weekStart = weekStartFor(db, todayLocal(), config);
		if (todayLocal() <= addDays(weekStart, 6)) {
			return fail(400, { message: "That week isn't over yet." });
		}
		const household = computeHouseholdWeek(db, weekStart, config);
		const result = settleWeek(db, kidId, weekStart, household, adult.id);
		if (!result) return fail(400, { message: 'That week has already been paid.' });

		notifyUser(db, kidId, {
			title: '💰 Your week is in!',
			body: 'Your allowance for the week has been added.',
			url: '/earnings'
		});
		return { success: true };
	},

	adjust: async ({ request, locals }) => {
		const adult = requireAdult(locals);
		const form = await request.formData();
		const kidId = Number(form.get('kidId'));
		const type = form.get('type') === 'penalty' ? 'penalty' : 'bonus';
		const amountCents = Math.round(Number(form.get('amount')) * 100);
		const note = String(form.get('note') ?? '');
		try {
			addAdjustment(db, kidId, adult.id, type, amountCents, note);
		} catch (err) {
			if (err instanceof InstanceActionError) return fail(400, { message: err.message });
			throw err;
		}
		notifyUser(db, kidId, {
			title: type === 'bonus' ? '🎁 You got a bonus!' : '📉 A penalty was applied',
			body: note.trim() || 'Check your earnings for details.',
			url: '/earnings'
		});
		return { success: true };
	}
};
