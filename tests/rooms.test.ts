import { beforeEach, describe, expect, it } from 'vitest';
import { asc, eq } from 'drizzle-orm';
import { CHORE_TEMPLATES, ROOM_PRESETS, templatesFor } from '$lib/choreLibrary';
import { addAssignee, removeAssignee } from '$lib/server/assignments';
import { choreAssignees, choreInstances, chores } from '$lib/server/db/schema';
import { createFromTemplates } from '$lib/server/library';
import { createRoom, deleteRoom, listRooms } from '$lib/server/roomAdmin';
import { createTestDb, insertUser } from './helpers/testDb';

const TODAY = '2026-07-15';

let db: ReturnType<typeof createTestDb>;
beforeEach(() => {
	db = createTestDb();
});

describe('the shipped catalog', () => {
	it('every room preset is unique and every template list is sane', () => {
		expect(new Set(ROOM_PRESETS.map((p) => p.key)).size).toBe(ROOM_PRESETS.length);
		expect(new Set(ROOM_PRESETS.map((p) => p.icon)).size).toBe(ROOM_PRESETS.length);

		for (const [roomKey, templates] of Object.entries(CHORE_TEMPLATES)) {
			expect(templates.length, roomKey).toBeGreaterThan(0);
			expect(new Set(templates.map((t) => t.title)).size, roomKey).toBe(templates.length);
			for (const t of templates) {
				expect(['daily', 'weekly', 'monthly', 'yearly'], t.title).toContain(t.frequency);
				expect(t.points, t.title).toBeGreaterThan(0);
				expect(t.icon, t.title).not.toBe('');
				if (t.frequency === 'yearly') expect(t.monthOfYear, t.title).toBeGreaterThanOrEqual(1);
			}
		}
	});

	it('unknown preset keys fall back to the General list', () => {
		expect(templatesFor('made-up-room')).toBe(CHORE_TEMPLATES.general);
		expect(templatesFor(null)).toBe(CHORE_TEMPLATES.general);
	});
});

describe('rooms', () => {
	it('create, list ordered, delete', () => {
		createRoom(db, { name: 'Kitchen', icon: '🍳' });
		const bath = createRoom(db, { name: 'Bathroom', icon: '🛁' });
		expect(listRooms(db).map((r) => r.name)).toEqual(['Kitchen', 'Bathroom']);

		deleteRoom(db, bath);
		expect(listRooms(db).map((r) => r.name)).toEqual(['Kitchen']);
	});

	it('deleting a room drops its chores back to General, not off a cliff', () => {
		const kitchen = createRoom(db, { name: 'Kitchen', icon: '🍳' });
		createFromTemplates(db, kitchen, 'kitchen', ['Wipe the counters'], TODAY);

		deleteRoom(db, kitchen);

		const orphan = db.select().from(chores).where(eq(chores.title, 'Wipe the counters')).get();
		expect(orphan).toBeDefined();
		expect(orphan?.roomId).toBeNull();
	});

	it('blank room names are rejected', () => {
		expect(() => createRoom(db, { name: '   ', icon: '🏠' })).toThrow(/name/);
	});
});

describe('library multi-add', () => {
	it('creates unassigned chores that generate no instances yet', () => {
		const kitchen = createRoom(db, { name: 'Kitchen', icon: '🍳' });
		const created = createFromTemplates(
			db,
			kitchen,
			'kitchen',
			['Unload the dishwasher', 'Mop the kitchen floor'],
			TODAY
		);
		expect(created).toBe(2);

		const rows = db.select().from(chores).orderBy(asc(chores.title)).all();
		expect(rows).toHaveLength(2);
		expect(rows.every((c) => c.roomId === kitchen)).toBe(true);
		expect(rows.every((c) => c.allowanceCents === 0)).toBe(true); // money is family policy
		expect(db.select().from(choreAssignees).all()).toHaveLength(0);
		expect(db.select().from(choreInstances).all()).toHaveLength(0); // nothing scheduled
	});

	it('re-adding the same template is a no-op, not a duplicate', () => {
		const kitchen = createRoom(db, { name: 'Kitchen', icon: '🍳' });
		createFromTemplates(db, kitchen, 'kitchen', ['Unload the dishwasher'], TODAY);
		const second = createFromTemplates(db, kitchen, 'kitchen', ['Unload the dishwasher'], TODAY);

		expect(second).toBe(0);
		expect(db.select().from(chores).all()).toHaveLength(1);
	});

	it('unknown titles are ignored rather than inventing chores', () => {
		expect(createFromTemplates(db, null, 'kitchen', ['Not a real template'], TODAY)).toBe(0);
	});
});

