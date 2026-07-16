import { requireUser } from '$lib/server/auth';
import { PHOTO_NAME_RE, uploadsDir } from '$lib/server/uploads';
import { error } from '@sveltejs/kit';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { RequestHandler } from './$types';

const CONTENT_TYPES: Record<string, string> = {
	jpg: 'image/jpeg',
	png: 'image/png',
	webp: 'image/webp'
};

/** Auth-gated serving of proof photos from the data directory. */
export const GET: RequestHandler = ({ locals, params }) => {
	requireUser(locals);

	// Generated names only — no path traversal, no probing other files.
	if (!PHOTO_NAME_RE.test(params.name)) error(404, 'Not found');
	const path = join(uploadsDir, params.name);
	if (!existsSync(path)) error(404, 'Not found');

	const ext = params.name.split('.').at(-1)!;
	return new Response(new Uint8Array(readFileSync(path)), {
		headers: {
			'content-type': CONTENT_TYPES[ext] ?? 'application/octet-stream',
			'cache-control': 'private, max-age=86400'
		}
	});
};
