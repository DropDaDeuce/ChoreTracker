import { computePayoutCents } from '$lib/server/payout';
import { describe, expect, it } from 'vitest';

describe('computePayoutCents', () => {
	it('pays in full with no reminders', () => {
		expect(computePayoutCents(200, 0)).toBe(200);
	});

	it('pays half after one reminder (default penalty)', () => {
		expect(computePayoutCents(200, 1)).toBe(100);
	});

	it('pays nothing after two or more reminders', () => {
		expect(computePayoutCents(200, 2)).toBe(0);
		expect(computePayoutCents(200, 5)).toBe(0);
	});

	it('honors a configured penalty percentage', () => {
		expect(computePayoutCents(200, 1, 25)).toBe(150);
		expect(computePayoutCents(200, 1, 100)).toBe(0);
		expect(computePayoutCents(200, 1, 0)).toBe(200);
	});

	it('rounds to whole cents', () => {
		expect(computePayoutCents(105, 1)).toBe(53); // 52.5 rounds up
	});

	it('handles zero-allowance chores', () => {
		expect(computePayoutCents(0, 0)).toBe(0);
		expect(computePayoutCents(0, 1)).toBe(0);
	});
});
