import { requireUser } from '$lib/server/auth';
import { db } from '$lib/server/db';
import { choreAssignees, choreInstances, chores, rooms, users } from '$lib/server/db/schema';
import { and, asc, eq } from 'drizzle-orm';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = ({ locals }) => {
	const user = requireUser(locals);

	// Every active chore this person is part of — fixed assignee or in a
	// rotation pool.
	const myChores = db
		.select({ chore: chores, room: rooms })
		.from(chores)
		.innerJoin(choreAssignees, eq(choreAssignees.choreId, chores.id))
		.leftJoin(rooms, eq(chores.roomId, rooms.id))
		.where(and(eq(choreAssignees.userId, user.id), eq(chores.isActive, true)))
		.orderBy(asc(chores.title))
		.all();

	const detailed = myChores.map(({ chore, room }) => {
		const nextUp = db
			.select({ dueDate: choreInstances.dueDate, assigneeName: users.name, assigneeId: users.id })
			.from(choreInstances)
			.innerJoin(users, eq(choreInstances.assigneeId, users.id))
			.where(and(eq(choreInstances.choreId, chore.id), eq(choreInstances.status, 'pending')))
			.orderBy(asc(choreInstances.dueDate))
			.get();

		return {
			...chore,
			roomLabel: room ? `${room.icon} ${room.name}` : null,
			nextDueDate: nextUp?.dueDate ?? null,
			nextAssigneeName: nextUp?.assigneeName ?? null,
			nextIsMine: nextUp?.assigneeId === user.id
		};
	});

	return { myChores: detailed };
};
