/**
 * Points are the app's single weight axis: they decide how much of a day's
 * allowance a chore claims, and they're what point goals count.
 */

export type Frequency = 'daily' | 'weekly' | 'monthly' | 'yearly';

/**
 * Suggested points by how often a chore comes round — a yearly job is a big
 * one-off, a daily job is small and repeated. These are only defaults on the
 * chore form; adults can set any value.
 */
export const DEFAULT_POINTS: Record<Frequency, number> = {
	daily: 1,
	weekly: 3,
	monthly: 5,
	yearly: 7
};
