import { choreAssignees, choreInstances, chores } from '$lib/server/db/schema';
import { generateDueInstances } from '$lib/server/generate';
import { sweepOverdue } from '$lib/server/sweep';
import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import { createTestDb, insertUser } from './helpers/testDb';

let db: ReturnType<typeof createTestDb>;
let kidId: number;

beforeEach(() => {
	db = createTestDb();
	kidId = insertUser(db, 'Sam', 'kid').id;
});

function choreWithInstanceDue(dueDate: string, graceDays = 0) {
	const chore = db
		.insert(chores)
		.values({ title: 'Test', frequency: 'daily', startDate: '2026-01-01', graceDays })
		.returning()
		.get();
	db.insert(choreAssignees).values({ choreId: chore.id, userId: kidId, position: 0 }).run();
	const instance = db
		.insert(choreInstances)
		.values({ choreId: chore.id, assigneeId: kidId, dueDate })
		.returning()
		.get();
	return instance;
}

function statusOf(id: number) {
	return db.select().from(choreInstances).where(eq(choreInstances.id, id)).get()!.status;
}

describe('sweepOverdue', () => {
	it('marks pending instances past their due date as missed', () => {
		const overdue = choreWithInstanceDue('2026-07-13');
		const dueToday = choreWithInstanceDue('2026-07-15');

		const missed = sweepOverdue(db, '2026-07-15');

		expect(missed).toBe(1);
		expect(statusOf(overdue.id)).toBe('missed');
		expect(statusOf(dueToday.id)).toBe('pending');
	});

	it('honors per-chore grace days', () => {
		const inGrace = choreWithInstanceDue('2026-07-13', 2); // 13 + 2 = 15, not < 15
		const pastGrace = choreWithInstanceDue('2026-07-12', 2); // 12 + 2 = 14 < 15

		sweepOverdue(db, '2026-07-15');

		expect(statusOf(inGrace.id)).toBe('pending');
		expect(statusOf(pastGrace.id)).toBe('missed');
	});

	it('leaves done/verified instances alone', () => {
		const doneOne = choreWithInstanceDue('2026-07-10');
		db.update(choreInstances)
			.set({ status: 'done' })
			.where(eq(choreInstances.id, doneOne.id))
			.run();

		expect(sweepOverdue(db, '2026-07-15')).toBe(0);
		expect(statusOf(doneOne.id)).toBe('done');
	});

	it('plays nice with generation: due-today instances survive a same-day sweep', () => {
		const chore = db
			.insert(chores)
			.values({ title: 'Daily', frequency: 'daily', startDate: '2026-01-01' })
			.returning()
			.get();
		db.insert(choreAssignees).values({ choreId: chore.id, userId: kidId, position: 0 }).run();

		generateDueInstances(db, '2026-07-15');
		expect(sweepOverdue(db, '2026-07-15')).toBe(0);
	});
});
