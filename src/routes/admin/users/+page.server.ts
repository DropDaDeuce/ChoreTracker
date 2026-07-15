import { hashPin, requireAdult } from '$lib/server/auth';
import { db } from '$lib/server/db';
import { users } from '$lib/server/db/schema';
import { firstZodMessage, personSchema, pinSchema } from '$lib/server/validation';
import { fail } from '@sveltejs/kit';
import { and, asc, eq, ne } from 'drizzle-orm';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = ({ locals }) => {
	const me = requireAdult(locals);
	const people = db
		.select({
			id: users.id,
			name: users.name,
			role: users.role,
			avatarColor: users.avatarColor,
			isActive: users.isActive
		})
		.from(users)
		.orderBy(asc(users.name))
		.all();
	return { people, myId: me.id };
};

export const actions: Actions = {
	add: async ({ request, locals }) => {
		requireAdult(locals);
		const form = await request.formData();
		const parsed = personSchema.safeParse({
			name: form.get('name'),
			role: form.get('role'),
			pin: form.get('pin'),
			avatarColor: form.get('avatarColor')
		});
		if (!parsed.success) return fail(400, { message: firstZodMessage(parsed.error) });

		db.insert(users)
			.values({
				name: parsed.data.name,
				role: parsed.data.role,
				pinHash: await hashPin(parsed.data.pin),
				avatarColor: parsed.data.avatarColor
			})
			.run();
		return { success: true };
	},

	resetPin: async ({ request, locals }) => {
		requireAdult(locals);
		const form = await request.formData();
		const userId = Number(form.get('userId'));
		const parsed = pinSchema.safeParse(form.get('pin'));
		if (!parsed.success) return fail(400, { message: firstZodMessage(parsed.error), userId });

		const target = db.select().from(users).where(eq(users.id, userId)).get();
		if (!target) return fail(404, { message: 'Person not found.' });

		db.update(users).set({ pinHash: await hashPin(parsed.data) }).where(eq(users.id, userId)).run();
		return { success: true };
	},

	toggleActive: async ({ request, locals }) => {
		requireAdult(locals);
		const form = await request.formData();
		const userId = Number(form.get('userId'));
		const target = db.select().from(users).where(eq(users.id, userId)).get();
		if (!target) return fail(404, { message: 'Person not found.' });

		if (target.isActive && target.role === 'adult') {
			const otherActiveAdults =
				db
					.select({ id: users.id })
					.from(users)
					.where(and(eq(users.role, 'adult'), eq(users.isActive, true), ne(users.id, userId)))
					.all().length;
			if (otherActiveAdults === 0) {
				return fail(400, { message: "You can't deactivate the last adult." });
			}
		}

		db.update(users).set({ isActive: !target.isActive }).where(eq(users.id, userId)).run();
		return { success: true };
	}
};
