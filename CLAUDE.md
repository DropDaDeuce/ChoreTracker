# ChoreTracker Core Directives

Read at the start of every session. Rules here are law. See `README.md` for the feature list + self-host quickstart, `docs/PLAN.md` for the original design/roadmap, and `ToDo.md` for the live backlog + the dated **Done** log — historical session detail lives THERE, not here. Long-form guides and durable working docs go in `docs/`; ephemeral/throwaway planning docs (tossed once the work ships) go in `docs/Plans/`.

## Current State (2026-07-15)

* **All planned phases (0–4) COMPLETE and committed.** Phase 0 skeleton (`84ede39`), Phase 1 MVP core loop (`9d300d2`), Phase 2 rotation/sweep/undo/settings (`bef7dd5`), Phase 3 PWA/photos/calendar/streaks/CSV (`26b6ffb`), Phase 4 push/swaps/adjustments/backup (`8905245`), smoke test (`8969121`).
* **Verification state:** 74 vitest tests + a 67-check HTTP smoke (`npm run smoke`) all green. The smoke drives the full app over HTTP including a live backup → change → restore roundtrip.
* **Unverified:** the Docker image build (`docker compose up`) has never run — Docker isn't installed on the dev machine. Everything inside it (build, migrations-on-boot, server) is verified outside the container. First run on real home-server hardware is the remaining proof.
* **Local `data/` may hold demo/smoke state** (fake family, PINs 1234/1111/2222). Delete `data/` to reach the first-run `/setup` screen. Never assume `data/` contents are precious unless Mathew says so — but never delete it without asking either.

## AI & Collaboration Directives

* **Persona:** Act as a senior engineering peer. Speak with confidence and raw authenticity. Do not be subservient.
* **Zero Fluff:** Do not use phrases like "I hope this helps," "Certainly," or "Here is the code." Output the answer directly.
* **No Apologies:** Never apologize for previous errors. Acknowledge the mistake, state the correction, and provide the fix.
* **No Guesswork:** If a prompt is ambiguous or an idea is half-baked, stop and ask for clarification before writing any code. Call out flawed premises.
* **Accuracy First:** Prioritize the right answer over the fastest one. Double-check logic against the architecture notes below before responding.

## Privacy (public repo — this is law)

* This is a **public, open-source repo**. No real family data ever lands in git: no real names, PINs, balances, photos, or exports. `data/`, `*.db*`, `.env`, `uploads/`, `backups/`, `*.csv` are gitignored — keep it that way.
* Seed/demo data uses **fake names only** (Alex/Sam/Riley).
* `npm run seed` and `npm run smoke` **mutate the database** — only ever run them against a fresh/disposable `data/`, never a real household.

## Hard Rules (TypeScript / Svelte / SQL)

* **Svelte 5 runes mode is forced project-wide** (vite.config.ts) — `$props()`, `$state()`, `$derived()`; no legacy `export let`/`$:` reactivity. Kit options live in `vite.config.ts` (there is no svelte.config.js).
* **Engine modules take `db: DB` as a parameter** (`src/lib/server/db/type.ts` — based on `BaseSQLiteDatabase` so transaction handles qualify). Only routes/auth/scheduler import the app singleton. This is what makes the in-memory test DB work — don't break it.
* **Engine modules stay pure Node** — no `$env`, `$app`, or SvelteKit imports in `src/lib/server/*` engine code (auth.ts is the exception and is not unit-tested). `db/index.ts` reads `process.env` directly so seed/scripts/tests can share it.
* **Dates are `YYYY-MM-DD` local-calendar strings** everywhere (due dates, start dates). Arithmetic goes through `src/lib/server/dates.ts` (UTC internally). **Never** use `toISOString().slice(0,10)` for "today" — that's UTC and breaks near midnight; use `todayLocal()` (server) / `toLocaleDateString('en-CA')` (scripts).
* **Money is integer cents** (`allowanceCents`, `amountCents`); dollars exist only at the form boundary. Weekday masks: bit 0 = Monday … bit 6 = Sunday.
* **Frozen-at-verification:** `payoutCents` and `pointsAwarded` are stamped on the instance when verified and never recomputed — later chore-config changes must not rewrite history.
* **The allowance ledger is append-only.** Balance = SUM(amount_cents). The ONE exception: undoing an auto-verified mistake deletes its earning row (by design — the ledger reads as if it never happened).
* **Schema changes:** edit `src/lib/server/db/schema.ts`, then `npx drizzle-kit generate --name <slug>`. Never hand-edit generated SQL in `drizzle/` or its `meta/` snapshots. Migrations auto-apply on boot (`hooks.server.ts`, skipped during build).
* **better-sqlite3 is synchronous:** `.all()`/`.get()`/`.run()`, and insert-returning is `.returning().get()` (bare destructuring type-errors). `.run().changes` is how generation detects real inserts.
* **Transactions roll back on throw** — a status write that must survive an intentional throw goes OUTSIDE the transaction (see `acceptSwap`; this bug shipped once already).
* **Validation is zod at the route boundary** (`validation.ts`); services throw `InstanceActionError` with user-facing messages and routes surface them via `fail(400)`.

