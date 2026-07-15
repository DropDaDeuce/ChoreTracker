import { eq } from 'drizzle-orm';
import { choreRotationState } from './db/schema';
import type { DB } from './db/type';

/** Round-robin: the pool position that comes after `lastPosition`. */
export function nextPosition(lastPosition: number, poolSize: number): number {
	if (poolSize <= 0) throw new Error('rotation pool is empty');
	// A shrunken pool can leave lastPosition out of range; modulo keeps the
	// pick valid either way.
	return (lastPosition + 1) % poolSize;
}

export function getLastPosition(db: DB, choreId: number): number {
	const row = db
		.select()
		.from(choreRotationState)
		.where(eq(choreRotationState.choreId, choreId))
		.get();
	return row?.lastPosition ?? -1;
}

export function setLastPosition(db: DB, choreId: number, position: number): void {
	db.insert(choreRotationState)
		.values({ choreId, lastPosition: position })
		.onConflictDoUpdate({
			target: choreRotationState.choreId,
			set: { lastPosition: position }
		})
		.run();
}
