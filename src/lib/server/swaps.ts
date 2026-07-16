import { and, eq } from 'drizzle-orm';
import { alias } from 'drizzle-orm/sqlite-core';
import { choreInstances, chores, swapRequests, users } from './db/schema';
import type { DB } from './db/type';
import { InstanceActionError } from './instances';
import { isHome } from './presence';

/** Ask someone else to take over one specific chore instance. */
export function requestSwap(db: DB, instanceId: number, fromUserId: number, toUserId: number) {
	const instance = db
		.select()
		.from(choreInstances)
		.where(eq(choreInstances.id, instanceId))
		.get();
	if (!instance) throw new InstanceActionError('Chore not found.');
	if (instance.status !== 'pending') throw new InstanceActionError('Only open chores can be swapped.');
	if (instance.assigneeId !== fromUserId) {
		throw new InstanceActionError('You can only offer your own chores.');
	}
	if (toUserId === fromUserId) throw new InstanceActionError('Pick someone else!');

	const target = db.select().from(users).where(eq(users.id, toUserId)).get();
	if (!target?.isActive) throw new InstanceActionError('Person not found.');
	if (!isHome(db, toUserId, instance.dueDate)) {
		throw new InstanceActionError(`${target.name} is away that day — pick someone else.`);
	}

	const open = db
		.select()
		.from(swapRequests)
		.where(and(eq(swapRequests.instanceId, instanceId), eq(swapRequests.status, 'pending')))
		.get();
	if (open) throw new InstanceActionError('There is already an open swap request for this chore.');

	return db
		.insert(swapRequests)
		.values({ instanceId, fromUser: fromUserId, toUser: toUserId })
		.returning()
		.get();
}

function getPendingSwap(db: DB, swapId: number) {
	const swap = db.select().from(swapRequests).where(eq(swapRequests.id, swapId)).get();
	if (!swap || swap.status !== 'pending') {
		throw new InstanceActionError('This swap request is no longer open.');
	}
	return swap;
}

/** Target accepts: the instance becomes theirs (rotation state is untouched). */
export function acceptSwap(db: DB, swapId: number, actorId: number) {
	const swap = getPendingSwap(db, swapId);
	if (swap.toUser !== actorId) throw new InstanceActionError('This request is not for you.');

	const instance = db
		.select()
		.from(choreInstances)
		.where(eq(choreInstances.id, swap.instanceId))
		.get();
	if (!instance || instance.status !== 'pending') {
		// Deliberately outside the transaction below — the cancellation must
		// stick even though we throw.
		db.update(swapRequests).set({ status: 'cancelled' }).where(eq(swapRequests.id, swapId)).run();
		throw new InstanceActionError('That chore is no longer open — swap cancelled.');
	}

	db.transaction((tx) => {
		tx.update(choreInstances)
			.set({ assigneeId: swap.toUser })
			.where(eq(choreInstances.id, swap.instanceId))
			.run();
		tx.update(swapRequests).set({ status: 'accepted' }).where(eq(swapRequests.id, swapId)).run();
	});
	return swap;
}

export function declineSwap(db: DB, swapId: number, actorId: number) {
	const swap = getPendingSwap(db, swapId);
	if (swap.toUser !== actorId) throw new InstanceActionError('This request is not for you.');
	db.update(swapRequests).set({ status: 'declined' }).where(eq(swapRequests.id, swapId)).run();
	return swap;
}

export function cancelSwap(db: DB, swapId: number, actorId: number) {
	const swap = getPendingSwap(db, swapId);
	if (swap.fromUser !== actorId) throw new InstanceActionError('Only the requester can cancel.');
	db.update(swapRequests).set({ status: 'cancelled' }).where(eq(swapRequests.id, swapId)).run();
	return swap;
}

/** Open requests involving a user, with enough context to render cards. */
export function openSwapsFor(db: DB, userId: number) {
	const fromUsers = alias(users, 'from_users');
	const base = () =>
		db
			.select({
				swap: swapRequests,
				choreTitle: chores.title,
				dueDate: choreInstances.dueDate,
				fromName: fromUsers.name,
				toName: users.name
			})
			.from(swapRequests)
			.innerJoin(choreInstances, eq(swapRequests.instanceId, choreInstances.id))
			.innerJoin(chores, eq(choreInstances.choreId, chores.id))
			.innerJoin(fromUsers, eq(swapRequests.fromUser, fromUsers.id))
			.innerJoin(users, eq(swapRequests.toUser, users.id));

	return {
		incoming: base()
			.where(and(eq(swapRequests.toUser, userId), eq(swapRequests.status, 'pending')))
			.all(),
		outgoing: base()
			.where(and(eq(swapRequests.fromUser, userId), eq(swapRequests.status, 'pending')))
			.all()
	};
}
