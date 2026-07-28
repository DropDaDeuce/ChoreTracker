import { and, asc, eq, gte, inArray, lte, ne } from 'drizzle-orm';
import { addDays, endOfWeek, startOfWeek, todayLocal, weekdayIndex } from './dates';
import { allowanceLedger, choreInstances, chores, users, weeklySettlements } from './db/schema';
import type { DB } from './db/type';
import { reminderFactor } from './payout';
import {
	FULL_WEEK_DAYS_KEY,
	getSettingInt,
	getSettingOr,
	REMINDER_PENALTY_PERCENT_KEY,
	SETTLEMENT_GRACE_DAYS_KEY,
	WEEK_START_KEY,
	WEEKLY_ALLOWANCE_CENTS_KEY
} from './settings';

/**
 * The weekly allowance.
 *
 * There is ONE household pot per week. What separates two kids is how many
 * days they were actually around to work, not a per-person rate:
 *
 *   fullWeekDays  D  = the busiest kid's chore-day count (or a pinned override)
 *   dayValue         = pot / D                    -- identical for everyone
 *   ceiling(k)       = daysWorked(k) x dayValue   -- the most they can earn
 *
 * Within a day, the day's value splits across that day's chores by weight,
 * and each chore's share is scaled by its reminder factor:
 *
 *   earned(i) = dayValue x weight(i)/dayWeight x reminderFactor(i)
 *
 * A day therefore pays the same whether it holds one chore or five — this
 * rewards "finish your day", and points only decide how a day splits inside
 * itself. Away days generate no instances at all (see generate.ts), so they
 * silently shrink the ceiling, which is exactly the intent: gone all week
 * means nothing was assigned and nothing is owed.
 *
 * Everything is computed in fractional cents and rounded ONCE at the end. A
 * kid who did everything must see exactly $10.00, not $9.98 of drift.
 */

/** A week is only settled once it has been over for this many days + grace. */
const MAX_RETRO_WEEKS = 8;

export type WeekInstance = {
	id: number;
	dueDate: string;
	title: string;
	icon: string;
	status: string;
	weight: number;
	isBonus: boolean;
	bonusPoints: number;
	reminderCount: number;
};

export type WeekChore = {
	id: number;
	title: string;
	icon: string;
	status: string;
	weight: number;
	reminderCount: number;
	/** This chore's slice of the day, before the reminder factor. */
	shareCents: number;
	/** What it's worth as things stand: banked if verified, still winnable if open. */
	valueCents: number;
};

export type WeekDay = {
	date: string;
	valueCents: number;
	chores: WeekChore[];
};

export type WeekResult = {
	weekStart: string;
	weekEnd: string;
	fullWeekDays: number;
	daysWorked: number;
	/** Rounded for display; the maths uses the unrounded value. */
	dayValueCents: number;
	ceilingCents: number;
	/** Banked from verified assigned chores. */
	earnedCents: number;
	/** Still winnable from chores that are open or awaiting verification. */
	pendingCents: number;
	/** Ceiling minus what's banked and what's still winnable. */
	lostCents: number;
	/** Banked from bonus chores and adult-granted bonus points. */
	bonusCents: number;
	/** Bonus work done but not yet verified. */
	pendingBonusCents: number;
	/** earned + bonus. */
	totalCents: number;
	/** Share of the ceiling banked so far, in basis points (10000 = 100%). */
	earnedBasisPoints: number;
	days: WeekDay[];
	/** Bonus chores and bonus-point grants, outside the day breakdown. */
	bonuses: WeekChore[];
};

export type AllowanceConfig = {
	weekStartIndex: number;
	allowanceCents: number;
	fullWeekDaysOverride: number;
	penaltyPercent: number;
	graceDays: number;
};

export function allowanceConfig(db: DB): AllowanceConfig {
	return {
		weekStartIndex: weekdayIndex(getSettingOr(db, WEEK_START_KEY)),
		allowanceCents: getSettingInt(db, WEEKLY_ALLOWANCE_CENTS_KEY, 0),
		fullWeekDaysOverride: getSettingInt(db, FULL_WEEK_DAYS_KEY, 0),
		penaltyPercent: getSettingInt(db, REMINDER_PENALTY_PERCENT_KEY, 50),
		graceDays: getSettingInt(db, SETTLEMENT_GRACE_DAYS_KEY, 1)
	};
}

/**
 * Instances that count toward a person's week. `skipped` is excluded outright
 * — an adult saying "not needed this week" must not cost anyone money.
 */
