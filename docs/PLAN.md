# ChoreTracker — Implementation Plan

## Context

Building a **self-hosted household chore tracker** web app to run on a local home
server (Raspberry Pi, mini-PC, or an always-on machine) and be used by the whole
family from phones/tablets/laptops on the home LAN.

The goal is a feature-rich app that:
1. Organizes chores by frequency (Yearly / Monthly / Weekly / Daily).
2. Lets chores be assigned to a fixed person **or** rotate through a defined pool.
3. Lets people mark their chores done.
4. Runs a **kids' allowance** system: kid marks done → adult verifies → payout.
   Reminders reduce the payout (1 reminder = half, 2+ reminders = nothing).
5. Is a **public, open-source repo** (MIT licensed) with legal boilerplate and a
   `.gitignore` that keeps all personal/family data out of source control.

Decisions locked with the user:
- **Stack:** Node + TypeScript (SvelteKit full-stack app).
- **License:** MIT.
- **Auth:** Profile picker + PIN (kid-friendly), role-gated adult actions.

The repo started empty (fresh `git init` on branch
`claude/household-chore-tracker-ezw0kk`) — this is a greenfield build.

---

## Tech Stack

One monolithic TypeScript app, shipped as a single Docker image. No cloud, no
external services.

| Concern | Choice | Why |
|---|---|---|
| Runtime | Node.js 20 LTS | Runs fine on a Pi 4/5 |
| Framework | **SvelteKit** (Node adapter) | One codebase = API + UI; compiles to minimal JS; SSR + form actions; snappy on phones |
| DB | **SQLite** via `better-sqlite3` | Zero-config, single file, trivial backup (copy one file) |
| ORM / migrations | **Drizzle ORM** + `drizzle-kit` | Type-safe schema, SQLite-first, generates SQL migrations |
| Auth | Signed HTTP-only session cookies + `sessions` table | LAN-simple, no OAuth |
| PIN hashing | `@node-rs/argon2` | Never store plaintext PINs |
| Scheduling | `node-cron` in-process | Daily recurrence generation + overdue sweep |
| Styling | Tailwind CSS | Mobile-first responsive UI |
| PWA | `@vite-pwa/sveltekit` | Installable "app" on phones |
| Validation | `zod` | Shared form/API validation |
| Tests | `vitest` + `@playwright/test` | Unit + E2E |

---

## Data Model (Drizzle / SQLite)

Key design principle: a **Chore** is a recurring *definition*; a **ChoreInstance**
is a single dated occurrence — that's what gets marked done, verified, and carries
the reminder count + payout. This split is the backbone of recurrence and the
allowance ledger.

- **users** — `id, name, role ('adult'|'kid'), pin_hash, avatar_color, is_active, created_at`
- **sessions** — `id (token), user_id, expires_at`
- **chores** — `id, title, description, frequency ('daily'|'weekly'|'monthly'|'yearly'),
  interval, weekday_mask, day_of_month, month_of_year, points, allowance_cents,
  assignment_type ('fixed'|'rotating'), requires_verification, requires_photo,
  grace_days, is_active, created_at`
- **chore_assignees** — `id, chore_id, user_id, position` (the single fixed assignee
  **or** the ordered rotation pool)
- **chore_rotation_state** — `chore_id (pk), last_position`
- **chore_instances** — `id, chore_id, assignee_id, due_date, status
  ('pending'|'done'|'verified'|'rejected'|'skipped'|'missed'), reminder_count,
  done_at, done_by, verified_at, verified_by, photo_path, payout_cents, note,
  created_at` with **`UNIQUE(chore_id, due_date)`** (idempotent generation guard)
- **reminders** — `id, instance_id, reminded_by, created_at`
- **allowance_ledger** (append-only) — `id, user_id, instance_id (nullable),
  type ('earning'|'bonus'|'penalty'|'payout'), amount_cents (+earn/-payout), note,
  created_by, created_at`
- **swap_requests** (value-add) — `id, instance_id, from_user, to_user, status, created_at`
- **app_settings** — `key, value` (currency symbol, week start, reminder penalty %, etc.)

