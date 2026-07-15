import { db } from '$lib/server/db';
import { appSettings } from '$lib/server/db/schema';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = () => {
	// Touching the settings table proves migrations ran and the DB is writable.
	const settings = db.select().from(appSettings).all();
	return { settingsCount: settings.length };
};
