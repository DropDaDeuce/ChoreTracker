import { requireAdult } from '$lib/server/auth';
import { db } from '$lib/server/db';
import { choreAssignees, chores, users } from '$lib/server/db/schema';
import { InstanceActionError } from '$lib/server/instances';
import { createRoom, deleteRoom, listRooms } from '$lib/server/roomAdmin';
import { fail } from '@sveltejs/kit';
import { asc, eq, sql } from 'drizzle-orm';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = ({ locals }) => {
	requireAdult(locals);

	const allChores = db.select().from(chores).orderBy(asc(chores.title)).all();
	const assignees = db
		.select({ choreId: choreAssignees.choreId, name: users.name, position: choreAssignees.position })
		.from(choreAssignees)
		.innerJoin(users, eq(choreAssignees.userId, users.id))
		.orderBy(asc(choreAssignees.position))
		.all();

	const byChore = new Map<number, string[]>();
	for (const a of assignees) {
		const list = byChore.get(a.choreId) ?? [];
		list.push(a.name);
		byChore.set(a.choreId, list);
	}

	const withNames = allChores.map((c) => ({ ...c, assigneeNames: byChore.get(c.id) ?? [] }));

	// "Get started" checklist state — shown until the house is furnished.
	const peopleCount = db.select({ n: sql<number>`count(*)` }).from(users).get()?.n ?? 0;
	const rooms = listRooms(db);
	const gettingStarted = {
		hasFamily: peopleCount > 1,
		hasRooms: rooms.length > 0,
		hasChores: withNames.length > 0,
		hasAssigned: withNames.some((c) => c.assigneeNames.length > 0)
	};

	return {
		rooms,
		chores: withNames,
		gettingStarted,
		showGettingStarted: Object.values(gettingStarted).some((done) => !done)
	};
};

export const actions: Actions = {
	addRoom: async ({ request, locals }) => {
		requireAdult(locals);
		const form = await request.formData();
		try {
			createRoom(db, {
				name: String(form.get('name') ?? ''),
				icon: String(form.get('icon') ?? '')
			});
		} catch (err) {
			if (err instanceof InstanceActionError) return fail(400, { message: err.message });
			throw err;
		}
		return { success: true };
	},

	deleteRoom: async ({ request, locals }) => {
		requireAdult(locals);
		const form = await request.formData();
		try {
			deleteRoom(db, Number(form.get('roomId')));
		} catch (err) {
			if (err instanceof InstanceActionError) return fail(400, { message: err.message });
			throw err;
		}
		return { success: true };
	}
};
