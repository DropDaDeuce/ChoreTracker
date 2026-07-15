import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import * as schema from '$lib/server/db/schema';

/** Fresh in-memory database with all real migrations applied. */
export function createTestDb() {
	const sqlite = new Database(':memory:');
	sqlite.pragma('foreign_keys = ON');
	const db = drizzle(sqlite, { schema });
	migrate(db, { migrationsFolder: 'drizzle' });
	return db;
}

export function insertUser(
	db: ReturnType<typeof createTestDb>,
	name: string,
	role: 'adult' | 'kid'
) {
	return db
		.insert(schema.users)
		.values({ name, role, pinHash: 'test-hash' })
		.returning()
		.get();
}
