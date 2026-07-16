import { startOfWeek } from '$lib/server/dates';
import { choreAssignees, choreInstances, chores } from '$lib/server/db/schema';
import { currentStreak, pointsTotal } from '$lib/server/stats';
import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import { createTestDb, insertUser } from './helpers/testDb';

const TODAY = '2026-07-15';

let db: ReturnType<typeof createTestDb>;
let kidId: number;
let choreId: number;

beforeEach(() => {
	db = createTestDb();
	kidId = insertUser(db, 'Sam', 'kid').id;
	const chore = db
		.insert(chores)
		.values({ title: 'Chore', frequency: 'daily', startDate: '2026-01-01', points: 10 })
		.returning()
		.get();
	choreId = chore.id;
	db.insert(choreAssignees).values({ choreId, userId: kidId, position: 0 }).run();
});

function instanceOn(dueDate: string, status: string, pointsAwarded?: number) {
	return db
		.insert(choreInstances)
		.values({
			choreId,
			assigneeId: kidId,
			dueDate,
			status: status as 'pending',
			pointsAwarded: pointsAwarded ?? (status === 'verified' ? 10 : null)
		})
		.returning()
		.get();
}

describe('currentStreak', () => {
	it('counts consecutive completed due-days back from today', () => {
		instanceOn('2026-07-13', 'verified');
		instanceOn('2026-07-14', 'verified');
		instanceOn('2026-07-15', 'verified');
		expect(currentStreak(db, kidId, TODAY)).toBe(3);
	});

	it('skips days with nothing due without breaking the streak', () => {
		instanceOn('2026-07-10', 'verified');
		instanceOn('2026-07-12', 'verified'); // nothing due on the 11th, 13th, 14th
		instanceOn('2026-07-15', 'verified');
		expect(currentStreak(db, kidId, TODAY)).toBe(3);
	});

	it('does not break (or count) while today is still in progress', () => {
		instanceOn('2026-07-13', 'verified');
		instanceOn('2026-07-14', 'verified');
		instanceOn('2026-07-15', 'pending');
		expect(currentStreak(db, kidId, TODAY)).toBe(2);
	});

	it('breaks on a missed day', () => {
		instanceOn('2026-07-12', 'verified');
		instanceOn('2026-07-13', 'missed');
		instanceOn('2026-07-14', 'verified');
		instanceOn('2026-07-15', 'verified');
		expect(currentStreak(db, kidId, TODAY)).toBe(2);
	});

	it('requires ALL of a day\'s chores to be complete', () => {
		instanceOn('2026-07-14', 'verified');
		const second = db
			.insert(chores)
			.values({ title: 'Other', frequency: 'daily', startDate: '2026-01-01' })
			.returning()
			.get();
		db.insert(choreInstances)
			.values({ choreId: second.id, assigneeId: kidId, dueDate: '2026-07-14', status: 'missed' })
			.run();
		instanceOn('2026-07-15', 'verified');
		expect(currentStreak(db, kidId, TODAY)).toBe(1);
	});

	it('is zero with no history', () => {
		expect(currentStreak(db, kidId, TODAY)).toBe(0);
	});
});

describe('pointsTotal', () => {
	it('sums frozen points on verified instances only', () => {
		instanceOn('2026-07-13', 'verified');
		instanceOn('2026-07-14', 'verified');
		instanceOn('2026-07-15', 'pending');
		expect(pointsTotal(db, kidId)).toBe(20);
	});

	it('uses the frozen value, not the chore\'s current points', () => {
		instanceOn('2026-07-14', 'verified', 10);
		db.update(chores).set({ points: 999 }).where(eq(chores.id, choreId)).run();
		expect(pointsTotal(db, kidId)).toBe(10);
	});

	it('filters by since-date for weekly/monthly boards', () => {
		instanceOn('2026-07-01', 'verified');
		instanceOn('2026-07-14', 'verified');
		expect(pointsTotal(db, kidId, '2026-07-10')).toBe(10);
		expect(pointsTotal(db, kidId)).toBe(20);
	});
});

describe('startOfWeek', () => {
	it('finds the most recent Monday or Sunday', () => {
		// 2026-07-15 is a Wednesday
		expect(startOfWeek('2026-07-15', 'monday')).toBe('2026-07-13');
		expect(startOfWeek('2026-07-15', 'sunday')).toBe('2026-07-12');
		// On the boundary day itself
		expect(startOfWeek('2026-07-13', 'monday')).toBe('2026-07-13');
		expect(startOfWeek('2026-07-12', 'sunday')).toBe('2026-07-12');
	});
});
