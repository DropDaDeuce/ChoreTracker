import { building } from '$app/environment';
import { SESSION_COOKIE, validateSessionToken } from '$lib/server/auth';
import { runMigrations } from '$lib/server/db/migrate';
import { startScheduler } from '$lib/server/scheduler';
import type { Handle } from '@sveltejs/kit';

// Once per server boot: apply pending migrations, then start the cron
// scheduler (which also does an immediate catch-up generation run).
// Skipped during `vite build` so building never touches a database.
if (!building) {
	runMigrations();
	startScheduler();
}

export const handle: Handle = async ({ event, resolve }) => {
	const token = event.cookies.get(SESSION_COOKIE);
	event.locals.user = token ? validateSessionToken(token) : null;
	return resolve(event);
};
