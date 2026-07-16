import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { databasePath, sqlite } from './db';
import { uploadsDir } from './uploads';
import { createZip, type ZipEntry } from './zipLite';

/**
 * Shared backup machinery — used by the /admin/backup download route, the
 * scheduler's nightly auto-backup, and the admin CLI.
 */

/** Where automatic + CLI backups land (inside the data volume, gitignored). */
export const backupsDir = join(databasePath, '..', 'backups');

/** Consistent SQLite snapshot (online backup API) + every photo, zipped. */
export async function createBackupZip(): Promise<Buffer> {
	const snapshotPath = `${databasePath}.backup-tmp`;
	await sqlite.backup(snapshotPath);
	const entries: ZipEntry[] = [{ name: 'chores.db', data: readFileSync(snapshotPath) }];
	unlinkSync(snapshotPath);

	if (existsSync(uploadsDir)) {
		for (const file of readdirSync(uploadsDir)) {
			entries.push({ name: `uploads/${file}`, data: readFileSync(join(uploadsDir, file)) });
		}
	}
	return createZip(entries);
}

/** Write a timestamped backup zip; returns its path and size. */
export async function writeBackupFile(dir = backupsDir): Promise<{ path: string; bytes: number }> {
	const zip = await createBackupZip();
	mkdirSync(dir, { recursive: true });
	// Local time, matching the project's local-calendar convention.
	const now = new Date();
	const pad = (n: number) => String(n).padStart(2, '0');
	const stamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
	const path = join(dir, `choretracker-backup-${stamp}.zip`);
	writeFileSync(path, new Uint8Array(zip));
	return { path, bytes: zip.length };
}

const BACKUP_NAME_RE = /^choretracker-backup-.*\.zip$/;

/** Delete all but the newest `keep` backups; returns how many were removed. */
export function pruneBackups(keep: number, dir = backupsDir): number {
	if (!existsSync(dir) || keep < 0) return 0;
	const backups = readdirSync(dir)
		.filter((f) => BACKUP_NAME_RE.test(f))
		.map((f) => ({ file: f, mtime: statSync(join(dir, f)).mtimeMs }))
		.sort((a, b) => b.mtime - a.mtime);

	let removed = 0;
	for (const old of backups.slice(keep)) {
		try {
			unlinkSync(join(dir, old.file));
			removed++;
		} catch {
			// Locked/vanished — the next prune gets it.
		}
	}
	return removed;
}