export function weekInstances(db: DB, userId: number, weekStart: string): WeekInstance[] {
	return db
		.select({
			id: choreInstances.id,
			dueDate: choreInstances.dueDate,
			title: chores.title,
			icon: chores.icon,
			status: choreInstances.status,
			weight: choreInstances.weight,
			isBonus: choreInstances.isBonus,
			bonusPoints: choreInstances.bonusPoints,
			reminderCount: choreInstances.reminderCount
		})
		.from(choreInstances)
		.innerJoin(chores, eq(choreInstances.choreId, chores.id))
		.where(
			and(
				eq(choreInstances.assigneeId, userId),
				gte(choreInstances.dueDate, weekStart),
				lte(choreInstances.dueDate, addDays(weekStart, 6)),
				ne(choreInstances.status, 'skipped')
			)
		)
		.orderBy(asc(choreInstances.dueDate))
		.all();
}

/** Distinct days this person had real (non-bonus) chores on. */
export function daysWorked(instances: WeekInstance[]): number {
	return new Set(instances.filter((i) => !i.isBonus).map((i) => i.dueDate)).size;
}

/** Total assigned weight — the basis for the bonus rate. */
function assignedWeight(instances: WeekInstance[]): number {
	return instances.filter((i) => !i.isBonus).reduce((sum, i) => sum + i.weight, 0);
}

/**
 * One person's week. Pure — every input is explicit so the maths is testable
 * without a database and the caller owns the household-wide decisions
 * (`fullWeekDays`, and the fallback used for the bonus rate).
 */
export function computeWeek(
	instances: WeekInstance[],
	opts: {
		weekStart: string;
		fullWeekDays: number;
		allowanceCents: number;
		penaltyPercent: number;
		/** Used for the bonus rate when this person had nothing assigned. */
		fallbackWeekWeight?: number;
	}
): WeekResult {
	const { weekStart, fullWeekDays, allowanceCents, penaltyPercent } = opts;
	const dayValue = fullWeekDays > 0 ? allowanceCents / fullWeekDays : 0;

	const assigned = instances.filter((i) => !i.isBonus);
	const byDate = new Map<string, WeekInstance[]>();
	for (const instance of assigned) {
		byDate.set(instance.dueDate, [...(byDate.get(instance.dueDate) ?? []), instance]);
	}

	let earned = 0;
	let pending = 0;
	const days: WeekDay[] = [];

	for (const date of [...byDate.keys()].sort()) {
		const dayChores = byDate.get(date) ?? [];
		const dayWeight = dayChores.reduce((sum, i) => sum + i.weight, 0);
		const rows: WeekChore[] = [];

		for (const instance of dayChores) {
			const share = dayWeight > 0 ? (dayValue * instance.weight) / dayWeight : 0;
			const value = share * reminderFactor(instance.reminderCount, penaltyPercent);
			if (instance.status === 'verified') earned += value;
			else if (instance.status === 'pending' || instance.status === 'done') pending += value;
			// missed and rejected earn nothing, and stay in the denominator.

			rows.push({
				id: instance.id,
				title: instance.title,
				icon: instance.icon,
				status: instance.status,
				weight: instance.weight,
				reminderCount: instance.reminderCount,
				shareCents: Math.round(share),
				valueCents: Math.round(value)
			});
		}
		days.push({ date, valueCents: Math.round(dayValue), chores: rows });
	}

	// Bonus work pays at the week's average point rate — flat, so a bonus is
	// worth the same whichever day it lands on and can't be farmed by saving
	// it for a light day.
	const weekWeight = assignedWeight(instances) || (opts.fallbackWeekWeight ?? 0);
	const bonusRate = weekWeight > 0 ? allowanceCents / weekWeight : 0;
	let bonus = 0;
	let pendingBonus = 0;
	const bonuses: WeekChore[] = [];
	for (const instance of instances) {
		const bonusWeight = (instance.isBonus ? instance.weight : 0) + instance.bonusPoints;
		if (bonusWeight <= 0) continue;
		const full = bonusWeight * bonusRate;
		const value = full * reminderFactor(instance.reminderCount, penaltyPercent);
		if (instance.status === 'verified') bonus += value;
		else if (instance.status === 'pending' || instance.status === 'done') pendingBonus += value;

		bonuses.push({
			id: instance.id,
			title: instance.title,
			icon: instance.icon,
			status: instance.status,
			weight: bonusWeight,
			reminderCount: instance.reminderCount,
			shareCents: Math.round(full),
			valueCents: Math.round(value)
		});
	}

	const worked = daysWorked(instances);
	const ceilingCents = Math.round(worked * dayValue);
	const earnedCents = Math.round(earned);
	const pendingCents = Math.round(pending);
	const bonusCents = Math.round(bonus);

	return {
		weekStart,
		weekEnd: addDays(weekStart, 6),
		fullWeekDays,
		daysWorked: worked,
		dayValueCents: Math.round(dayValue),
		ceilingCents,
		earnedCents,
		pendingCents,
		// Derived from the rounded figures so the three always add up to the
		// ceiling on screen.
		lostCents: Math.max(0, ceilingCents - earnedCents - pendingCents),
		bonusCents,
		pendingBonusCents: Math.round(pendingBonus),
		totalCents: earnedCents + bonusCents,
		earnedBasisPoints: ceilingCents > 0 ? Math.round((earnedCents / ceilingCents) * 10000) : 0,
		days,
		bonuses
	};
}

