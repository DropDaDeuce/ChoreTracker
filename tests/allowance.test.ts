import {
	computeHouseholdWeek,
	computeWeek,
	newestSettleableWeek,
	settleDueWeeks,
	settleWeek,
	weekStartFor,
	type WeekInstance
} from '$lib/server/allowance';
import {
	allowanceLedger,
	choreAssignees,
	choreInstances,
	chores,
	weeklySettlements
} from '$lib/server/db/schema';
import { generateDueInstances } from '$lib/server/generate';
import {
	FULL_WEEK_DAYS_KEY,
	SETTLEMENT_GRACE_DAYS_KEY,
	setSetting,
	WEEK_START_KEY,
	WEEKLY_ALLOWANCE_CENTS_KEY
} from '$lib/server/settings';
import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import { createTestDb, insertUser } from './helpers/testDb';

/** Saturday — the household default, so a week runs Sat…Fri. */
const WEEK_START = '2026-07-11';
const TODAY = '2026-07-15'; // the Wednesday inside that week

let id = 0;
function instance(overrides: Partial<WeekInstance> = {}): WeekInstance {
	return {
		id: ++id,
		dueDate: WEEK_START,
		title: 'Chore',
		icon: '',
		status: 'verified',
		weight: 1,
		isBonus: false,
		bonusPoints: 0,
		reminderCount: 0,
		...overrides
	};
}

const opts = (fullWeekDays: number, allowanceCents = 1000) => ({
	weekStart: WEEK_START,
	fullWeekDays,
	allowanceCents,
	penaltyPercent: 50
});

describe('computeWeek — the day pot', () => {
	it('pays the whole allowance for a full week done clean', () => {
		const days = ['2026-07-11', '2026-07-12', '2026-07-13', '2026-07-14', '2026-07-15'];
		const week = computeWeek(
			days.map((dueDate) => instance({ dueDate })),
			opts(5)
		);

		expect(week.daysWorked).toBe(5);
		expect(week.ceilingCents).toBe(1000);
		// Rounded once at the end: a perfect week is exactly $10.00, not $9.98.
		expect(week.earnedCents).toBe(1000);
		expect(week.lostCents).toBe(0);
		expect(week.earnedBasisPoints).toBe(10000);
	});

	it('rounds once, even when the day value does not divide evenly', () => {
		// $10 over 3 days = $3.333… a day. Three perfect days must still be $10.
		const days = ['2026-07-11', '2026-07-12', '2026-07-13'];
		const week = computeWeek(
			days.map((dueDate) => instance({ dueDate })),
			opts(3)
		);
		expect(week.earnedCents).toBe(1000);
		expect(week.ceilingCents).toBe(1000);
	});

	it('shrinks the ceiling for someone who was only here part of the week', () => {
		// Same 5-day yardstick, but this person only had chores on 3 days.
		const days = ['2026-07-11', '2026-07-12', '2026-07-13'];
		const week = computeWeek(
			days.map((dueDate) => instance({ dueDate })),
			opts(5)
		);

		expect(week.daysWorked).toBe(3);
		expect(week.ceilingCents).toBe(600); // 3 x $2.00
		expect(week.earnedCents).toBe(600);
	});

	it('pays nothing for a week that was entirely away', () => {
		const week = computeWeek([], opts(5));
		expect(week.daysWorked).toBe(0);
		expect(week.ceilingCents).toBe(0);
		expect(week.earnedCents).toBe(0);
	});

	it('pays a day the same whether it holds one chore or five', () => {
		const oneChore = computeWeek([instance()], opts(1));
		const fiveChores = computeWeek(
			Array.from({ length: 5 }, () => instance()),
			opts(1)
		);
		expect(oneChore.earnedCents).toBe(1000);
		expect(fiveChores.earnedCents).toBe(1000);
	});

	it('splits a day between its chores by points', () => {
		const week = computeWeek(
			[instance({ weight: 1 }), instance({ weight: 3 })],
			opts(1) // one day, worth the whole $10
		);
		const [light, heavy] = week.days[0].chores;
		expect(light.shareCents).toBe(250); // 1 of 4 points
		expect(heavy.shareCents).toBe(750); // 3 of 4 points
	});
});

