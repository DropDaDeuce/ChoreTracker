import { computeHouseholdWeek, settleWeek, weekStartFor } from '$lib/server/allowance';
import { allowanceLedger, choreAssignees, choreInstances, chores } from '$lib/server/db/schema';
import { generateDueInstances } from '$lib/server/generate';
import {
	addAdjustment,
	addReminder,
	balanceCents,
	grantBonusPoints,
	InstanceActionError,
	markDone,
	payOutBalance,
	rejectInstance,
	undoMarkDone,
	verifyInstance
} from '$lib/server/instances';
import {
	setSetting,
	UNDO_WINDOW_MINUTES_KEY,
	WEEKLY_ALLOWANCE_CENTS_KEY
} from '$lib/server/settings';
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
			points: 1,
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

describe('the chore lifecycle', () => {
	it('done → verify freezes the points and moves NO money', () => {
		const [first] = makeChore({ points: 3 });

		markDone(db, first.id, kid);
		expect(reload(first.id).status).toBe('done');

		verifyInstance(db, first.id, adult.id);
		const verified = reload(first.id);
		expect(verified.status).toBe('verified');
		expect(verified.pointsAwarded).toBe(3);
		// Money is a property of the WEEK now — nothing is owed until it settles.
		expect(verified.payoutCents).toBeNull();
		expect(balanceCents(db, kid.id)).toBe(0);
		expect(db.select().from(allowanceLedger).all()).toHaveLength(0);
	});

	it('freezes the weight when the instance is created, not when it is verified', () => {
		const [first] = makeChore({ points: 3 });
		expect(reload(first.id).weight).toBe(3);

		// Retuning the chore mid-week must not move the denominator underneath
		// a week already in progress.
		db.update(chores).set({ points: 99 }).where(eq(chores.id, first.choreId)).run();
		markDone(db, first.id, kid);
		verifyInstance(db, first.id, adult.id);

		expect(reload(first.id).weight).toBe(3);
	});

	it('reject sends the chore back to pending so it can be redone', () => {
		const [first] = makeChore();

		markDone(db, first.id, kid);
		rejectInstance(db, first.id, adult.id);

		expect(reload(first.id).status).toBe('pending');

		markDone(db, first.id, kid);
		verifyInstance(db, first.id, adult.id);
		expect(reload(first.id).status).toBe('verified');
	});

	it('auto-verifies when no verification is required', () => {
		const [first] = makeChore({ requiresVerification: false });

		markDone(db, first.id, kid);

		expect(reload(first.id).status).toBe('verified');
		expect(db.select().from(allowanceLedger).all()).toHaveLength(0);
	});

	it('pay out zeroes the balance via a negative ledger row', () => {
		addAdjustment(db, kid.id, adult.id, 'bonus', 200, 'Car wash');
		expect(balanceCents(db, kid.id)).toBe(200);

		const paid = payOutBalance(db, kid.id, adult.id);

		expect(paid).toBe(200);
		expect(balanceCents(db, kid.id)).toBe(0);
		expect(() => payOutBalance(db, kid.id, adult.id)).toThrow(InstanceActionError);
	});
});

describe('settled weeks are frozen', () => {
	function settleKidsWeek() {
		setSetting(db, WEEKLY_ALLOWANCE_CENTS_KEY, '1000');
		const weekStart = weekStartFor(db, TODAY);
		const household = computeHouseholdWeek(db, weekStart);
		settleWeek(db, kid.id, weekStart, household, adult.id);
	}

	it('refuses every mutation on a chore whose week has been paid', () => {
		const [first] = makeChore();
		settleKidsWeek();

		expect(() => markDone(db, first.id, kid)).toThrow(InstanceActionError);
		expect(() => addReminder(db, first.id, adult.id)).toThrow(InstanceActionError);
	});

	it('leaves an unsettled week fully editable', () => {
		const [first] = makeChore();
		expect(() => markDone(db, first.id, kid)).not.toThrow();
		expect(() => undoMarkDone(db, first.id, kid)).not.toThrow();
	});
});