**Payout rule** (computed & frozen at verification, written as an `earning` ledger row):
```
reminder_count >= 2  -> payout = 0
reminder_count == 1  -> payout = allowance_cents / 2   (percentage configurable)
otherwise            -> payout = allowance_cents
```
Kid balance = `SUM(amount_cents)` in the ledger.

---

## Recurrence & Rotation Engine

**Scheduled generation + lazy catch-up** — robust to a Pi that sleeps/reboots.
- `node-cron` runs `generateDueInstances(today)` daily (~00:05) **and once on app
  startup** (catch-up after downtime).
- Materialize a rolling window (today + ~14 days for daily/weekly; next occurrence
  for monthly/yearly) to keep the dashboard/calendar populated without creating
  years of rows.
- **Idempotent:** `INSERT OR IGNORE` + the `UNIQUE(chore_id, due_date)` constraint
  make re-runs harmless.

Due-date math per frequency: `daily` every N days; `weekly` per set bit in
`weekday_mask` (supports Mon+Thu); `monthly` `day_of_month` clamped to month length;
`yearly` `month_of_year` + `day_of_month`.

**Rotation** resolved at generation time: read `last_position`, pick
`(last_position + 1) mod poolSize`, set `assignee_id`, advance `last_position`.
Resolving at creation (not display) keeps assignments stable and preserves history
even if the pool later changes.

**Overdue sweep:** daily job marks `pending` instances past `due_date + grace_days`
as `missed` (stays visible, no payout).

---

## Auth (family-friendly, LAN)

- **Profile picker** home screen: big colored tiles with names/avatars — no
  username typing.
- Tap a profile → **numeric PIN pad** → verified against `pin_hash` (argon2) →
  create `sessions` row + signed HTTP-only cookie.
- **Role gating (server-side `requireAdult()` on every admin mutation):**
  - *Kid:* view own chores, mark done, upload photo, view earnings, request swaps.
  - *Adult:* all of the above **plus** verify/reject, add reminders, CRUD chores &
    rotations, manage users/PINs, record payouts, apply bonuses/penalties.
- **Bootstrap:** first run with zero users → "create first adult" screen.

---

## Core Screens / Flows

1. `/` — profile picker + PIN.
2. `/dashboard` — "Today": my due/overdue chores, big check-off buttons,
   points/earnings snapshot, streak badge.
3. `/chores/mine` — tabs Daily/Weekly/Monthly/Yearly.
4. **Mark-done** — tap done → optional proof photo → status `done` (auto-complete
   if no verification required).
5. `/verify` (adult) — queue of `done` instances; Verify / Reject / "+ Reminder"
   (increments counter, shows recomputed payout preview). Verifying writes the ledger.
6. `/earnings` (kid) — balance, this-period earnings, per-chore breakdown with reason
   ("reminded once → half"), payout history.
7. `/admin/chores` (adult) — CRUD, recurrence fields, points/allowance, assignment
   type, rotation pool + order.
8. `/admin/users` (adult) — add members, role/PIN/color, reorder rotation pools.
9. `/calendar` — month grid color-coded per person.
10. **Payout screen** (adult) — per kid, "pay out balance" writes a negative `payout`
    ledger row, with a summary receipt.

---

## Open-Source / Repo Hygiene

- **LICENSE** — MIT (year 2026, user as copyright holder).
- **README.md** — what it is, screenshots, feature list, self-host/Docker quickstart,
  backup instructions, contributing note.
- **`.gitignore`** — keep **all personal data out of the public repo**:
  - `data/` (SQLite DB + uploaded photos), `*.db`, `*.db-wal`, `*.db-shm`
  - `.env`, `.env.*` (secrets, session key)
  - `node_modules/`, `build/`, `.svelte-kit/`, coverage/test artifacts
  - OS/editor cruft (`.DS_Store`, `.vscode/` optional)
- **`.env.example`** — documents required vars (`DATABASE_PATH`, `SESSION_SECRET`,
  `ORIGIN`) with placeholder values, safe to commit.
