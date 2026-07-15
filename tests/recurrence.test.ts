import { nextOccurrence, occursOn, occurrencesInRange, type Recurrence } from '$lib/server/recurrence';
import { describe, expect, it } from 'vitest';

const base: Recurrence = {
	frequency: 'daily',
	interval: 1,
	weekdayMask: 0,
	dayOfMonth: null,
	monthOfYear: null,
	startDate: '2026-01-01'
};

describe('daily', () => {
	it('occurs every day from the start date', () => {
		expect(occursOn(base, '2026-01-01')).toBe(true);
		expect(occursOn(base, '2026-07-15')).toBe(true);
		expect(occursOn(base, '2025-12-31')).toBe(false); // before start
	});

	it('respects the every-N-days interval anchored at startDate', () => {
		const r = { ...base, interval: 3 };
		expect(occursOn(r, '2026-01-01')).toBe(true);
		expect(occursOn(r, '2026-01-02')).toBe(false);
		expect(occursOn(r, '2026-01-04')).toBe(true);
		expect(occurrencesInRange(r, '2026-01-01', '2026-01-10')).toEqual([
			'2026-01-01',
			'2026-01-04',
			'2026-01-07',
			'2026-01-10'
		]);
	});
});

describe('weekly', () => {
	it('supports multi-day masks (Mon + Thu)', () => {
		const r: Recurrence = { ...base, frequency: 'weekly', weekdayMask: (1 << 0) | (1 << 3) };
		// 2026-01-05 is a Monday
		expect(occurrencesInRange(r, '2026-01-05', '2026-01-18')).toEqual([
			'2026-01-05',
			'2026-01-08',
			'2026-01-12',
			'2026-01-15'
		]);
	});

	it('never occurs with an empty mask', () => {
		const r: Recurrence = { ...base, frequency: 'weekly', weekdayMask: 0 };
		expect(occurrencesInRange(r, '2026-01-01', '2026-01-31')).toEqual([]);
	});
});

describe('monthly', () => {
	it('occurs on the given day each month', () => {
		const r: Recurrence = { ...base, frequency: 'monthly', dayOfMonth: 15 };
		expect(occursOn(r, '2026-07-15')).toBe(true);
		expect(occursOn(r, '2026-07-14')).toBe(false);
	});

	it('clamps day 31 to the end of shorter months', () => {
		const r: Recurrence = { ...base, frequency: 'monthly', dayOfMonth: 31 };
		expect(occursOn(r, '2026-02-28')).toBe(true); // non-leap Feb
		expect(occursOn(r, '2028-02-29')).toBe(true); // leap Feb
		expect(occursOn(r, '2026-04-30')).toBe(true);
		expect(occursOn(r, '2026-04-29')).toBe(false);
		expect(occursOn(r, '2026-01-31')).toBe(true);
	});

	it('finds the next occurrence', () => {
		const r: Recurrence = { ...base, frequency: 'monthly', dayOfMonth: 15 };
		expect(nextOccurrence(r, '2026-07-16')).toBe('2026-08-15');
		expect(nextOccurrence(r, '2026-07-15')).toBe('2026-07-15');
	});
});

describe('yearly', () => {
	it('occurs once a year on month + day', () => {
		const r: Recurrence = { ...base, frequency: 'yearly', monthOfYear: 3, dayOfMonth: 15 };
		expect(occursOn(r, '2026-03-15')).toBe(true);
		expect(occursOn(r, '2026-04-15')).toBe(false);
		expect(nextOccurrence(r, '2026-07-15')).toBe('2027-03-15');
	});

	it('clamps Feb 29 to Feb 28 in non-leap years', () => {
		const r: Recurrence = {
			...base,
			frequency: 'yearly',
			monthOfYear: 2,
			dayOfMonth: 29,
			startDate: '2024-01-01'
		};
		expect(occursOn(r, '2024-02-29')).toBe(true);
		expect(occursOn(r, '2026-02-28')).toBe(true);
	});
});
