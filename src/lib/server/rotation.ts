/**
 * Rotation: whose turn is it?
 *
 * The rule is **least-recently-served**: among the pool members who are home
 * on the due date, the turn goes to whoever has gone longest without this
 * chore (never-served first, ties broken by pool position).
 *
 * This is DERIVED from the instances that exist rather than stored in a
 * pointer, which is what makes an away day behave the way a family expects:
 * someone else covers the day, and the person who was away is first in line
 * the moment they're back — their last-served date is the stalest. A stored
 * "last position" pointer can't express that; it moves to whoever covered, so
 * the returning person silently forfeited their turn and got a free day.
 *
 * Being derived also means it's idempotent. Generation, presence changes and
 * assignment edits all delete-and-regenerate the forward window; re-deriving
 * the same history always produces the same schedule, so a rebuild only moves
 * the dates the change actually affected.
 */

/** A pool member, in pool order (position 0 first). */
export type PoolMember = { userId: number; position: number };

/** One turn already taken (or already scheduled) for this chore. */
export type Turn = { userId: number; dueDate: string };

/**
 * The most recent turn this person took strictly BEFORE `dueDate`, or null if
 * they've never had one. Later-dated turns are ignored on purpose: the window
 * is materialized forward, so a person can already hold turns *after* the gap
 * being filled, and those must not make them look recently served.
 */
function lastServedBefore(turns: Turn[], userId: number, dueDate: string): string | null {
	let last: string | null = null;
	for (const turn of turns) {
		if (turn.userId !== userId) continue;
		if (turn.dueDate >= dueDate) continue;
		if (last === null || turn.dueDate > last) last = turn.dueDate;
	}
	return last;
}

/**
 * Pick who takes `dueDate`, or null when nobody in the pool is home that day
 * (the caller skips the day entirely — an away household owes no chores).
 *
 * Pure: `isHomeOn` is injected so this stays testable without a database and
 * the caller controls how presence is looked up.
 */
export function pickRotationAssignee(
	pool: PoolMember[],
	turns: Turn[],
	dueDate: string,
	isHomeOn: (userId: number) => boolean
): PoolMember | null {
	let best: PoolMember | null = null;
	let bestServed: string | null = null;

	for (const member of pool) {
		if (!isHomeOn(member.userId)) continue;
		const served = lastServedBefore(turns, member.userId, dueDate);

		// First home candidate wins by default; after that only a strictly
		// staler turn takes over, so equal claims fall to the earlier pool
		// position and the pick stays deterministic.
		if (best === null) {
			best = member;
			bestServed = served;
			continue;
		}
		if (bestServed === null) continue; // nothing is staler than never-served
		if (served === null || served < bestServed) {
			best = member;
			bestServed = served;
		}
	}

	return best;
}
