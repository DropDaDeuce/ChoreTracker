/** Client-safe display helpers for chore recurrence fields. */

const WEEKDAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const MONTH_LABELS = [
	'January',
	'February',
	'March',
	'April',
	'May',
	'June',
	'July',
	'August',
	'September',
	'October',
	'November',
	'December'
];

function ordinal(n: number): string {
	const rem10 = n % 10;
	const rem100 = n % 100;
	if (rem10 === 1 && rem100 !== 11) return `${n}st`;
	if (rem10 === 2 && rem100 !== 12) return `${n}nd`;
	if (rem10 === 3 && rem100 !== 13) return `${n}rd`;
	return `${n}th`;
}

export function describeRecurrence(c: {
	frequency: 'daily' | 'weekly' | 'monthly' | 'yearly';
	interval: number;
	weekdayMask: number;
	dayOfMonth: number | null;
	monthOfYear: number | null;
}): string {
	switch (c.frequency) {
		case 'daily':
			return c.interval > 1 ? `Every ${c.interval} days` : 'Every day';
		case 'weekly': {
			const days = WEEKDAY_LABELS.filter((_, i) => c.weekdayMask & (1 << i));
			return days.length ? `Weekly on ${days.join(', ')}` : 'Weekly';
		}
		case 'monthly':
			return c.dayOfMonth ? `Monthly on the ${ordinal(c.dayOfMonth)}` : 'Monthly';
		case 'yearly':
			return c.monthOfYear && c.dayOfMonth
				? `Every year on ${MONTH_LABELS[c.monthOfYear - 1]} ${c.dayOfMonth}`
				: 'Yearly';
	}
}

export { MONTH_LABELS, WEEKDAY_LABELS };
