/**
 * ChoreTracker server admin CLI.
 *
 *   npm run admin -- status                  household + database overview
 *   npm run admin -- list-users              everyone, with role/active/balance
 *   npm run admin -- reset-pin <name> [pin]  rescue a forgotten PIN (random if omitted)
 *   npm run admin -- backup [dir]            write a backup zip (default data/backups)
 *   npm run admin -- prune-backups [keep]    keep newest N backups (default 14)
 *   npm run admin -- checkpoint              shrink the SQLite WAL file
 *   npm run admin -- doctor                  health diagnostics (exit 1 on failures)
 *
 * Safe to run while the server is up (WAL mode; the backup uses SQLite's
 * online backup API).
 */
import { hash } from '@node-rs/argon2';
import { randomInt } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, statSync, statfsSync } from 'node:fs';
import { join } from 'node:path';
import { and, asc, eq, lt, sql, type SQL } from 'drizzle-orm';
import type { SQLiteTable } from 'drizzle-orm/sqlite-core';
import { backupsDir, pruneBackups, writeBackupFile } from '../src/lib/server/backup';
import { todayLocal } from '../src/lib/server/dates';
import { databasePath, db, sqlite } from '../src/lib/server/db';
import { runMigrations } from '../src/lib/server/db/migrate';
import {
	allowanceLedger,
	choreAssignees,
	choreInstances,
	chores,
	pushSubscriptions,
	users
} from '../src/lib/server/db/schema';
import { balanceCents } from '../src/lib/server/instances';
import { formatCents } from '../src/lib/money';
import { DEFAULT_SETTINGS, getSettingOr } from '../src/lib/server/settings';
import { uploadsDir } from '../src/lib/server/uploads';

function count(table: SQLiteTable, where?: SQL): number {
	const q = db.select({ n: sql<number>`count(*)` }).from(table);
	return (where ? q.where(where) : q).get()?.n ?? 0;
}

function kb(bytes: number): string {
	return bytes >= 1024 * 1024
		? `${(bytes / 1024 / 1024).toFixed(1)} MB`
		: `${Math.round(bytes / 1024)} KB`;
}

function fileSize(path: string): number {
	return existsSync(path) ? statSync(path).size : 0;
}

// ── commands ────────────────────────────────────────────────────────────────

function cmdStatus(): void {
	const currency = getSettingOr(db, 'currency_symbol');
	console.log(`ChoreTracker status — ${new Date().toLocaleString()}`);
	console.log(`  database   ${databasePath} (${kb(fileSize(databasePath))}, WAL ${kb(fileSize(databasePath + '-wal'))})`);

	const activeUsers = count(users, eq(users.isActive, true));
	const adults = count(users, and(eq(users.isActive, true), eq(users.role, 'adult')));
	console.log(`  people     ${activeUsers} active (${adults} adult) of ${count(users)} total`);
	console.log(`  chores     ${count(chores, eq(chores.isActive, true))} active of ${count(chores)} total`);

	const statuses = db
		.select({ status: choreInstances.status, n: sql<number>`count(*)` })
		.from(choreInstances)
		.groupBy(choreInstances.status)
		.all();
	console.log(`  instances  ${statuses.map((s) => `${s.status}:${s.n}`).join('  ') || 'none'}`);
	console.log(`  verify queue: ${count(choreInstances, eq(choreInstances.status, 'done'))} waiting`);

	const kids = db
		.select({ id: users.id, name: users.name })
		.from(users)
		.where(and(eq(users.role, 'kid'), eq(users.isActive, true)))
		.orderBy(asc(users.name))
		.all();
	for (const kid of kids) {
		console.log(`  balance    ${kid.name}: ${formatCents(balanceCents(db, kid.id), currency)}`);
	}

	console.log(`  push subs  ${count(pushSubscriptions)}`);
	console.log(
		`  settings   ${Object.keys(DEFAULT_SETTINGS)
			.map((k) => `${k}=${getSettingOr(db, k as keyof typeof DEFAULT_SETTINGS)}`)
			.join('  ')}`
	);

	const backups = existsSync(backupsDir)
		? readdirSync(backupsDir).filter((f) => f.endsWith('.zip')).sort()
		: [];
	console.log(
		`  backups    ${backups.length} in ${backupsDir}` +
			(backups.length ? ` (newest: ${backups[backups.length - 1]})` : '')
	);
}

