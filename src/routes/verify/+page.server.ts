import { requireAdult } from '$lib/server/auth';
import { todayLocal } from '$lib/server/dates';
import { db } from '$lib/server/db';
import { choreInstances, chores, users } from '$lib/server/db/schema';
import {
	addReminder,
	InstanceActionError,
	rejectInstance,
	verifyInstance
} from '$lib/server/instances';
import { computePayoutCents } from '$lib/server/payout';
import { getSettingInt, REMINDER_PENALTY_PERCENT_KEY } from '$lib/server/settings';
import { fail } from '@sveltejs/kit';
import { and, asc, eq, lte } from 'drizzle-orm';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = ({ locals }) => {
	requireAdult(locals);
	const today = todayLocal();
	const penaltyPercent = getSettingInt(db, REMINDER_PENALTY_PERCENT_KEY, 50);

	const select = () =>
		db
			.select({ instance: choreInstances, chore: chores, assignee: users })
			.from(choreInstances)
			.innerJoin(chores, eq(choreInstances.choreId, chores.id))
			.innerJoin(users, eq(choreInstances.assigneeId, users.id));

	const withPreview = (rows: ReturnType<ReturnType<typeof select>['all']>) =>
		rows.map((row) => ({
			...row,
			payoutPreview: computePayoutCents(
				row.chore.allowanceCents,
				row.instance.reminderCount,
				penaltyPercent
			)
		}));

	const queue = withPreview(
		select().where(eq(choreInstances.status, 'done')).orderBy(asc(choreInstances.doneAt)).all()
	);

	// Open chores due today or overdue — where "+1 reminder" usually happens.
	const stillOpen = withPreview(
		select()
			.where(and(eq(choreInstances.status, 'pending'), lte(choreInstances.dueDate, today)))
			.orderBy(asc(choreInstances.dueDate))
			.all()
	);

	return { today, queue, stillOpen, penaltyPercent };
};

function instanceAction(fn: (instanceId: number, adultId: number) => void): NonNullable<Actions[string]> {
	return async ({ request, locals }) => {
		const adult = requireAdult(locals);
		const form = await request.formData();
		const instanceId = Number(form.get('instanceId'));
		try {
			fn(instanceId, adult.id);
		} catch (err) {
			if (err instanceof InstanceActionError) return fail(400, { message: err.message });
			throw err;
		}
		return { success: true };
	};
}

export const actions: Actions = {
	verify: instanceAction((id, adultId) => verifyInstance(db, id, adultId)),
	reject: instanceAction((id, adultId) => rejectInstance(db, id, adultId)),
	remind: instanceAction((id, adultId) => addReminder(db, id, adultId))
};