## Workflow & Verification

* **Verify ladder for any nontrivial change:** `npm run check` (0 errors/warnings) → `npm test` → `npm run build` → for user-facing flows, fresh seed + `npm run smoke` against `node build` (PORT=3010, ORIGIN=http://localhost:3010, BODY_SIZE_LIMIT=10M).
* **Tests live in `tests/`** with `tests/helpers/testDb.ts` (in-memory SQLite + real migrations). New engine logic ships WITH unit tests; new user flows get a smoke check appended to `scripts/smoke.mjs`.
* **Scripted form POSTs need `accept: text/html`** or SvelteKit returns JSON action results instead of HTML + real 303s (bit us in smoke).
* Commit per coherent unit of work with a body that says what was verified. Never commit `data/` or `/Edits`-style scratch — scratch goes in the session scratchpad, not the repo.

## Core Architecture

* **Stack:** SvelteKit 2 (Svelte 5, adapter-node) + Tailwind v4 (`@tailwindcss/vite`, no config file) + Drizzle ORM on better-sqlite3 (WAL, FKs on) + node-cron. One app, one SQLite file (`data/chores.db`), photos in `data/uploads/`.
* **Chore vs ChoreInstance is the backbone:** a Chore is the recurring definition; a ChoreInstance is one dated occurrence (status `pending|done|verified|rejected|skipped|missed`) and carries reminder count, frozen payout/points, photo. `UNIQUE(chore_id, due_date)` is the idempotent-generation guard.
* **Generation (`generate.ts`):** rolling 14-day window for daily/weekly (`ROLLING_WINDOW_DAYS`), next-occurrence-only for monthly/yearly. Insert-or-ignore; **rotation advances only when a row actually inserts** (re-runs never skip turns). Runs nightly 00:05 + on boot (`scheduler.ts`, HMR-guarded via globalThis; the cron task is destroyed on `sveltekit:shutdown` or Ctrl+C hangs — do not remove that handler).
* **Sweep (`sweep.ts`):** pending past `due_date + grace_days` → `missed` (visible, no payout, can't be completed).
* **Presence (`presence.ts` reads / `presenceAdmin.ts` mutations — split to avoid a generate↔presence import cycle):** per-person home/away. Resolution: day override → newest matching rule (weekly / biweekly-with-anchor / monthly, clamped) → default HOME. Generation never schedules an away (or deactivated) person; rotations hand the turn to the next member who IS home; every presence mutation runs `applyPresenceChange` (drops the person's future PENDING instances on away days — freeing the unique chore+date slot for rotation backfill — then regenerates). Streaks are naturally unaffected (away days have no instances). Swap requests refuse targets who are away on the due date.
* **Payout rule (`payout.ts`):** 0 reminders = full, 1 = minus `reminder_penalty_percent` (default 50), 2+ = nothing. Preview is computed live on /verify; the real number freezes at verification.
* **Lifecycle (`instances.ts`):** markDone (assignee or adult; photo required if `requiresPhoto`; auto-finalizes when `!requiresVerification`) → verify/reject (adult) → ledger. Undo: `done` reverts any time; auto-verified reverts within `undo_window_minutes` (unwinds ledger + payout); adult-verified never undoes (reject instead).
* **Auth (`auth.ts`):** profile picker + argon2 PIN; sessions stored as sha256(token), 90-day sliding expiry. Cookies are `secure: false` **by design** (plain-HTTP LAN — browsers drop Secure cookies there). `requireUser`/`requireAdult` guard every load/action; `hooks.server.ts` populates `locals.user`.
* **Settings (`settings.ts`):** key/value `app_settings` with `DEFAULT_SETTINGS` (currency symbol, penalty %, undo window, week start) + the auto-generated VAPID keypair. Currency threads from the root layout load into every `formatCents` call.
* **Push (`push.ts`):** zero-config VAPID (generated into app_settings). `notifyUser` is fire-and-forget — it must never block or fail an action; 404/410 prunes the subscription. Browsers require a secure context (HTTPS or localhost) to subscribe — same caveat as PWA install; the UI hides itself elsewhere.
* **Swaps (`swaps.ts`):** one open request per instance; accept reassigns just that occurrence (rotation state untouched); accepting a no-longer-open chore auto-cancels the request.
* **Photos (`uploads.ts` + `/photos/[name]`):** stored under `data/uploads` with generated names; `PHOTO_NAME_RE` is the path-traversal guard on the auth-gated serving route — keep every photo path through it. Undo/reject delete the file. `BODY_SIZE_LIMIT=10M` required in prod (adapter default 512kb rejects phone photos).
* **Backup/restore (`zipLite.ts` + `/admin/backup`):** download = consistent snapshot via better-sqlite3's online `backup()` + photos, zipped (store-method, dependency-free). Restore validates integrity + the `__drizzle_migrations` table, snapshots live data to `.pre-restore`, restores INTO the running app via the backup API, then re-runs migrations. zipLite writes STORE only, reads STORE + DEFLATE.
* **Calendar:** materialized instances + computed future occurrences from recurrence rules ("planned", rotations shown as TBD). Honors the week-start setting.
* **Streaks/points (`stats.ts`):** streak = consecutive *due-days* fully completed, walking back from today; empty days skip, in-progress today neither counts nor breaks. Points sum `pointsAwarded` on verified instances only.

## Do-Not-Relearn Gotchas

* WV2/Access lessons do NOT apply here — this is a plain Node/SvelteKit app.
* `vite build` must never touch a database: boot-time work is gated on `!building` in hooks.
* Vitest uses its own `vitest.config.ts` (with the `$lib` alias) — it deliberately does NOT load the SvelteKit vite config.
* The scaffold-era `state_referenced_locally` warnings are silenced with `svelte-ignore` comments where the initial-value capture is intentional (form initials, login selection) — don't "fix" those into deriveds.
* `npm audit` shows ~8 vulns living entirely in drizzle-kit's bundled dev-time deps (`@esbuild-kit/*`) — known, not runtime, don't `audit fix --force`.
* Node 24 on the dev box; Docker NOT installed (don't try to run it). Dockerfile pins `node:22-alpine` (Vite 8 needs ≥20.19/22.12 — the plan's original Node 20 floor is stale).

## Run / Deploy

* Dev: `npm run dev` (localhost:5173). Prod-local: `npm run build` then `node build` (port 3000; Ctrl+C exits cleanly). Phone-on-LAN dev: `npm run dev -- --host`.
* Home server: `docker compose up -d` — `./data` volume is the entire household state; backup = copy that folder or use `/admin/backup`.
* Full PWA install + push need HTTPS (or localhost). On plain-HTTP LAN they degrade to a home-screen shortcut and hidden push UI — that's expected, not a bug.
