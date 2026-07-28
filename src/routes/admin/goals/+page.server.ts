import { requireAdult } from '$lib/server/auth';
import { db } from '$lib/server/db';
import { users } from '$lib/server/db/schema';
import { allGoals, createGoal, deleteGoal } from '$lib/server/goals';
import { fail } from '@sveltejs/kit';
import { and, asc, eq } from 'drizzle-orm';
import { z } from 'zod';
import type { Actions, PageServerLoad } from './$types';

const goalSchema = z
	.object({
		scope: z.enum(['user', 'family']),
		userId: z.coerce.number().int().positive().optional(),
		period: z.enum(['daily', 'weekly']),
		targetPoints: z.coerce.number().int().min(1, 'Pick a target above zero.').max(10000),
		rewardNote: z.string().trim().max(200).default('')
	})
	.superRefine((goal, ctx) => {
		if (goal.scope === 'user' && !goal.userId) {
			ctx.addIssue({ code: 'custom', path: ['userId'], message: 'Pick who the goal is for.' });
		}
	});

export const load: PageServerLoad = ({ locals }) => {
	requireAdult(locals);
	return {
		goals: allGoals(db),
		kids: db
			.select({ id: users.id, name: users.name, avatarColor: users.avatarColor })
			.from(users)
			.where(and(eq(users.role, 'kid'), eq(users.isActive, true)))
			.orderBy(asc(users.name))
			.all()
	};
};

export const actions: Actions = {
	create: async ({ request, locals }) => {
		requireAdult(locals);
		const form = await request.formData();
		const parsed = goalSchema.safeParse({
			scope: form.get('scope'),
			userId: form.get('userId') || undefined,
			period: form.get('period'),
			targetPoints: form.get('targetPoints'),
			rewardNote: form.get('rewardNote') ?? ''
		});
		if (!parsed.success) {
			return fail(400, { message: parsed.error.issues[0]?.message ?? 'Invalid input.' });
		}
		createGoal(db, parsed.data);
		return { success: true };
	},

	delete: async ({ request, locals }) => {
		requireAdult(locals);
		const form = await request.formData();
		deleteGoal(db, Number(form.get('goalId')));
		return { success: true };
	}
};