/**
 * instanceId → what that chore is worth as things stand, for every person,
 * across the given weeks. Powers the "you'd earn X" hint on a kid's card and
 * the payout preview in the verify queue — both of which show individual
 * chores, while the money itself only exists at the week level.
 *
 * PRIVACY: an adult-only helper by nature. A kid's page must filter the map
 * down to their own instances before it reaches the browser.
 */
export function instanceValues(
	db: DB,
	weekStarts: string[],
	config = allowanceConfig(db)
): Map<number, number> {
	const values = new Map<number, number>();
	for (const weekStart of new Set(weekStarts)) {
		for (const person of computeHouseholdWeek(db, weekStart, config).people) {
			for (const day of person.week.days) {
				for (const chore of day.chores) values.set(chore.id, chore.valueCents);
			}
			for (const chore of person.week.bonuses) values.set(chore.id, chore.valueCents);
		}
	}
	return values;
}

export type HouseholdWeek = {
	weekStart: string;
	weekEnd: string;
	fullWeekDays: number;
	allowanceCents: number;
	dayValueCents: number;
	people: Array<{ userId: number; name: string; avatarColor: string; week: WeekResult }>;
};

/**
 * Every active kid's week at once — the shape settlement and the adult views
 * both need, because `fullWeekDays` is a household-wide decision.
 *
 * PRIVACY: this necessarily holds every kid's numbers. Callers serving a kid
 * must pick out that kid's entry and send only that to the browser; nobody but
 * an adult may see another person's figures, and the divisor is never
 * attributed to whoever set it.
 */
export function computeHouseholdWeek(
	db: DB,
	weekStart: string,
	config = allowanceConfig(db)
): HouseholdWeek {
	const kids = db
		.select({ id: users.id, name: users.name, avatarColor: users.avatarColor })
		.from(users)
		.where(and(eq(users.role, 'kid'), eq(users.isActive, true)))
		.orderBy(asc(users.name))
		.all();

	const loaded = kids.map((kid) => ({ kid, instances: weekInstances(db, kid.id, weekStart) }));

	// The busiest kid defines a full week, unless an adult pinned it. Only
	// kids count: an adult helping out of a rotation pool must not set the bar.
	const fullWeekDays =
		config.fullWeekDaysOverride > 0
			? config.fullWeekDaysOverride
			: Math.max(0, ...loaded.map(({ instances }) => daysWorked(instances)));

	// A kid with nothing assigned has no rate of their own to price a bonus
	// against; borrow the busiest week, consistent with how the divisor works.
	const fallbackWeekWeight = Math.max(
		0,
		...loaded.map(({ instances }) => assignedWeight(instances))
	);

	return {
		weekStart,
		weekEnd: addDays(weekStart, 6),
		fullWeekDays,
		allowanceCents: config.allowanceCents,
		dayValueCents: fullWeekDays > 0 ? Math.round(config.allowanceCents / fullWeekDays) : 0,
		people: loaded.map(({ kid, instances }) => ({
			userId: kid.id,
			name: kid.name,
			avatarColor: kid.avatarColor,
			week: computeWeek(instances, {
				weekStart,
				fullWeekDays,
				allowanceCents: config.allowanceCents,
				penaltyPercent: config.penaltyPercent,
				fallbackWeekWeight
			})
		}))
	};
}

/** The week containing `date`, per the household's week-start setting. */
export function weekStartFor(db: DB, date = todayLocal(), config = allowanceConfig(db)): string {
	return startOfWeek(date, config.weekStartIndex);
}

export function weekEndFor(db: DB, date = todayLocal(), config = allowanceConfig(db)): string {
	return endOfWeek(date, config.weekStartIndex);
}

/**
 * The newest week that is fully over AND past its grace period. Returns null
 * before any week qualifies.
 */
export function newestSettleableWeek(today: string, config: AllowanceConfig): string {
	const graceAdjusted = addDays(today, -Math.max(0, config.graceDays));
	return addDays(startOfWeek(graceAdjusted, config.weekStartIndex), -7);
}

