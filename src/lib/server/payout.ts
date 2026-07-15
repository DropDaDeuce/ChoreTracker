/**
 * The allowance rule (docs/PLAN.md):
 *   0 reminders  -> full allowance
 *   1 reminder   -> reduced by `penaltyPercent` (default half)
 *   2+ reminders -> nothing
 */
export function computePayoutCents(
	allowanceCents: number,
	reminderCount: number,
	penaltyPercent = 50
): number {
	if (reminderCount >= 2) return 0;
	if (reminderCount === 1) {
		return Math.round((allowanceCents * (100 - penaltyPercent)) / 100);
	}
	return allowanceCents;
}

/** Human-readable reason for a reduced payout, or null when paid in full. */
export function payoutReason(reminderCount: number): string | null {
	if (reminderCount >= 2) return `${reminderCount} reminders — no payout`;
	if (reminderCount === 1) return '1 reminder — reduced payout';
	return null;
}
