import { db } from '$lib/server/db';
import { appSettings } from '$lib/server/db/schema';
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

/**
 * Liveness probe for Docker HEALTHCHECK / uptime monitors. Unauthenticated by
 * design (LAN app) — it exposes nothing but "the app and its DB respond".
 */
export const GET: RequestHandler = () => {
	try {
		db.select().from(appSettings).limit(1).all(); // proves the DB answers
		return json({ ok: true, time: new Date().toISOString() });
	} catch {
		return json({ ok: false }, { status: 503 });
	}
};
