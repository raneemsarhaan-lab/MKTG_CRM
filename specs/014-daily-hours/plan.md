# Implementation Plan: Daily Working Hours

**Branch**: `claude/nice-noether-x4rgei` (Spec Kit feature `014-daily-hours`) | **Date**: 2026-11-09 | **Spec**: [spec.md](./spec.md)

**Input**: `specs/014-daily-hours/spec.md`, clarified on 2026-11-09:
- **Reminder:** it opens on the last working day without hours, and the member can add more days and fill them together.
- **Working week:** Sunday to Thursday for everyone, the same week My Board already uses.
- **Visibility:** only admins see other members' hours. Superusers see only their own.

## Summary

Members record one number a day, the hours they worked, or mark the day off:
- **On My Day:** a "Today's hours" card, plus a strip of the last 7 days and the week's total against capacity.
- **Through a reminder window:** the first time they open the app on a new day, if their last working day is empty. The window can take several days at once.

Admins get a weekly report of everyone's hours, which can be downloaded as a spreadsheet file.

The approach (details in [research.md](./research.md)):
- **Storage (R1):** one row per member per calendar day, keyed by the date the member's device gives. The server only accepts today or earlier, within 30 days for members.
- **Reminder (R2):** decided on the server from the member's local date and a per-member "prompted on" date, so it shows at most once a day across devices. Mounted once in `AppShell`, it waits for other dialogs.
- **Multi-day save (R3):** one action, all or nothing.
- **Report (R4):** an admin page at `/hours` and a CSV download (UTF-8 with BOM, so Excel opens Arabic names correctly). No new dependency.
- **Working days (R5):** Sunday to Thursday, reusing `weekStart` in `src/lib/myboard.ts`.

## Technical Context

**Language/Version**: TypeScript 5 (strict), React 19, Next.js 16 App Router.

**Primary Dependencies**: next-intl, Prisma v5. No new dependency.

**Storage**: PostgreSQL through Prisma, with schema changes applied by `db push` (`scripts/migrate.sh`):
- a new `work_days` table;
- a new `members.hours_prompted_on` date.

**Testing**: the lab pattern of earlier specs:
- `scripts/hours-lab/`: pure checks in Node, plus UI scenarios built with esbuild and run with Playwright against stub hosts;
- running-app checks on a production build;
- axe.

**Target Platform**: The web app on desktop and phones (390 px), in English and Arabic (RTL).

**Project Type**: Web application (one Next.js app).

**Performance Goals**:
- Logging today takes under 10 s and three actions (SC-001).
- The reminder check adds one small request to the first page load of the day.
- The weekly report for 50 members renders in under 1 s.

**Constraints**:
- At most one entry per member per day.
- Hours run 0–24, in steps of 0.25.
- No future days. Members can change only the last 30 days.
- Only admins see others' hours (enforced on the server).
- WCAG 2.1 AA.
- 44 px targets on phones.

**Scale/Scope**:
- About 10–50 members, so about 250 rows a week.
- 1 new table, 1 new column.
- About 5 server actions, 1 route, 1 CSV route, about 6 components.
- A new `hours` namespace of about 60 strings in each language.

## Constitution Check

| Principle | Gate | Status |
|---|---|---|
| **§I Design System Fidelity** | Tokens in `src/lib/tokens.ts` (`HOURS_UI`) and `--hr-*` CSS variables. No new palette beyond existing purple, lime and state colours | Pass (planned) |
| **§II Workflow Pipeline Integrity** | Doesn't touch stages, moves, SLAs or celebrations. Hours are not tied to tasks | Pass |
| **§III Role-Based Feature Access** | Members read and write only their own days. The report and any cross-member read are admin-only, checked in every action and on the page. Admins can correct any day | Pass |
| **§IV Design-Driven Development** | `design/hours.html` (My Day card, 7-day strip, reminder window with several days, report, phone, Arabic) is published and approved **before** any UI code | Gate: design first |
| **§V Cultural UX** | `hours` namespace in English and Arabic. Weekday names and numbers use the member's locale. Sunday–Thursday week. Mirrors in RTL | Pass (planned) |
| **§VI State Architecture** | Types first in `src/types/index.ts`. Server state: `work_days` and `members.hours_prompted_on`. No browser storage needed: the reminder state is on the server so it holds across devices | Pass |
| **Tech Stack** | No new dependency. CSV is written by hand | Pass |

No violations, so Complexity Tracking is empty.

## Project Structure

### Documentation (this feature)

```text
specs/014-daily-hours/
├── spec.md
├── plan.md              # this file
├── research.md          # R1–R7
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── server.md        # actions and the CSV route
│   └── ui.md            # card, strip, reminder window, report
├── checklists/requirements.md
└── tasks.md             # /speckit-tasks
```

### Source Code (repository root)

```text
prisma/schema.prisma                     # WorkDay model, Member.hours_prompted_on
src/types/index.ts                       # WorkDayEntry, HoursStatus, HoursWeekReport
src/lib/hours.ts                         # pure: dates, working days, validation, totals, CSV
src/actions/hours.ts                     # myHours, saveDays, hoursStatus, dismissReminder, teamHours
src/app/(app)/hours/page.tsx             # admin report
src/app/(app)/hours/export/route.ts      # CSV download (admin)
src/components/hours/
├── types.ts, api.ts                     # HoursApi (injected, as in specs 012/013)
├── TodayHours.tsx                       # My Day card: field, quick choices, 7-day strip, week total
├── DaysForm.tsx                         # the multi-day form, shared by the window and "Log several days"
├── HoursReminder.tsx                    # the window; mounted in AppShell
└── HoursReport.tsx                      # the admin report
src/components/myboard/MyBoard.tsx       # place TodayHours under the greeting
src/components/shared/AppShell.tsx       # mount HoursReminder
src/lib/nav.tsx                          # "Hours" for admins (after Capacity)
messages/en.json, messages/ar.json       # `hours` namespace
src/app/globals.css                      # `--hr-*` and the hours styles
design/hours.html                        # §IV
scripts/hours-lab/                       # pure + UI lab
```

**Structure Decision**: the same single Next.js app. The new code sits in `src/components/hours/`, with server actions in `src/actions/hours.ts` and pure logic in `src/lib/hours.ts`, so the lab can test it without a database.

## Phase 0 → Phase 1

- **Phase 0** ([research.md](./research.md)): R1–R7 resolve the date model, the reminder, the multi-day save, the report and its download, working days, placement, and access. Nothing is left as NEEDS CLARIFICATION.
- **Phase 1:**
  - [data-model.md](./data-model.md);
  - [contracts/server.md](./contracts/server.md);
  - [contracts/ui.md](./contracts/ui.md);
  - [quickstart.md](./quickstart.md).

## Constitution Check (post-design)

Rechecked after Phase 1. The design adds no dependency, and every cross-member read is behind `requireAdmin`. The only browser state is ephemeral UI. The design file gate (§IV) still applies before the UI tasks. **Pass.**

## Complexity Tracking

None.
