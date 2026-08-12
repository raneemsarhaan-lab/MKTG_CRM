# Quickstart & Validation: Projects Workload

**Feature**: `specs/004-projects-workload` | **Date**: 2026-08-12

How to run this feature and prove it works. No test runner is configured in this repository (research R6), so validation is four things: typecheck, a pure-function reconciliation harness, a production build, and a browser pass.

---

## Prerequisites

A local PostgreSQL 16 on port 5433, socket in `/tmp`. It must be started **as the `postgres` user**:

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
prisma db push --accept-data-loss --skip-generate   # creates the two new columns
prisma generate --no-hints
bash scripts/migrate.sh                             # seed + ClickUp + plan import
```

Expect the plan import to report ~40 projects present and some projects without a brand. Chromium for the browser pass is pre-installed at `/opt/pw-browsers/chromium` — do not run `playwright install`.

---

## Validation 1 — Reconciliation (the one that matters most)

`src/lib/workload.ts` imports neither React nor Prisma, so it runs directly against the plan file. This checks the two invariants that no browser assertion would catch.

```bash
tsx scripts/check-workload.ts       # a scratch harness, not shipped
```

**Expected**:

- `Σ capacityRows[].days` equals total planned step-days across the projects in scope, with **no** step-day lost or double-counted (contract C1). Against the full plan today that total is **960.0**, of which **391.0** must land in the unassigned row.
- For every member, `Σ months[].days + undatedDays === days` (C2). For Samaa today: **134 dated + 30 undated = 164**.
- No `NaN`, no `Infinity`, no negative working-day count anywhere in the output (C3, C7).

A mismatch here is a real defect. It is the class of bug that makes a dashboard confidently wrong, which is worse than one that is obviously broken.

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

Rebuilding while the server is running corrupts its chunk manifest and the login form silently falls back to a native GET submit. **Stop the server before rebuilding**, then start it fresh.

Sign in as an admin, go to `/projects`, open the **Workload** tab.

| # | Check | Expected |
|---|---|---|
| 1 | Tab is present for an admin | Fifth tab beside Overview / Projects / Timeline / Weeks |
| 2 | Tab is absent for a non-admin | Not rendered; visiting the tab state directly shows nothing privileged |
| 3 | Portfolio totals | Project count matches the Focus count the board's toggle reports |
| 4 | Brand rows | One per brand with projects in scope, plus an unbranded group; ordered heaviest first |
| 5 | Capacity rows | One per member with load, plus an **Unassigned** row carrying ~41% of the days |
| 6 | Unassigned row | Shows days and hours, **no** percentage, visibly not a person |
| 7 | Over-capacity row | Percentage in `UI.redStrong`; bar clamped at full width while the label reads past 100% |
| 8 | Person card | Total days, days open, overdue count with oldest date, month list |
| 9 | Undated days | Reported separately; months + undated reconcile to the person's total |
| 10 | Person with no steps | Empty state, not a zero-filled card |
| 11 | Assumption change | Admin changes hours-per-step-day → every hours figure and percentage moves proportionally; header states the assumption |
| 12 | Non-admin assumptions | Read-only text, no editor |
| 13 | Focus/Aspiring | Switching the board's toggle changes the panel's scope; the header says which subset is shown |

## Validation 4 — Live edit round-trip (SC-004)

1. Note a person's total on the Workload tab.
2. On the **Projects** tab, change one step's duration by 2 days.
3. Return to Workload.

**Expected**: that person's row, their brand's row and the portfolio total have each moved by exactly 2 days, with no manual refresh.

---

## Deploying

`scripts/migrate.sh` runs `prisma db push` at container start, so the two new columns are created on deploy with no separate step. Watch the start-up log for the schema push reporting a change rather than "already in sync".

## What "done" looks like

- Reconciliation harness passes both invariants against real data.
- `tsc --noEmit` and `next build` clean.
- All 13 browser checks pass.
- The edit round-trip moves every affected figure by the same amount.
- No figure on the panel is unbacked by stored data (SC-007) — a reviewer can point at any number and name the records behind it.
