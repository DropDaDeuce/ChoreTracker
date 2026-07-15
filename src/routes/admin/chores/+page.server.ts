import { requireAdult } from '$lib/server/auth';
import { db } from '$lib/server/db';
import { choreAssignees, chores, users } from '$lib/server/db/schema';
import { asc, eq } from 'drizzle-orm';
import type { PageServerLoad } from './$types';

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

	return {
		chores: allChores.map((c) => ({ ...c, assigneeNames: byChore.get(c.id) ?? [] }))
	};
};
