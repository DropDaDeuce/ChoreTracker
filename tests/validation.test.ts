import { choreSchema } from '$lib/server/validation';
import { describe, expect, it } from 'vitest';

const valid = {
	title: 'Dishes',
	frequency: 'daily',
	startDate: '2026-07-15',
	assignmentType: 'fixed',
	assigneeIds: ['3'] // form values arrive as strings
};

describe('choreSchema', () => {
	it('accepts a minimal fixed chore and coerces form strings', () => {
		const parsed = choreSchema.parse(valid);
		expect(parsed.assigneeIds).toEqual([3]);
		expect(parsed.interval).toBe(1);
		expect(parsed.graceDays).toBe(0);
	});

	it('allows zero assignees — unassigned chores are stocked now, handed out later', () => {
		expect(choreSchema.safeParse({ ...valid, assigneeIds: [] }).success).toBe(true);
		expect(
			choreSchema.safeParse({ ...valid, assignmentType: 'rotating', assigneeIds: [] }).success
		).toBe(true);
	});

	it('requires at least two people for a rotation', () => {
		expect(
			choreSchema.safeParse({ ...valid, assignmentType: 'rotating', assigneeIds: ['1'] }).success
		).toBe(false);
		expect(
			choreSchema.safeParse({ ...valid, assignmentType: 'rotating', assigneeIds: ['1', '2'] })
				.success
		).toBe(true);
	});

	it('rejects duplicate pool members', () => {
		expect(
			choreSchema.safeParse({ ...valid, assignmentType: 'rotating', assigneeIds: ['1', '1'] })
				.success
		).toBe(false);
	});

	it('requires weekdays for weekly and day/month fields for monthly/yearly', () => {
		expect(choreSchema.safeParse({ ...valid, frequency: 'weekly' }).success).toBe(false);
		expect(
			choreSchema.safeParse({ ...valid, frequency: 'weekly', weekdays: ['0', '3'] }).success
		).toBe(true);
		expect(choreSchema.safeParse({ ...valid, frequency: 'monthly' }).success).toBe(false);
		expect(
			choreSchema.safeParse({ ...valid, frequency: 'yearly', dayOfMonth: '1' }).success
		).toBe(false);
		expect(
			choreSchema.safeParse({ ...valid, frequency: 'yearly', dayOfMonth: '1', monthOfYear: '3' })
				.success
		).toBe(true);
	});

	it('rejects invalid start dates', () => {
		expect(choreSchema.safeParse({ ...valid, startDate: '2026-02-30' }).success).toBe(false);
	});
});
