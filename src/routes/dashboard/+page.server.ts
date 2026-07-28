import { requireUser } from '$lib/server/auth';
import { addDays, todayLocal } from '$lib/server/dates';
import { db } from '$lib/server/db';
import { choreInstances, chores, rooms, users } from '$lib/server/db/schema';
import { isHome } from '$lib/server/presence';
import { getVapidPublicKey, notifyUser } from '$lib/server/push';
import { acceptSwap, cancelSwap, declineSwap, openSwapsFor, requestSwap } from '$lib/server/swaps';
import {
	balanceCents,
	InstanceActionError,
	markDone,
	undoMarkDone
} from '$lib/server/instances';
import {
	allowanceConfig,
	computeHouseholdWeek,
	weekStartFor
} from '$lib/server/allowance';
import { claimNewAchievements, goalsFor } from '$lib/server/goals';
import { getSettingInt, UNDO_WINDOW_MINUTES_KEY } from '$lib/server/settings';
import { currentStreak } from '$lib/server/stats';
import { deletePhoto, savePhoto, UploadError } from '$lib/server/uploads';
import { fail } from '@sveltejs/kit';
import { and, asc, desc, eq, gt, gte, lte } from 'drizzle-orm';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = ({ locals }) => {
	const user = requireUser(locals);
	const today = todayLocal();

	const mine = (extra: ReturnType<typeof and>) =>
		db
			.select({ instance: choreInstances, chore: chores, room: rooms })
			.from(choreInstances)
			.innerJoin(chores, eq(choreInstances.choreId, chores.id))
			.leftJoin(rooms, eq(chores.roomId, rooms.id))
			.where(and(eq(choreInstances.assigneeId, user.id), extra))
			.orderBy(asc(choreInstances.dueDate))
			.all();

	// This person's allowance week. A chore's "you'd earn X" is its slice of
	// the day it lives on, so the preview comes out of the week rather than
	// off the chore. Only THIS person's week is loaded into the page — no kid
	// may learn what anyone else is earning.
	const config = allowanceConfig(db);
	const weekStart = weekStartFor(db, today, config);
	const myWeek =
		computeHouseholdWeek(db, weekStart, config).people.find((p) => p.userId === user.id)?.week ??
		null;

	const valueOf = new Map<number, number>();
	for (const day of myWeek?.days ?? []) {
		for (const chore of day.chores) valueOf.set(chore.id, chore.valueCents);
	}
	for (const chore of myWeek?.bonuses ?? []) valueOf.set(chore.id, chore.valueCents);

	// payoutPreview powers the "you'd earn X" hint and the done-celebration.
	const open = mine(
		and(eq(choreInstances.status, 'pending'), lte(choreInstances.dueDate, today))
	).map((row) => ({
		...row,
		payoutPreview: valueOf.get(row.instance.id) ?? 0
	}));
	const awaiting = mine(eq(choreInstances.status, 'done'));
	const upcoming = mine(
		and(eq(choreInstances.status, 'pending'), gt(choreInstances.dueDate, today))
	).slice(0, 5);
	const missed = mine(
		and(eq(choreInstances.status, 'missed'), gte(choreInstances.dueDate, addDays(today, -7)))
	);

	// Auto-approved chores finished today can still be undone within the window.
	const undoWindowMs = getSettingInt(db, UNDO_WINDOW_MINUTES_KEY, 15) * 60_000;
	const startOfToday = new Date();
	startOfToday.setHours(0, 0, 0, 0);
	const completedToday = db
		.select({ instance: choreInstances, chore: chores })
		.from(choreInstances)
		.innerJoin(chores, eq(choreInstances.choreId, chores.id))
		.where(
			and(
				eq(choreInstances.assigneeId, user.id),
				eq(choreInstances.status, 'verified'),
				gte(choreInstances.verifiedAt, startOfToday)
			)
		)
		.orderBy(desc(choreInstances.verifiedAt))
		.all()
		.map((row) => ({
			...row,
			canUndo:
				!row.chore.requiresVerification &&
				Date.now() - (row.instance.verifiedAt?.getTime() ?? 0) <= undoWindowMs
		}));

	// verifyQueueCount comes from the root layout load (badge on the nav).
	const swapPeople = db
		.select({ id: users.id, name: users.name })
		.from(users)
		.where(eq(users.isActive, true))
		.orderBy(asc(users.name))
		.all()
		.filter((p) => p.id !== user.id);

	return {
		today,
		open,
		awaiting,
		upcoming,
		missed,
		completedToday,
		balance: balanceCents(db, user.id),
		streak: currentStreak(db, user.id, today),
		swaps: openSwapsFor(db, user.id),
		swapPeople,
		vapidPublicKey: getVapidPublicKey(db),
		awayToday: !isHome(db, user.id, today),
		week: myWeek,
		goals: goalsFor(db, user.id, today)
	};
};

