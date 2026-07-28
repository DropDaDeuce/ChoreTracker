import { choreAssignees, choreInstances, chores, goalAchievements } from '$lib/server/db/schema';
import {
	allGoals,
	claimNewAchievements,
	createGoal,
	deleteGoal,
	goalsFor,
	pointsInRange
} from '$lib/server/goals';
import { setSetting, WEEK_START_KEY } from '$lib/server/settings';
import { beforeEach, describe, expect, it } from 'vitest';
import { createTestDb, insertUser } from './helpers/testDb';

const TODAY = '2026-07-15'; // Wednesday; the Sat–Fri week starts 2026-07-11

let db: ReturnType<typeof createTestDb>;
let sam: { id: number };
let riley: { id: number };

beforeEach(() => {
	db = createTestDb();
	sam = insertUser(db, 'Sam', 'kid');
	riley = insertUser(db, 'Riley', 'kid');
	setSetting(db, WEEK_START_KEY, 'saturday');
});

/** Award `points` to someone on a given day, as a verified chore would. */
function award(userId: number, points: number, dueDate = TODAY) {
	const chore = db
		.insert(chores)
		.values({ title: 'Chore', frequency: 'daily', startDate: '2026-01-01', points })
		.returning()
		.get();
	db.insert(choreAssignees).values({ choreId: chore.id, userId, position: 0 }).run();
	db.insert(choreInstances)
		.values({
			choreId: chore.id,
			assigneeId: userId,
			dueDate,
			status: 'verified',
			pointsAwarded: points,
			weight: points
		})
		.run();
}

describe('pointsInRange', () => {
	it('counts only verified chores', () => {
		award(sam.id, 5);
		const chore = db
			.insert(chores)
			.values({ title: 'Unfinished', frequency: 'daily', startDate: '2026-01-01', points: 5 })
			.returning()
			.get();
		db.insert(choreInstances)
			.values({ choreId: chore.id, assigneeId: sam.id, dueDate: TODAY, status: 'pending' })
			.run();

		expect(pointsInRange(db, sam.id, TODAY, TODAY)).toBe(5);
	});

	it('sums the whole family when nobody is named', () => {
		award(sam.id, 5);
		award(riley.id, 3);
		expect(pointsInRange(db, null, TODAY, TODAY)).toBe(8);
	});
});

describe('goal progress', () => {
	it('tracks a personal weekly goal across the whole week', () => {
		createGoal(db, { scope: 'user', userId: sam.id, period: 'weekly', targetPoints: 10 });
		award(sam.id, 4, '2026-07-11'); // Saturday, same week
		award(sam.id, 3, TODAY);

		const [goal] = goalsFor(db, sam.id, TODAY);
		expect(goal.points).toBe(7);
		expect(goal.percent).toBe(70);
		expect(goal.met).toBe(false);
	});

	it('a daily goal only counts today', () => {
		createGoal(db, { scope: 'user', userId: sam.id, period: 'daily', targetPoints: 5 });
		award(sam.id, 9, '2026-07-11');
		award(sam.id, 5, TODAY);

		const [goal] = goalsFor(db, sam.id, TODAY);
		expect(goal.points).toBe(5);
		expect(goal.met).toBe(true);
	});

	it('caps the bar at 100% when a goal is blown past', () => {
		createGoal(db, { scope: 'user', userId: sam.id, period: 'daily', targetPoints: 5 });
		award(sam.id, 50);
		expect(goalsFor(db, sam.id, TODAY)[0].percent).toBe(100);
	});

	it('shows family goals to everyone but personal goals only to their owner', () => {
		createGoal(db, { scope: 'family', period: 'weekly', targetPoints: 20 });
		createGoal(db, { scope: 'user', userId: sam.id, period: 'weekly', targetPoints: 10 });

		expect(goalsFor(db, sam.id, TODAY)).toHaveLength(2);
		expect(goalsFor(db, riley.id, TODAY)).toHaveLength(1); // family only
		expect(goalsFor(db, null, TODAY)).toHaveLength(1); // the board: family only
		expect(allGoals(db, TODAY)).toHaveLength(2); // adults see the lot
	});

	it('counts every kid toward a family goal', () => {
		createGoal(db, { scope: 'family', period: 'weekly', targetPoints: 10 });
		award(sam.id, 6);
		award(riley.id, 4);

		expect(goalsFor(db, riley.id, TODAY)[0].met).toBe(true);
	});

	it('ignores reminders — goals count raw points', () => {
		createGoal(db, { scope: 'user', userId: sam.id, period: 'daily', targetPoints: 5 });
		const chore = db
			.insert(chores)
			.values({ title: 'Nagged', frequency: 'daily', startDate: '2026-01-01', points: 5 })
			.returning()
			.get();
		db.insert(choreAssignees).values({ choreId: chore.id, userId: sam.id, position: 0 }).run();
		db.insert(choreInstances)
			.values({
				choreId: chore.id,
				assigneeId: sam.id,
				dueDate: TODAY,
				status: 'verified',
				pointsAwarded: 5,
				weight: 5,
				reminderCount: 2 // no money at all, but the stars still count
			})
			.run();

		expect(goalsFor(db, sam.id, TODAY)[0].met).toBe(true);
	});
});

describe('claiming achievements', () => {
	it('hands back a newly-met goal exactly once', () => {
		createGoal(db, { scope: 'user', userId: sam.id, period: 'daily', targetPoints: 5 });
		award(sam.id, 5);

		expect(claimNewAchievements(db, sam.id, TODAY)).toHaveLength(1);
		expect(claimNewAchievements(db, sam.id, TODAY)).toHaveLength(0);
		expect(db.select().from(goalAchievements).all()).toHaveLength(1);
	});

	it('claims nothing while the goal is unmet', () => {
		createGoal(db, { scope: 'user', userId: sam.id, period: 'daily', targetPoints: 50 });
		award(sam.id, 5);
		expect(claimNewAchievements(db, sam.id, TODAY)).toHaveLength(0);
	});

	it('can be met again in the next period', () => {
		createGoal(db, { scope: 'user', userId: sam.id, period: 'daily', targetPoints: 5 });
		award(sam.id, 5, TODAY);
		award(sam.id, 5, '2026-07-16');

		expect(claimNewAchievements(db, sam.id, TODAY)).toHaveLength(1);
		expect(claimNewAchievements(db, sam.id, '2026-07-16')).toHaveLength(1);
	});
});

describe('managing goals', () => {
	it('refuses a personal goal with nobody attached', () => {
		expect(() => createGoal(db, { scope: 'user', period: 'daily', targetPoints: 5 })).toThrow();
	});

	it('drops a goal and its achievement history', () => {
		const id = createGoal(db, {
			scope: 'user',
			userId: sam.id,
			period: 'daily',
			targetPoints: 5
		});
		award(sam.id, 5);
		claimNewAchievements(db, sam.id, TODAY);

		deleteGoal(db, id);

		expect(goalsFor(db, sam.id, TODAY)).toHaveLength(0);
		expect(db.select().from(goalAchievements).all()).toHaveLength(0);
	});
});
