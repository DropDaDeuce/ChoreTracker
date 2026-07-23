import { db } from '$lib/server/db';
import { choreInstances } from '$lib/server/db/schema';
import { CURRENCY_SYMBOL_KEY, getSettingOr } from '$lib/server/settings';
import { eq, sql } from 'drizzle-orm';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = ({ locals }) => {
	// Badge on the Verify tab — adults only, one indexed count per page load.
	const verifyQueueCount =
		locals.user?.role === 'adult'
			? (db
					.select({ n: sql<number>`count(*)` })
					.from(choreInstances)
					.where(eq(choreInstances.status, 'done'))
					.get()?.n ?? 0)
			: 0;

	return {
		user: locals.user,
		currency: getSettingOr(db, CURRENCY_SYMBOL_KEY),
		verifyQueueCount
	};
};
