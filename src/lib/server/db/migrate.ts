import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { db } from './index';

/**
 * Applies any pending SQL migrations from the `drizzle/` folder.
 * Called once on server boot (see src/hooks.server.ts) so both `npm run dev`
 * and the production Docker container are always on the current schema.
 */
export function runMigrations() {
	migrate(db, { migrationsFolder: 'drizzle' });
}
