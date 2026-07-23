import { eq, inArray, sql } from 'drizzle-orm';
import { allowanceLedger, choreInstances, chores } from './db/schema';
import type { DB } from './db/type';
import { InstanceActionError } from './instances';

/**
 * Delete a chore and its entire schedule/history.
 *
 * Money already earned is sacred: ledger rows keep their amounts (balances
 * never change) and only lose their instance link — their note text already
 * names the chore and date. Points/streak history on the deleted instances
 * goes with them; the UI warns when that's about to happen.
 *
 * Returns the proof-photo paths so the ROUTE can delete the files — engine
 * modules stay pure Node with no fs side effects.
 */
export function deleteChore(db: DB, choreId: number): { photoPaths: string[] } {
	return db.transaction((tx) => {
		const chore = tx.select().from(chores).where(eq(chores.id, choreId)).get();
		if (!chore) throw new InstanceActionError('Chore not found.');

		const photoPaths = tx
			.select({ photoPath: choreInstances.photoPath })
			.from(choreInstances)
			.where(eq(choreInstances.choreId, choreId))
			.all()
			.map((r) => r.photoPath)
			.filter((p): p is string => p !== null);

		tx.update(allowanceLedger)
			.set({ instanceId: null })
			.where(
				inArray(
					allowanceLedger.instanceId,
					tx
						.select({ id: choreInstances.id })
						.from(choreInstances)
						.where(eq(choreInstances.choreId, choreId))
				)
			)
			.run();

		// Instances, reminders, swap requests, assignees, and rotation state
		// all cascade from the chore row.
		tx.delete(chores).where(eq(chores.id, choreId)).run();

		return { photoPaths };
	});
}

/** How many completed entries deletion would erase — powers the UI warning. */
export function verifiedCount(db: DB, choreId: number): number {
	return (
		db
			.select({ n: sql<number>`count(*)` })
			.from(choreInstances)
			.where(
				sql`${choreInstances.choreId} = ${choreId} and ${choreInstances.status} = 'verified'`
			)
			.get()?.n ?? 0
	);
}