function cmdListUsers(): void {
	const currency = getSettingOr(db, 'currency_symbol');
	for (const u of db.select().from(users).orderBy(asc(users.name)).all()) {
		const balance = u.role === 'kid' ? `  balance ${formatCents(balanceCents(db, u.id), currency)}` : '';
		console.log(
			`  #${u.id}  ${u.name.padEnd(20)} ${u.role.padEnd(6)} ${u.isActive ? 'active' : 'INACTIVE'}${balance}`
		);
	}
}

async function cmdResetPin(name?: string, pin?: string): Promise<void> {
	if (!name) throw new Error('Usage: reset-pin <name> [pin]');
	const matches = db
		.select()
		.from(users)
		.all()
		.filter((u) => u.name.toLowerCase() === name.toLowerCase());
	if (matches.length === 0) throw new Error(`No user named "${name}". Try: npm run admin -- list-users`);
	if (matches.length > 1) throw new Error(`Multiple users named "${name}" — rename one first.`);

	const newPin = pin ?? String(randomInt(0, 10000)).padStart(4, '0');
	if (!/^\d{4,6}$/.test(newPin)) throw new Error('PIN must be 4–6 digits.');

	db.update(users)
		.set({ pinHash: await hash(newPin) })
		.where(eq(users.id, matches[0].id))
		.run();
	console.log(`PIN for ${matches[0].name} is now: ${newPin}`);
	console.log('(Existing logins stay valid; this only changes future logins.)');
}

async function cmdBackup(dir?: string): Promise<void> {
	const { path, bytes } = await writeBackupFile(dir);
	console.log(`Backup written: ${path} (${kb(bytes)})`);
}

function cmdPruneBackups(keepArg?: string): void {
	const keep = keepArg ? Number(keepArg) : 14;
	if (!Number.isInteger(keep) || keep < 0) throw new Error('keep must be a non-negative integer');
	const removed = pruneBackups(keep);
	console.log(`Pruned ${removed} backup(s); keeping newest ${keep} in ${backupsDir}`);
}

function cmdCheckpoint(): void {
	const before = fileSize(databasePath + '-wal');
	sqlite.pragma('wal_checkpoint(TRUNCATE)');
	console.log(`WAL checkpoint done: ${kb(before)} -> ${kb(fileSize(databasePath + '-wal'))}`);
}