- Optional: `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, MIT-consistent headers, a
  `LICENSE`-referencing footer.
- **Seed data uses fake demo names** (never commit real family names/PINs).

---

## Build Phasing

**Phase 0 — Skeleton:** SvelteKit + Tailwind + Drizzle + SQLite wired; Docker builds;
migrations run on boot; MIT LICENSE, README, `.gitignore`, `.env.example` in place.

**Phase 1 — MVP (core loop, covers requirements 1–4):** users + profile picker + PIN
+ sessions; chore CRUD (all frequencies, fixed assignment, points + allowance);
recurrence engine + cron + startup catch-up; dashboard "today" + mark-done; adult
verification queue with reminder counter + payout; allowance ledger + earnings view +
payout.

**Phase 2 — Rotation & polish:** rotating assignment + pool management;
chores-by-frequency tabs; overdue sweep; edit/undo window on mark-done; settings
(currency, week start, reminder penalty %).

**Phase 3 — UX / value-add:** PWA install; photo proof; calendar view; streaks +
points/leaderboard; payout-period summaries + CSV export.

**Phase 4 — Nice-to-have:** Web Push reminders (a parent's "remind" also bumps the
counter — ties notifications to the allowance mechanic); swap requests; bonuses/
penalties UI; backup/restore button.

---

## Project Structure

```
ChoreTracker/
  src/
    lib/server/
      db/{schema.ts, index.ts, migrate.ts}
      auth.ts          # session cookies, requireUser/requireAdult
      recurrence.ts    # due-date math per frequency
      rotation.ts      # next-assignee logic
      generate.ts      # generateDueInstances(window) - idempotent
      payout.ts        # reminder->payout rule, ledger writes
      scheduler.ts     # node-cron: daily gen + overdue sweep
    lib/components/     # ChoreCard, PinPad, etc.
    routes/            # +page/+page.server.ts per screen above
    hooks.server.ts    # attach user from session cookie
    app.css
  drizzle/             # generated migrations
  static/              # icons, manifest.webmanifest
  data/                # SQLite + photos (volume mount, gitignored)
  {drizzle,svelte,vite,tailwind}.config.*
  Dockerfile, docker-compose.yml, package.json
  LICENSE, README.md, .gitignore, .env.example
```

**Critical new files:** `src/lib/server/db/schema.ts`, `generate.ts`, `rotation.ts`,
`payout.ts`, `auth.ts`.

---

## Run / Deploy at Home

**Dev:** `npm install && npm run db:migrate && npm run dev`

**Prod (bare Node):** `npm run build && node build` (migrations auto-run on boot;
cron starts).

**Docker (recommended):** multi-stage `Dockerfile` (build → `node:20-alpine`,
non-root) + `docker-compose.yml`:
```yaml
services:
  choretracker:
    build: .
    ports: ["3000:3000"]
    volumes: ["./data:/app/data"]   # SQLite + photos persist
    environment:
      - DATABASE_PATH=/app/data/chores.db
      - SESSION_SECRET=change-me
      - ORIGIN=http://home-server.local:3000
    restart: unless-stopped
```
`docker compose up -d` → open `http://<pi-ip>:3000` on any LAN device. Backup = copy
`./data`.

---

## Verification

- **Unit (`vitest`)** on pure logic (highest value):
  - `recurrence.ts` — each frequency, intervals, month-end clamping, multi-weekday masks.
  - `rotation.ts` — pool advance, wraparound, pool-size changes.
  - `payout.ts` — 0/1/2+ reminder tiers, verified vs rejected.
  - `generate.ts` — idempotency (run twice → no dupes).
- **Integration** (temp SQLite): full loop — create kid + chore → generate instance
  → mark done → add 1 reminder → verify → assert ledger shows half payout + balance.
- **E2E (`Playwright`)**: profile pick → PIN → mark done → verify → earnings updates.
- **`npm run seed`** — demo family (fake names) to eyeball the app immediately.
- **Manual smoke** on a phone to confirm responsiveness + PWA install.
