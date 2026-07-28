import { requireUser } from '$lib/server/auth';
import { daysInMonth, todayLocal, weekdayIndex } from '$lib/server/dates';
import { db } from '$lib/server/db';
import { choreAssignees, choreInstances, chores, users } from '$lib/server/db/schema';
import { isHome } from '$lib/server/presence';
import { occurrencesInRange } from '$lib/server/recurrence';
import { getSettingOr, WEEK_START_KEY } from '$lib/server/settings';
import { and, asc, between, eq } from 'drizzle-orm';
import type { PageServerLoad } from './$types';

export interface CalendarEntry {
	title: string;
	color: string | null; // null = assignee not decided yet (future rotation)
	personName: string | null;
	status: string; // 'planned' for not-yet-materialized occurrences
	mine: boolean;
}

export const load: PageServerLoad = ({ locals, url }) => {
	const user = requireUser(locals);
	const today = todayLocal();

	const monthParam = /^\d{4}-(0[1-9]|1[0-2])$/.test(url.searchParams.get('month') ?? '')
		? url.searchParams.get('month')!
		: today.slice(0, 7);
	const [year, month] = monthParam.split('-').map(Number);
	const first = `${monthParam}-01`;
	const last = `${monthParam}-${String(daysInMonth(year, month)).padStart(2, '0')}`;

	const entries = new Map<string, CalendarEntry[]>();
	const push = (date: string, entry: CalendarEntry) =>
		entries.set(date, [...(entries.get(date) ?? []), entry]);

	// Materialized instances: real rows with real assignees.
	const instanceRows = db
		.select({
			dueDate: choreInstances.dueDate,
			status: choreInstances.status,
			title: chores.title,
			color: users.avatarColor,
			personName: users.name,
			assigneeId: choreInstances.assigneeId,
			choreId: choreInstances.choreId
		})
		.from(choreInstances)
		.innerJoin(chores, eq(choreInstances.choreId, chores.id))
		.innerJoin(users, eq(choreInstances.assigneeId, users.id))
		.where(between(choreInstances.dueDate, first, last))
		.orderBy(asc(choreInstances.dueDate))
		.all();

	const materialized = new Set(instanceRows.map((r) => `${r.choreId}|${r.dueDate}`));
	// `everyone` chores can be half-materialized at the edge of the rolling
	// window — one person's row exists, another's doesn't yet — so they need
	// per-person granularity rather than "is this date done".
	const materializedSlots = new Set(
		instanceRows.map((r) => `${r.choreId}|${r.dueDate}|${r.assigneeId}`)
	);
	for (const row of instanceRows) {
		push(row.dueDate, {
			title: row.title,
			color: row.color,
			personName: row.personName,
			status: row.status,
			mine: row.assigneeId === user.id
		});
	}

	// Future occurrences beyond the materialized window, computed from the
	// recurrence rules. Fixed chores know their person; rotations show as TBD.
	const activeChores = db.select().from(chores).where(eq(chores.isActive, true)).all();
	for (const chore of activeChores) {
		const pool = db
			.select({ name: users.name, color: users.avatarColor, userId: users.id })
			.from(choreAssignees)
			.innerJoin(users, eq(choreAssignees.userId, users.id))
			.where(eq(choreAssignees.choreId, chore.id))
			.orderBy(asc(choreAssignees.position))
			.all();
		if (pool.length === 0) continue;

		const from = first > today ? first : today;
		for (const date of occurrencesInRange(chore, from, last)) {
			// Presence-aware, matching what generation will actually do: a fixed
			// chore skips its person's away days; a rotation only vanishes when
			// the whole pool is away; an `everyone` chore shows one entry per
			// person who'll be home.
			if (chore.assignmentType === 'everyone') {
				for (const person of pool.filter((p) => isHome(db, p.userId, date))) {
					if (materializedSlots.has(`${chore.id}|${date}|${person.userId}`)) continue;
					push(date, {
						title: chore.title,
						color: person.color,
						personName: person.name,
						status: 'planned',
						mine: person.userId === user.id
					});
				}
				continue;
			}

			if (materialized.has(`${chore.id}|${date}`)) continue;
			const fixed = chore.assignmentType === 'fixed' ? pool[0] : null;
			if (fixed && !isHome(db, fixed.userId, date)) continue;
			if (!fixed && !pool.some((p) => isHome(db, p.userId, date))) continue;
			push(date, {
				title: chore.title,
				color: fixed?.color ?? null,
				personName: fixed?.name ?? null,
				status: 'planned',
				mine: fixed?.userId === user.id
			});
		}
	}

	const prev = month === 1 ? `${year - 1}-12` : `${year}-${String(month - 1).padStart(2, '0')}`;
	const next = month === 12 ? `${year + 1}-01` : `${year}-${String(month + 1).padStart(2, '0')}`;

	const people = db
		.select({ name: users.name, color: users.avatarColor })
		.from(users)
		.where(eq(users.isActive, true))
		.orderBy(asc(users.name))
		.all();

	return {
		monthParam,
		year,
		month,
		daysInMonth: daysInMonth(year, month),
		entries: Object.fromEntries(entries),
		weekStartIndex: weekdayIndex(getSettingOr(db, WEEK_START_KEY)),
		today,
		prev,
		next,
		people
	};
};
