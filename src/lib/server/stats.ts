import { and, eq, gte, lte, sql } from 'drizzle-orm';
import { addDays, todayLocal } from './dates';
import { choreInstances } from './db/schema';
import type { DB } from './db/type';

/**
 * Current completion streak: consecutive *due-days* (days the person actually
 * had chores due) where everything got completed, walking back from today.
 * Days with nothing due don't count and don't break the streak.
 *
 * Today is special: if it's still in progress (some chores open, none missed)
 * it neither counts nor breaks — the streak is whatever yesterday's run was.
 */
export function currentStreak(db: DB, userId: number, today = todayLocal()): number {
	const rows = db
		.select({ dueDate: choreInstances.dueDate, status: choreInstances.status })
		.from(choreInstances)
		.where(and(eq(choreInstances.assigneeId, userId), lte(choreInstances.dueDate, today)))
		.all();
	if (rows.length === 0) return 0;

	const byDate = new Map<string, string[]>();
	let minDate = today;
	for (const row of rows) {
		byDate.set(row.dueDate, [...(byDate.get(row.dueDate) ?? []), row.status]);
		if (row.dueDate < minDate) minDate = row.dueDate;
	}

	const completed = (s: string) => s === 'verified' || s === 'done';
	let streak = 0;
	for (let d = today; d >= minDate; d = addDays(d, -1)) {
		const statuses = byDate.get(d);
		if (!statuses) continue; // nothing due that day

		if (statuses.every(completed)) {
			streak++;
		} else if (d === today && !statuses.some((s) => s === 'missed')) {
			continue; // today's chores still open — jury's out
		} else {
			break;
		}
	}
	return streak;
}

/** Sum of frozen points on verified instances, optionally since a date. */
export function pointsTotal(db: DB, userId: number, sinceDueDate?: string): number {
	const row = db
		.select({ total: sql<number>`coalesce(sum(${choreInstances.pointsAwarded}), 0)` })
		.from(choreInstances)
		.where(
			and(
				eq(choreInstances.assigneeId, userId),
				eq(choreInstances.status, 'verified'),
				...(sinceDueDate ? [gte(choreInstances.dueDate, sinceDueDate)] : [])
			)
		)
		.get();
	return row?.total ?? 0;
}