export const actions: Actions = {
	markDone: async ({ request, locals }) => {
		const user = requireUser(locals);
		const form = await request.formData();
		const instanceId = Number(form.get('instanceId'));

		// Save the proof photo (if any) first; roll it back if the action fails.
		const upload = form.get('photo');
		let photoName: string | undefined;
		try {
			if (upload instanceof File && upload.size > 0) {
				photoName = await savePhoto(upload);
			}
			markDone(db, instanceId, user, photoName);
		} catch (err) {
			deletePhoto(photoName);
			if (err instanceof InstanceActionError || err instanceof UploadError) {
				return fail(400, { message: err.message });
			}
			throw err;
		}
		return { success: true };
	},

	/**
	 * Record goals this person has just crossed and hand back the fresh ones
	 * to celebrate. An action rather than part of `load` on purpose: a link
	 * preload runs `load` speculatively, so claiming there would let a
	 * hover-and-move-away swallow the celebration.
	 */
	claimGoals: async ({ locals }) => {
		const user = requireUser(locals);
		return { success: true, achievements: claimNewAchievements(db, user.id) };
	},

	undo: async ({ request, locals }) => {
		const user = requireUser(locals);
		const form = await request.formData();
		const instanceId = Number(form.get('instanceId'));
		const before = db
			.select({ photoPath: choreInstances.photoPath })
			.from(choreInstances)
			.where(eq(choreInstances.id, instanceId))
			.get();
		try {
			undoMarkDone(db, instanceId, user);
		} catch (err) {
			if (err instanceof InstanceActionError) return fail(400, { message: err.message });
			throw err;
		}
		deletePhoto(before?.photoPath);
		return { success: true };
	},

	requestSwap: swapAction((form, user) => {
		const toUserId = Number(form.get('toUserId'));
		const swap = requestSwap(db, Number(form.get('instanceId')), user.id, toUserId);
		const ctx = swapContext(swap.instanceId);
		notifyUser(db, toUserId, {
			title: `🔁 ${user.name} asks for a swap`,
			body: ctx ? `Can you take "${ctx.title}" (${ctx.dueDate})?` : 'Can you take a chore?',
			url: '/dashboard'
		});
	}),
	acceptSwap: swapAction((form, user) => {
		const swap = acceptSwap(db, Number(form.get('swapId')), user.id);
		const ctx = swapContext(swap.instanceId);
		notifyUser(db, swap.fromUser, {
			title: `✅ ${user.name} took your chore`,
			body: ctx ? `"${ctx.title}" (${ctx.dueDate}) is off your list.` : 'Swap accepted.',
			url: '/dashboard'
		});
	}),
	declineSwap: swapAction((form, user) => {
		const swap = declineSwap(db, Number(form.get('swapId')), user.id);
		const ctx = swapContext(swap.instanceId);
		notifyUser(db, swap.fromUser, {
			title: `❌ ${user.name} can't take it`,
			body: ctx ? `"${ctx.title}" (${ctx.dueDate}) is still yours.` : 'Swap declined.',
			url: '/dashboard'
		});
	}),
	cancelSwap: swapAction((form, user) => {
		cancelSwap(db, Number(form.get('swapId')), user.id);
	})
};

function swapContext(instanceId: number) {
	return db
		.select({ title: chores.title, dueDate: choreInstances.dueDate })
		.from(choreInstances)
		.innerJoin(chores, eq(choreInstances.choreId, chores.id))
		.where(eq(choreInstances.id, instanceId))
		.get();
}

function swapAction(
	fn: (form: FormData, user: { id: number; name: string; role: string }) => void
): NonNullable<Actions[string]> {
	return async ({ request, locals }) => {
		const user = requireUser(locals);
		const form = await request.formData();
		try {
			fn(form, user);
		} catch (err) {
			if (err instanceof InstanceActionError) return fail(400, { message: err.message });
			throw err;
		}
		return { success: true };
	};
}
