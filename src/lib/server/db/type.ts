import type { RunResult } from 'better-sqlite3';
import type { BaseSQLiteDatabase } from 'drizzle-orm/sqlite-core';
import type * as schema from './schema';

/**
 * The drizzle database handle type. Engine modules take this as a parameter
 * (instead of importing the app singleton) so tests can pass an in-memory DB.
 * Based on BaseSQLiteDatabase so both the app db and `db.transaction` handles
 * qualify.
 */
export type DB = BaseSQLiteDatabase<'sync', RunResult, typeof schema>;
