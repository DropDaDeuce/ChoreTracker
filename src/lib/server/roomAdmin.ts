import { asc, eq, sql } from 'drizzle-orm';
import { chores, rooms } from './db/schema';
import type { DB } from './db/type';
import { InstanceActionError } from './instances';

/** Rooms are purely organizational — nothing here touches instances. */

export function listRooms(db: DB) {
	return db.select().from(rooms).orderBy(asc(rooms.sortOrder), asc(rooms.name)).all();
}

/** Rooms with how many (active) chores live in each. */
export function listRoomsWithCounts(db: DB) {
	return listRooms(db).map((room) => {
		const counts = db
			.select({
				total: sql<number>`count(*)`,
				unassigned: sql<number>`sum(case when not exists (
					select 1 from chore_assignees ca where ca.chore_id = ${chores.id}
				) then 1 else 0 end)`
			})
			.from(chores)
			.where(sql`${chores.roomId} = ${room.id} and ${chores.isActive}`)
			.get();
		return { ...room, choreCount: counts?.total ?? 0, unassignedCount: counts?.unassigned ?? 0 };
	});
}

export function createRoom(db: DB, input: { name: string; icon: string }): number {
	const name = input.name.trim();
	if (!name) throw new InstanceActionError('The room needs a name.');
	if (name.length > 50) throw new InstanceActionError('Room name is too long.');
	const maxSort =
		db.select({ max: sql<number>`coalesce(max(${rooms.sortOrder}), 0)` }).from(rooms).get()?.max ??
		0;
	const created = db
		.insert(rooms)
		.values({ name, icon: input.icon.trim().slice(0, 16) || '🏠', sortOrder: maxSort + 1 })
		.returning()
		.get();
	return created.id;
}

/** Chores in the room survive — they're released back to General first. */
export function deleteRoom(db: DB, roomId: number): void {
	db.transaction((tx) => {
		tx.update(chores).set({ roomId: null }).where(eq(chores.roomId, roomId)).run();
		const gone = tx.delete(rooms).where(eq(rooms.id, roomId)).run();
		if (gone.changes === 0) throw new InstanceActionError('Room not found.');
	});
}
