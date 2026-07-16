/// <reference types="@sveltejs/kit" />
/// <reference lib="webworker" />

// Makes the app installable and instant-loading on the home screen.
// Static build assets are cached forever (they're content-hashed); pages go
// network-first so live chore data is never stale, with a cache fallback so
// an installed app still opens if the home server is briefly down.
import { build, files, version } from '$service-worker';

const sw = self as unknown as ServiceWorkerGlobalScope;
const CACHE = `choretracker-${version}`;
const ASSETS = [...build, ...files];

sw.addEventListener('install', (event) => {
	event.waitUntil(
		caches
			.open(CACHE)
			.then((cache) => cache.addAll(ASSETS))
			.then(() => sw.skipWaiting())
	);
});

sw.addEventListener('activate', (event) => {
	event.waitUntil(
		caches
			.keys()
			.then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
			.then(() => sw.clients.claim())
	);
});

sw.addEventListener('push', (event) => {
	let data: { title?: string; body?: string; url?: string } = {};
	try {
		data = event.data?.json() ?? {};
	} catch {
		// Malformed payload — show a generic nudge instead of nothing.
	}
	event.waitUntil(
		sw.registration.showNotification(data.title ?? 'ChoreTracker', {
			body: data.body ?? '',
			icon: '/icons/icon-192.png',
			badge: '/icons/icon-192.png',
			data: { url: data.url ?? '/' }
		})
	);
});

sw.addEventListener('notificationclick', (event) => {
	event.notification.close();
	const url = (event.notification.data as { url?: string })?.url ?? '/';
	event.waitUntil(
		sw.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
			const existing = clients.find((c) => 'focus' in c);
			return existing ? existing.focus().then((c) => c.navigate?.(url)) : sw.clients.openWindow(url);
		})
	);
});

sw.addEventListener('fetch', (event) => {
	if (event.request.method !== 'GET') return;
	const url = new URL(event.request.url);
	if (url.origin !== location.origin) return;
	// Proof photos are auth-gated and personal — never cache them.
	if (url.pathname.startsWith('/photos/')) return;

	event.respondWith(
		(async () => {
			const cache = await caches.open(CACHE);

			if (ASSETS.includes(url.pathname)) {
				const cached = await cache.match(url.pathname);
				if (cached) return cached;
			}

			try {
				const response = await fetch(event.request);
				if (response.ok && response.type === 'basic') {
					cache.put(event.request, response.clone());
				}
				return response;
			} catch (err) {
				const cached = await cache.match(event.request);
				if (cached) return cached;
				throw err;
			}
		})()
	);
});
