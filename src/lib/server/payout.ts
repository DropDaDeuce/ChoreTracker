/**
 * The reminder rule (docs/Plans/weekly-allowance-and-goals.md):
 *   0 reminders  -> the chore claims its full weight
 *   1 reminder   -> reduced by `penaltyPercent` (default half)
 *   2+ reminders -> nothing
 *
 * Under the weekly-allowance model this scales a chore's *weight*, not a cash
 * amount: money comes from the week's pot, and a nagged chore simply claims a
 * smaller share of the day it belongs to.
 */
export function reminderFactor(reminderCount: number, penaltyPercent = 50): number {
	if (reminderCount >= 2) return 0;
	if (reminderCount === 1) return (100 - penaltyPercent) / 100;
	return 1;
}

/**
 * A chore's weight for allowance maths, frozen onto the instance when it is
 * created. Floors at 1 so a household that never touches points still gets
 * plain "what fraction of my chores did I do" behaviour rather than a
 * division by zero.
 *
 * Lives here rather than in `$lib/points` because engine modules stay pure
 * Node — `npm run seed` and the admin CLI import this path without SvelteKit's
 * `$lib` alias.
 */
export function instanceWeight(points: number): number {
	return Math.max(1, points);
}

/** Human-readable reason for a reduced payout, or null when paid in full. */
export function payoutReason(reminderCount: number): string | null {
	if (reminderCount >= 2) return `${reminderCount} reminders — no payout`;
	if (reminderCount === 1) return '1 reminder — reduced payout';
	return null;
}
