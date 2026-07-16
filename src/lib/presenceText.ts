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

export function describePresenceRule(rule: {
	kind: 'weekly' | 'biweekly' | 'monthly';
	weekday: number | null;
	anchorDate: string | null;
	dayOfMonth: number | null;
	isHome: boolean;
}): string {
	const state = rule.isHome ? 'Home' : 'Away';
	switch (rule.kind) {
		case 'weekly':
			return `${state} every ${WEEKDAY_FULL[rule.weekday ?? 0]}`;
		case 'biweekly':
			return `${state} every other ${WEEKDAY_FULL[rule.weekday ?? 0]} (from ${rule.anchorDate})`;
		case 'monthly':
			return `${state} on the ${ordinal(rule.dayOfMonth ?? 1)} of each month`;
	}
}
