# ChoreTracker

A self-hosted household chore tracker for families. Runs on your own hardware
(a Raspberry Pi, mini-PC, or any always-on home machine) and is used from
phones, tablets, and laptops on your home network — no cloud, no accounts, no
data leaving your house.

> **Status:** feature-complete across the planned roadmap — chores, rotation,
> verification, allowance, calendar, photo proof, push reminders, swaps, and
> backup/restore all work. See [`docs/PLAN.md`](docs/PLAN.md) for the design.

## Features

- **Chores by frequency** — Daily (every N days), Weekly (any set of
  weekdays), Monthly, and Yearly chores, with a "My chores" view per person.
- **Flexible assignment** — assign a chore to one person, or **rotate** it
  through an ordered pool, one turn per occurrence.
- **Mark done** — a simple, phone-friendly flow to check chores off, with an
  undo window for mistakes.
- **Kids' allowance** — kids earn an allowance when they mark a chore done and
  an adult verifies it. Getting reminded reduces the payout:
  - No reminders → full allowance
  - 1 reminder → half (percentage configurable)
  - 2+ reminders → nothing for that chore
- **Adult verification queue** — parents approve, reject, or add a reminder,
  with a live payout preview.
- **Earnings & payouts** — per-kid balance from an append-only ledger, with a
  payout flow and history.
- **Missed-chore sweep** — open chores past their due date (plus per-chore
  grace days) are marked missed automatically each night.
- **Profile + PIN login** — a kid-friendly profile picker, no usernames or
  passwords; adult-only actions are role-gated server-side.
- **Settings** — currency symbol, reminder penalty %, undo window, week start.
- **Calendar** — month view color-coded per person, including planned future
  occurrences.
- **Streaks & leaderboard** — completion streaks and weekly/monthly/all-time
  points standings.
- **Photo proof** — chores can require a camera photo before they count;
  parents see it in the verify queue.
- **CSV export** — download any kid's full allowance history.
- **Installable (PWA)** — add it to a phone's home screen with an app icon.
  Note: browsers only offer full install + offline caching over HTTPS (or
  `localhost`); on a plain-HTTP LAN it behaves as a home-screen shortcut,
  which works fine. Put a reverse proxy with HTTPS in front if you want the
  full experience.
- **Push reminders** — opt in per device; reminders, verifications,
  rejections, swaps, and bonuses ping the right person. (Same HTTPS caveat as
  install — browsers require a secure context for push.)
- **Swap requests** — "can you take this one?" Offer a chore to someone else;
  they accept or decline from their dashboard.
- **Bonuses & penalties** — adults can adjust a kid's ledger outside the
  chore flow, with a reason.
- **Backup & restore** — download the whole household (database + photos) as
  one zip from the admin UI, and restore it later — even into a running app.

## Tech stack

- **[SvelteKit](https://kit.svelte.dev/)** (Node adapter) — one app serving both
  the UI and the API.
- **SQLite** via `better-sqlite3` with **[Drizzle ORM](https://orm.drizzle.team/)**
  for a type-safe schema and migrations.
- **Tailwind CSS** for a mobile-first responsive UI.
- Profile + PIN auth, `node-cron` for recurring chore generation.

## Getting started

> These commands describe the intended setup as the app is built out.

```bash
# 1. Install dependencies
npm install

# 2. Configure your environment
cp .env.example .env
#   then edit .env — at minimum set a strong SESSION_SECRET

# 3. Set up the database
npm run db:migrate

# 4. Run in development (hot reload)
npm run dev
```

Open the app at the URL printed in your terminal (default
`http://localhost:5173` in dev).

### Running at home (production)

```bash
npm run build
node build      # migrations run on boot; the scheduler starts automatically
```

### Docker (recommended for a home server)

```bash
docker compose up -d
```

Then open `http://<your-server-ip>:3000` from any device on your LAN.

## Backups

All of your data lives in the `data/` directory (the SQLite database and any
uploaded photos). Three ways to back up, safest first:

1. **Automatic** — every night the app writes a backup zip to `data/backups`
   and keeps the newest 14 (configurable under Settings; 0 turns it off).
2. **From the app** — Settings → Backup & restore downloads a zip and can
   restore one later, even while the app is running.
3. **By hand** — copy the whole folder:

```bash
cp -r data/ ~/choretracker-backup-$(date +%F)/
```

Keep a copy somewhere off the server — `data/backups` protects against
mistakes and corruption, not a dead disk.

## Maintaining the server

A small admin CLI ships with the app (run from the repo root on the server):

```bash
npm run admin -- status                  # household + database overview
npm run admin -- doctor                  # health checks (exit 1 on failure)
npm run admin -- reset-pin <name> [pin]  # rescue a forgotten PIN
npm run admin -- list-users
npm run admin -- backup [dir]            # write a backup zip now
npm run admin -- prune-backups [keep]
npm run admin -- checkpoint              # shrink the SQLite WAL file
```

All commands are safe while the server is running. `reset-pin` is the
lockout rescue — if the only adult forgets their PIN, run it from a shell on
the server.

The app also serves `GET /healthz` (unauthenticated, returns
`{"ok":true}`) — the Docker image uses it as its `HEALTHCHECK`, and any
uptime monitor can watch it.

## Privacy

This is a public, open-source repository, so **no household data is ever
committed to it**. The `.gitignore` excludes the `data/` directory, all
database files, `.env`, uploads, and exports. Demo/seed data uses fake names.

## Contributing

Issues and pull requests are welcome. This project is intended to be a friendly,
hackable base for anyone who wants to self-host their family's chores.

## License

[MIT](LICENSE) © 2026 DropDaDeuce
