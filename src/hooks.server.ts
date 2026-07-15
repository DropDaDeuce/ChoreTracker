import { building } from '$app/environment';
import { runMigrations } from '$lib/server/db/migrate';

// Run pending migrations once per server boot. Skipped during `vite build`
// (prerendering) so building never touches a database.
if (!building) {
	runMigrations();
}
