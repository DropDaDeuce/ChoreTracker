import { choreAssignees, choreInstances, chores } from '$lib/server/db/schema';
import { generateDueInstances, ROLLING_WINDOW_DAYS } from '$lib/server/generate';
import { asc, eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import { createTestDb, insertUser } from './helpers/testDb';

const TODAY = '2026-07-15';

let db: ReturnType<typeof createTestDb>;

beforeEach(() => {
	db = createTestDb();
});

function insertChore(values: Partial<typeof chores.$inferInsert>, assigneeIds: number[]) {
	const chore = db
		.insert(chores)
		.values({
			title: 'Test chore',
			frequency: 'daily',
			startDate: '2026-01-01',
			...values
		})
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

describe('generateDueInstances', () => {
	it('materializes the rolling window for a daily chore', () => {
		const kid = insertUser(db, 'Sam', 'kid');
		const chore = insertChore({}, [kid.id]);

		const created = generateDueInstances(db, TODAY);

		expect(created).toBe(ROLLING_WINDOW_DAYS);
		const rows = instancesOf(chore.id);
		expect(rows).toHaveLength(ROLLING_WINDOW_DAYS);
		expect(rows[0].dueDate).toBe(TODAY);
		expect(rows.every((r) => r.assigneeId === kid.id && r.status === 'pending')).toBe(true);
	});

	it('is idempotent — a second run creates nothing', () => {
		const kid = insertUser(db, 'Sam', 'kid');
		insertChore({}, [kid.id]);

		expect(generateDueInstances(db, TODAY)).toBe(ROLLING_WINDOW_DAYS);
		expect(generateDueInstances(db, TODAY)).toBe(0);
	});

	it('slides the window forward on later runs without duplicating', () => {
		const kid = insertUser(db, 'Sam', 'kid');
		const chore = insertChore({}, [kid.id]);

		generateDueInstances(db, TODAY);
		const createdNextDay = generateDueInstances(db, '2026-07-16');

		expect(createdNextDay).toBe(1); // only the new far edge of the window
		expect(instancesOf(chore.id)).toHaveLength(ROLLING_WINDOW_DAYS + 1);
	});

	it('creates only the next occurrence for monthly chores', () => {
		const kid = insertUser(db, 'Sam', 'kid');
		const chore = insertChore({ frequency: 'monthly', dayOfMonth: 1 }, [kid.id]);

		generateDueInstances(db, TODAY);

		const rows = instancesOf(chore.id);
		expect(rows).toHaveLength(1);
		expect(rows[0].dueDate).toBe('2026-08-01');
	});

	it('skips chores with nobody assigned', () => {
		insertChore({}, []);
		expect(generateDueInstances(db, TODAY)).toBe(0);
	});

	it('skips inactive chores', () => {
		const kid = insertUser(db, 'Sam', 'kid');
		insertChore({ isActive: false }, [kid.id]);
		expect(generateDueInstances(db, TODAY)).toBe(0);
	});

	it('rotates through the pool in order, one step per instance', () => {
		const a = insertUser(db, 'Ana', 'kid');
		const b = insertUser(db, 'Ben', 'kid');
		const c = insertUser(db, 'Cal', 'kid');
		const chore = insertChore({ assignmentType: 'rotating' }, [a.id, b.id, c.id]);

		generateDueInstances(db, TODAY);

		const rows = instancesOf(chore.id);
		expect(rows.map((r) => r.assigneeId)).toEqual(
			Array.from({ length: ROLLING_WINDOW_DAYS }, (_, i) => [a.id, b.id, c.id][i % 3])
		);
	});

	it('does not disturb the rotation on idempotent re-runs', () => {
		const a = insertUser(db, 'Ana', 'kid');
		const b = insertUser(db, 'Ben', 'kid');
		const chore = insertChore({ assignmentType: 'rotating' }, [a.id, b.id]);

		generateDueInstances(db, TODAY);
		const first = instancesOf(chore.id).map((r) => `${r.dueDate}:${r.assigneeId}`);

		expect(generateDueInstances(db, TODAY)).toBe(0);
		expect(instancesOf(chore.id).map((r) => `${r.dueDate}:${r.assigneeId}`)).toEqual(first);
	});

	it('gives an `everyone` chore to each person, every occurrence', () => {
		const a = insertUser(db, 'Ana', 'kid');
		const b = insertUser(db, 'Ben', 'kid');
		const c = insertUser(db, 'Cal', 'kid');
		const chore = insertChore({ assignmentType: 'everyone' }, [a.id, b.id, c.id]);

		const created = generateDueInstances(db, TODAY);

		// One row per person per day — not one row that takes turns.
		expect(created).toBe(ROLLING_WINDOW_DAYS * 3);
		const rows = instancesOf(chore.id);
		const forToday = rows.filter((r) => r.dueDate === TODAY);
		expect(forToday.map((r) => r.assigneeId).sort()).toEqual([a.id, b.id, c.id].sort());
	});

	it('re-running an `everyone` chore creates nothing new', () => {
		const a = insertUser(db, 'Ana', 'kid');
		const b = insertUser(db, 'Ben', 'kid');
		const chore = insertChore({ assignmentType: 'everyone' }, [a.id, b.id]);

		generateDueInstances(db, TODAY);
		expect(generateDueInstances(db, TODAY)).toBe(0);
		expect(instancesOf(chore.id)).toHaveLength(ROLLING_WINDOW_DAYS * 2);
	});

	it('backfills only the missing person when an `everyone` slot is freed', () => {
		const a = insertUser(db, 'Ana', 'kid');
		const b = insertUser(db, 'Ben', 'kid');
		const chore = insertChore({ assignmentType: 'everyone' }, [a.id, b.id]);
		generateDueInstances(db, TODAY);

		const bensToday = instancesOf(chore.id).find(
			(r) => r.dueDate === TODAY && r.assigneeId === b.id
		)!;
		db.delete(choreInstances).where(eq(choreInstances.id, bensToday.id)).run();

		expect(generateDueInstances(db, TODAY)).toBe(1);
		expect(instancesOf(chore.id).filter((r) => r.dueDate === TODAY)).toHaveLength(2);
	});

	it('adding someone to an `everyone` chore does not duplicate the others', () => {
		const a = insertUser(db, 'Ana', 'kid');
		const b = insertUser(db, 'Ben', 'kid');
		const chore = insertChore({ assignmentType: 'everyone' }, [a.id]);
		generateDueInstances(db, TODAY);
		expect(instancesOf(chore.id)).toHaveLength(ROLLING_WINDOW_DAYS);

		db.insert(choreAssignees).values({ choreId: chore.id, userId: b.id, position: 1 }).run();
		const created = generateDueInstances(db, TODAY);

		expect(created).toBe(ROLLING_WINDOW_DAYS); // Ben's copies only
		expect(instancesOf(chore.id)).toHaveLength(ROLLING_WINDOW_DAYS * 2);
	});

	it('picks up the rotation where it left off when the window slides', () => {
		const a = insertUser(db, 'Ana', 'kid');
		const b = insertUser(db, 'Ben', 'kid');
		const c = insertUser(db, 'Cal', 'kid');
		const chore = insertChore({ assignmentType: 'rotating' }, [a.id, b.id, c.id]);

		generateDueInstances(db, TODAY);
		generateDueInstances(db, '2026-07-16');

		// The new far edge continues the cycle rather than restarting it.
		const rows = instancesOf(chore.id);
		expect(rows).toHaveLength(ROLLING_WINDOW_DAYS + 1);
		expect(rows.map((r) => r.assigneeId)).toEqual(
			Array.from({ length: ROLLING_WINDOW_DAYS + 1 }, (_, i) => [a.id, b.id, c.id][i % 3])
		);
	});
});
