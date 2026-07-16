import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

// Photos live next to the SQLite file so the whole household state is one
// directory: gitignored, volume-mounted in Docker, backed up by copying data/.
const dataDir = dirname(process.env.DATABASE_PATH || './data/chores.db');
export const uploadsDir = join(dataDir, 'uploads');

const ALLOWED = new Map([
	['image/jpeg', 'jpg'],
	['image/png', 'png'],
	['image/webp', 'webp']
]);
const MAX_BYTES = 10 * 1024 * 1024;

/** Strict shape of names we generate — doubles as the path-traversal guard. */
export const PHOTO_NAME_RE = /^[a-f0-9]{16}\.(jpg|png|webp)$/;

export class UploadError extends Error {}

/** Validate + persist an uploaded photo; returns the stored filename. */
export async function savePhoto(file: File): Promise<string> {
	const ext = ALLOWED.get(file.type);
	if (!ext) throw new UploadError('Photos must be JPEG, PNG, or WebP.');
	if (file.size === 0) throw new UploadError('That photo is empty.');
	if (file.size > MAX_BYTES) throw new UploadError('Photos must be under 10 MB.');

	mkdirSync(uploadsDir, { recursive: true });
	const name = `${randomBytes(8).toString('hex')}.${ext}`;
	writeFileSync(join(uploadsDir, name), Buffer.from(await file.arrayBuffer()));
	return name;
}

/** Best-effort delete (undo/reject cleanup); missing files are fine. */
export function deletePhoto(name: string | null | undefined): void {
	if (!name || !PHOTO_NAME_RE.test(name)) return;
	const path = join(uploadsDir, name);
	if (existsSync(path)) {
		try {
			unlinkSync(path);
		} catch {
			// Already gone or locked — nothing user-visible to do about it.
		}
	}
}
