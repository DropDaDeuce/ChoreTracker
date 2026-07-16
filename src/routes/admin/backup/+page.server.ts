import { requireAdult } from '$lib/server/auth';
import { databasePath, sqlite } from '$lib/server/db';
import { runMigrations } from '$lib/server/db/migrate';
import { PHOTO_NAME_RE, uploadsDir } from '$lib/server/uploads';
import { readZip } from '$lib/server/zipLite';
import { fail } from '@sveltejs/kit';
import Database from 'better-sqlite3';
import { mkdirSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = ({ locals }) => {
	requireAdult(locals);
	return {};
};

/** Validate an uploaded SQLite file before letting it near the live data. */
function validateSnapshot(path: string): string | null {
	let probe: InstanceType<typeof Database> | null = null;
	try {
		probe = new Database(path, { readonly: true });
		const integrity = probe.pragma('integrity_check', { simple: true });
		if (integrity !== 'ok') return 'That database file failed its integrity check.';
		const hasMigrations = probe
			.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='__drizzle_migrations'")
			.get();
		if (!hasMigrations) return "That file doesn't look like a ChoreTracker backup.";
		return null;
	} catch {
		return "That file isn't a readable SQLite database.";
	} finally {
		probe?.close();
	}
}

export const actions: Actions = {
	restore: async ({ request, locals }) => {
		requireAdult(locals);
		const form = await request.formData();
		if (form.get('confirm') !== 'on') {
			return fail(400, { message: 'Please tick the confirmation box first.' });
		}
		const file = form.get('backup');
		if (!(file instanceof File) || file.size === 0) {
			return fail(400, { message: 'Pick a backup file first.' });
		}

		const buffer = Buffer.from(await file.arrayBuffer());
		let dbBytes: Buffer;
		let photos: { name: string; data: Buffer }[] = [];

		if (buffer.length > 4 && buffer.readUInt32LE(0) === 0x04034b50) {
			let entries;
			try {
				entries = readZip(buffer);
			} catch {
				return fail(400, { message: "Couldn't read that zip file." });
			}
			const dbEntry = entries.find((e) => e.name === 'chores.db');
			if (!dbEntry) return fail(400, { message: 'No chores.db found inside that zip.' });
			dbBytes = dbEntry.data;
			photos = entries.filter(
				(e) => e.name.startsWith('uploads/') && PHOTO_NAME_RE.test(e.name.slice('uploads/'.length))
			);
		} else {
			dbBytes = buffer; // bare .db file
		}

		const incomingPath = `${databasePath}.restore-tmp`;
		writeFileSync(incomingPath, new Uint8Array(dbBytes));
		const invalid = validateSnapshot(incomingPath);
		if (invalid) {
			unlinkSync(incomingPath);
			return fail(400, { message: invalid });
		}

		// Safety net first, then restore INTO the live file via the online
		// backup API — SQLite handles the locking, so the running app simply
		// sees the new data.
		await sqlite.backup(`${databasePath}.pre-restore`);
		const incoming = new Database(incomingPath, { readonly: true });
		try {
			await incoming.backup(databasePath);
		} finally {
			incoming.close();
			unlinkSync(incomingPath);
		}
		runMigrations(); // the backup may predate newer schema

		if (photos.length > 0) {
			mkdirSync(uploadsDir, { recursive: true });
			for (const photo of photos) {
				writeFileSync(
					join(uploadsDir, photo.name.slice('uploads/'.length)),
					new Uint8Array(photo.data)
				);
			}
		}

		return {
			success: true,
			message: `Restored. ${photos.length} photo(s) recovered. Everyone may need to log in again.`
		};
	}
};
