import { schedule } from 'node-cron';
import { todayLocal } from './dates';
import { db } from './db';
import { generateDueInstances } from './generate';

declare global {
	// Guards against double-starting on Vite HMR reloads in dev.
	var __choretrackerSchedulerStarted: boolean | undefined;
}

/**
 * Runs instance generation once now (startup catch-up after downtime — a home
 * server sleeps and reboots) and every night at 00:05.
 */
export function startScheduler(): void {
	if (globalThis.__choretrackerSchedulerStarted) return;
	globalThis.__choretrackerSchedulerStarted = true;

	const run = (label: string) => {
		try {
			const created = generateDueInstances(db, todayLocal());
			if (created > 0) console.log(`[scheduler] ${label}: created ${created} chore instance(s)`);
		} catch (err) {
			console.error(`[scheduler] ${label} failed`, err);
		}
	};

	run('startup catch-up');
	schedule('5 0 * * *', () => run('nightly'));
}
