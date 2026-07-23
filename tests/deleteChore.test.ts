import { beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import {
	allowanceLedger,
	choreAssignees,
	choreInstances,
	chores,
	swapRequests
} from '$lib/server/db/schema';
import { deleteChore, verifiedCount } from '$lib/server/deleteChore';
import { balanceCents, markDone, verifyInstance } from '$lib/server/instances';
import { generateDueInstances } from '$lib/server/generate';
import { createTestDb, insertUser } from './helpers/testDb';

const TODAY = '2026-07-15';

let db: ReturnType<typeof createTestDb>;
let kid: { id: number; role: string };
let adult: { id: number; role: string };

beforeEach(() => {
	db = createTestDb();
	kid = insertUser(db, 'Sam', 'kid');
	adult = insertUser(db, 'Alex', 'adult');
});

function makeChore(allowanceCents = 100) {
	const chore = db
		.insert(chores)
		.values({ title: 'Dishes', frequency: 'daily', startDate: '2026-01-01', allowanceCents })
		.returning()
		.get();
	db.insert(choreAssignees).values({ choreId: chore.id, userId: kid.id, position: 0 }).run();
	generateDueInstances(db, TODAY);
	return chore;
}

describe('deleteChore', () => {
	it('removes the chore, its schedule, and reports photo paths', () => {
		const chore = makeChore();
		const first = db.select().from(choreInstances).all()[0];
		db.update(choreInstances)
			.set({ photoPath: 'proof-123.jpg' })
			.where(eq(choreInstances.id, first.id))
			.run();

		const { photoPaths } = deleteChore(db, chore.id);

		expect(photoPaths).toEqual(['proof-123.jpg']);
		expect(db.select().from(chores).all()).toHaveLength(0);
		expect(db.select().from(choreInstances).all()).toHaveLength(0);
		expect(db.select().from(choreAssignees).all()).toHaveLength(0);
	});

	it('keeps earned money: ledger rows survive with the link nulled', () => {
		const chore = makeChore(100);
		const instance = db.select().from(choreInstances).all()[0];
		markDone(db, instance.id, kid);
		verifyInstance(db, instance.id, adult.id);
		expect(balanceCents(db, kid.id)).toBe(100);
		expect(verifiedCount(db, chore.id)).toBe(1);

		deleteChore(db, chore.id);

		expect(balanceCents(db, kid.id)).toBe(100); // money untouched
		const ledger = db.select().from(allowanceLedger).all();
		expect(ledger).toHaveLength(1);
		expect(ledger[0].instanceId).toBeNull();
		expect(ledger[0].note).toContain('Dishes'); // note still names the chore
		expect(db.select().from(choreInstances).all()).toHaveLength(0);
	});

	it('takes open swap requests down with the instances', () => {
		const chore = makeChore();
		const riley = insertUser(db, 'Riley', 'kid');
		const instance = db.select().from(choreInstances).all()[0];
		db.insert(swapRequests)
			.values({ instanceId: instance.id, fromUser: kid.id, toUser: riley.id })
			.run();

		deleteChore(db, chore.id);

		expect(db.select().from(swapRequests).all()).toHaveLength(0);
	});

	it('throws on a missing chore', () => {
		expect(() => deleteChore(db, 999)).toThrow(/not found/);
	});
});
