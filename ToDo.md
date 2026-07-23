# ChoreTracker — ToDo

Tags: **[High]/[Med]/[Low]** = production impact; **[DECISION]** = needs Mathew's call before coding; **[Idea]** = unscoped, park it here until it's real. Completed items live in **## Done** at the bottom (condensed — one dated block per work session). Design/roadmap background lives in `docs/PLAN.md`.

## Architecture & Goals

* **UX north star:** kid-friendly first. Big tap targets, no typing beyond the PIN pad, surprises surfaced (badges, payout previews, confirm-style flows) rather than silent. A 7-year-old should be able to mark a chore done on a phone without help.
* **Privacy is non-negotiable:** public repo, zero real family data in git (see CLAUDE.md → Privacy). Anything that touches exports, backups, seeds, or screenshots gets weighed against this first.
* **Self-hosted simplicity:** one Docker container, one `data/` folder, zero external services, zero required configuration (VAPID keys self-generate; settings have defaults). New features should not add mandatory setup steps.
* **Every change rides the verify ladder** (CLAUDE.md → Workflow): check → test → build → smoke for user-facing flows. New engine logic ships with unit tests; new flows get a smoke check.

## Open Items

### Next up

* **[Med] First real deployment: verify the Docker path on actual home-server hardware.** `docker compose up -d` has never run (no Docker on the dev box). Confirm: image builds (better-sqlite3/argon2 native deps on the target arch — Pi = ARM), migrations apply on boot, `./data` volume persists across restarts, `ORIGIN` set correctly so form posts pass CSRF, cron fires at local midnight (container TZ!), and Ctrl-C/`docker stop` shuts down cleanly.

### Backlog

