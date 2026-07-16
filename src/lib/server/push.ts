import { eq } from 'drizzle-orm';
import webpush from 'web-push';
import { pushSubscriptions } from './db/schema';
import type { DB } from './db/type';
import { getSetting, setSetting } from './settings';

/**
 * Web Push, self-contained: VAPID keys are generated on first use and stored
 * in app_settings, so there's nothing to configure. Browsers only allow push
 * over HTTPS (or localhost) — the client hides the UI elsewhere.
 */

const VAPID_PUBLIC_KEY = 'vapid_public_key';
const VAPID_PRIVATE_KEY = 'vapid_private_key';

let configured = false;

export function getVapidPublicKey(db: DB): string {
	let publicKey = getSetting(db, VAPID_PUBLIC_KEY);
	let privateKey = getSetting(db, VAPID_PRIVATE_KEY);
	if (!publicKey || !privateKey) {
		const keys = webpush.generateVAPIDKeys();
		publicKey = keys.publicKey;
		privateKey = keys.privateKey;
		setSetting(db, VAPID_PUBLIC_KEY, publicKey);
		setSetting(db, VAPID_PRIVATE_KEY, privateKey);
		configured = false;
	}
	if (!configured) {
		webpush.setVapidDetails('mailto:choretracker@localhost', publicKey, privateKey);
		configured = true;
	}
	return publicKey;
}

export function saveSubscription(
	db: DB,
	userId: number,
	sub: { endpoint: string; keys: { p256dh: string; auth: string } }
): void {
	db.insert(pushSubscriptions)
		.values({ userId, endpoint: sub.endpoint, p256dh: sub.keys.p256dh, auth: sub.keys.auth })
		.onConflictDoUpdate({
			target: pushSubscriptions.endpoint,
			set: { userId, p256dh: sub.keys.p256dh, auth: sub.keys.auth }
		})
		.run();
}

export function removeSubscription(db: DB, endpoint: string): void {
	db.delete(pushSubscriptions).where(eq(pushSubscriptions.endpoint, endpoint)).run();
}

export interface PushPayload {
	title: string;
	body: string;
	url?: string;
}

/**
 * Fire-and-forget: never blocks or fails the action that triggered it.
 * Dead subscriptions (410/404) are pruned as they're discovered.
 */
export function notifyUser(db: DB, userId: number, payload: PushPayload): void {
	const subs = db
		.select()
		.from(pushSubscriptions)
		.where(eq(pushSubscriptions.userId, userId))
		.all();
	if (subs.length === 0) return;

	getVapidPublicKey(db); // ensures VAPID details are configured

	const json = JSON.stringify(payload);
	for (const sub of subs) {
		webpush
			.sendNotification(
				{ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
				json
			)
			.catch((err: { statusCode?: number }) => {
				if (err.statusCode === 404 || err.statusCode === 410) {
					removeSubscription(db, sub.endpoint);
				} else {
					console.error('[push] send failed', err.statusCode ?? err);
				}
			});
	}
}
