import { hash, verify } from '@node-rs/argon2';
import { error, redirect } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { createHash, randomBytes } from 'node:crypto';
import { db } from './db';
import { sessions, users } from './db/schema';

export const SESSION_COOKIE = 'session';
const SESSION_LIFETIME_MS = 90 * 24 * 60 * 60 * 1000; // 90 days — family devices on the LAN
// Kiosk visits are brief by design; the short expiry is the backstop if the
// idle auto-return never fires (tablet crashed mid-visit).
const KIOSK_VISIT_LIFETIME_MS = 24 * 60 * 60 * 1000;

/** What the rest of the app sees as "the logged-in person" (locals.user). */
export interface SessionUser {
	id: number;
	name: string;
	role: 'adult' | 'kid';
	avatarColor: string;
	/** Locked family-board session: only /board works until someone PINs in. */
	kiosk: boolean;
	/** Face-tap login from a locked board — returns there when done/idle. */
	kioskVisit: boolean;
}

export function hashPin(pin: string): Promise<string> {
	return hash(pin);
}

export function verifyPin(pinHash: string, pin: string): Promise<boolean> {
	return verify(pinHash, pin).catch(() => false);
}

/** Sessions are keyed by sha256(token): a leaked DB can't forge cookies. */
function tokenId(token: string): string {
	return createHash('sha256').update(token).digest('hex');
}

export function createSession(
	userId: number,
	kind: 'user' | 'kiosk' | 'kiosk_visit' = 'user'
): { token: string; expiresAt: Date } {
	const token = randomBytes(32).toString('base64url');
	const lifetime = kind === 'kiosk_visit' ? KIOSK_VISIT_LIFETIME_MS : SESSION_LIFETIME_MS;
	const expiresAt = new Date(Date.now() + lifetime);
	db.insert(sessions).values({ id: tokenId(token), userId, kind, expiresAt }).run();
	return { token, expiresAt };
}

export function validateSessionToken(token: string): SessionUser | null {
	const row = db
		.select({ session: sessions, user: users })
		.from(sessions)
		.innerJoin(users, eq(sessions.userId, users.id))
		.where(eq(sessions.id, tokenId(token)))
		.get();
	if (!row) return null;

	if (row.session.expiresAt.getTime() <= Date.now() || !row.user.isActive) {
		db.delete(sessions).where(eq(sessions.id, row.session.id)).run();
		return null;
	}

	// Sliding renewal: extend once less than half the lifetime remains.
	// Per-kind lifetime — renewing a 24h kiosk visit with the 90-day span
	// would quietly turn a visit into a permanent session.
	const lifetime =
		row.session.kind === 'kiosk_visit' ? KIOSK_VISIT_LIFETIME_MS : SESSION_LIFETIME_MS;
	if (row.session.expiresAt.getTime() - Date.now() < lifetime / 2) {
		db.update(sessions)
			.set({ expiresAt: new Date(Date.now() + lifetime) })
			.where(eq(sessions.id, row.session.id))
			.run();
	}

	const { id, name, role, avatarColor } = row.user;
	return {
		id,
		name,
		role,
		avatarColor,
		kiosk: row.session.kind === 'kiosk',
		kioskVisit: row.session.kind === 'kiosk_visit'
	};
}

export function destroySession(token: string): void {
	db.delete(sessions).where(eq(sessions.id, tokenId(token))).run();
}

/**
 * Cookie options for the session. `secure: false` is deliberate: the app is
 * served over plain http on a home LAN (http://pi.local:3000), where browsers
 * would silently drop a Secure cookie.
 */
export const SESSION_COOKIE_OPTIONS = {
	path: '/',
	httpOnly: true,
	sameSite: 'lax',
	secure: false
} as const;

/** Route guard: must be logged in, else back to the profile picker. */
export function requireUser(locals: App.Locals): SessionUser {
	if (!locals.user) redirect(303, '/');
	// A locked kiosk session sees exactly one page: the board. Typing URLs
	// on the wall tablet gets you right back there.
	if (locals.user.kiosk) redirect(303, '/board');
	return locals.user;
}

/** Route guard: must be a logged-in adult. */
export function requireAdult(locals: App.Locals): SessionUser {
	const user = requireUser(locals);
	if (user.role !== 'adult') error(403, 'Adults only.');
	return user;
}
