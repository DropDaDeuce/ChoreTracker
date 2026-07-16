import {
	choreAssignees,
	choreInstances,
	chores,
	presenceRules,
	users
} from '$lib/server/db/schema';
import { generateDueInstances, ROLLING_WINDOW_DAYS } from '$lib/server/generate';
import { isHome, ruleMatches } from '$lib/server/presence';
import { addRule, applyPresenceChange, resetDay, toggleDay } from '$lib/server/presenceAdmin';
import { asc, eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import { createTestDb, insertUser } from './helpers/testDb';

const TODAY = '2026-07-15'; // a Wednesday

let db: ReturnType<typeof createTestDb>;
let kid: { id: number };

beforeEach(() => {
	db = createTestDb();
	kid = insertUser(db, 'Sam', 'kid');
});

function makeRule(overrides: Partial<typeof presenceRules.$inferInsert>) {
	return db
		.insert(presenceRules)
		.values({ userId: kid.id, kind: 'weekly', isHome: false, ...overrides })
		.returning()
		.get();
}

describe('rule matching', () => {
	it('weekly matches its weekday every week', () => {
		const rule = makeRule({ kind: 'weekly', weekday: 3 }); // Thursday
		expect(ruleMatches(rule, '2026-07-16')).toBe(true); // Thu
		expect(ruleMatches(rule, '2026-07-23')).toBe(true); // next Thu
		expect(ruleMatches(rule, '2026-07-17')).toBe(false); // Fri
	});

	it('biweekly matches every other week from its anchor, both directions', () => {
		const rule = makeRule({ kind: 'biweekly', weekday: 3, anchorDate: '2026-07-16' });
		expect(ruleMatches(rule, '2026-07-16')).toBe(true); // anchor
		expect(ruleMatches(rule, '2026-07-23')).toBe(false); // off week
		expect(ruleMatches(rule, '2026-07-30')).toBe(true); // on week
		expect(ruleMatches(rule, '2026-07-09')).toBe(false); // week before anchor
		expect(ruleMatches(rule, '2026-07-02')).toBe(true); // two weeks before
	});

	it('monthly clamps day 31 to short months', () => {
		const rule = makeRule({ kind: 'monthly', dayOfMonth: 31 });
		expect(ruleMatches(rule, '2026-07-31')).toBe(true);
		expect(ruleMatches(rule, '2026-06-30')).toBe(true); // clamped
		expect(ruleMatches(rule, '2026-06-29')).toBe(false);
	});
});

describe('isHome resolution', () => {
	it('defaults to home', () => {
		expect(isHome(db, kid.id, TODAY)).toBe(true);
	});

	it('rules apply; the newest matching rule wins', () => {
		makeRule({ kind: 'weekly', weekday: 2, isHome: false }); // away Wednesdays
		expect(isHome(db, kid.id, TODAY)).toBe(false);

		makeRule({ kind: 'weekly', weekday: 2, isHome: true }); // newer: home Wednesdays
		expect(isHome(db, kid.id, TODAY)).toBe(true);
	});

	it('day overrides beat rules; reset falls back to the rule', () => {
		makeRule({ kind: 'weekly', weekday: 2, isHome: false });
		toggleDay(db, kid.id, TODAY); // flips away -> home for just this day
		expect(isHome(db, kid.id, TODAY)).toBe(true);
		expect(isHome(db, kid.id, '2026-07-22')).toBe(false); // other Wednesdays unaffected

		resetDay(db, kid.id, TODAY);
		expect(isHome(db, kid.id, TODAY)).toBe(false);
	});
});

describe('presence-aware generation', () => {
	function makeChore(overrides: Partial<typeof chores.$inferInsert>, assigneeIds: number[]) {
		const chore = db
			.insert(chores)
			.values({ title: 'Chore', frequency: 'daily', startDate: '2026-01-01', ...overrides })
			.returning()
			.get();
		for (const [position, userId] of assigneeIds.entries()) {
			db.insert(choreAssignees).values({ choreId: chore.id, userId, position }).run();
		}
		return chore;
	}

	function instancesOf(choreId: number) {
		return db
			.select()
			.from(choreInstances)
			.where(eq(choreInstances.choreId, choreId))
			.orderBy(asc(choreInstances.dueDate))
			.all();
	}

	it('BUG FIX: deactivated people are never scheduled', () => {
		const chore = makeChore({}, [kid.id]);
		db.update(users).set({ isActive: false }).where(eq(users.id, kid.id)).run();

		expect(generateDueInstances(db, TODAY)).toBe(0);
		expect(instancesOf(chore.id)).toHaveLength(0);
	});

	it('fixed chores skip away days entirely', () => {
		addRule(db, kid.id, { kind: 'weekly', weekday: 3, isHome: false }); // away Thursdays
		const chore = makeChore({}, [kid.id]);

		generateDueInstances(db, TODAY);

		const rows = instancesOf(chore.id);
		expect(rows).toHaveLength(ROLLING_WINDOW_DAYS - 2); // two Thursdays in the window
		expect(rows.some((r) => r.dueDate === '2026-07-16' || r.dueDate === '2026-07-23')).toBe(false);
	});

	it('rotations hand the turn to whoever is home', () => {
		const riley = insertUser(db, 'Riley', 'kid');
		addRule(db, kid.id, { kind: 'weekly', weekday: 3, isHome: false }); // Sam away Thursdays
		const chore = makeChore({ assignmentType: 'rotating' }, [kid.id, riley.id]);

		generateDueInstances(db, TODAY);

		const rows = instancesOf(chore.id);
		expect(rows).toHaveLength(ROLLING_WINDOW_DAYS); // every day still covered
		for (const row of rows) {
			if (row.dueDate === '2026-07-16' || row.dueDate === '2026-07-23') {
				expect(row.assigneeId).toBe(riley.id); // Riley covers Sam's away Thursdays
			}
		}
	});

	it('rotation skips the day when the whole pool is away', () => {
		const riley = insertUser(db, 'Riley', 'kid');
		addRule(db, kid.id, { kind: 'weekly', weekday: 3, isHome: false });
		addRule(db, riley.id, { kind: 'weekly', weekday: 3, isHome: false });
		const chore = makeChore({ assignmentType: 'rotating' }, [kid.id, riley.id]);

		generateDueInstances(db, TODAY);

		expect(instancesOf(chore.id).some((r) => r.dueDate === '2026-07-16')).toBe(false);
	});

	it('applyPresenceChange drops now-away open chores and backfills rotations', () => {
		const riley = insertUser(db, 'Riley', 'kid');
		const fixed = makeChore({}, [kid.id]);
		const rotating = makeChore({ title: 'Rotating', assignmentType: 'rotating' }, [
			kid.id,
			riley.id
		]);
		generateDueInstances(db, TODAY);

		// Sam leaves for Thursday the 16th (rule added AFTER instances exist).
		addRule(db, kid.id, { kind: 'weekly', weekday: 3, isHome: false });

		const fixedThursdays = instancesOf(fixed.id).filter(
			(r) => r.dueDate === '2026-07-16' || r.dueDate === '2026-07-23'
		);
		expect(fixedThursdays).toHaveLength(0); // dropped, nobody else to take them

		const rotatingThursdays = instancesOf(rotating.id).filter(
			(r) => r.dueDate === '2026-07-16' || r.dueDate === '2026-07-23'
		);
		expect(rotatingThursdays.length).toBeGreaterThan(0);
		expect(rotatingThursdays.every((r) => r.assigneeId === riley.id)).toBe(true); // backfilled

		// Coming back home regenerates the fixed chore.
		applyPresenceChange(db, kid.id, TODAY);
		db.delete(presenceRules).where(eq(presenceRules.userId, kid.id)).run();
		applyPresenceChange(db, kid.id, TODAY);
		expect(
			instancesOf(fixed.id).filter((r) => r.dueDate === '2026-07-16' || r.dueDate === '2026-07-23')
		).toHaveLength(2);
	});

	it('completed history survives a presence change', () => {
		const chore = makeChore({}, [kid.id]);
		generateDueInstances(db, TODAY);
		const first = instancesOf(chore.id)[0];
		db.update(choreInstances)
			.set({ status: 'verified' })
			.where(eq(choreInstances.id, first.id))
			.run();

		addRule(db, kid.id, { kind: 'weekly', weekday: 2, isHome: false }); // away Wednesdays incl. TODAY

		const kept = instancesOf(chore.id).find((r) => r.id === first.id);
		expect(kept?.status).toBe('verified'); // only PENDING rows get dropped
	});
});
