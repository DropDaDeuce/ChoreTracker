import { sqliteTable, text } from 'drizzle-orm/sqlite-core';

// Phase 0: minimal schema proving the migration pipeline end-to-end.
// The full data model (users, chores, instances, ledger, ...) lands in Phase 1 —
// see docs/PLAN.md "Data Model".

/** Simple key/value store for app-wide settings (currency symbol, week start, ...). */
export const appSettings = sqliteTable('app_settings', {
	key: text('key').primaryKey(),
	value: text('value').notNull()
});
