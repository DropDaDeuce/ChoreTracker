import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

// Full data model — see docs/PLAN.md "Data Model".
// A Chore is a recurring *definition*; a ChoreInstance is a single dated
// occurrence. Instances are what get marked done, verified, and paid.

export const users = sqliteTable('users', {
	id: integer('id').primaryKey({ autoIncrement: true }),
	name: text('name').notNull(),
	role: text('role', { enum: ['adult', 'kid'] }).notNull(),
	pinHash: text('pin_hash').notNull(),
	avatarColor: text('avatar_color').notNull().default('#3b82f6'),
	isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
	createdAt: integer('created_at', { mode: 'timestamp_ms' })
		.notNull()
		.$defaultFn(() => new Date())
});

export const sessions = sqliteTable('sessions', {
	// sha256 hex of the raw cookie token — a leaked DB doesn't leak usable tokens.
	id: text('id').primaryKey(),
	userId: integer('user_id')
		.notNull()
		.references(() => users.id, { onDelete: 'cascade' }),
	expiresAt: integer('expires_at', { mode: 'timestamp_ms' }).notNull()
});

/**
 * A room (or area) of the house. Purely organizational — generation, rotation
 * and payouts never look at it. Deleting a room drops its chores back to
 * "General" (room_id set null).
 */
export const rooms = sqliteTable('rooms', {
	id: integer('id').primaryKey({ autoIncrement: true }),
	name: text('name').notNull(),
	icon: text('icon').notNull().default('🏠'),
	sortOrder: integer('sort_order').notNull().default(0),
	createdAt: integer('created_at', { mode: 'timestamp_ms' })
		.notNull()
		.$defaultFn(() => new Date())
});

export const chores = sqliteTable('chores', {
	id: integer('id').primaryKey({ autoIncrement: true }),
	title: text('title').notNull(),
	description: text('description').notNull().default(''),
	/** Null = "General" / whole-house. */
	roomId: integer('room_id').references(() => rooms.id, { onDelete: 'set null' }),
	/** Emoji shown on cards; empty = none. */
	icon: text('icon').notNull().default(''),
	frequency: text('frequency', { enum: ['daily', 'weekly', 'monthly', 'yearly'] }).notNull(),
	/** Every N days (daily only, for now). */
	interval: integer('interval').notNull().default(1),
	/** Weekly: bit 0 = Monday … bit 6 = Sunday. */
	weekdayMask: integer('weekday_mask').notNull().default(0),
	/** Monthly/yearly: 1–31, clamped to the month's length at generation time. */
	dayOfMonth: integer('day_of_month'),
	/** Yearly: 1–12. */
	monthOfYear: integer('month_of_year'),
	/** Anchor for interval math and earliest possible occurrence (YYYY-MM-DD). */
	startDate: text('start_date').notNull(),
	points: integer('points').notNull().default(0),
	allowanceCents: integer('allowance_cents').notNull().default(0),
	assignmentType: text('assignment_type', { enum: ['fixed', 'rotating'] })
		.notNull()
		.default('fixed'),
	requiresVerification: integer('requires_verification', { mode: 'boolean' })
		.notNull()
		.default(true),
	requiresPhoto: integer('requires_photo', { mode: 'boolean' }).notNull().default(false),
	graceDays: integer('grace_days').notNull().default(0),
	isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
	createdAt: integer('created_at', { mode: 'timestamp_ms' })
		.notNull()
		.$defaultFn(() => new Date())
});

/** The single fixed assignee (position 0) or the ordered rotation pool. */
export const choreAssignees = sqliteTable(
	'chore_assignees',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		choreId: integer('chore_id')
			.notNull()
			.references(() => chores.id, { onDelete: 'cascade' }),
		userId: integer('user_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		position: integer('position').notNull().default(0)
	},
	(t) => [uniqueIndex('chore_assignees_chore_user_unique').on(t.choreId, t.userId)]
);

export const choreRotationState = sqliteTable('chore_rotation_state', {
	choreId: integer('chore_id')
		.primaryKey()
		.references(() => chores.id, { onDelete: 'cascade' }),
	/** Pool position of the most recently assigned person; -1 = nobody yet. */
	lastPosition: integer('last_position').notNull().default(-1)
});

export const choreInstances = sqliteTable(
	'chore_instances',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		choreId: integer('chore_id')
			.notNull()
			.references(() => chores.id, { onDelete: 'cascade' }),
		assigneeId: integer('assignee_id')
			.notNull()
			.references(() => users.id),
		/** YYYY-MM-DD. */
		dueDate: text('due_date').notNull(),
		status: text('status', {
			enum: ['pending', 'done', 'verified', 'rejected', 'skipped', 'missed']
		})
			.notNull()
			.default('pending'),
		reminderCount: integer('reminder_count').notNull().default(0),
		doneAt: integer('done_at', { mode: 'timestamp_ms' }),
		doneBy: integer('done_by').references(() => users.id),
		verifiedAt: integer('verified_at', { mode: 'timestamp_ms' }),
		verifiedBy: integer('verified_by').references(() => users.id),
		photoPath: text('photo_path'),
		/** Frozen at verification so later config changes never rewrite history. */
		payoutCents: integer('payout_cents'),
		/** Frozen at verification, like payoutCents. */
		pointsAwarded: integer('points_awarded'),
		note: text('note'),
		createdAt: integer('created_at', { mode: 'timestamp_ms' })
			.notNull()
			.$defaultFn(() => new Date())
	},
	(t) => [
		// Idempotent generation guard: re-running the generator can never duplicate.
		uniqueIndex('chore_instances_chore_due_unique').on(t.choreId, t.dueDate),
		index('chore_instances_assignee_status_idx').on(t.assigneeId, t.status),
		index('chore_instances_status_due_idx').on(t.status, t.dueDate)
	]
);