describe('computeWeek — reminders and unfinished work', () => {
	it('halves a chore after one reminder and zeroes it after two', () => {
		const week = computeWeek(
			[
				instance({ dueDate: '2026-07-11', reminderCount: 0 }),
				instance({ dueDate: '2026-07-12', reminderCount: 1 }),
				instance({ dueDate: '2026-07-13', reminderCount: 2 })
			],
			opts(3)
		);
		expect(week.days[0].chores[0].valueCents).toBe(333);
		expect(week.days[1].chores[0].valueCents).toBe(167); // half of 333.33
		expect(week.days[2].chores[0].valueCents).toBe(0);
		expect(week.earnedCents).toBe(500);
	});

	it('counts missed chores in the denominator but pays nothing for them', () => {
		const week = computeWeek(
			[
				instance({ dueDate: '2026-07-11', status: 'verified' }),
				instance({ dueDate: '2026-07-12', status: 'missed' })
			],
			opts(2)
		);
		expect(week.daysWorked).toBe(2);
		expect(week.ceilingCents).toBe(1000);
		expect(week.earnedCents).toBe(500);
		expect(week.lostCents).toBe(500);
	});

	it('treats open and awaiting-verification chores as still winnable', () => {
		const week = computeWeek(
			[
				instance({ dueDate: '2026-07-11', status: 'verified' }),
				instance({ dueDate: '2026-07-12', status: 'pending' }),
				instance({ dueDate: '2026-07-13', status: 'done' })
			],
			opts(3)
		);
		expect(week.earnedCents).toBe(333);
		expect(week.pendingCents).toBe(667);
		expect(week.lostCents).toBe(0);
	});
});

describe('computeWeek — bonuses', () => {
	it('pays a bonus chore on top, without touching the denominator', () => {
		const week = computeWeek(
			[
				instance({ dueDate: '2026-07-11', weight: 5 }),
				instance({ dueDate: '2026-07-11', isBonus: true, weight: 5 })
			],
			opts(1)
		);
		// The assigned chore is the whole day, so the day still pays $10 …
		expect(week.daysWorked).toBe(1);
		expect(week.ceilingCents).toBe(1000);
		expect(week.earnedCents).toBe(1000);
		// … and the bonus adds the week rate for 5 points on top: 5/5 x $10.
		expect(week.bonusCents).toBe(1000);
		expect(week.totalCents).toBe(2000);
	});

	it('pays adult-granted bonus points at the same flat week rate', () => {
		const week = computeWeek(
			[
				instance({ dueDate: '2026-07-11', weight: 4 }),
				instance({ dueDate: '2026-07-12', weight: 6, bonusPoints: 5 })
			],
			opts(2)
		);
		// Week weight is 10, so the rate is $1 a point; 5 bonus points = $5.
		expect(week.bonusCents).toBe(500);
	});

	it('prices a bonus off the busiest week when this person had nothing assigned', () => {
		const week = computeWeek([instance({ isBonus: true, weight: 2 })], {
			...opts(5),
			fallbackWeekWeight: 10
		});
		expect(week.ceilingCents).toBe(0); // nothing was assigned to them
		expect(week.bonusCents).toBe(200); // 2 points at $1 each
	});
});

