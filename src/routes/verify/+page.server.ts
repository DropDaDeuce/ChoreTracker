import { requireAdult } from '$lib/server/auth';
import { todayLocal } from '$lib/server/dates';
import { db } from '$lib/server/db';
import { choreInstances, chores, users } from '$lib/server/db/schema';
import {
	addReminder,
	grantBonusPoints,
	InstanceActionError,
	rejectInstance,
	verifyInstance
} from '$lib/server/instances';
import { formatCents } from '$lib/money';
import { allowanceConfig, instanceValues } from '$lib/server/allowance';
import { startOfWeek } from '$lib/server/dates';
import { notifyUser } from '$lib/server/push';
import { CURRENCY_SYMBOL_KEY, getSettingOr } from '$lib/server/settings';
import { deletePhoto } from '$lib/server/uploads';
import { fail } from '@sveltejs/kit';
import { and, asc, eq, lte } from 'drizzle-orm';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = ({ locals }) => {
	requireAdult(locals);
	const today = todayLocal();
	const config = allowanceConfig(db);
	const penaltyPercent = config.penaltyPercent;

	const select = () =>
		db
			.select({ instance: choreInstances, chore: chores, assignee: users })
			.from(choreInstances)
			.innerJoin(chores, eq(choreInstances.choreId, chores.id))
			.innerJoin(users, eq(choreInstances.assigneeId, users.id));

	const queue = select()
		.where(eq(choreInstances.status, 'done'))
		.orderBy(asc(choreInstances.doneAt))
		.all();

	// Open chores due today or overdue — where "+1 reminder" usually happens.
	const stillOpen = select()
		.where(and(eq(choreInstances.status, 'pending'), lte(choreInstances.dueDate, today)))
		.orderBy(asc(choreInstances.dueDate))
		.all();

	// A chore's worth is a slice of its own week, and the queue can hold
	// leftovers from last week — so price every week the queue touches.
	const values = instanceValues(
		db,
		[...queue, ...stillOpen].map((row) =>
			startOfWeek(row.instance.dueDate, config.weekStartIndex)
		),
		config
	);
	const withPreview = (rows: typeof queue) =>
		rows.map((row) => ({ ...row, payoutPreview: values.get(row.instance.id) ?? 0 }));

	return {
		today,
		queue: withPreview(queue),
		stillOpen: withPreview(stillOpen),
		penaltyPercent
	};
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

function instanceContext(id: number) {
	return db
		.select({ instance: choreInstances, chore: chores })
		.from(choreInstances)
		.innerJoin(chores, eq(choreInstances.choreId, chores.id))
		.where(eq(choreInstances.id, id))
		.get();
}

export const actions: Actions = {
	verify: instanceAction((id, adultId) => {
		verifyInstance(db, id, adultId);
		const ctx = instanceContext(id);
		if (ctx) {
			const currency = getSettingOr(db, CURRENCY_SYMBOL_KEY);
			const config = allowanceConfig(db);
			const worth = instanceValues(
				db,
				[startOfWeek(ctx.instance.dueDate, config.weekStartIndex)],
				config
			).get(id);
			notifyUser(db, ctx.instance.assigneeId, {
				title: `✅ ${ctx.chore.title} verified!`,
				body:
					worth && worth > 0
						? `That's ${formatCents(worth, currency)} toward this week.`
						: 'Nice work!',
				url: '/earnings'
			});
		}
	}),
	/** "That was above and beyond" — extra points on this one occurrence. */
	bonus: async ({ request, locals }) => {
		requireAdult(locals);
		const form = await request.formData();
		const instanceId = Number(form.get('instanceId'));
		const points = Number(form.get('points'));
		try {
			grantBonusPoints(db, instanceId, points);
		} catch (err) {
			if (err instanceof InstanceActionError) return fail(400, { message: err.message });
			throw err;
		}
		return { success: true };
	},

	reject: async ({ request, locals }) => {
		const adult = requireAdult(locals);
		const form = await request.formData();
		const id = Number(form.get('instanceId'));
		const note = String(form.get('note') ?? '')
			.trim()
			.slice(0, 200);
		const before = instanceContext(id);
		try {
			rejectInstance(db, id, adult.id, note);
		} catch (err) {
			if (err instanceof InstanceActionError) return fail(400, { message: err.message });
			throw err;
		}
		deletePhoto(before?.instance.photoPath); // redo means fresh proof
		if (before) {
			notifyUser(db, before.instance.assigneeId, {
				title: `↩ ${before.chore.title} needs another go`,
				body: note ? `Sent back: ${note}` : 'It was sent back — give it one more try.',
				url: '/dashboard'
			});
		}
		return { success: true };
	},
	remind: instanceAction((id, adultId) => {
		addReminder(db, id, adultId);
		const ctx = instanceContext(id);
		if (ctx) {
			const currency = getSettingOr(db, CURRENCY_SYMBOL_KEY);
			const config = allowanceConfig(db);
			// Priced AFTER the reminder landed, so the number they see is what
			// the chore is now actually worth.
			const worth = instanceValues(
				db,
				[startOfWeek(ctx.instance.dueDate, config.weekStartIndex)],
				config
			).get(id);
			notifyUser(db, ctx.instance.assigneeId, {
				title: `🔔 Reminder: ${ctx.chore.title}`,
				body:
					config.allowanceCents > 0
						? worth && worth > 0
							? `It's down to ${formatCents(worth, currency)} — go do it!`
							: "There's no allowance left on this one — do it anyway!"
						: 'Time to get it done!',
				url: '/dashboard'
			});
		}
	})
};