export const reminders = sqliteTable('reminders', {
	id: integer('id').primaryKey({ autoIncrement: true }),
	instanceId: integer('instance_id')
		.notNull()
		.references(() => choreInstances.id, { onDelete: 'cascade' }),
	remindedBy: integer('reminded_by')
		.notNull()
		.references(() => users.id),
	createdAt: integer('created_at', { mode: 'timestamp_ms' })
		.notNull()
		.$defaultFn(() => new Date())
});

/** Append-only. A kid's balance is SUM(amount_cents) of their rows. */
export const allowanceLedger = sqliteTable(
	'allowance_ledger',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		userId: integer('user_id')
			.notNull()
			.references(() => users.id),
		instanceId: integer('instance_id').references(() => choreInstances.id),
		type: text('type', { enum: ['earning', 'bonus', 'penalty', 'payout'] }).notNull(),
		/** Positive for earning/bonus, negative for penalty/payout. */
		amountCents: integer('amount_cents').notNull(),
		note: text('note').notNull().default(''),
		createdBy: integer('created_by')
			.notNull()
			.references(() => users.id),
		createdAt: integer('created_at', { mode: 'timestamp_ms' })
			.notNull()
			.$defaultFn(() => new Date())
	},
	(t) => [index('allowance_ledger_user_idx').on(t.userId)]
);

/** One row per browser that opted into push notifications. */
export const pushSubscriptions = sqliteTable('push_subscriptions', {
	id: integer('id').primaryKey({ autoIncrement: true }),
	userId: integer('user_id')
		.notNull()
		.references(() => users.id, { onDelete: 'cascade' }),
	endpoint: text('endpoint').notNull().unique(),
	p256dh: text('p256dh').notNull(),
	auth: text('auth').notNull(),
	createdAt: integer('created_at', { mode: 'timestamp_ms' })
		.notNull()
		.$defaultFn(() => new Date())
});

/** "Can you take this one?" — offers a single chore instance to someone else. */
export const swapRequests = sqliteTable(
	'swap_requests',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		instanceId: integer('instance_id')
			.notNull()
			.references(() => choreInstances.id, { onDelete: 'cascade' }),
		fromUser: integer('from_user')
			.notNull()
			.references(() => users.id),
		toUser: integer('to_user')
			.notNull()
			.references(() => users.id),
		status: text('status', { enum: ['pending', 'accepted', 'declined', 'cancelled'] })
			.notNull()
			.default('pending'),
		createdAt: integer('created_at', { mode: 'timestamp_ms' })
			.notNull()
			.$defaultFn(() => new Date())
	},
	(t) => [index('swap_requests_to_user_idx').on(t.toUser, t.status)]
);

/**
 * Repeating home/away patterns ("away every other Thursday"). Most recently
 * created matching rule wins; day overrides beat rules; default is home.
 */
export const presenceRules = sqliteTable('presence_rules', {
	id: integer('id').primaryKey({ autoIncrement: true }),
	userId: integer('user_id')
		.notNull()
		.references(() => users.id, { onDelete: 'cascade' }),
	kind: text('kind', { enum: ['weekly', 'biweekly', 'monthly'] }).notNull(),
	/** 0 = Monday … 6 = Sunday (biweekly; legacy weekly rules). */
	weekday: integer('weekday'),
	/**
	 * Weekly rules: bit 0 = Monday … bit 6 = Sunday — one rule covers any set
	 * of days ("away weekdays" = 0b0011111). 0 = legacy rule; fall back to
	 * `weekday`.
	 */
	weekdayMask: integer('weekday_mask').notNull().default(0),
	/** A date that IS part of the pattern — fixes the biweekly phase. */
	anchorDate: text('anchor_date'),
	/** 1–31, clamped to month length (monthly). */
	dayOfMonth: integer('day_of_month'),
	isHome: integer('is_home', { mode: 'boolean' }).notNull(),
	createdAt: integer('created_at', { mode: 'timestamp_ms' })
		.notNull()
		.$defaultFn(() => new Date())
});

/** Single-day home/away overrides — always beat the rules. */
export const presenceDays = sqliteTable(
	'presence_days',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		userId: integer('user_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		/** YYYY-MM-DD. */
		date: text('date').notNull(),
		isHome: integer('is_home', { mode: 'boolean' }).notNull()
	},
	(t) => [uniqueIndex('presence_days_user_date_unique').on(t.userId, t.date)]
);

/** Simple key/value store for app-wide settings (currency symbol, week start, ...). */
export const appSettings = sqliteTable('app_settings', {
	key: text('key').primaryKey(),
	value: text('value').notNull()
});
