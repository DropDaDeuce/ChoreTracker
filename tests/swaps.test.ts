import { choreAssignees, choreInstances, chores, swapRequests } from '$lib/server/db/schema';
import { InstanceActionError, markDone } from '$lib/server/instances';
import { acceptSwap, cancelSwap, declineSwap, openSwapsFor, requestSwap } from '$lib/server/swaps';
import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import { createTestDb, insertUser } from './helpers/testDb';

let db: ReturnType<typeof createTestDb>;
let sam: { id: number; role: 'adult' | 'kid' };
let riley: { id: number; role: 'adult' | 'kid' };
let instanceId: number;

beforeEach(() => {
	db = createTestDb();
	sam = insertUser(db, 'Sam', 'kid');
	riley = insertUser(db, 'Riley', 'kid');
	const chore = db
		.insert(chores)
		.values({ title: 'Dishes', frequency: 'daily', startDate: '2026-01-01' })
		.returning()
		.get();
	db.insert(choreAssignees).values({ choreId: chore.id, userId: sam.id, position: 0 }).run();
	instanceId = db
		.insert(choreInstances)
		.values({ choreId: chore.id, assigneeId: sam.id, dueDate: '2026-07-15' })
		.returning()
		.get().id;
});

function assigneeOf(id: number) {
	return db.select().from(choreInstances).where(eq(choreInstances.id, id)).get()!.assigneeId;
}

describe('swap requests', () => {
	it('accept hands the instance to the target', () => {
		const swap = requestSwap(db, instanceId, sam.id, riley.id);
		acceptSwap(db, swap.id, riley.id);

		expect(assigneeOf(instanceId)).toBe(riley.id);
		expect(db.select().from(swapRequests).get()!.status).toBe('accepted');
	});

	it('decline leaves the instance alone', () => {
		const swap = requestSwap(db, instanceId, sam.id, riley.id);
		declineSwap(db, swap.id, riley.id);

		expect(assigneeOf(instanceId)).toBe(sam.id);
		expect(db.select().from(swapRequests).get()!.status).toBe('declined');
	});

	it('only the target can answer; only the requester can cancel', () => {
		const swap = requestSwap(db, instanceId, sam.id, riley.id);

		expect(() => acceptSwap(db, swap.id, sam.id)).toThrow(InstanceActionError);
		expect(() => declineSwap(db, swap.id, sam.id)).toThrow(InstanceActionError);
		expect(() => cancelSwap(db, swap.id, riley.id)).toThrow(InstanceActionError);

		cancelSwap(db, swap.id, sam.id);
		expect(db.select().from(swapRequests).get()!.status).toBe('cancelled');
	});

	it('rejects swapping chores you do not own, done chores, and duplicates', () => {
		expect(() => requestSwap(db, instanceId, riley.id, sam.id)).toThrow(InstanceActionError);
		expect(() => requestSwap(db, instanceId, sam.id, sam.id)).toThrow(InstanceActionError);

		requestSwap(db, instanceId, sam.id, riley.id);
		expect(() => requestSwap(db, instanceId, sam.id, riley.id)).toThrow(InstanceActionError);
	});

	it('accepting a swap for a no-longer-open chore cancels it', () => {
		const swap = requestSwap(db, instanceId, sam.id, riley.id);
		markDone(db, instanceId, sam);

		expect(() => acceptSwap(db, swap.id, riley.id)).toThrow(InstanceActionError);
		expect(db.select().from(swapRequests).get()!.status).toBe('cancelled');
		expect(assigneeOf(instanceId)).toBe(sam.id);
	});

	it('openSwapsFor lists incoming and outgoing with context', () => {
		requestSwap(db, instanceId, sam.id, riley.id);

		const forRiley = openSwapsFor(db, riley.id);
		expect(forRiley.incoming).toHaveLength(1);
		expect(forRiley.incoming[0].choreTitle).toBe('Dishes');
		expect(forRiley.incoming[0].fromName).toBe('Sam');
		expect(forRiley.outgoing).toHaveLength(0);

		const forSam = openSwapsFor(db, sam.id);
		expect(forSam.outgoing).toHaveLength(1);
		expect(forSam.incoming).toHaveLength(0);
	});
});
