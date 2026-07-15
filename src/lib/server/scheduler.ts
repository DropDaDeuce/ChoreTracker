import { schedule } from 'node-cron';
import { todayLocal } from './dates';
import { db } from './db';
import { generateDueInstances } from './generate';
import { sweepOverdue } from './sweep';

declare global {
	// Guards against double-starting on Vite HMR reloads in dev.
	var __choretrackerSchedulerStarted: boolean | undefined;
}

/**
 * Runs the daily jobs once now (startup catch-up after downtime — a home
 * server sleeps and reboots) and every night at 00:05:
 *   1. materialize upcoming chore instances
 *   2. sweep overdue pending instances to `missed`
 */
export function startScheduler(): void {
	if (globalThis.__choretrackerSchedulerStarted) return;
	globalThis.__choretrackerSchedulerStarted = true;

	const run = (label: string) => {
		try {
			const today = todayLocal();
			const created = generateDueInstances(db, today);
			const missed = sweepOverdue(db, today);
			if (created > 0 || missed > 0) {
				console.log(`[scheduler] ${label}: created ${created}, marked ${missed} missed`);
			}
		} catch (err) {
			console.error(`[scheduler] ${label} failed`, err);
		}
	};

	run('startup catch-up');
	const task = schedule('5 0 * * *', () => run('nightly'));

	// adapter-node closes the HTTP server on SIGINT/SIGTERM and then emits this
	// event; without destroying the cron task its timer keeps the event loop
	// alive and Ctrl+C appears to hang.
	process.once('sveltekit:shutdown', () => {
		task.destroy();
		globalThis.__choretrackerSchedulerStarted = false;
	});
}
