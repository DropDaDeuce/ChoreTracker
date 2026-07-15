import { requireUser } from '$lib/server/auth';
import { addDays, todayLocal } from '$lib/server/dates';
import { db } from '$lib/server/db';
import { choreInstances, chores } from '$lib/server/db/schema';
import {
	balanceCents,
	InstanceActionError,
	markDone,
	undoMarkDone
} from '$lib/server/instances';
import { getSettingInt, UNDO_WINDOW_MINUTES_KEY } from '$lib/server/settings';
import { fail } from '@sveltejs/kit';
import { and, asc, desc, eq, gt, gte, lte, sql } from 'drizzle-orm';
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
	const missed = mine(
		and(eq(choreInstances.status, 'missed'), gte(choreInstances.dueDate, addDays(today, -7)))
	);

	// Auto-approved chores finished today can still be undone within the window.
	const undoWindowMs = getSettingInt(db, UNDO_WINDOW_MINUTES_KEY, 15) * 60_000;
	const startOfToday = new Date();
	startOfToday.setHours(0, 0, 0, 0);
	const completedToday = db
		.select({ instance: choreInstances, chore: chores })
		.from(choreInstances)
		.innerJoin(chores, eq(choreInstances.choreId, chores.id))
		.where(and(eq(choreInstances.assigneeId, user.id), eq(choreInstances.status, 'verified')))
		.orderBy(desc(choreInstances.verifiedAt))
		.limit(10)
		.all()
		.filter((row) => (row.instance.verifiedAt?.getTime() ?? 0) >= startOfToday.getTime())
		.map((row) => ({
			...row,
			canUndo:
				!row.chore.requiresVerification &&
				Date.now() - (row.instance.verifiedAt?.getTime() ?? 0) <= undoWindowMs
		}));

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
		missed,
		completedToday,
		balance: balanceCents(db, user.id),
		verifyQueueCount
	};
};

function instanceAction(
	fn: (instanceId: number, actor: { id: number; role: string }) => void
): NonNullable<Actions[string]> {
	return async ({ request, locals }) => {
		const user = requireUser(locals);
		const form = await request.formData();
		const instanceId = Number(form.get('instanceId'));
		try {
			fn(instanceId, user);
		} catch (err) {
			if (err instanceof InstanceActionError) return fail(400, { message: err.message });
			throw err;
		}
		return { success: true };
	};
}

export const actions: Actions = {
	markDone: instanceAction((id, actor) => markDone(db, id, actor)),
	undo: instanceAction((id, actor) => undoMarkDone(db, id, actor))
};
