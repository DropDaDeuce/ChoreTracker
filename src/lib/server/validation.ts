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
		frequency: z.enum(['daily', 'weekly', 'monthly', 'yearly']),
		interval: z.coerce.number().int().min(1).max(365).default(1),
		weekdays: z.array(z.coerce.number().int().min(0).max(6)).default([]),
		dayOfMonth: z.coerce.number().int().min(1).max(31).optional(),
		monthOfYear: z.coerce.number().int().min(1).max(12).optional(),
		startDate: z.string().refine(isDateString, 'Start date must be a valid date.'),
		points: z.coerce.number().int().min(0).max(1000).default(0),
		/** Dollars in the form; converted to cents on save. */
		allowance: z.coerce.number().min(0).max(1000).default(0),
		requiresVerification: z.boolean().default(true),
		assigneeId: z.coerce.number().int().positive('Pick who does this chore.')
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
		allowance: form.get('allowance') || 0,
		requiresVerification: form.get('requiresVerification') === 'on',
		assigneeId: form.get('assigneeId')
	};
}

/** First human-readable message out of a ZodError. */
export function firstZodMessage(err: z.ZodError): string {
	return err.issues[0]?.message ?? 'Invalid input.';
}