describe('the household divisor', () => {
	let db: ReturnType<typeof createTestDb>;
	let sam: { id: number };
	let riley: { id: number };

	beforeEach(() => {
		db = createTestDb();
		sam = insertUser(db, 'Sam', 'kid');
		riley = insertUser(db, 'Riley', 'kid');
		setSetting(db, WEEKLY_ALLOWANCE_CENTS_KEY, '1000');
		setSetting(db, WEEK_START_KEY, 'saturday');
	});

	function giveChore(userId: number, dueDates: string[], overrides = {}) {
		const chore = db
			.insert(chores)
			.values({ title: 'Chore', frequency: 'daily', startDate: '2026-01-01', ...overrides })
			.returning()
			.get();
		db.insert(choreAssignees).values({ choreId: chore.id, userId, position: 0 }).run();
		for (const dueDate of dueDates) {
			db.insert(choreInstances)
				.values({ choreId: chore.id, assigneeId: userId, dueDate, status: 'verified', weight: 1 })
				.run();
		}
		return chore;
	}

	it('lets the busiest person set the full week for everyone', () => {
		giveChore(sam.id, ['2026-07-11', '2026-07-12', '2026-07-13', '2026-07-14']);
		giveChore(riley.id, ['2026-07-11', '2026-07-12']);

		const household = computeHouseholdWeek(db, WEEK_START);

		expect(household.fullWeekDays).toBe(4);
		expect(household.dayValueCents).toBe(250);
		const samWeek = household.people.find((p) => p.userId === sam.id)!.week;
		const rileyWeek = household.people.find((p) => p.userId === riley.id)!.week;
		expect(samWeek.ceilingCents).toBe(1000); // full week
		expect(rileyWeek.ceilingCents).toBe(500); // away half of it
	});

	it('honors a pinned full-week length', () => {
		setSetting(db, FULL_WEEK_DAYS_KEY, '7');
		giveChore(sam.id, ['2026-07-11', '2026-07-12', '2026-07-13', '2026-07-14']);

		const household = computeHouseholdWeek(db, WEEK_START);

		expect(household.fullWeekDays).toBe(7);
		// Four of seven days: even the busiest kid no longer reaches the full pot.
		expect(household.people.find((p) => p.userId === sam.id)!.week.ceilingCents).toBe(571);
	});

	it('ignores skipped chores entirely', () => {
		const chore = giveChore(sam.id, ['2026-07-11', '2026-07-12']);
		db.update(choreInstances)
			.set({ status: 'skipped' })
			.where(eq(choreInstances.dueDate, '2026-07-12'))
			.run();
		void chore;

		const household = computeHouseholdWeek(db, WEEK_START);
		// The skipped day never happened: one day worked, and it pays in full.
		expect(household.fullWeekDays).toBe(1);
		expect(household.people.find((p) => p.userId === sam.id)!.week.earnedCents).toBe(1000);
	});
});