describe('person-centric assignment', () => {
	function makeTemplateChore(title = 'Unload the dishwasher') {
		createFromTemplates(db, null, 'kitchen', [title], TODAY);
		return db.select().from(chores).where(eq(chores.title, title)).get()!;
	}

	it('assigning an unassigned chore schedules it immediately', () => {
		const kid = insertUser(db, 'Sam', 'kid');
		const chore = makeTemplateChore(); // daily template

		addAssignee(db, chore.id, kid.id, TODAY);

		const instances = db.select().from(choreInstances).all();
		expect(instances.length).toBeGreaterThan(0);
		expect(instances.every((i) => i.assigneeId === kid.id)).toBe(true);
	});

	it('fixed chores switch person; instances move with them', () => {
		const sam = insertUser(db, 'Sam', 'kid');
		const riley = insertUser(db, 'Riley', 'kid');
		const chore = makeTemplateChore();
		addAssignee(db, chore.id, sam.id, TODAY);

		addAssignee(db, chore.id, riley.id, TODAY);

		const pool = db.select().from(choreAssignees).where(eq(choreAssignees.choreId, chore.id)).all();
		expect(pool).toHaveLength(1);
		expect(pool[0].userId).toBe(riley.id);
		const open = db
			.select()
			.from(choreInstances)
			.where(eq(choreInstances.status, 'pending'))
			.all();
		expect(open.every((i) => i.assigneeId === riley.id)).toBe(true);
	});

	it('rotating chores append to the pool instead of replacing', () => {
		const sam = insertUser(db, 'Sam', 'kid');
		const riley = insertUser(db, 'Riley', 'kid');
		const chore = makeTemplateChore();
		db.update(chores).set({ assignmentType: 'rotating' }).where(eq(chores.id, chore.id)).run();

		addAssignee(db, chore.id, sam.id, TODAY);
		addAssignee(db, chore.id, riley.id, TODAY);

		const pool = db
			.select()
			.from(choreAssignees)
			.where(eq(choreAssignees.choreId, chore.id))
			.orderBy(asc(choreAssignees.position))
			.all();
		expect(pool.map((p) => p.userId)).toEqual([sam.id, riley.id]);
	});

	it('double-assign and phantom-unassign both throw', () => {
		const sam = insertUser(db, 'Sam', 'kid');
		const chore = makeTemplateChore();
		addAssignee(db, chore.id, sam.id, TODAY);

		expect(() => addAssignee(db, chore.id, sam.id, TODAY)).toThrow(/already/);
		expect(() => removeAssignee(db, chore.id, sam.id + 99, TODAY)).toThrow(/don't have/);
	});

	it('unassigning clears future instances but keeps history', () => {
		const sam = insertUser(db, 'Sam', 'kid');
		const chore = makeTemplateChore();
		addAssignee(db, chore.id, sam.id, TODAY);
		const first = db.select().from(choreInstances).orderBy(asc(choreInstances.dueDate)).all()[0];
		db.update(choreInstances)
			.set({ status: 'verified' })
			.where(eq(choreInstances.id, first.id))
			.run();

		removeAssignee(db, chore.id, sam.id, TODAY);

		const left = db.select().from(choreInstances).all();
		expect(left).toHaveLength(1); // just the verified one
		expect(left[0].status).toBe('verified');
		expect(db.select().from(chores).all()).toHaveLength(1); // chore survives
	});
});
