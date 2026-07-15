import { addDays, dayOf, daysInMonth, diffDays, isoWeekday, monthOf, yearOf } from './dates';

/** The subset of a chore row that drives due-date math. */
export interface Recurrence {
	frequency: 'daily' | 'weekly' | 'monthly' | 'yearly';
	/** Every N days (daily only). */
	interval: number;
	/** Weekly: bit 0 = Monday … bit 6 = Sunday. */
	weekdayMask: number;
	dayOfMonth: number | null;
	monthOfYear: number | null;
	/** YYYY-MM-DD; earliest possible occurrence and anchor for interval math. */
	startDate: string;
}

/**
 * Does this chore fall due on `date`?
 *
 * Monthly/yearly `dayOfMonth` is clamped to the month's length, so a chore on
 * the 31st falls due on Feb 28 (29 in leap years), Apr 30, etc.
 */
export function occursOn(r: Recurrence, date: string): boolean {
	if (date < r.startDate) return false;

	switch (r.frequency) {
		case 'daily': {
			const interval = Math.max(1, r.interval);
			return diffDays(r.startDate, date) % interval === 0;
		}
		case 'weekly':
			return (r.weekdayMask & (1 << isoWeekday(date))) !== 0;
		case 'monthly': {
			if (!r.dayOfMonth) return false;
			const clamped = Math.min(r.dayOfMonth, daysInMonth(yearOf(date), monthOf(date)));
			return dayOf(date) === clamped;
		}
		case 'yearly': {
			if (!r.dayOfMonth || !r.monthOfYear) return false;
			if (monthOf(date) !== r.monthOfYear) return false;
			const clamped = Math.min(r.dayOfMonth, daysInMonth(yearOf(date), monthOf(date)));
			return dayOf(date) === clamped;
		}
	}
}

/** All due dates in [from, to], inclusive. */
export function occurrencesInRange(r: Recurrence, from: string, to: string): string[] {
	const result: string[] = [];
	for (let d = from; d <= to; d = addDays(d, 1)) {
		if (occursOn(r, d)) result.push(d);
	}
	return result;
}

/** First due date on or after `from`, or null if none within `searchDays`. */
export function nextOccurrence(r: Recurrence, from: string, searchDays = 400): string | null {
	const start = from < r.startDate ? r.startDate : from;
	for (let i = 0; i <= searchDays; i++) {
		const d = addDays(start, i);
		if (occursOn(r, d)) return d;
	}
	return null;
}
