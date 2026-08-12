# Quickstart & Validation: Projects Workload

**Feature**: `specs/004-projects-workload` | **Date**: 2026-08-12 (rewritten post-clarification)

How to run this feature and prove it works. No test runner is configured (research R7), so validation is four things: a pure-function reconciliation harness, typecheck, a production build, and a browser pass.

---

## Prerequisites

A local PostgreSQL 16 on port 5433, socket in `/tmp`, started **as the `postgres` user**:

```bash
su postgres -c "/usr/lib/postgresql/16/bin/pg_ctl -D /tmp/pgfluxo -o '-p 5433 -k /tmp' -l /tmp/pgfluxo.log start"
pg_isready -h /tmp -p 5433
```

```bash
export DATABASE_URL="postgresql://postgres@localhost:5433/fluxo?schema=public&host=/tmp"
export NEXTAUTH_SECRET="local-dev-only"        # the session HMAC key
export PRISMA_HIDE_UPDATE_MESSAGE=true CHECKPOINT_DISABLE=1
export PATH="$PWD/node_modules/.bin:$PATH"
```

## Setup

```bash
prisma db push --accept-data-loss --skip-generate   # 7 new columns + seniority_levels
prisma generate --no-hints
bash scripts/migrate.sh                             # seed + ClickUp + plan import
```

Expect the seed to report three seniority levels, and the plan import to report milestone flags seeded from marker names. Chromium is pre-installed at `/opt/pw-browsers/chromium` — do not run `playwright install`.

---

## Validation 1 — Reconciliation (the one that matters most)

`src/lib/workload.ts` imports neither React nor Prisma, so it runs directly against the plan file. These five properties are invisible on screen and are where a workload panel goes confidently wrong.

```bash
tsx scripts/check-workload.ts       # a scratch harness, not shipped
```

| # | Property | Expected against today's plan |
|---|---|---|
| 1 | `Σ capacityRows.planDays` = total plan days | **960.0** over all projects, of which **391.0** on the unassigned row. Asserted on **plan** days, never effort. |
| 2 | `Σ months.planDays + undatedPlanDays = person.planDays` | Samaa: **134 dated + 30 undated = 164** |
| 3 | `effortDays ≥ planDays` where factor ≥ 1 | Equality for anyone whose work is entirely simple |
| 4 | Supervision conserved: generated = received | Nothing lost when split between role-holders; nothing invented when there are none |
| 5 | No `NaN`, `Infinity` or negative working days | Anywhere in the output |

Two worked figures to check the rule itself, at the default threshold of 3 days over the 426 Focus step-days:

- **Split**: 177d simple / 249d complex.
- **Supervision**: with the video editor as the only junior, her 33 complex days give `33 × 1.8 × 0.25 = 14.8d`. The mock says 16d — the same drift every other figure shows, because the plan was edited after the mock was drawn. **Do not tune the code to hit 16.**

Two traps worth a deliberate check:

- Compute supervision off `duration` rather than `adjusted` and it comes out ~44% low. C3.
- Apply the factor to all days rather than complex ones only and a wholly-junior team reads 767d instead of 625d. C4.

## Validation 2 — Typecheck and build

```bash
npx tsc --noEmit
npx next build
```

`npm run build` sometimes exits 144 in this environment; retry once. Both must be clean.

## Validation 3 — Browser pass

```bash
DATABASE_URL="…" NEXTAUTH_SECRET="local-dev-only" PORT=3111 npx next start
```

Rebuilding while the server runs corrupts its chunk manifest, and the login form then silently falls back to a native GET submit. **Stop the server before rebuilding**, then start fresh.

Sign in as an admin, go to `/projects`, open the **Workload** tab.

| # | Check | Expected |
|---|---|---|
| 1 | Tab present for an admin | Fifth tab beside Overview / Projects / Timeline / Weeks |
| 2 | Tab absent for a non-admin | Not rendered |
| 3 | Portfolio totals | Project count matches the Focus count the board's toggle reports |
| 4 | Consumed hours | `done step-days × hours-per-step-day`, with its % of expected |
| 5 | Milestones tile | Total, split ahead vs passed |
| 6 | Brand rows | One per brand plus an unbranded group; heaviest first; each with a completion % |
| 7 | Brand rows ignore seniority | Changing a member's level moves no brand figure (C13) |
| 8 | Capacity rows | One per member with load, plus **Unassigned** carrying ~41% of days |
| 9 | Unassigned row | Plan days and hours, **no** percentage, visibly not a person |
| 10 | Over-capacity row | Percentage in `UI.redStrong`; bar clamped while the label reads past 100% |
| 11 | Supervision component | Shown distinctly — "112d incl. 16d supervision" — never folded in |
| 12 | Supervising role vacant | Overhead still appears, on an unattributed row (FR-050) |
| 13 | Several hold the role | Split evenly, and the split is stated (FR-049) |
| 14 | Self-supervision | A marketing manager's own complex steps generate no overhead (FR-051) |
| 15 | Shows its workings | Any row where effort ≠ plan exposes plan days, simple/complex split, factor and level, and supervision (FR-044) |
| 16 | Person card | Plan days, effort days, days open, overdue count with oldest date, month list |
| 17 | Undated days | Reported separately; months + undated reconcile to the person's total |
| 18 | Person with no steps | Empty state, not a zero-filled card |
| 19 | Milestone toggle | Turning a step's flag on moves the milestones tile and the brand's count |
| 20 | Complexity override | Overriding a step changes effort; **changing the threshold afterwards leaves the override intact** (C5) |
| 21 | Threshold change | Moves the simple/complex split and every effort figure; the threshold in force is shown |
| 22 | Rate change | Editing junior's factor or rate moves effort and supervision proportionally |
| 23 | Non-admin assumptions | Read-only text, no editor |
| 24 | Focus/Aspiring | Switching the board's toggle changes the panel's scope; the header says which subset |

## Validation 4 — Live edit round-trips

1. **Duration** — change one step's duration by 2 days on the Projects tab. That person's plan days, their brand's row and the portfolio total each move by exactly 2. Effort moves by 2 × factor if the step is complex.
2. **Tick a step done** — consumed hours rises by `duration × hours-per-step-day`, and the brand's completion % moves.
3. **Reassign a step** to someone of a different level — plan days move across unchanged; effort and supervision change to reflect the new level.

None of these should need a manual refresh (SC-004).

---

## Deploying

`scripts/migrate.sh` runs `prisma db push` at container start, so the new table and columns land on deploy. Watch the start-up log for the schema push reporting a change rather than "already in sync", for the seed reporting three seniority levels, and for the plan import reporting seeded milestones.

## What "done" looks like

- All five reconciliation properties pass against real data.
- `tsc --noEmit` and `next build` clean.
- All 24 browser checks pass.
- All three edit round-trips move every affected figure by the right amount.
- Every figure either derives from stored data or visibly shows the assumption behind it (FR-027) — a reviewer can point at any number and name either the records or the setting it came from.
