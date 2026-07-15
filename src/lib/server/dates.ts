/**
 * Date helpers over plain `YYYY-MM-DD` strings.
 *
 * Due dates are calendar dates in the household's local time — no timezones,
 * no DST edge cases. Internally we do arithmetic in UTC so every day is
 * exactly 24h.
 */

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isDateString(value: string): boolean {
	if (!DATE_RE.test(value)) return false;
	const [y, m, d] = value.split('-').map(Number);
	return m >= 1 && m <= 12 && d >= 1 && d <= daysInMonth(y, m);
}

function toUtc(date: string): number {
	const [y, m, d] = date.split('-').map(Number);
	return Date.UTC(y, m - 1, d);
}

function fromUtc(ms: number): string {
	return new Date(ms).toISOString().slice(0, 10);
}

/** Today as a local-time calendar date. */
export function todayLocal(now = new Date()): string {
	const y = now.getFullYear();
	const m = String(now.getMonth() + 1).padStart(2, '0');
	const d = String(now.getDate()).padStart(2, '0');
	return `${y}-${m}-${d}`;
}

export function addDays(date: string, n: number): string {
	return fromUtc(toUtc(date) + n * 86_400_000);
}

/** Whole days from `a` to `b` (positive when b is later). */
export function diffDays(a: string, b: string): number {
	return Math.round((toUtc(b) - toUtc(a)) / 86_400_000);
}

/** ISO weekday index: 0 = Monday … 6 = Sunday. */
export function isoWeekday(date: string): number {
	return (new Date(toUtc(date)).getUTCDay() + 6) % 7;
}

export function daysInMonth(year: number, month: number): number {
	return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function yearOf(date: string): number {
	return Number(date.slice(0, 4));
}

export function monthOf(date: string): number {
	return Number(date.slice(5, 7));
}

export function dayOf(date: string): number {
	return Number(date.slice(8, 10));
}