describe('settlement', () => {
	let db: ReturnType<typeof createTestDb>;
	let sam: { id: number };
	let adult: { id: number };

	beforeEach(() => {
		db = createTestDb();
		adult = insertUser(db, 'Alex', 'adult');
		sam = insertUser(db, 'Sam', 'kid');
		setSetting(db, WEEKLY_ALLOWANCE_CENTS_KEY, '1000');
		setSetting(db, WEEK_START_KEY, 'saturday');
	});

	function workedWeek(dueDates: string[]) {
		const chore = db
			.insert(chores)
			.values({ title: 'Dishes', frequency: 'daily', startDate: '2026-01-01' })
			.returning()
			.get();
		db.insert(choreAssignees).values({ choreId: chore.id, userId: sam.id, position: 0 }).run();
		for (const dueDate of dueDates) {
			db.insert(choreInstances)
				.values({
					choreId: chore.id,
					assigneeId: sam.id,
					dueDate,
					status: 'verified',
					weight: 1
				})
				.run();
		}
	}

	it('writes one ledger row and freezes each chore payout', () => {
		workedWeek(['2026-07-11', '2026-07-12']);

		const result = settleWeek(
			db,
			sam.id,
			WEEK_START,
			computeHouseholdWeek(db, WEEK_START),
			adult.id
		);

		expect(result?.cents).toBe(1000);
		const ledger = db.select().from(allowanceLedger).all();
		expect(ledger).toHaveLength(1);
		expect(ledger[0].amountCents).toBe(1000);
		expect(ledger[0].note).toContain('2 of 2 days');
		// Per-chore figures are frozen so a settled week can still be explained.
		expect(db.select().from(choreInstances).all().every((i) => i.payoutCents === 500)).toBe(true);
	});

	it('never pays the same week twice', () => {
		workedWeek(['2026-07-11']);
		const household = computeHouseholdWeek(db, WEEK_START);

		expect(settleWeek(db, sam.id, WEEK_START, household, adult.id)).not.toBeNull();
		expect(settleWeek(db, sam.id, WEEK_START, household, adult.id)).toBeNull();

		expect(db.select().from(allowanceLedger).all()).toHaveLength(1);
	});

	it('waits for the grace period before closing a finished week', () => {
		setSetting(db, SETTLEMENT_GRACE_DAYS_KEY, '1');
		workedWeek(['2026-07-11', '2026-07-12']);

		// The week ends Friday 17th. Saturday is too early with a day of grace.
		expect(settleDueWeeks(db, '2026-07-18')).toBe(0);
		// Sunday it goes.
		expect(settleDueWeeks(db, '2026-07-19')).toBe(1);
		expect(db.select().from(weeklySettlements).all()).toHaveLength(1);
	});

	it('settles nothing while the money model is switched off', () => {
		setSetting(db, WEEKLY_ALLOWANCE_CENTS_KEY, '0');
		workedWeek(['2026-07-11']);
		expect(settleDueWeeks(db, '2026-07-19')).toBe(0);
	});

	it('catches up after downtime without double-paying', () => {
		setSetting(db, SETTLEMENT_GRACE_DAYS_KEY, '0');
		workedWeek(['2026-07-11', '2026-07-18', '2026-07-25']);

		// Server was down for three weeks; it comes back on the 1st.
		expect(settleDueWeeks(db, '2026-08-01')).toBe(3);
		expect(settleDueWeeks(db, '2026-08-01')).toBe(0);
		expect(db.select().from(weeklySettlements).all()).toHaveLength(3);
	});

	it('picks the newest fully-closed week', () => {
		const config = {
			weekStartIndex: 5, // Saturday
			allowanceCents: 1000,
			fullWeekDaysOverride: 0,
			penaltyPercent: 50,
			graceDays: 1
		};
		// Sunday the 19th: the week that ran the 11th–17th is the one due.
		expect(newestSettleableWeek('2026-07-19', config)).toBe('2026-07-11');
	});
});

describe('end to end through generation', () => {
	it('prices a real generated week', () => {
		const db = createTestDb();
		const adult = insertUser(db, 'Alex', 'adult');
		const sam = insertUser(db, 'Sam', 'kid');
		setSetting(db, WEEKLY_ALLOWANCE_CENTS_KEY, '700');
		setSetting(db, WEEK_START_KEY, 'saturday');

		const chore = db
			.insert(chores)
			.values({ title: 'Dishes', frequency: 'daily', startDate: '2026-01-01', points: 2 })
			.returning()
			.get();
		db.insert(choreAssignees).values({ choreId: chore.id, userId: sam.id, position: 0 }).run();
		generateDueInstances(db, TODAY);

		// Generation stamps the weight from the chore's points.
		expect(db.select().from(choreInstances).all().every((i) => i.weight === 2)).toBe(true);

		const weekStart = weekStartFor(db, TODAY);
		expect(weekStart).toBe(WEEK_START);

		const household = computeHouseholdWeek(db, weekStart);
		// Generation starts at TODAY, so the week holds Wed–Fri: 3 days.
		expect(household.fullWeekDays).toBe(3);
		const week = household.people[0].week;
		expect(week.earnedCents).toBe(0); // nothing verified yet
		expect(week.pendingCents).toBe(700); // all still winnable
		void adult;
	});
});
