import { requireUser } from '$lib/server/auth';
import { todayLocal } from '$lib/server/dates';
import { db } from '$lib/server/db';
import { choreInstances, chores } from '$lib/server/db/schema';
import { balanceCents, InstanceActionError, markDone } from '$lib/server/instances';
import { fail } from '@sveltejs/kit';
import { and, asc, eq, gt, lte, sql } from 'drizzle-orm';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = ({ locals }) => {
	const user = requireUser(locals);
	const today = todayLocal();

	const mine = (extra: ReturnType<typeof and>) =>
		db
			.select({ instance: choreInstances, chore: chores })
			.from(choreInstances)
			.innerJoin(chores, eq(choreInstances.choreId, chores.id))
			.where(and(eq(choreInstances.assigneeId, user.id), extra))
			.orderBy(asc(choreInstances.dueDate))
			.all();

	const open = mine(and(eq(choreInstances.status, 'pending'), lte(choreInstances.dueDate, today)));
	const awaiting = mine(eq(choreInstances.status, 'done'));
	const upcoming = mine(
		and(eq(choreInstances.status, 'pending'), gt(choreInstances.dueDate, today))
	).slice(0, 5);

	const verifyQueueCount =
		user.role === 'adult'
			? (db
					.select({ n: sql<number>`count(*)` })
					.from(choreInstances)
					.where(eq(choreInstances.status, 'done'))
					.get()?.n ?? 0)
			: 0;

	return {
		today,
		open,
		awaiting,
		upcoming,
		balance: balanceCents(db, user.id),
		verifyQueueCount
	};
};

export const actions: Actions = {
	markDone: async ({ request, locals }) => {
		const user = requireUser(locals);
		const form = await request.formData();
		const instanceId = Number(form.get('instanceId'));
		try {
			markDone(db, instanceId, user);
		} catch (err) {
			if (err instanceof InstanceActionError) return fail(400, { message: err.message });
			throw err;
		}
		return { success: true };
	}
};
