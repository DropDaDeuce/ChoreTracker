import { presetKeyForRoom, templatesFor } from '$lib/choreLibrary';
import { requireAdult } from '$lib/server/auth';
import { createChore } from '$lib/server/choreAdmin';
import { createFromTemplates } from '$lib/server/library';
import { todayLocal } from '$lib/server/dates';
import { db } from '$lib/server/db';
import { chores, users } from '$lib/server/db/schema';
import { listRooms } from '$lib/server/roomAdmin';
import { choreFormToObject, choreSchema, firstZodMessage } from '$lib/server/validation';
import { fail, redirect } from '@sveltejs/kit';
import { asc, eq, sql } from 'drizzle-orm';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = ({ locals, url }) => {
	requireAdult(locals);
	const people = db
		.select({ id: users.id, name: users.name, role: users.role })
		.from(users)
		.where(eq(users.isActive, true))
		.orderBy(asc(users.name))
		.all();

	const rooms = listRooms(db);
	const roomParam = Number(url.searchParams.get('room'));
	const room = rooms.find((r) => r.id === roomParam) ?? null;
	const presetKey = room ? presetKeyForRoom(room) : 'general';

	// Library templates for this room, marked when the title already exists there.
	const existingTitles = new Set(
		db
			.select({ title: chores.title })
			.from(chores)
			.where(room ? eq(chores.roomId, room.id) : sql`${chores.roomId} is null`)
			.all()
			.map((r) => r.title)
	);
	const templates = templatesFor(presetKey).map((t) => ({
		...t,
		alreadyAdded: existingTitles.has(t.title)
	}));

	return { people, rooms, room, presetKey, templates, today: todayLocal() };
};

export const actions: Actions = {
	// Custom chore via the full form (also what the smoke test drives).
	// Named (not default) because named actions can't coexist with a default.
	custom: async ({ request, locals }) => {
		requireAdult(locals);
		const parsed = choreSchema.safeParse(choreFormToObject(await request.formData()));
		if (!parsed.success) return fail(400, { message: firstZodMessage(parsed.error) });

		createChore(parsed.data);
		redirect(303, '/admin/chores');
	},

	// Multi-add from the library: creates each picked template, unassigned.
	library: async ({ request, locals }) => {
		requireAdult(locals);
		const form = await request.formData();
		const roomIdRaw = Number(form.get('roomId'));
		const roomId = Number.isInteger(roomIdRaw) && roomIdRaw > 0 ? roomIdRaw : null;
		const presetKey = String(form.get('presetKey') ?? 'general');
		const titles = form.getAll('titles').map(String);
		if (titles.length === 0) return fail(400, { message: 'Tick at least one chore to add.' });

		createFromTemplates(db, roomId, presetKey, titles);
		redirect(303, '/admin/chores');
	}
};
