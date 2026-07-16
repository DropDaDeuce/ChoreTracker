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

const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const FORM_TYPES = ['application/x-www-form-urlencoded', 'multipart/form-data', 'text/plain'];

/**
 * CSRF: same-host origin check. Kit's built-in check (disabled in
 * vite.config.ts) compares against ONE configured ORIGIN, but this app is
 * legitimately reached as http://localhost, http://<LAN-IP>, and
 * http://<hostname> at once. Browsers always attach the Origin header to
 * form posts, so requiring origin.host === Host blocks cross-site
 * submissions from any of them without pinning a single address.
 */
function crossSiteForm(request: Request): boolean {
	if (!MUTATING.has(request.method)) return false;
	const type = request.headers.get('content-type')?.split(';')[0].trim().toLowerCase() ?? '';
	if (!FORM_TYPES.includes(type)) return false;

	const origin = request.headers.get('origin');
	if (!origin) return true;
	try {
		return new URL(origin).host !== request.headers.get('host');
	} catch {
		return true; // e.g. Origin: null
	}
}

export const handle: Handle = async ({ event, resolve }) => {
	if (crossSiteForm(event.request)) {
		return new Response(`Cross-site ${event.request.method} form submissions are forbidden`, {
			status: 403
		});
	}

	const token = event.cookies.get(SESSION_COOKIE);
	event.locals.user = token ? validateSessionToken(token) : null;
	return resolve(event);
};
