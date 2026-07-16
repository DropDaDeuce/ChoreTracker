import { requireAdult } from '$lib/server/auth';
import { createBackupZip } from '$lib/server/backup';
import { todayLocal } from '$lib/server/dates';
import type { RequestHandler } from './$types';

/**
 * Full household backup: a consistent SQLite snapshot (online backup API, so
 * it's safe while the app is running) plus every uploaded photo, zipped.
 */
export const GET: RequestHandler = async ({ locals }) => {
	requireAdult(locals);
	return new Response(new Uint8Array(await createBackupZip()), {
		headers: {
			'content-type': 'application/zip',
			'content-disposition': `attachment; filename="choretracker-backup-${todayLocal()}.zip"`
		}
	});
};
