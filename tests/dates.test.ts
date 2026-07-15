import { addDays, daysInMonth, diffDays, isDateString, isoWeekday } from '$lib/server/dates';
import { describe, expect, it } from 'vitest';

describe('dates', () => {
	it('adds days across month and year boundaries', () => {
		expect(addDays('2026-01-30', 3)).toBe('2026-02-02');
		expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
		expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
	});

	it('diffs days', () => {
		expect(diffDays('2026-07-01', '2026-07-15')).toBe(14);
		expect(diffDays('2026-07-15', '2026-07-01')).toBe(-14);
	});

	it('computes ISO weekdays (0 = Monday)', () => {
		expect(isoWeekday('2026-01-05')).toBe(0); // a Monday
		expect(isoWeekday('2026-01-08')).toBe(3); // a Thursday
		expect(isoWeekday('2026-01-11')).toBe(6); // a Sunday
	});

	it('knows month lengths incl. leap years', () => {
		expect(daysInMonth(2026, 2)).toBe(28);
		expect(daysInMonth(2028, 2)).toBe(29);
		expect(daysInMonth(2026, 4)).toBe(30);
	});

	it('validates date strings', () => {
		expect(isDateString('2026-02-28')).toBe(true);
		expect(isDateString('2026-02-30')).toBe(false);
		expect(isDateString('2026-13-01')).toBe(false);
		expect(isDateString('not-a-date')).toBe(false);
	});
});
