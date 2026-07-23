// E2E web server launcher: wipe + seed the scratch database, then run the
// built app. Doing all three here (instead of playwright globalSetup) makes
// the ordering structural — Playwright boots the webServer before global
// setup runs, so a setup-time wipe races the server's own DB handle.
import { execSync, spawn } from 'node:child_process';
import { existsSync, rmSync } from 'node:fs';

const dbPath = process.env.DATABASE_PATH ?? '.playwright/data/chores.db';

if (existsSync('.playwright')) rmSync('.playwright', { recursive: true, force: true });
execSync('npm run seed', {
	env: { ...process.env, DATABASE_PATH: dbPath },
	stdio: 'inherit',
	shell: true
});

const server = spawn('node', ['build'], { stdio: 'inherit', shell: true });
server.on('exit', (code) => process.exit(code ?? 0));
