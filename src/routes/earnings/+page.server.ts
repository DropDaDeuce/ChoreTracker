import { requireAdult, requireUser } from '$lib/server/auth';
import { db } from '$lib/server/db';
import { allowanceLedger, choreInstances, chores, users } from '$lib/server/db/schema';
import { balanceCents, InstanceActionError, payOutBalance } from '$lib/server/instances';
import { fail } from '@sveltejs/kit';
import { and, asc, desc, eq } from 'drizzle-orm';
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

	return { ...person, balance: balanceCents(db, person.id), ledger, recentChores };
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
	}
};
