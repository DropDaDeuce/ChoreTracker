import { requireAdult } from '$lib/server/auth';
import { createChore } from '$lib/server/choreAdmin';
import { todayLocal } from '$lib/server/dates';
import { db } from '$lib/server/db';
import { users } from '$lib/server/db/schema';
import { choreFormToObject, choreSchema, firstZodMessage } from '$lib/server/validation';
import { fail, redirect } from '@sveltejs/kit';
import { asc, eq } from 'drizzle-orm';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = ({ locals }) => {
	requireAdult(locals);
	const people = db
		.select({ id: users.id, name: users.name, role: users.role })
		.from(users)
		.where(eq(users.isActive, true))
		.orderBy(asc(users.name))
		.all();
	return { people, today: todayLocal() };
};

export const actions: Actions = {
	default: async ({ request, locals }) => {
		requireAdult(locals);
		const parsed = choreSchema.safeParse(choreFormToObject(await request.formData()));
		if (!parsed.success) return fail(400, { message: firstZodMessage(parsed.error) });

		createChore(parsed.data);
		redirect(303, '/admin/chores');
	}
};
