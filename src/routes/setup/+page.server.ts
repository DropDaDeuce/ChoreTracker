import {
	createSession,
	hashPin,
	SESSION_COOKIE,
	SESSION_COOKIE_OPTIONS
} from '$lib/server/auth';
import { db } from '$lib/server/db';
import { users } from '$lib/server/db/schema';
import { firstZodMessage, personSchema } from '$lib/server/validation';
import { fail, redirect } from '@sveltejs/kit';
import { sql } from 'drizzle-orm';
import type { Actions, PageServerLoad } from './$types';

function userCount(): number {
	return db.select({ n: sql<number>`count(*)` }).from(users).get()?.n ?? 0;
}

export const load: PageServerLoad = () => {
	// Setup is only for a brand-new install; afterwards adults add people
	// via /admin/users.
	if (userCount() > 0) redirect(303, '/');
	return {};
};

export const actions: Actions = {
	default: async ({ request, cookies }) => {
		if (userCount() > 0) redirect(303, '/');

		const form = await request.formData();
		const parsed = personSchema.safeParse({
			name: form.get('name'),
			role: 'adult', // the first person must be an adult
			pin: form.get('pin'),
			avatarColor: form.get('avatarColor')
		});
		if (!parsed.success) {
			return fail(400, { message: firstZodMessage(parsed.error) });
		}
		if (parsed.data.pin !== form.get('pinConfirm')) {
			return fail(400, { message: "PINs don't match." });
		}

		const created = db
			.insert(users)
			.values({
				name: parsed.data.name,
				role: 'adult',
				pinHash: await hashPin(parsed.data.pin),
				avatarColor: parsed.data.avatarColor
			})
			.returning()
			.get();

		const { token, expiresAt } = createSession(created.id);
		cookies.set(SESSION_COOKIE, token, { ...SESSION_COOKIE_OPTIONS, expires: expiresAt });
		redirect(303, '/dashboard');
	}
};
