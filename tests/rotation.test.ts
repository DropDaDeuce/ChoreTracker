import { pickRotationAssignee, type PoolMember, type Turn } from '$lib/server/rotation';
import { describe, expect, it } from 'vitest';

const POOL: PoolMember[] = [
	{ userId: 1, position: 0 },
	{ userId: 2, position: 1 },
	{ userId: 3, position: 2 }
];

const everyoneHome = () => true;

describe('pickRotationAssignee', () => {
	it('starts at the top of the pool when nobody has served', () => {
		expect(pickRotationAssignee(POOL, [], '2026-07-15', everyoneHome)?.userId).toBe(1);
	});

	it('prefers someone who has never served over anyone who has', () => {
		const turns: Turn[] = [{ userId: 3, dueDate: '2026-07-01' }];
		// Person 3 served longest ago in wall-clock terms, but 1 and 2 have
		// never had a turn at all — they go first, in pool order.
		expect(pickRotationAssignee(POOL, turns, '2026-07-15', everyoneHome)?.userId).toBe(1);
	});

	it('picks whoever has gone longest without the chore', () => {
		const turns: Turn[] = [
			{ userId: 1, dueDate: '2026-07-14' },
			{ userId: 2, dueDate: '2026-07-12' },
			{ userId: 3, dueDate: '2026-07-13' }
		];
		expect(pickRotationAssignee(POOL, turns, '2026-07-15', everyoneHome)?.userId).toBe(2);
	});

	it('breaks ties by pool position', () => {
		const turns: Turn[] = [
			{ userId: 1, dueDate: '2026-07-10' },
			{ userId: 2, dueDate: '2026-07-10' },
			{ userId: 3, dueDate: '2026-07-14' }
		];
		expect(pickRotationAssignee(POOL, turns, '2026-07-15', everyoneHome)?.userId).toBe(1);
	});

	it('skips people who are away and hands the turn to the next in line', () => {
		const turns: Turn[] = [
			{ userId: 1, dueDate: '2026-07-12' },
			{ userId: 2, dueDate: '2026-07-13' },
			{ userId: 3, dueDate: '2026-07-14' }
		];
		const pick = pickRotationAssignee(POOL, turns, '2026-07-15', (id) => id !== 1);
		expect(pick?.userId).toBe(2);
	});

	it('leaves the away person first in line for the next day they are home', () => {
		const turns: Turn[] = [
			{ userId: 1, dueDate: '2026-07-12' },
			{ userId: 2, dueDate: '2026-07-13' },
			{ userId: 3, dueDate: '2026-07-14' }
		];
		// Person 2 covered the 15th while 1 was away; on the 16th person 1 is
		// back and still holds the stalest turn, so they take it.
		const covered: Turn[] = [...turns, { userId: 2, dueDate: '2026-07-15' }];
		expect(pickRotationAssignee(POOL, covered, '2026-07-16', everyoneHome)?.userId).toBe(1);
	});

	it('returns null when the whole pool is away', () => {
		expect(pickRotationAssignee(POOL, [], '2026-07-15', () => false)).toBeNull();
	});

	it('ignores turns dated on or after the day being filled', () => {
		// The rolling window is materialized ahead, so person 1 can already
		// hold later turns while an earlier gap is backfilled. Those must not
		// count against them.
		const turns: Turn[] = [
			{ userId: 1, dueDate: '2026-07-20' },
			{ userId: 2, dueDate: '2026-07-14' },
			{ userId: 3, dueDate: '2026-07-15' }
		];
		expect(pickRotationAssignee(POOL, turns, '2026-07-16', everyoneHome)?.userId).toBe(1);
	});

	it('handles a single-person pool', () => {
		const solo: PoolMember[] = [{ userId: 9, position: 0 }];
		expect(pickRotationAssignee(solo, [], '2026-07-15', everyoneHome)?.userId).toBe(9);
		expect(pickRotationAssignee(solo, [], '2026-07-15', () => false)).toBeNull();
	});
});