* **[Low] HTTPS on the LAN guide.** Full PWA install + Web Push require a secure context. Write up (or script) the reverse-proxy path — e.g. Caddy/Traefik with a local CA, or a Tailscale cert — so a home server gets install prompts + notifications. Until then both features degrade gracefully by design.
* **[Low] Container timezone note.** `node:22-alpine` defaults to UTC; `todayLocal()` and the 00:05 cron follow the container clock. Document setting `TZ=` in docker-compose (and consider surfacing the server's "today" in the admin UI so a mismatch is obvious).
* **[Low] Photo storage hygiene.** Verified-instance photos are kept forever. Decide a retention policy (e.g. purge photos on instances verified >90 days ago) and add it to the nightly job with a setting. (`admin doctor` already reports orphan photos as info.)
* **[Low] npm audit noise.** ~8 vulns pinned inside drizzle-kit's bundled dev-time deps (`@esbuild-kit/*`). Not runtime-reachable. Re-check when drizzle-kit ships a cleaned release; do NOT `audit fix --force`.

### Ideas (unscoped)

* **[Idea] Session/device management** — "log out everywhere" per person; adults can see active devices.
* **[Idea] Chore templates / quick-add** — common household chores as one-tap presets on the new-chore form.
* **[Idea] Weekly digest push** — Sunday-evening summary per kid (earned this week, streak, what's due tomorrow).
* **[Idea] E2E browser tests** — the plan named Playwright; the HTTP smoke covers the flows, but a thin Playwright layer would exercise the actual JS (PIN pad, pool builder, enhance forms).

## Done

* **2026-07-22 — Feel pass + Rooms & chore library (UX rework phases 1–2).**
  * **Feel pass (`3a65ffb`):** shared `submit()` enhance wrapper on every form (busy pulse, double-post proof); confetti + earned-amount celebration on mark-done; Today progress bar; My-chores section first; reject-with-reason (surfaces on the kid's card + push); two-step payout confirm (no-JS falls back to direct post — smoke caught the JS-only version); completedToday date filter moved into SQL. Fixed a latent date-dependent presence test (mutations now thread `today`; it was green only the week it was written).
  * **Rooms + library:** `rooms` table, `chores.room_id/icon` (migration `0005_rooms`); House view (room-grouped admin, Add Room presets + custom, get-started checklist); library picker with checklist multi-add (unassigned, $0); person detail page (`/admin/users/[id]`) with assign/unassign + weekly-load estimate; room badges on kid cards; seed creates demo rooms. New engine modules `assignments.ts`/`library.ts`/`roomAdmin.ts` are db-parameterized (choreAdmin's singleton import would create `data/` under vitest). Gotcha: SvelteKit forbids default + named actions on one route — `/admin/chores/new` is now `?/custom` + `?/library`.
  * Verified: 99 vitest tests + full smoke (incl. new room→library→assign→unassign checks) green.

* **2026-07-15 — Multi-host LAN access fixed (first real deployment feedback).** Phone at `http://<LAN-IP>:3000` would 403 on login: kit's CSRF check needs ONE fixed ORIGIN, and without ORIGIN adapter-node assumes **https** for the derived origin, failing every plain-HTTP form post. Replaced with our own same-host check in hooks.server.ts (`csrf.checkOrigin: false`); verified logins via 127.0.0.1, localhost, AND the real LAN IP with cross-site posts still blocked; ORIGIN removed from panel/compose/docs. Panel Stop button can now stop servers it didn't start (finds the node PID on the port, confirms, kill-tree). Reminder surfaced for users: type `http://`, phones auto-upgrade to https → ERR_SSL_PROTOCOL_ERROR.

* **2026-07-15 — Presence ("Days at home") for split households + deploy tool.**
  * Presence calendar per person (People → Days at home): click a day to flip home/away, right-click for patterns (away/home every X, every other X with anchor date, Nth of month), pattern list with remove + a form fallback for mobile. Day overrides beat rules; newest rule wins; default home.
  * Engine: generation skips away people (fixed chores skip the day; rotations hand the turn to whoever's home, skip the day if nobody is); presence changes drop future pending instances on away days and regenerate (history untouched); swaps refuse away targets; kid dashboard shows an away banner; People page shows away-today.
  * **Bug fixed:** generation scheduled chores for DEACTIVATED users (pool query never checked `is_active`).
  * Deploy tool: `tools/deploy.ps1` (+ control-panel button, target remembered in gitignored `.deploy-target`) builds and mirrors a runnable production copy (build/drizzle/src/scripts/tools + npm ci), never touches the target's `data/`, optional demo seed on first install. Verified end-to-end: deployed to a scratch folder, booted standalone, healthz + seeded picker OK.
  * 86 vitest tests (12 new presence) + 78-step smoke green.

* **2026-07-15 — Windows control panel (`ChoreTracker.cmd`).** WinForms GUI (PowerShell, zero deps, pure-ASCII .ps1 for PS 5.1): health-polled attach/start/stop of the server, buttons for the whole admin CLI (incl. reset-PIN with inputs), dev actions (build/check/test/seed/smoke with destructive-action confirms), streamed command output, server log viewer. Headless self-test hook (`CT_PANEL_TEST=1`). Gotcha fixed: health checks hit `127.0.0.1`, not `localhost` — adapter-node binds IPv4 while localhost resolves to `::1`.

* **2026-07-15 — Ops tooling: admin CLI, nightly auto-backups, healthz.**
  * `npm run admin` — `status` / `doctor` (integrity, migrations, lockout risk, unassigned chores, photo bookkeeping, WAL size, disk free, TZ; exit 1 on failure) / `reset-pin` (the lockout rescue — verified live against a running server) / `list-users` / `backup` / `prune-backups` / `checkpoint`.
  * Nightly auto-backup in the scheduler → `data/backups`, retention via new `backup_keep_count` setting (Settings UI field; 0 disables). Shared `backup.ts` now backs the download route, CLI, and scheduler.
  * `GET /healthz` (unauthenticated liveness) + Docker `HEALTHCHECK`. Smoke grew to 68 checks; README gained a "Maintaining the server" section.

* **2026-07-15 — Phases 0–4 built, verified, committed (one session).**
  * **Phase 0 (`84ede39`):** SvelteKit 2 + Svelte 5 runes + Tailwind v4 + Drizzle/better-sqlite3 skeleton; migrations-on-boot; multi-stage Dockerfile + compose; landing page proves the stack end-to-end.
  * **Phase 1 (`9d300d2`):** full schema; recurrence engine (daily/N-days, weekly masks, monthly/yearly with month-length clamping); idempotent rolling-window generation + nightly cron + startup catch-up; rotation engine; profile-picker + argon2 PIN auth + first-run /setup; dashboard mark-done; adult verify queue with reminder counter + live payout preview; append-only ledger; earnings + payout; admin chore CRUD + people management; seed script (fake family).
  * **Phase 2 (`bef7dd5`):** rotation pool UI (ordered, reorderable, validated); /chores frequency tabs; overdue sweep (grace days → missed); undo mark-done (auto-verified undo unwinds ledger within window); /admin/settings (currency/penalty/undo/week-start) with currency threaded app-wide; **fixed Ctrl-C hang** (cron task destroyed on `sveltekit:shutdown`).
  * **Phase 3 (`26b6ffb`):** PWA (manifest + generated icons + service worker; hashed assets cached, pages network-first, photos never cached); photo proof (auth-gated `/photos/[name]`, traversal-guarded, undo/reject delete the file); calendar with planned-occurrence overlay; streaks + points frozen at verification + /leaderboard; earned-since-last-payout + CSV export; `BODY_SIZE_LIMIT=10M`.
  * **Phase 4 (`8905245`):** Web Push (self-generating VAPID, per-device opt-in, fire-and-forget `notifyUser`, dead-sub pruning) wired into remind/verify/reject/swaps/bonuses; swap requests (request/accept/decline/cancel, one open per instance, stale auto-cancel); bonuses/penalties from /earnings; backup/restore (zipLite + SQLite online-backup API, restore into the running app, `.pre-restore` safety snapshot). Bugs fixed en route: acceptSwap's cancel was inside the throwing transaction (rollback ate it); undo-window `>` → `>=` so a 0-minute window disables undo.
  * **Smoke test committed (`8969121`):** `npm run smoke` = 67 checks over HTTP incl. live backup→change→restore. Final state: 74 vitest tests + 67 smoke checks green.
