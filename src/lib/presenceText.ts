/** Client-safe display helpers for presence rules. */

export const WEEKDAY_FULL = [
	'Monday',
	'Tuesday',
	'Wednesday',
	'Thursday',
	'Friday',
	'Saturday',
	'Sunday'
];

function ordinal(n: number): string {
	const rem10 = n % 10;
	const rem100 = n % 100;
	if (rem10 === 1 && rem100 !== 11) return `${n}st`;
	if (rem10 === 2 && rem100 !== 12) return `${n}nd`;
	if (rem10 === 3 && rem100 !== 13) return `${n}rd`;
	return `${n}th`;
}

export const WEEKDAY_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export const WEEKDAYS_MASK = 0b0011111; // Mon-Fri
export const WEEKEND_MASK = 0b1100000; // Sat-Sun
export const EVERY_DAY_MASK = 0b1111111;

export function describePresenceRule(rule: {
	kind: 'weekly' | 'biweekly' | 'monthly';
	weekday: number | null;
	weekdayMask?: number;
	anchorDate: string | null;
	dayOfMonth: number | null;
	isHome: boolean;
}): string {
	const state = rule.isHome ? 'Home' : 'Away';
	switch (rule.kind) {
		case 'weekly': {
			const mask =
				(rule.weekdayMask ?? 0) || (rule.weekday !== null ? 1 << rule.weekday : 0);
			if (mask === EVERY_DAY_MASK) return `${state} every day`;
			if (mask === WEEKDAYS_MASK) return `${state} on weekdays (Mon–Fri)`;
			if (mask === WEEKEND_MASK) return `${state} on weekends`;
			const days = WEEKDAY_SHORT.filter((_, i) => mask & (1 << i));
			if (days.length === 1) {
				return `${state} every ${WEEKDAY_FULL[WEEKDAY_SHORT.indexOf(days[0])]}`;
			}
			return `${state} every ${days.join(', ')}`;
		}
		case 'biweekly': {
			const mask =
				(rule.weekdayMask ?? 0) || (rule.weekday !== null ? 1 << rule.weekday : 0);
			const from = ` (from ${rule.anchorDate})`;
			if (mask === EVERY_DAY_MASK) return `${state} every other week${from}`;
			if (mask === WEEKDAYS_MASK) return `${state} every other week, weekdays only${from}`;
			if (mask === WEEKEND_MASK) return `${state} every other weekend${from}`;
			const days = WEEKDAY_SHORT.filter((_, i) => mask & (1 << i));
			if (days.length === 1) {
				return `${state} every other ${WEEKDAY_FULL[WEEKDAY_SHORT.indexOf(days[0])]}${from}`;
			}
			return `${state} every other week on ${days.join(', ')}${from}`;
		}
		case 'monthly':
			return `${state} on the ${ordinal(rule.dayOfMonth ?? 1)} of each month`;
	}
}