function cmdDoctor(): void {
	let failures = 0;
	const report = (ok: boolean, label: string, detail = '') => {
		console.log(`${ok ? 'OK   ' : 'FAIL '} ${label}${detail ? ` — ${detail}` : ''}`);
		if (!ok) failures++;
	};
	const info = (label: string, detail: string) => console.log(`info  ${label} — ${detail}`);

	const [major, minor] = process.versions.node.split('.').map(Number);
	const nodeOk = (major === 20 && minor >= 19) || major === 21 || (major === 22 && minor >= 12) || major >= 23;
	report(nodeOk, `Node ${process.versions.node}`, 'needs >=20.19 / >=22.12');

	report(existsSync(databasePath), `database file ${databasePath}`);
	const integrity = sqlite.pragma('integrity_check', { simple: true });
	report(integrity === 'ok', 'SQLite integrity_check', String(integrity));

	// Migrations: applied count vs the repo's journal.
	try {
		const journal = JSON.parse(readFileSync(join('drizzle', 'meta', '_journal.json'), 'utf8'));
		const available = journal.entries?.length ?? 0;
		const applied =
			(sqlite.prepare('SELECT count(*) AS n FROM __drizzle_migrations').get() as { n: number }).n;
		report(applied >= available, 'migrations', `${applied} applied / ${available} in repo`);
	} catch {
		info('migrations', 'journal not readable from this working directory (run from the repo root)');
	}

	const activeAdults = count(users, and(eq(users.isActive, true), eq(users.role, 'adult')));
	report(activeAdults >= 1 || count(users) === 0, 'at least one active adult',
		activeAdults === 0 && count(users) > 0 ? 'LOCKOUT RISK — use reset-pin / reactivate an adult' : `${activeAdults}`);

	// Active chores nobody is assigned to never generate instances.
	const unassigned = db
		.select({ id: chores.id, title: chores.title })
		.from(chores)
		.where(eq(chores.isActive, true))
		.all()
		.filter((c) => count(choreAssignees, eq(choreAssignees.choreId, c.id)) === 0);
	report(unassigned.length === 0, 'all active chores have assignees',
		unassigned.length ? unassigned.map((c) => c.title).join(', ') : '');

	// Photo bookkeeping: referenced-but-missing is a real problem; orphans are just wasted disk.
	const referenced = new Set(
		db.select({ photoPath: choreInstances.photoPath }).from(choreInstances).all()
			.map((r) => r.photoPath)
			.filter(Boolean) as string[]
	);
	const onDisk = existsSync(uploadsDir) ? readdirSync(uploadsDir) : [];
	const missing = [...referenced].filter((f) => !onDisk.includes(f));
	report(missing.length === 0, 'referenced photos exist on disk', missing.join(', '));
	const orphans = onDisk.filter((f) => !referenced.has(f));
	if (orphans.length) info('orphan photos', `${orphans.length} file(s) in uploads no instance references`);

	const walBytes = fileSize(databasePath + '-wal');
	report(walBytes < 20 * 1024 * 1024, 'WAL size', `${kb(walBytes)}${walBytes >= 20 * 1024 * 1024 ? ' — run: npm run admin -- checkpoint' : ''}`);

	try {
		const fs = statfsSync(databasePath);
		const freeBytes = fs.bavail * fs.bsize;
		report(freeBytes > 500 * 1024 * 1024, 'disk free', `${(freeBytes / 1024 / 1024 / 1024).toFixed(1)} GB`);
	} catch {
		info('disk free', 'not measurable on this platform');
	}

	const utcToday = new Date().toISOString().slice(0, 10);
	info('server date', `local ${todayLocal()} (UTC ${utcToday}, TZ=${process.env.TZ ?? Intl.DateTimeFormat().resolvedOptions().timeZone})${todayLocal() !== utcToday ? ' — local/UTC differ right now; chores follow LOCAL' : ''}`);
	info('verify queue', `${count(choreInstances, eq(choreInstances.status, 'done'))} waiting`);
	info('overdue pending', `${count(choreInstances, and(eq(choreInstances.status, 'pending'), lt(choreInstances.dueDate, todayLocal())))} (nightly sweep applies grace days)`);
	info('ledger rows', String(count(allowanceLedger)));

	console.log(failures === 0 ? '\nAll checks passed.' : `\n${failures} check(s) FAILED.`);
	process.exitCode = failures === 0 ? 0 : 1;
}

// ── dispatch ────────────────────────────────────────────────────────────────

async function main() {
	runMigrations(); // keep CLI views consistent with the app's schema
	const [command, ...args] = process.argv.slice(2);
	switch (command) {
		case 'status':          return cmdStatus();
		case 'list-users':      return cmdListUsers();
		case 'reset-pin':       return cmdResetPin(args[0], args[1]);
		case 'backup':          return cmdBackup(args[0]);
		case 'prune-backups':   return cmdPruneBackups(args[0]);
		case 'checkpoint':      return cmdCheckpoint();
		case 'doctor':          return cmdDoctor();
		default:
			console.log('Commands: status | list-users | reset-pin <name> [pin] | backup [dir] | prune-backups [keep] | checkpoint | doctor');
			process.exitCode = command ? 1 : 0;
	}
}

main().catch((err) => {
	console.error(String(err instanceof Error ? err.message : err));
	process.exitCode = 1;
});
