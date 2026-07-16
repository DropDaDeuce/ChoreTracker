import { requireAdult } from '$lib/server/auth';
import { todayLocal } from '$lib/server/dates';
import { databasePath, sqlite } from '$lib/server/db';
import { uploadsDir } from '$lib/server/uploads';
import { createZip, type ZipEntry } from '$lib/server/zipLite';
import { existsSync, readdirSync, readFileSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import type { RequestHandler } from './$types';

/**
 * Full household backup: a consistent SQLite snapshot (online backup API, so
 * it's safe while the app is running) plus every uploaded photo, zipped.
 */
export const GET: RequestHandler = async ({ locals }) => {
	requireAdult(locals);

	const snapshotPath = `${databasePath}.backup-tmp`;
	await sqlite.backup(snapshotPath);
	const entries: ZipEntry[] = [{ name: 'chores.db', data: readFileSync(snapshotPath) }];
	unlinkSync(snapshotPath);

	if (existsSync(uploadsDir)) {
		for (const file of readdirSync(uploadsDir)) {
			entries.push({ name: `uploads/${file}`, data: readFileSync(join(uploadsDir, file)) });
		}
	}

	return new Response(new Uint8Array(createZip(entries)), {
		headers: {
			'content-type': 'application/zip',
			'content-disposition': `attachment; filename="choretracker-backup-${todayLocal()}.zip"`
		}
	});
};
