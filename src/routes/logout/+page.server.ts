import {
	createSession,
	destroySession,
	SESSION_COOKIE,
	SESSION_COOKIE_OPTIONS
} from '$lib/server/auth';
import { redirect } from '@sveltejs/kit';
import type { Actions } from './$types';

export const actions: Actions = {
	default: ({ cookies, locals }) => {
		// The board's own session has nothing to log out of.
		if (locals.user?.kiosk) redirect(303, '/board');

		const token = cookies.get(SESSION_COOKIE);

		// "Logging out" of a kiosk visit means handing the tablet back to the
		// LOCKED board — never stranding it on the sign-in screen.
		if (locals.user?.kioskVisit) {
			if (token) destroySession(token);
			const { token: kioskToken, expiresAt } = createSession(locals.user.id, 'kiosk');
			cookies.set(SESSION_COOKIE, kioskToken, { ...SESSION_COOKIE_OPTIONS, expires: expiresAt });
			redirect(303, '/board');
		}

		if (token) destroySession(token);
		cookies.delete(SESSION_COOKIE, { path: '/' });
		redirect(303, '/');
	}
};
