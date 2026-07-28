import { z } from 'zod';
import { isDateString } from './dates';

export const pinSchema = z
	.string()
	.regex(/^\d{4,6}$/, 'PIN must be 4–6 digits.');

export const personSchema = z.object({
	name: z.string().trim().min(1, 'Name is required.').max(50),
	role: z.enum(['adult', 'kid']),
	pin: pinSchema,
	avatarColor: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Pick a color.')
});

export const choreSchema = z
	.object({
		title: z.string().trim().min(1, 'Title is required.').max(100),
		description: z.string().trim().max(500).default(''),
		/** Room the chore belongs to; absent = General / whole-house. */
		roomId: z.coerce.number().int().positive().optional(),
		/** Emoji shown on cards (can be a multi-codepoint sequence). */
		icon: z.string().trim().max(16).default(''),
		frequency: z.enum(['daily', 'weekly', 'monthly', 'yearly']),
		interval: z.coerce.number().int().min(1).max(365).default(1),
		weekdays: z.array(z.coerce.number().int().min(0).max(6)).default([]),
		dayOfMonth: z.coerce.number().int().min(1).max(31).optional(),
		monthOfYear: z.coerce.number().int().min(1).max(12).optional(),
		startDate: z.string().refine(isDateString, 'Start date must be a valid date.'),
		/**
		 * The chore's weight: its claim on the day's allowance value, and what
		 * point goals count. There is no per-chore money any more — the
		 * household has one weekly pot (see docs/Plans).
		 */
		points: z.coerce.number().int().min(0).max(1000).default(0),
		/** Extra credit: earns on top of the week instead of counting toward it. */
		isBonus: z.boolean().default(false),
		requiresVerification: z.boolean().default(true),
		requiresPhoto: z.boolean().default(false),
		graceDays: z.coerce.number().int().min(0).max(30).default(0),
		assignmentType: z.enum(['fixed', 'rotating', 'everyone']).default('fixed'),
		/**
		 * Ordered: position 0 first. Fixed assignment uses just the first entry;
		 * `everyone` uses them all at once (order is only display order).
		 * Empty = unassigned: the chore exists but generation skips it until
		 * someone takes it (lets you stock the house first, assign later).
		 */
		assigneeIds: z.array(z.coerce.number().int().positive()).default([])
	})
	.superRefine((c, ctx) => {
		if (c.frequency === 'weekly' && c.weekdays.length === 0) {
			ctx.addIssue({ code: 'custom', path: ['weekdays'], message: 'Pick at least one weekday.' });
		}
		if ((c.frequency === 'monthly' || c.frequency === 'yearly') && !c.dayOfMonth) {
			ctx.addIssue({ code: 'custom', path: ['dayOfMonth'], message: 'Pick a day of the month.' });
		}
		if (c.frequency === 'yearly' && !c.monthOfYear) {
			ctx.addIssue({ code: 'custom', path: ['monthOfYear'], message: 'Pick a month.' });
		}
		// 0 people = unassigned (fine); a rotation of exactly 1 makes no sense.
		if (c.assignmentType === 'rotating' && c.assigneeIds.length === 1) {
			ctx.addIssue({
				code: 'custom',
				path: ['assigneeIds'],
				message: 'A rotation needs at least two people.'
			});
		}
		if (new Set(c.assigneeIds).size !== c.assigneeIds.length) {
			ctx.addIssue({
				code: 'custom',
				path: ['assigneeIds'],
				message: 'Each person can only appear once in the rotation.'
			});
		}
	});

export type ChoreInput = z.infer<typeof choreSchema>;

/** Turn a chore form's FormData into a candidate for choreSchema. */
export function choreFormToObject(form: FormData) {
	return {
		title: form.get('title'),
		description: form.get('description') ?? '',
		frequency: form.get('frequency'),
		interval: form.get('interval') || 1,
		weekdays: form.getAll('weekdays'),
		dayOfMonth: form.get('dayOfMonth') || undefined,
		monthOfYear: form.get('monthOfYear') || undefined,
		startDate: form.get('startDate'),
		points: form.get('points') || 0,
		isBonus: form.get('isBonus') === 'on',
		requiresVerification: form.get('requiresVerification') === 'on',
		requiresPhoto: form.get('requiresPhoto') === 'on',
		graceDays: form.get('graceDays') || 0,
		assignmentType: form.get('assignmentType') ?? 'fixed',
		// '' is the "Nobody yet — assign later" option on the fixed select.
		assigneeIds: form.getAll('assigneeIds').filter((v) => v !== ''),
		roomId: form.get('roomId') || undefined,
		icon: form.get('icon') ?? ''
	};
}

/** First human-readable message out of a ZodError. */
export function firstZodMessage(err: z.ZodError): string {
	return err.issues[0]?.message ?? 'Invalid input.';
}
