import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import * as schema from './schema';

// Plain process.env (not $env/dynamic/private) so scripts and tests that run
// outside SvelteKit — npm run seed, drizzle-kit — can share this module.
const databasePath = process.env.DATABASE_PATH || './data/chores.db';

// The data directory is gitignored and volume-mounted in Docker; create it on
// first run so a fresh checkout boots without manual setup.
mkdirSync(dirname(databasePath), { recursive: true });

/** Raw better-sqlite3 handle — needed for the online-backup API. */
export const sqlite = new Database(databasePath);
sqlite.pragma('journal_mode = WAL');
sqlite.pragma('foreign_keys = ON');

export const db = drizzle(sqlite, { schema });
export { databasePath };
