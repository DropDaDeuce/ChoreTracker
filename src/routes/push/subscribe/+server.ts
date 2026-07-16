import { requireUser } from '$lib/server/auth';
import { db } from '$lib/server/db';
import { removeSubscription, saveSubscription } from '$lib/server/push';
import { error, json } from '@sveltejs/kit';
import { z } from 'zod';
import type { RequestHandler } from './$types';

const subscriptionSchema = z.object({
	endpoint: z.url(),
	keys: z.object({ p256dh: z.string().min(1), auth: z.string().min(1) })
});

export const POST: RequestHandler = async ({ locals, request }) => {
	const user = requireUser(locals);
	const parsed = subscriptionSchema.safeParse(await request.json().catch(() => null));
	if (!parsed.success) error(400, 'Invalid subscription');
	saveSubscription(db, user.id, parsed.data);
	return json({ ok: true });
};

export const DELETE: RequestHandler = async ({ locals, request }) => {
	requireUser(locals);
	const body = (await request.json().catch(() => null)) as { endpoint?: string } | null;
	if (!body?.endpoint) error(400, 'Missing endpoint');
	removeSubscription(db, body.endpoint);
	return json({ ok: true });
};
