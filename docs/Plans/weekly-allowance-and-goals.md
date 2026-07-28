# Plan — Weekly allowance + point goals

Scope: replace per-chore money with a household weekly allowance apportioned by
days and points, and add point goals. Decisions below are **settled** (Mathew,
2026-07-27); this doc is the spec to build against, and it gets deleted once the
work ships and `CLAUDE.md` carries the durable rules.

Companion work already landed: least-recently-served rotation (see the Done log
in `ToDo.md`).

---

## 1. Weekly allowance

### The model

Money is no longer attached to a chore. There is **one household-wide weekly
allowance** — every kid has the same pot. What differentiates them is how many
days they were actually around to work.

```
D          = the full-week length, in days (see below)
dayValue   = weekly_allowance_cents / D          -- identical for every kid
days(k)    = days in the week on which kid k had at least one chore
ceiling(k) = days(k) × dayValue                  -- the most they can earn
```

Within one day, the day's value splits across that day's chores **by points**:

```
earned(i) = dayValue × weight(i)/dayPoints(k,d) × factor(reminders(i))
factor    = 1 reminder-free | (100-penalty)/100 at one | 0 at two or more
```

Worked example — allowance $10, Sam has chores 6 days, Riley is away 3 days:

| | days | dayValue | ceiling |
|---|---|---|---|
| Sam | 6 | $1.67 | $10.00 |
| Riley | 3 | $1.67 | $5.00 |

Riley's Saturday holds a daily (1 pt) and a weekly (3 pt) chore: the daily is
worth $0.42, the weekly $1.25. One reminder on the weekly drops it to $0.63.

### Settled decisions

| Decision | Answer |
|---|---|
| Per-chore `allowanceCents` | **Killed.** One money model. Column dropped, UI removed. |
| Allowance scope | **One household setting**, not a per-user column. Everyone shares the pot. |
| `D` (full-week length) | **The busiest kid's day count**, auto per week, with a settings override to pin it to a fixed number. |
| Away the whole week | 0 days → 0 ceiling → no allowance. Nothing was assigned, nothing is owed. |
| Week boundary | **Saturday → Friday.** |
| Settlement | Week closes Friday; cron settles **Sunday 00:05** (1-day grace, configurable) so the weekend verify queue still counts. |
| Verified after settlement | Settled weeks are **final**; adults correct with a bonus. The ledger never rewrites itself. |
| Missed / rejected | Count in the denominator (that is the point). |
| `skipped` | Excluded — an adult saying "not needed" shouldn't cost anyone. |
| Only `verified` earns | Yes. Still-`done`-at-settlement earns nothing; the grace day is the safety valve. |
| Points scale | Default from frequency: daily 1, weekly 3, monthly 5, yearly 7. Editable per chore. |
| Bonuses | Two forms, both **uncapped**. |

### Bonuses

A bonus is extra credit that never enters the denominator:

- `chores.is_bonus` — a standing bonus chore. Its instances are excluded from
  `days(k)` and from `dayPoints`.
- An adult granting a bonus on a completed chore, ad hoc.

Both pay at the **week-average point rate**, deliberately different from the
day-pot rate:

```
bonus(i) = weekly_allowance_cents × weight(i) / weekPoints(k)
weekPoints(k) = total weight of k's non-bonus instances that week
```

Flat by design — a 3-point bonus is worth the same whichever day it lands on,
so it can't be gamed by saving bonus work for light days.

Edge: `weekPoints(k) = 0` (kid had nothing assigned all week). Fall back to the
busiest kid's week points, consistent with how `D` is chosen; if that is also 0,
no bonus is payable.

### Privacy — hard rule

Mathew's constraint, and it is law: **no kid may learn what another kid is
making, what their ceiling is, or who set the divisor.**

- `D` renders as a bare number — "Full week = 6 days". Never "set by Sam".
- Every money surface filters to the viewer unless the viewer is an adult.
  Audit list: dashboard, `/earnings`, `/board`, `/leaderboard`, CSV export,
  push notification bodies.
- `/board` continues to show no money at all.
- `/leaderboard` stays **points only** — points don't reveal money under this
  model, since cents depend on days present and the shared pot.

### Schema

- `app_settings`: `weekly_allowance_cents`, `full_week_days_override`,
  `settlement_grace_days`. `week_start` widens from monday|sunday to any
  weekday (drives the calendar too).
- `chore_instances.weight` — stamped at generation from the chore's points,
  frozen. A mid-week chore edit must not move the denominator underneath a
  week already in progress.
- `chores.is_bonus`.
- `chores.allowance_cents` — dropped.
- `weekly_settlements(user_id, week_start UNIQUE-together, days_worked,
  full_week_days, cents, created_at)` — the double-pay guard (the cron re-runs)
  and the "past weeks" history view. Settlement writes exactly one `earning`
  ledger row per kid.

### Implementation notes

- Compute the whole week in fractional credit and **round once** at settlement.
  Rounding per chore drifts, and a kid who did everything must see exactly
  $10.00, not $9.98.
- `D` counts only kids eligible for allowance — an adult in a rotation pool
  must not set the household's bar.
- `payout.ts` survives nearly intact: it returns a fraction of weight instead
  of cents.
- The live card is the motivating piece: *"This week: 8 of 11 → $7.30
  projected, $2.70 still on the table."* Ship it with the engine, not after.

### Known trade-offs (accepted)

- **A day pays the same whether it holds one chore or five.** The day pot is
  fixed; points only decide how a day splits internally. This rewards
  "finish your day" over grinding — deliberate.
- **The divisor couples kids.** Giving one kid a 7-day chore lowers everyone
  else's ceiling. The settings override is the escape hatch; watch for it
  biting when kids of different ages get deliberately different loads.

---

## 2. Point goals

Adults set point goals per kid or for the whole family, daily or weekly.

- `goals(id, scope 'user'|'family', user_id nullable, period 'daily'|'weekly',
  target_points, reward_note, is_active, created_at)`
- `goal_achievements(goal_id, period_start, achieved_at)` with
  `UNIQUE(goal_id, period_start)` — makes "hit it three weeks running" possible
  and guarantees a celebration fires exactly once.

Settled:

- Progress counts **raw points** from verified instances — undiscounted by
  reminders. Money is the stick; goals are the carrot, so don't punish twice.
- A goal is a **celebration plus a reward note** ("movie night"). No tracked
  money, no ledger involvement.
- Family goal = the sum of all kids' points in the period. Aggregate only, so
  it doesn't leak individual money.
- Daily goals reset at midnight; weekly goals follow `week_start` (Saturday).
- Surfaces: a progress ring on the kid dashboard, a family bar on `/board`.
  A shared bar filling up all day is the best version of this on a wall tablet.

---

## Build order

1. ~~Least-recently-served rotation~~ — done.
2. Week-start widening + `chore_instances.weight` + points-from-frequency
   defaults. Groundwork, no behavior change visible yet.
3. Allowance engine + settlement cron + `weekly_settlements`, with unit tests
   covering the divisor, rounding, away weeks, and the reminder factors.
4. Money UI: drop per-chore allowance everywhere, add the live week card and
   the settings fields. Privacy audit lands here.
5. Bonus chores + ad-hoc bonuses.
6. Point goals.
