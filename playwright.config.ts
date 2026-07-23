import { defineConfig } from '@playwright/test';

/**
 * Thin browser layer over the flows the HTTP smoke can't see: real clicks
 * through the PIN pad, enhance-driven forms, and the presence calendar
 * (both of this week's UI-only bugs lived there).
 *
 * Runs against its OWN database (.playwright/data — wiped and reseeded by
 * global-setup) on its own port, so it never touches data/ or a dev server.
 *
 *   npm run build && npm run e2e
 */
export default defineConfig({
	testDir: 'e2e',
	workers: 1, // tests share one seeded household; keep them sequential
	timeout: 30_000,
	use: {
		baseURL: 'http://127.0.0.1:3011'
	},
	webServer: {
		// Wipes + reseeds .playwright/data, then serves the built app (the
		// launcher owns the ordering — see e2e/start-server.mjs).
		command: 'node e2e/start-server.mjs',
		url: 'http://127.0.0.1:3011/healthz',
		reuseExistingServer: false,
		timeout: 30_000,
		env: {
			PORT: '3011',
			DATABASE_PATH: '.playwright/data/chores.db',
			BODY_SIZE_LIMIT: '10M'
		}
	}
});
