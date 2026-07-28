import { schedule } from 'node-cron';
import { settleDueWeeks } from './allowance';
import { pruneBackups, writeBackupFile } from './backup';
import { todayLocal } from './dates';
import { db } from './db';
import { generateDueInstances } from './generate';
import { BACKUP_KEEP_COUNT_KEY, getSettingInt } from './settings';
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
 *   3. settle any allowance week that has closed and cleared its grace period
 *   4. (nightly only) write an automatic backup + prune old ones
 *
 * The sweep runs BEFORE settlement so a week is only ever paid once its
 * unfinished chores have been marked missed — otherwise they'd still look
 * open and be counted as "still winnable" at the moment the week is closed.
 */
export function startScheduler(): void {
	if (globalThis.__choretrackerSchedulerStarted) return;
	globalThis.__choretrackerSchedulerStarted = true;

	const run = (label: string) => {
		try {
			const today = todayLocal();
			const created = generateDueInstances(db, today);
			const missed = sweepOverdue(db, today);
			const settled = settleDueWeeks(db, today);
			if (created > 0 || missed > 0 || settled > 0) {
				console.log(
					`[scheduler] ${label}: created ${created}, marked ${missed} missed` +
						(settled > 0 ? `, settled ${settled} allowance week(s)` : '')
				);
			}
		} catch (err) {
			console.error(`[scheduler] ${label} failed`, err);
		}
	};

	const autoBackup = async () => {
		try {
			const keep = getSettingInt(db, BACKUP_KEEP_COUNT_KEY, 14);
			if (keep <= 0) return; // disabled in settings
			const { path, bytes } = await writeBackupFile();
			const pruned = pruneBackups(keep);
			console.log(
				`[scheduler] nightly backup: ${path} (${Math.round(bytes / 1024)} KB)` +
					(pruned > 0 ? `, pruned ${pruned} old` : '')
			);
		} catch (err) {
			console.error('[scheduler] nightly backup failed', err);
		}
	};

	run('startup catch-up');
	const task = schedule('5 0 * * *', () => {
		run('nightly');
		void autoBackup();
	});

	// adapter-node closes the HTTP server on SIGINT/SIGTERM and then emits this
	// event; without destroying the cron task its timer keeps the event loop
	// alive and Ctrl+C appears to hang.
	process.once('sveltekit:shutdown', () => {
		task.destroy();
		globalThis.__choretrackerSchedulerStarted = false;
	});
}
