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
- **Flexible assignment** — three ways to hand out a chore: to **one person**,
  **rotated** through an ordered pool (one turn per occurrence), or to
  **everyone** at once, where each person gets their own copy every time it
  comes round. That last one is for "clean your room" — one chore, not one per
  kid, and anyone who's away that day simply doesn't get one.
- **Mark done** — a simple, phone-friendly flow to check chores off, with an
  undo window for mistakes.
- **Weekly allowance** — one allowance amount for the whole household, per
  week. Everyone can earn the same; what changes it is how much of the week
  they were actually around for:
  - The busiest person's chore-days define a "full week" (or pin it yourself).
  - The allowance divides by those days, so each chore-day is worth a fixed
    slice — miss a day away from home and that slice simply isn't in your pot.
  - Within a day, the day's value splits between that day's chores by points.
    A day is worth the same whether it holds one chore or five, so the goal is
    always "finish your day".
  - Getting reminded shrinks what a chore claims: none → full, 1 → half
    (configurable), 2+ → nothing.
  - The week is paid out automatically a day after it ends, as a single
    entry — or an adult can close it early.
- **Bonus chores** — mark a chore as a bonus (or grant bonus points on a job
  well done) and it earns on top of the week without ever counting against
  anyone.
- **Point goals** — set a star target for one kid or the whole family, daily
  or weekly, with a reward you name ("movie night"). Hitting it is a
  celebration, not money.
- **Adult verification queue** — parents approve, reject, or add a reminder,
  with a live preview of what each chore is worth this week.
- **Earnings & payouts** — per-kid balance from an append-only ledger, a live
  "this week" breakdown, past-week history, and a payout flow. Kids only ever
  see their own figures — never a sibling's earnings or ceiling.
- **Missed-chore sweep** — open chores past their due date (plus per-chore
  grace days) are marked missed automatically each night.
- **Days at home** — for split households: each person gets a presence
  calendar (People → Days at home). Click days on/off or set repeating
  patterns ("away every other Thursday"); nobody is assigned chores on days
  they're away, rotations automatically hand the turn to whoever's home, and
  the person who was away is first in line the day they're back.
- **Profile + PIN login** — a kid-friendly profile picker, no usernames or
  passwords; adult-only actions are role-gated server-side.
- **Settings** — weekly allowance, days in a full week, settlement grace,
  currency symbol, reminder penalty %, undo window, and which day the week
  starts on (any of the seven — a Sat–Fri allowance week is normal).
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

Zero configuration required — no .env needed for a normal LAN setup.

```bash
# 1. Install dependencies
npm install

# 2. Run in development (hot reload; the database creates itself)
npm run dev
```

Open the app at the URL printed in your terminal (default
`http://localhost:5173` in dev). The first visit walks you through creating
the first adult account.

### Running at home (production)

```bash
npm run build
node build      # migrations run on boot; the scheduler starts automatically
```

On Windows, `ChoreTracker.cmd` gives you a control panel for all of this,
including a one-click deploy that keeps a separate production folder updated.

### Docker (recommended for a home server)

```bash
docker compose up -d
```

Then open `http://<your-server-ip>:3000` from any device on your LAN — note
**http://**, not https:// (phones like to silently add the s; type it out or
bookmark it). The app works from `localhost`, the LAN IP, and a hostname at
the same time.

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

**Windows control panel:** double-click `ChoreTracker.cmd` for a GUI that
attaches to the running server (or starts one), with buttons for every tool
below plus build/test/dev actions. It works from any checkout of the repo.

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
