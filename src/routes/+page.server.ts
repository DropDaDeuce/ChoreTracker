import {
	createSession,
	SESSION_COOKIE,
	SESSION_COOKIE_OPTIONS,
	verifyPin
} from '$lib/server/auth';
import { db } from '$lib/server/db';
import { users } from '$lib/server/db/schema';
import { fail, redirect } from '@sveltejs/kit';
import { asc, eq } from 'drizzle-orm';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = ({ locals }) => {
	if (locals.user) redirect(303, '/dashboard');

	const profiles = db
		.select({ id: users.id, name: users.name, role: users.role, avatarColor: users.avatarColor })
		.from(users)
		.where(eq(users.isActive, true))
		.orderBy(asc(users.name))
		.all();

	// First run: no family yet — go create the first adult.
	if (profiles.length === 0) redirect(303, '/setup');

	return { profiles };
};

export const actions: Actions = {
	login: async ({ request, cookies }) => {
		const form = await request.formData();
		const userId = Number(form.get('userId'));
		const pin = String(form.get('pin') ?? '');

		const user = db.select().from(users).where(eq(users.id, userId)).get();
		if (!user || !user.isActive || !(await verifyPin(user.pinHash, pin))) {
			return fail(400, { message: 'Wrong PIN — try again.', userId });
		}

		const { token, expiresAt } = createSession(user.id);
		cookies.set(SESSION_COOKIE, token, { ...SESSION_COOKIE_OPTIONS, expires: expiresAt });
		redirect(303, '/dashboard');
	}
};
