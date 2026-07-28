import { and, asc, eq, gte, lte, sql } from 'drizzle-orm';
import { addDays, startOfWeek, todayLocal, weekdayIndex } from './dates';
import { choreInstances, goalAchievements, goals, users } from './db/schema';
import type { DB } from './db/type';
import { getSettingOr, WEEK_START_KEY } from './settings';

/**
 * Point goals: a target an adult sets, for one kid or for the whole family,
 * over a day or a week.
 *
 * Goals are pure carrot. They count RAW points from verified chores —
 * undiscounted by reminders — because money is already the stick, and being
 * nagged shouldn't cost a kid their goal as well as their allowance. Nothing
 * here touches the ledger; the reward is a note ("movie night") and a
 * celebration.
 */

export type GoalRow = typeof goals.$inferSelect;

export type GoalProgress = {
	id: number;
	scope: 'user' | 'family';
	userId: number | null;
	/** Whose goal it is, for display; null on family goals. */
	personName: string | null;
	period: 'daily' | 'weekly';
	targetPoints: number;
	rewardNote: string;
	periodStart: string;
	periodEnd: string;
	points: number;
	/** 0–100, clamped — a blown-past goal still shows a full bar. */
	percent: number;
	met: boolean;
	/** Already celebrated for this period. */
	achieved: boolean;
};

/** The window a goal is measured over, given the household's week start. */
export function goalPeriod(
	db: DB,
	period: 'daily' | 'weekly',
	today = todayLocal()
): { start: string; end: string } {
	if (period === 'daily') return { start: today, end: today };
	const start = startOfWeek(today, weekdayIndex(getSettingOr(db, WEEK_START_KEY)));
	return { start, end: addDays(start, 6) };
}

/** Verified points in a date range — for one person, or the whole family. */
export function pointsInRange(
	db: DB,
	userId: number | null,
	start: string,
	end: string
): number {
	const row = db
		.select({ total: sql<number>`coalesce(sum(${choreInstances.pointsAwarded}), 0)` })
		.from(choreInstances)
		.where(
			and(
				eq(choreInstances.status, 'verified'),
				gte(choreInstances.dueDate, start),
				lte(choreInstances.dueDate, end),
				...(userId === null ? [] : [eq(choreInstances.assigneeId, userId)])
			)
		)
		.get();
	return row?.total ?? 0;
}

function progressFor(db: DB, goal: GoalRow, today: string, personName: string | null): GoalProgress {
	const { start, end } = goalPeriod(db, goal.period, today);
	const points = pointsInRange(db, goal.scope === 'family' ? null : goal.userId, start, end);
	const met = points >= goal.targetPoints;
	const achieved = db
		.select({ id: goalAchievements.id })
		.from(goalAchievements)
		.where(and(eq(goalAchievements.goalId, goal.id), eq(goalAchievements.periodStart, start)))
		.get();

	return {
		id: goal.id,
		scope: goal.scope,
		userId: goal.userId,
		personName,
		period: goal.period,
		targetPoints: goal.targetPoints,
		rewardNote: goal.rewardNote,
		periodStart: start,
		periodEnd: end,
		points,
		percent:
			goal.targetPoints > 0 ? Math.min(100, Math.round((points / goal.targetPoints) * 100)) : 0,
		met,
		achieved: Boolean(achieved)
	};
}

/**
 * Active goals that apply to `userId`: their own, plus every family goal.
 * Pass null to get family goals only (the board's view).
 */
export function goalsFor(db: DB, userId: number | null, today = todayLocal()): GoalProgress[] {
	const rows = db
		.select({ goal: goals, personName: users.name })
		.from(goals)
		.leftJoin(users, eq(goals.userId, users.id))
		.where(eq(goals.isActive, true))
		.orderBy(asc(goals.period), asc(goals.id))
		.all();

	return rows
		.filter(
			({ goal }) =>
				goal.scope === 'family' || (userId !== null && goal.userId === userId)
		)
		.map(({ goal, personName }) =>
			progressFor(db, goal, today, goal.scope === 'family' ? null : personName)
		);
}

/** Every active goal with progress — the adult overview. */
export function allGoals(db: DB, today = todayLocal()): GoalProgress[] {
	const rows = db
		.select({ goal: goals, personName: users.name })
		.from(goals)
		.leftJoin(users, eq(goals.userId, users.id))
		.where(eq(goals.isActive, true))
		.orderBy(asc(goals.scope), asc(goals.id))
		.all();
	return rows.map(({ goal, personName }) =>
		progressFor(db, goal, today, goal.scope === 'family' ? null : personName)
	);
}

/**
 * Record any newly-met goals for this period and return them, so the caller
 * can celebrate exactly once. The UNIQUE(goal, period) index is what makes
 * "once" true even if two requests land at the same moment.
 */
export function claimNewAchievements(
	db: DB,
	userId: number,
	today = todayLocal()
): GoalProgress[] {
	const fresh: GoalProgress[] = [];
	for (const progress of goalsFor(db, userId, today)) {
		if (!progress.met || progress.achieved) continue;
		const inserted = db
			.insert(goalAchievements)
			.values({
				goalId: progress.id,
				periodStart: progress.periodStart,
				pointsAtAchievement: progress.points
			})
			.onConflictDoNothing()
			.run();
		if (inserted.changes > 0) fresh.push({ ...progress, achieved: true });
	}
	return fresh;
}

export function createGoal(
	db: DB,
	input: {
		scope: 'user' | 'family';
		userId?: number | null;
		period: 'daily' | 'weekly';
		targetPoints: number;
		rewardNote?: string;
	}
): number {
	if (input.scope === 'user' && !input.userId) {
		throw new Error('Pick who the goal is for.');
	}
	return db
		.insert(goals)
		.values({
			scope: input.scope,
			userId: input.scope === 'family' ? null : (input.userId ?? null),
			period: input.period,
			targetPoints: input.targetPoints,
			rewardNote: input.rewardNote?.trim() ?? ''
		})
		.returning()
		.get().id;
}

export function deleteGoal(db: DB, goalId: number): void {
	db.delete(goals).where(eq(goals.id, goalId)).run();
}
