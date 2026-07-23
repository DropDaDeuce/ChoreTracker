import { requireAdult } from '$lib/server/auth';
import { addAssignee, removeAssignee } from '$lib/server/assignments';
import { db } from '$lib/server/db';
import { choreAssignees, chores, rooms, users } from '$lib/server/db/schema';
import { InstanceActionError } from '$lib/server/instances';
import { fail, error } from '@sveltejs/kit';
import { asc, eq } from 'drizzle-orm';
import type { Actions, PageServerLoad } from './$types';

function getPerson(id: number) {
	const person = db
		.select({
			id: users.id,
			name: users.name,
			role: users.role,
			avatarColor: users.avatarColor,
			isActive: users.isActive
		})
		.from(users)
		.where(eq(users.id, id))
		.get();
	if (!person) error(404, 'Person not found');
	return person;
}

export const load: PageServerLoad = ({ locals, params }) => {
	requireAdult(locals);
	const person = getPerson(Number(params.id));

	// Every active chore, with room + pool info; split into theirs vs available.
	const allChores = db
		.select({ chore: chores, room: rooms })
		.from(chores)
		.leftJoin(rooms, eq(chores.roomId, rooms.id))
		.where(eq(chores.isActive, true))
		.orderBy(asc(chores.title))
		.all();
	const pools = db
		.select({ choreId: choreAssignees.choreId, userId: choreAssignees.userId, name: users.name })
		.from(choreAssignees)
		.innerJoin(users, eq(choreAssignees.userId, users.id))
		.orderBy(asc(choreAssignees.position))
		.all();

	const decorated = allChores.map(({ chore, room }) => {
		const pool = pools.filter((p) => p.choreId === chore.id);
		return {
			id: chore.id,
			title: chore.title,
			icon: chore.icon,
			frequency: chore.frequency,
			assignmentType: chore.assignmentType,
			roomLabel: room ? `${room.icon} ${room.name}` : '🏠 General',
			poolNames: pool.map((p) => p.name),
			mine: pool.some((p) => p.userId === person.id),
			unassigned: pool.length === 0
		};
	});

	const theirChores = decorated.filter((c) => c.mine);
	// Weekly load: rough dose of how much is on their plate.
	const perWeek = theirChores.reduce((sum, c) => {
		const share = c.assignmentType === 'rotating' ? 1 / Math.max(c.poolNames.length, 1) : 1;
		if (c.frequency === 'daily') return sum + 7 * share;
		if (c.frequency === 'weekly') return sum + 1 * share;
		return sum + 0.25 * share;
	}, 0);

	return {
		person,
		theirChores,
		available: decorated.filter((c) => !c.mine),
		perWeek: Math.round(perWeek)
	};
};

function choreAction(fn: (choreId: number, userId: number) => void): NonNullable<Actions[string]> {
	return async ({ request, locals, params }) => {
		requireAdult(locals);
		const person = getPerson(Number(params.id));
		const form = await request.formData();
		try {
			fn(Number(form.get('choreId')), person.id);
		} catch (err) {
			if (err instanceof InstanceActionError) return fail(400, { message: err.message });
			throw err;
		}
		return { success: true };
	};
}

export const actions: Actions = {
	assign: choreAction((choreId, userId) => addAssignee(db, choreId, userId)),
	unassign: choreAction((choreId, userId) => removeAssignee(db, choreId, userId))
};
