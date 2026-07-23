import {
	createSession,
	destroySession,
	SESSION_COOKIE,
	SESSION_COOKIE_OPTIONS,
	verifyPin
} from '$lib/server/auth';
import { todayLocal } from '$lib/server/dates';
import { db } from '$lib/server/db';
import { choreInstances, chores, rooms, users } from '$lib/server/db/schema';
import { isHome } from '$lib/server/presence';
import { currentStreak } from '$lib/server/stats';
import { fail, redirect } from '@sveltejs/kit';
import { and, asc, eq, gte, lte } from 'drizzle-orm';
import type { Actions, PageServerLoad } from './$types';

/**
 * The family board: everyone's day at a glance, built for a wall tablet.
 * Any logged-in user can view it; tapping a person + their PIN switches the
 * kiosk session to them (a real login — doneBy/audit stays honest).
 */
export const load: PageServerLoad = ({ locals }) => {
	// Deliberately NOT requireUser: locked kiosk sessions may view the board
	// (requireUser would bounce them right back here anyway).
	if (!locals.user) redirect(303, '/');
	const me = locals.user;
	const today = todayLocal();
	const startOfToday = new Date();
	startOfToday.setHours(0, 0, 0, 0);

	const family = db
		.select({ id: users.id, name: users.name, role: users.role, avatarColor: users.avatarColor })
		.from(users)
		.where(eq(users.isActive, true))
		.orderBy(asc(users.name))
		.all();

	const forUser = (userId: number) => {
		const rows = (extra: ReturnType<typeof and>) =>
			db
				.select({ instance: choreInstances, chore: chores, room: rooms })
				.from(choreInstances)
				.innerJoin(chores, eq(choreInstances.choreId, chores.id))
				.leftJoin(rooms, eq(chores.roomId, rooms.id))
				.where(and(eq(choreInstances.assigneeId, userId), extra))
				.orderBy(asc(choreInstances.dueDate))
				.all()
				.map(({ instance, chore, room }) => ({
					id: instance.id,
					title: chore.title,
					icon: chore.icon || room?.icon || '',
					dueDate: instance.dueDate,
					overdue: instance.status === 'pending' && instance.dueDate < today
				}));

		return {
			open: rows(and(eq(choreInstances.status, 'pending'), lte(choreInstances.dueDate, today))),
			awaiting: rows(eq(choreInstances.status, 'done')),
			completed: rows(
				and(eq(choreInstances.status, 'verified'), gte(choreInstances.verifiedAt, startOfToday))
			)
		};
	};

	return {
		today,
		me: { id: me.id, name: me.name, avatarColor: me.avatarColor, kiosk: me.kiosk },
		people: family.map((person) => ({
			...person,
			...forUser(person.id),
			away: !isHome(db, person.id, today),
			streak: currentStreak(db, person.id, today)
		}))
	};
};

export const actions: Actions = {
	// Kiosk fast-switch: same verification as the login page, so marking done
	// afterwards is attributed to the right person. Allowed FROM a locked
	// kiosk session — the PIN is the gate, not the old session.
	switch: async ({ request, cookies, locals }) => {
		if (!locals.user) redirect(303, '/');
		const form = await request.formData();
		const userId = Number(form.get('userId'));
		const pin = String(form.get('pin') ?? '');

		const user = db.select().from(users).where(eq(users.id, userId)).get();
		if (!user || !user.isActive || !(await verifyPin(user.pinHash, pin))) {
			return fail(400, { message: 'Wrong PIN — try again.', userId });
		}

		const oldToken = cookies.get(SESSION_COOKIE);
		if (oldToken) destroySession(oldToken);
		const { token, expiresAt } = createSession(user.id);
		cookies.set(SESSION_COOKIE, token, { ...SESSION_COOKIE_OPTIONS, expires: expiresAt });
		redirect(303, '/dashboard');
	},

	// One-tap lock: swap the personal session for a board-only kiosk session.
	// After this, every page except /board demands a PIN (via face-tap).
	lock: ({ cookies, locals }) => {
		if (!locals.user) redirect(303, '/');
		if (locals.user.kiosk) return { success: true }; // already locked
		const oldToken = cookies.get(SESSION_COOKIE);
		if (oldToken) destroySession(oldToken);
		const { token, expiresAt } = createSession(locals.user.id, 'kiosk');
		cookies.set(SESSION_COOKIE, token, { ...SESSION_COOKIE_OPTIONS, expires: expiresAt });
		return { success: true };
	}
};
