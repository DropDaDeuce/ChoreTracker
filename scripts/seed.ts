/**
 * Seed a demo family so the app can be eyeballed immediately:
 *   npm run seed
 *
 * Demo data only — fake names, well-known PINs. Never seed a real household
 * this way; real data stays out of the repo entirely (see .gitignore).
 */
import { hash } from '@node-rs/argon2';
import { sql } from 'drizzle-orm';
import { db } from '../src/lib/server/db';
import { runMigrations } from '../src/lib/server/db/migrate';
import { choreAssignees, chores, rooms, users } from '../src/lib/server/db/schema';
import { todayLocal } from '../src/lib/server/dates';
import { generateDueInstances } from '../src/lib/server/generate';

async function main() {
	runMigrations();

	const existing = db.select({ n: sql<number>`count(*)` }).from(users).get()?.n ?? 0;
	if (existing > 0) {
		console.log('Database already has users — refusing to seed on top. Delete data/chores.db first.');
		process.exit(1);
	}

	const today = todayLocal();

	const family = [
		{ name: 'Alex', role: 'adult' as const, pin: '1234', avatarColor: '#3b82f6' },
		{ name: 'Sam', role: 'kid' as const, pin: '1111', avatarColor: '#10b981' },
		{ name: 'Riley', role: 'kid' as const, pin: '2222', avatarColor: '#ec4899' }
	];

	const ids: Record<string, number> = {};
	for (const person of family) {
		const created = db
			.insert(users)
			.values({
				name: person.name,
				role: person.role,
				pinHash: await hash(person.pin),
				avatarColor: person.avatarColor
			})
			.returning()
			.get();
		ids[person.name] = created.id;
	}

	const demoRooms = [
		{ name: 'Kitchen', icon: '🍳' },
		{ name: 'Living room', icon: '🛋️' },
		{ name: 'Bathroom', icon: '🛁' }
	];
	const roomIds: Record<string, number> = {};
	for (const [sortOrder, room] of demoRooms.entries()) {
		roomIds[room.name] = db
			.insert(rooms)
			.values({ ...room, sortOrder })
			.returning()
			.get().id;
	}

	const demoChores: Array<{
		values: Omit<typeof chores.$inferInsert, 'startDate'>;
		assignees: string[];
	}> = [
		{
			values: {
				title: 'Empty the dishwasher',
				icon: '🍽️',
				roomId: roomIds['Kitchen'],
				frequency: 'daily',
				allowanceCents: 50,
				points: 5
			},
			assignees: ['Sam']
		},
		{
			values: {
				title: 'Take out the trash',
				icon: '🗑️',
				roomId: roomIds['Kitchen'],
				frequency: 'weekly',
				weekdayMask: (1 << 0) | (1 << 3), // Mon + Thu
				allowanceCents: 100,
				points: 10,
				requiresPhoto: true
			},
			assignees: ['Riley']
		},
		{
			values: {
				title: 'Vacuum the living room',
				icon: '🌀',
				roomId: roomIds['Living room'],
				frequency: 'weekly',
				weekdayMask: 1 << 5, // Sat
				allowanceCents: 150,
				points: 15,
				assignmentType: 'rotating'
			},
			assignees: ['Sam', 'Riley']
		},
		{
			values: {
				title: 'Deep-clean the bathroom',
				icon: '🛁',
				roomId: roomIds['Bathroom'],
				frequency: 'monthly',
				dayOfMonth: 1,
				requiresVerification: false
			},
			assignees: ['Alex']
		},
		{
			values: {
				title: 'Replace smoke-alarm batteries',
				frequency: 'yearly',
				monthOfYear: 3,
				dayOfMonth: 1,
				requiresVerification: false
			},
			assignees: ['Alex']
		}
	];

	for (const { values, assignees } of demoChores) {
		const chore = db
			.insert(chores)
			.values({ ...values, startDate: today })
			.returning()
			.get();
		for (const [position, name] of assignees.entries()) {
			db.insert(choreAssignees)
				.values({ choreId: chore.id, userId: ids[name], position })
				.run();
		}
	}

	const created = generateDueInstances(db, today);

	console.log('Seeded demo family 🎉');
	console.log('  Alex  (adult) — PIN 1234');
	console.log('  Sam   (kid)   — PIN 1111');
	console.log('  Riley (kid)   — PIN 2222');
	console.log(`  ${demoChores.length} chores, ${created} scheduled instances`);
	console.log('Run `npm run dev` and log in from the profile picker.');
}

main();