describe('grantBonusPoints', () => {
	it('sets bonus points on one occurrence', () => {
		const [first] = makeChore();
		grantBonusPoints(db, first.id, 5);
		expect(reload(first.id).bonusPoints).toBe(5);

		// Sets rather than adds, so a mistyped grant is corrected by retyping.
		grantBonusPoints(db, first.id, 2);
		expect(reload(first.id).bonusPoints).toBe(2);
	});

	it('rejects nonsense amounts', () => {
		const [first] = makeChore();
		expect(() => grantBonusPoints(db, first.id, -1)).toThrow(InstanceActionError);
		expect(() => grantBonusPoints(db, first.id, 1.5)).toThrow(InstanceActionError);
	});
});

describe('addAdjustment', () => {
	it('bonuses add and penalties subtract', () => {
		addAdjustment(db, kid.id, adult.id, 'bonus', 150, 'Helped wash the car');
		expect(balanceCents(db, kid.id)).toBe(150);

		addAdjustment(db, kid.id, adult.id, 'penalty', 50, 'Left the door open');
		expect(balanceCents(db, kid.id)).toBe(100);
	});

	it('rejects zero/negative amounts and unknown people', () => {
		expect(() => addAdjustment(db, kid.id, adult.id, 'bonus', 0, '')).toThrow(InstanceActionError);
		expect(() => addAdjustment(db, kid.id, adult.id, 'bonus', -5, '')).toThrow(InstanceActionError);
		expect(() => addAdjustment(db, 999, adult.id, 'bonus', 100, '')).toThrow(InstanceActionError);
	});
});

describe('undoMarkDone', () => {
	it('reverts a done-but-unverified chore to pending', () => {
		const [first] = makeChore();
		markDone(db, first.id, kid);

		undoMarkDone(db, first.id, kid);

		const reverted = reload(first.id);
		expect(reverted.status).toBe('pending');
		expect(reverted.doneAt).toBeNull();
		expect(reverted.doneBy).toBeNull();
	});

	it('unwinds an auto-verified chore within the window', () => {
		const [first] = makeChore({ requiresVerification: false });
		markDone(db, first.id, kid);
		expect(reload(first.id).status).toBe('verified');

		undoMarkDone(db, first.id, kid);

		const reverted = reload(first.id);
		expect(reverted.status).toBe('pending');
		expect(reverted.pointsAwarded).toBeNull();
		// It simply stops counting toward the week in progress; there was
		// never a ledger row to unwind.
		expect(db.select().from(allowanceLedger).all()).toHaveLength(0);
	});

	it('refuses once the undo window has passed', () => {
		setSetting(db, UNDO_WINDOW_MINUTES_KEY, '0');
		const [first] = makeChore({ requiresVerification: false });
		markDone(db, first.id, kid);

		expect(() => undoMarkDone(db, first.id, kid)).toThrow(InstanceActionError);
		expect(reload(first.id).status).toBe('verified');
	});

	it('refuses to undo an adult-verified chore', () => {
		const [first] = makeChore();
		markDone(db, first.id, kid);
		verifyInstance(db, first.id, adult.id);

		expect(() => undoMarkDone(db, first.id, kid)).toThrow(InstanceActionError);
	});

	it('only the doer or an adult can undo', () => {
		const otherKid = insertUser(db, 'Riley', 'kid');
		const [first] = makeChore();
		markDone(db, first.id, kid);

		expect(() => undoMarkDone(db, first.id, otherKid)).toThrow(InstanceActionError);
		expect(() => undoMarkDone(db, first.id, adult)).not.toThrow();
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

	it('photo-required chores refuse markDone without a photo', () => {
		const [first] = makeChore({ requiresPhoto: true });

		expect(() => markDone(db, first.id, kid)).toThrow(InstanceActionError);

		markDone(db, first.id, kid, 'abc123.jpg');
		expect(reload(first.id).status).toBe('done');
		expect(reload(first.id).photoPath).toBe('abc123.jpg');
	});

	it('reminders only apply to open chores', () => {
		const [first] = makeChore();
		markDone(db, first.id, kid);
		verifyInstance(db, first.id, adult.id);

		expect(() => addReminder(db, first.id, adult.id)).toThrow(InstanceActionError);
	});
});
