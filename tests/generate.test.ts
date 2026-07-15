import { choreAssignees, choreInstances, choreRotationState, chores } from '$lib/server/db/schema';
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

	it('does not advance rotation on idempotent re-runs', () => {
		const a = insertUser(db, 'Ana', 'kid');
		const b = insertUser(db, 'Ben', 'kid');
		const chore = insertChore({ assignmentType: 'rotating' }, [a.id, b.id]);

		generateDueInstances(db, TODAY);
		const stateAfterFirst = db
			.select()
			.from(choreRotationState)
			.where(eq(choreRotationState.choreId, chore.id))
			.get();

		generateDueInstances(db, TODAY);
		const stateAfterSecond = db
			.select()
			.from(choreRotationState)
			.where(eq(choreRotationState.choreId, chore.id))
			.get();

		expect(stateAfterSecond).toEqual(stateAfterFirst);
		expect(instancesOf(chore.id)).toHaveLength(ROLLING_WINDOW_DAYS);
	});
});
