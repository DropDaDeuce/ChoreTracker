# ChoreTracker

A self-hosted household chore tracker for families. Runs on your own hardware
(a Raspberry Pi, mini-PC, or any always-on home machine) and is used from
phones, tablets, and laptops on your home network — no cloud, no accounts, no
data leaving your house.

> **Status:** early development. The planning and project foundation are in
> place; the app itself is being built. See [`docs/PLAN.md`](docs/PLAN.md) for
> the full design and roadmap.

## Features (planned)

- **Chores by frequency** — organize Daily, Weekly, Monthly, and Yearly chores.
- **Flexible assignment** — assign a chore to one person, or **rotate** it
  through a defined pool of people.
- **Mark done** — a simple, phone-friendly flow to check chores off.
- **Kids' allowance** — kids earn an allowance when they mark a chore done and
  an adult verifies it. Getting reminded reduces the payout:
  - No reminders → full allowance
  - 1 reminder → half
  - 2+ reminders → nothing for that chore
- **Adult verification queue** — parents approve, reject, or add a reminder.
- **Earnings & payouts** — per-kid balance from an append-only ledger, with a
  payout flow and history.
- **Extras on the roadmap** — rotation management, calendar view, streaks &
  points leaderboard, photo proof, PWA install, and push reminders.

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
uploaded photos). To back up, simply copy that folder:

```bash
cp -r data/ ~/choretracker-backup-$(date +%F)/
```

## Privacy

This is a public, open-source repository, so **no household data is ever
committed to it**. The `.gitignore` excludes the `data/` directory, all
database files, `.env`, uploads, and exports. Demo/seed data uses fake names.

## Contributing

Issues and pull requests are welcome. This project is intended to be a friendly,
hackable base for anyone who wants to self-host their family's chores.

## License

[MIT](LICENSE) © 2026 DropDaDeuce
