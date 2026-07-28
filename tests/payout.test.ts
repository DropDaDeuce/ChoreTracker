import { instanceWeight, reminderFactor } from '$lib/server/payout';
import { describe, expect, it } from 'vitest';

describe('reminderFactor', () => {
	it('claims the full weight with no reminders', () => {
		expect(reminderFactor(0)).toBe(1);
	});

	it('halves after one reminder (default penalty)', () => {
		expect(reminderFactor(1)).toBe(0.5);
	});

	it('claims nothing after two or more reminders', () => {
		expect(reminderFactor(2)).toBe(0);
		expect(reminderFactor(5)).toBe(0);
	});

	it('honors a configured penalty percentage', () => {
		expect(reminderFactor(1, 25)).toBe(0.75);
		expect(reminderFactor(1, 100)).toBe(0);
		expect(reminderFactor(1, 0)).toBe(1);
	});
});

describe('instanceWeight', () => {
	it('uses the chore points', () => {
		expect(instanceWeight(3)).toBe(3);
	});

	it('floors at 1 so a points-free household still splits days evenly', () => {
		expect(instanceWeight(0)).toBe(1);
		expect(instanceWeight(-5)).toBe(1);
	});
});
