import { requireAdult, requireUser } from '$lib/server/auth';
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

function earningsFor(person: { id: number; name: string; avatarColor: string }) {
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
		periodEarned: earnedThisPeriod?.total ?? 0
	};
}

export const load: PageServerLoad = ({ locals }) => {
	const user = requireUser(locals);

	const people =
		user.role === 'adult'
			? db
					.select({ id: users.id, name: users.name, avatarColor: users.avatarColor })
					.from(users)
					.where(and(eq(users.role, 'kid'), eq(users.isActive, true)))
					.orderBy(asc(users.name))
					.all()
			: [{ id: user.id, name: user.name, avatarColor: user.avatarColor }];

	return { people: people.map(earningsFor), isAdult: user.role === 'adult' };
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
