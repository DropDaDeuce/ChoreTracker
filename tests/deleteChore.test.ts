import { beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import {
	allowanceLedger,
	choreAssignees,
	choreInstances,
	chores,
	swapRequests
} from '$lib/server/db/schema';
import { computeHouseholdWeek, settleWeek, weekStartFor } from '$lib/server/allowance';
import { deleteChore, verifiedCount } from '$lib/server/deleteChore';
import { balanceCents, markDone, verifyInstance } from '$lib/server/instances';
import { generateDueInstances } from '$lib/server/generate';
import { setSetting, WEEKLY_ALLOWANCE_CENTS_KEY } from '$lib/server/settings';
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

function makeChore(points = 1) {
	const chore = db
		.insert(chores)
		.values({ title: 'Dishes', frequency: 'daily', startDate: '2026-01-01', points })
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

	it('keeps money already paid out for a settled week', () => {
		setSetting(db, WEEKLY_ALLOWANCE_CENTS_KEY, '700');
		const chore = makeChore();
		const instance = db.select().from(choreInstances).all()[0];
		markDone(db, instance.id, kid);
		verifyInstance(db, instance.id, adult.id);
		expect(verifiedCount(db, chore.id)).toBe(1);

		const weekStart = weekStartFor(db, TODAY);
		settleWeek(db, kid.id, weekStart, computeHouseholdWeek(db, weekStart), adult.id);
		const paid = balanceCents(db, kid.id);
		expect(paid).toBeGreaterThan(0);

		deleteChore(db, chore.id);

		// Deleting a chore rewrites the schedule, never the bank balance.
		expect(balanceCents(db, kid.id)).toBe(paid);
		expect(db.select().from(allowanceLedger).all()).toHaveLength(1);
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
