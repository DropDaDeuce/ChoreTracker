import { requireAdult } from '$lib/server/auth';
import { setChoreActive, updateChore } from '$lib/server/choreAdmin';
import { db } from '$lib/server/db';
import { choreAssignees, chores, users } from '$lib/server/db/schema';
import { deleteChore, verifiedCount } from '$lib/server/deleteChore';
import { InstanceActionError } from '$lib/server/instances';
import { listRooms } from '$lib/server/roomAdmin';
import { deletePhoto } from '$lib/server/uploads';
import { choreFormToObject, choreSchema, firstZodMessage } from '$lib/server/validation';
import { error, fail, redirect } from '@sveltejs/kit';
import { asc, eq } from 'drizzle-orm';
import type { Actions, PageServerLoad } from './$types';

function getChore(id: number) {
	const chore = db.select().from(chores).where(eq(chores.id, id)).get();
	if (!chore) error(404, 'Chore not found');
	return chore;
}

export const load: PageServerLoad = ({ locals, params }) => {
	requireAdult(locals);
	const chore = getChore(Number(params.id));

	const pool = db
		.select()
		.from(choreAssignees)
		.where(eq(choreAssignees.choreId, chore.id))
		.orderBy(asc(choreAssignees.position))
		.all();

	const people = db
		.select({ id: users.id, name: users.name, role: users.role })
		.from(users)
		.where(eq(users.isActive, true))
		.orderBy(asc(users.name))
		.all();

	return {
		chore,
		assigneeIds: pool.map((a) => a.userId),
		people,
		rooms: listRooms(db),
		verifiedCount: verifiedCount(db, chore.id)
	};
};

export const actions: Actions = {
	save: async ({ request, locals, params }) => {
		requireAdult(locals);
		const chore = getChore(Number(params.id));
		const parsed = choreSchema.safeParse(choreFormToObject(await request.formData()));
		if (!parsed.success) return fail(400, { message: firstZodMessage(parsed.error) });

		updateChore(chore.id, parsed.data);
		redirect(303, '/admin/chores');
	},
	toggleActive: ({ locals, params }) => {
		requireAdult(locals);
		const chore = getChore(Number(params.id));
		setChoreActive(chore.id, !chore.isActive);
		return { success: true };
	},

	delete: ({ locals, params }) => {
		requireAdult(locals);
		const chore = getChore(Number(params.id));
		let photoPaths: string[] = [];
		try {
			({ photoPaths } = deleteChore(db, chore.id));
		} catch (err) {
			if (err instanceof InstanceActionError) return fail(400, { message: err.message });
			throw err;
		}
		for (const path of photoPaths) deletePhoto(path);
		redirect(303, '/admin/chores');
	}
};