/**
 * Close one person's week: freeze each chore's payout on its instance, record
 * the settlement, and append ONE earning to the ledger.
 *
 * Idempotent through `UNIQUE(user_id, week_start)` — the nightly cron re-runs
 * and must never pay twice. Returns null when the week was already settled.
 */
export function settleWeek(
	db: DB,
	userId: number,
	weekStart: string,
	household: HouseholdWeek,
	actorId: number
): { cents: number } | null {
	const entry = household.people.find((p) => p.userId === userId);
	if (!entry) return null;

	const existing = db
		.select({ id: weeklySettlements.id })
		.from(weeklySettlements)
		.where(
			and(eq(weeklySettlements.userId, userId), eq(weeklySettlements.weekStart, weekStart))
		)
		.get();
	if (existing) return null;

	const { week } = entry;

	return db.transaction((tx) => {
		tx.insert(weeklySettlements)
			.values({
				userId,
				weekStart,
				daysWorked: week.daysWorked,
				fullWeekDays: week.fullWeekDays,
				earnedBasisPoints: week.earnedBasisPoints,
				cents: week.totalCents
			})
			.run();

		// Freeze what each chore actually paid, so the earnings history can
		// still explain a settled week months later.
		for (const chore of [...week.days.flatMap((day) => day.chores), ...week.bonuses]) {
			if (chore.status !== 'verified') continue;
			tx.update(choreInstances)
				.set({ payoutCents: chore.valueCents })
				.where(eq(choreInstances.id, chore.id))
				.run();
		}

		if (week.totalCents > 0) {
			const bonusNote = week.bonusCents > 0 ? `, incl. bonus` : '';
			tx.insert(allowanceLedger)
				.values({
					userId,
					type: 'earning',
					amountCents: week.totalCents,
					note: `Week of ${weekStart} — ${week.daysWorked} of ${week.fullWeekDays} days${bonusNote}`,
					createdBy: actorId
				})
				.run();
		}
		return { cents: week.totalCents };
	});
}

/** Whoever the ledger credits automated entries to: the longest-standing adult. */
function systemActorId(db: DB, fallback: number): number {
	const adult = db
		.select({ id: users.id })
		.from(users)
		.where(and(eq(users.role, 'adult'), eq(users.isActive, true)))
		.orderBy(asc(users.id))
		.get();
	return adult?.id ?? fallback;
}

/**
 * Settle every week that has closed and cleared its grace period but hasn't
 * been paid — catching up after downtime, since a home server sleeps.
 *
 * Bounded to the last `MAX_RETRO_WEEKS` so switching the allowance on doesn't
 * retroactively pay out the household's entire history at today's rate.
 */
export function settleDueWeeks(db: DB, today = todayLocal()): number {
	const config = allowanceConfig(db);
	if (config.allowanceCents <= 0) return 0; // money model switched off

	const newest = newestSettleableWeek(today, config);
	let settled = 0;

	for (let back = MAX_RETRO_WEEKS - 1; back >= 0; back--) {
		const weekStart = addDays(newest, -7 * back);
		const household = computeHouseholdWeek(db, weekStart, config);

		// Nothing was assigned to anyone that week — skip it rather than
		// writing a row full of zeroes.
		if (household.fullWeekDays === 0) continue;

		const alreadySettled = new Set(
			db
				.select({ userId: weeklySettlements.userId })
				.from(weeklySettlements)
				.where(eq(weeklySettlements.weekStart, weekStart))
				.all()
				.map((row) => row.userId)
		);

		for (const person of household.people) {
			if (alreadySettled.has(person.userId)) continue;
			const actor = systemActorId(db, person.userId);
			if (settleWeek(db, person.userId, weekStart, household, actor)) settled++;
		}
	}

	return settled;
}

/** Past settlements for one person, newest first. */
export function settlementHistory(db: DB, userId: number, limit = 8) {
	return db
		.select()
		.from(weeklySettlements)
		.where(eq(weeklySettlements.userId, userId))
		.orderBy(asc(weeklySettlements.weekStart))
		.all()
		.slice(-limit)
		.reverse();
}

/** True when this person's week has already been paid (so it's read-only). */
export function isWeekSettled(db: DB, userIds: number[], weekStart: string): Set<number> {
	if (userIds.length === 0) return new Set();
	return new Set(
		db
			.select({ userId: weeklySettlements.userId })
			.from(weeklySettlements)
			.where(
				and(
					eq(weeklySettlements.weekStart, weekStart),
					inArray(weeklySettlements.userId, userIds)
				)
			)
			.all()
			.map((row) => row.userId)
	);
}
