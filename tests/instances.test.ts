import { allowanceLedger, choreAssignees, choreInstances, chores } from '$lib/server/db/schema';
import { generateDueInstances } from '$lib/server/generate';
import {
	addReminder,
	balanceCents,
	InstanceActionError,
	markDone,
	payOutBalance,
	rejectInstance,
	verifyInstance
} from '$lib/server/instances';
import { asc, eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import { createTestDb, insertUser } from './helpers/testDb';

const TODAY = '2026-07-15';

let db: ReturnType<typeof createTestDb>;
let adult: { id: number; role: 'adult' | 'kid' };
let kid: { id: number; role: 'adult' | 'kid' };

beforeEach(() => {
	db = createTestDb();
	adult = insertUser(db, 'Alex', 'adult');
	kid = insertUser(db, 'Sam', 'kid');
});

function makeChore(overrides: Partial<typeof chores.$inferInsert> = {}) {
	const chore = db
		.insert(chores)
		.values({
			title: 'Dishes',
			frequency: 'daily',
			startDate: '2026-01-01',
			allowanceCents: 100,
			...overrides
		})
		.returning()
		.get();
	db.insert(choreAssignees).values({ choreId: chore.id, userId: kid.id, position: 0 }).run();
	generateDueInstances(db, TODAY);
	return db
		.select()
		.from(choreInstances)
		.where(eq(choreInstances.choreId, chore.id))
		.orderBy(asc(choreInstances.dueDate))
		.all();
}

function reload(id: number) {
	return db.select().from(choreInstances).where(eq(choreInstances.id, id)).get()!;
}

describe('full allowance loop', () => {
	it('done → verify pays the full allowance into the ledger', () => {
		const [first] = makeChore();

		markDone(db, first.id, kid);
		expect(reload(first.id).status).toBe('done');
		expect(balanceCents(db, kid.id)).toBe(0); // nothing until verified

		verifyInstance(db, first.id, adult.id);
		const verified = reload(first.id);
		expect(verified.status).toBe('verified');
		expect(verified.payoutCents).toBe(100);
		expect(balanceCents(db, kid.id)).toBe(100);
	});

	it('one reminder halves the payout', () => {
		const [first] = makeChore();

		addReminder(db, first.id, adult.id);
		markDone(db, first.id, kid);
		verifyInstance(db, first.id, adult.id);

		expect(reload(first.id).payoutCents).toBe(50);
		expect(balanceCents(db, kid.id)).toBe(50);
	});

	it('two reminders pay nothing (and write no ledger row)', () => {
		const [first] = makeChore();

		addReminder(db, first.id, adult.id);
		addReminder(db, first.id, adult.id);
		markDone(db, first.id, kid);
		verifyInstance(db, first.id, adult.id);

		expect(reload(first.id).status).toBe('verified');
		expect(reload(first.id).payoutCents).toBe(0);
		expect(db.select().from(allowanceLedger).all()).toHaveLength(0);
	});

	it('reject sends the chore back to pending with no payout', () => {
		const [first] = makeChore();

		markDone(db, first.id, kid);
		rejectInstance(db, first.id, adult.id);

		expect(reload(first.id).status).toBe('pending');
		expect(balanceCents(db, kid.id)).toBe(0);

		// Redo after rejection still works.
		markDone(db, first.id, kid);
		verifyInstance(db, first.id, adult.id);
		expect(balanceCents(db, kid.id)).toBe(100);
	});

	it('auto-verifies (and pays) when no verification is required', () => {
		const [first] = makeChore({ requiresVerification: false });

		markDone(db, first.id, kid);

		expect(reload(first.id).status).toBe('verified');
		expect(balanceCents(db, kid.id)).toBe(100);
	});

	it('pay out zeroes the balance via a negative ledger row', () => {
		const [first, second] = makeChore();
		markDone(db, first.id, kid);
		verifyInstance(db, first.id, adult.id);
		markDone(db, second.id, kid);
		verifyInstance(db, second.id, adult.id);
		expect(balanceCents(db, kid.id)).toBe(200);

		const paid = payOutBalance(db, kid.id, adult.id);

		expect(paid).toBe(200);
		expect(balanceCents(db, kid.id)).toBe(0);
		expect(() => payOutBalance(db, kid.id, adult.id)).toThrow(InstanceActionError);
	});
});

describe('guards', () => {
	it('only the assignee or an adult can mark done', () => {
		const otherKid = insertUser(db, 'Riley', 'kid');
		const [first] = makeChore();

		expect(() => markDone(db, first.id, otherKid)).toThrow(InstanceActionError);
		expect(() => markDone(db, first.id, adult)).not.toThrow(); // parent helping out
	});

	it('cannot mark done twice or verify an unfinished chore', () => {
		const [first, second] = makeChore();

		markDone(db, first.id, kid);
		expect(() => markDone(db, first.id, kid)).toThrow(InstanceActionError);
		expect(() => verifyInstance(db, second.id, adult.id)).toThrow(InstanceActionError);
	});

	it('reminders only apply to open chores', () => {
		const [first] = makeChore();
		markDone(db, first.id, kid);
		verifyInstance(db, first.id, adult.id);

		expect(() => addReminder(db, first.id, adult.id)).toThrow(InstanceActionError);
	});
});
