---

description: "Task list for Daily Working Hours (spec 014)"
---

# Tasks: Daily Working Hours

**Input**: Design documents from `specs/014-daily-hours/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/](./contracts/), [quickstart.md](./quickstart.md)

**Tests**: The project validates each spec with labs and running-app checks (as in specs 012 and 013), so lab tasks are included per story. There are no separate unit-test frameworks.

**Organization**: Tasks are grouped by user story (spec.md US1–US4) so each can be built and checked on its own.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no unfinished dependency).
- **[Story]**: US1–US4 from spec.md.

---

## Phase 1: Setup

**Purpose**: The design gate and the lab skeleton.

- [X] T001 Write `design/hours.html` (constitution §IV), publish it as an artifact and get the user's approval **before any UI task**. It shows:
  - the My Day "Today's hours" card: field, quick choices, Save, status, 7-day strip, week total, "Log several days";
  - the reminder window with one day, and with three days after "Add another day" and "Same for all";
  - a line that was refused, with its reason;
  - the admin `/hours` report with Missing cells, totals and Download;
  - a 390 px phone (bottom sheet) and Arabic (RTL).
- [X] T002 [P] Create the lab skeleton in `scripts/hours-lab/`:
  - `build.sh`, `pure-entry.ts`, `pure.mjs`, `entry.tsx`, `index.html`, `scenarios.mjs` and `scenarios/`;
  - add `"lab:hours"` to `package.json`;
  - add `scripts/hours-lab/out/` to `.gitignore`.

---

## Phase 2: Foundational (blocks every story)

**Purpose**: Schema, types, pure logic, strings and the server actions every story uses.

- [X] T003 Add the schema in `prisma/schema.prisma` (data-model §1–§2):
  - the `WorkDay` model, mapped to `work_days`, with primary key `(member_id, date)`, an index on `date`, and `hours Decimal? @db.Decimal(4,2)`, `off Boolean @default(false)`, `updated_by`, `created_at`, `updated_at`;
  - `hours_prompted_on DateTime? @db.Date` on `Member`, plus the relations;
  - apply it with `bash scripts/migrate.sh`.
- [X] T004 [P] Add `WorkDayEntry`, `HoursStatus`, `HoursWeekRow` and `HoursWeekReport` to `src/types/index.ts` (data-model §4).
- [X] T005 [P] Write the pure module `src/lib/hours.ts` (research R1, R5; data-model §3):
  - `isWorkingDay` (Sunday–Thursday), `lastWorkingDayBefore`, `missingDays`, `weekOf` (reuse `weekStart` from `src/lib/myboard.ts`) and date-string helpers (`toISODate`, `addDays`);
  - `parseHours`, accepting `7.5`, `7,5`, `7:30` and Arabic digits; 0–24; quarter hours; error codes `bad_hours` and `bad_step`;
  - `validateLines(entries, { today, admin })`, returning per-line errors (`future`, `too_old`, `duplicate`, `bad_date`);
  - `weekTotals` and `toCsv` (a BOM, CRLF line endings, Excel quoting).
- [X] T006 [P] Add `HOURS_UI` to `src/lib/tokens.ts` and the matching `--hr-*` variables to `src/app/globals.css`, using existing colours only (§I).
- [X] T007 [P] Add the `hours` namespace (about 60 keys: card, strip, form, reminder, report, errors, plurals) to `messages/en.json` and `messages/ar.json`, with ICU plurals and Arabic plural forms.
- [X] T008 Write the server actions in `src/actions/hours.ts` (contracts/server.md): `hoursStatus`, `myHours`, `saveDays` (all or nothing in one transaction; `opts.memberId` admin-only), `dismissReminder` and `teamHours` (admin). Every action checks the session member, and `teamHours` and other members' days are admin-only (R7).
- [X] T009 [P] Write the injected API in `src/components/hours/types.ts` and `src/components/hours/api.ts` (`HoursApi`, wrapping the actions; a thrown error becomes `network`, as in `src/components/sheets/api.ts`).
- [X] T010 Lab: write the pure checks in `scripts/hours-lab/pure.mjs` for `parseHours` (including Arabic digits and `7:30`), working days (a Sunday asks about Thursday), `missingDays` (accounts created mid-week), `validateLines`, `weekTotals` and the CSV round trip (BOM, quotes, Arabic). Also write a server smoke test in `scripts/hours-lab/smoke/run.ts` for `saveDays` all-or-nothing, the 30-day limit, admin-only `teamHours` and `dismissReminder`.

**Checkpoint**: schema applied, `lab:hours` pure checks and the smoke test pass, and the typecheck is clean.

---

## Phase 3: User Story 1 — Log today's hours in a few seconds (P1) 🎯 MVP

**Goal**: A member logs today's hours on My Day in under 10 s.

**Independent Test**: Open My Day, enter 7.5 and press Enter, then reload: 7.5 is still there and marked saved. 30 and "abc" are refused.

- [X] T011 [US1] Build `src/components/hours/TodayHours.tsx` (contracts/ui.md §1, the top part):
  - the heading with today's date in the member's locale;
  - the field (`data-hours-input`, `inputmode="decimal"`, labelled), where Enter saves;
  - quick choices 4, 6, 8 and Off (`data-hours-quick`), each saving in one tap;
  - Save (`data-hours-save`) and a polite `role="status"` line ("Saved" or the reason);
  - if the save fails, keep what was typed.
- [X] T012 [US1] Place `TodayHours` under the greeting in `src/components/myboard/MyBoard.tsx`, not in the admin team view. Load the initial `HoursStatus` in `src/app/(app)/overview/page.tsx`, using the server date, and correct it on the client with the device date.
- [X] T013 [P] [US1] Add the card's styles to `src/app/globals.css`: logical properties, so it mirrors in Arabic; 44 px targets on phones; visible focus.
- [X] T014 [US1] Lab scenarios `s1-*` in `scripts/hours-lab/scenarios/`:
  - type and save;
  - a quick choice;
  - changing a saved value;
  - refusing 30, "abc" and 7.1 (not a quarter hour);
  - keyboard only;
  - the status read aloud;
  - Arabic digits;
  - RTL;
  - phone;
  - axe.

**Checkpoint**: US1 works end to end on its own.

---

## Phase 4: User Story 2 — A pop-up for the day I forgot (P1)

**Goal**: The first time a member opens the app on a new day, if their last working day is empty, a window asks about it. They can add more days and fill them together.

**Independent Test**: Leave Thursday empty and open the app on Sunday. The window names Thursday and opens once. Add two days, use "Same for all", and Save. All three are saved and the window doesn't come back that day, on any device.

- [X] T015 [US2] Build `src/components/hours/DaysForm.tsx` (contracts/ui.md §2), shared by the window and "Log several days":
  - lines with a label, an hours field, an Off toggle, and remove (on added lines);
  - "Add another day" (`data-add-day`): the next missing working day, then a date field limited to the last 30 days, with "N more days missing";
  - "Same for all" (`data-same-all`);
  - one Save, with per-line errors from `saveDays`, keeping every value typed.
- [X] T016 [US2] Build `src/components/hours/HoursReminder.tsx` (contracts/ui.md §3, research R2):
  - after the page is idle, call `hoursStatus(localDate)`;
  - open only when `remindDay` is set and `prompted` is false, and never over another `[role="dialog"]` or the task form (watch with a MutationObserver until they close);
  - on open, call `dismissReminder(localDate)`;
  - the title names the day; "I was off"; Save; "Later" (`data-hours-later`); Esc means Later;
  - focus starts in the first field, is trapped, and is restored on close;
  - bottom sheet on phones.
- [X] T017 [US2] Mount `HoursReminder` once in `src/components/shared/AppShell.tsx`, and pass `sheetsApi`-style injection through `src/components/hours/api.ts`.
- [X] T018 [P] [US2] Add the styles for the form and the window to `src/app/globals.css`: modal, bottom sheet under 767 px, lines, the error per line, mirrored in Arabic.
- [X] T019 [US2] Lab scenarios `s2-*` in `scripts/hours-lab/scenarios/index.mjs`:
  - opens on Sunday for Thursday;
  - doesn't open when the day is logged, already prompted, before the account existed, or on Friday/Saturday;
  - waits for another dialog;
  - "I was off";
  - "Later" (closes; the next day it opens again);
  - "Add another day" ×2, then "Same for all", then Save (one call, three entries);
  - one bad line saves nothing and keeps the values;
  - focus trap and Esc;
  - phone bottom sheet with 44 px targets;
  - Arabic;
  - axe.

**Checkpoint**: US1 and US2 both work. The MVP is complete.

---

## Phase 5: User Story 3 — See and fix my recent days (P2)

**Goal**: The last 7 days at a glance on My Day, each editable, with the week total against capacity, plus "Log several days".

**Independent Test**: Log three days, open My Day, and check the strip and total. Correct one day: the total updates.

- [X] T020 [US3] Add the 7-day strip (`data-hours-day`) to `src/components/hours/TodayHours.tsx`:
  - each day shows Hours, Off or Missing (amber, with an icon); today is marked; Fri/Sat are muted;
  - a click opens a popover with the field, Off and Clear (Clear calls `saveDays` with `hours: null, off: false`);
  - members can't edit days older than 30 days or in the future.
- [X] T021 [US3] Add the week total (`data-hours-week`, "31.5 of 40 h this week", using `capacity_hrs_wk`) and "Log several days" (`data-hours-several`) to `TodayHours.tsx`. "Log several days" opens `DaysForm` in a dialog, pre-filled with this week's missing days.
- [X] T022 [US3] Lab scenarios `s3-*` in `scripts/hours-lab/scenarios/index.mjs`:
  - the strip shows hours, Off and Missing;
  - editing a past day;
  - Clear makes it Missing;
  - a day older than 30 days can't be edited;
  - the total updates;
  - "Log several days" saves several days;
  - RTL;
  - phone (the strip scrolls sideways);
  - axe.

**Checkpoint**: US1–US3 work.

---

## Phase 6: User Story 4 — Team hours report (P2)

**Goal**: Admins see everyone's hours by week, and can download it.

**Independent Test**: Two members log a few days. An admin opens `/hours`, checks the numbers and totals, and downloads the CSV. A non-admin is refused.

- [X] T023 [US4] Build the admin page `src/app/(app)/hours/page.tsx`: redirect non-admins to `/overview`; read `?week=` (a Sunday); call `teamHours`.
- [X] T024 [US4] Build `src/components/hours/HoursReport.tsx` (contracts/ui.md §4):
  - a `<table>` with a caption;
  - a member row, Sun–Thu columns, and Fri/Sat columns only when used;
  - Missing in amber with an icon; Off;
  - totals against capacity, and per-day totals;
  - "N of M logged every working day";
  - previous and next week (`data-week-prev`, `data-week-next`);
  - Download (`data-hours-export`);
  - a sticky name column on phones.
- [X] T025 [US4] Write the CSV route `src/app/(app)/hours/export/route.ts`: admin-only (403 otherwise); `text/csv; charset=utf-8` with a BOM; file name `hours-<week>.csv`; the same rows, columns and totals as the page, via `toCsv`.
- [X] T026 [P] [US4] Add "Hours" for admins after Capacity in `src/lib/nav.tsx` (with an icon and `nav.hours` in both languages), and add the report's styles to `src/app/globals.css`.
- [X] T027 [US4] Lab scenarios `s4-*` in `scripts/hours-lab/scenarios/index.mjs`:
  - the report's numbers and totals;
  - Missing marked;
  - moving between weeks;
  - the download matches;
  - RTL;
  - phone;
  - axe.

  Running-app checks for the non-admin refusal follow in T030.

**Checkpoint**: All four stories work on their own.

---

## Phase 7: Polish & cross-cutting

- [X] T028 [P] Docs in `specs/014-daily-hours/` and `HANDOVER.md`:
  - `specs/014-daily-hours/constitution-check.md`;
  - a "Daily hours" section in `HANDOVER.md` (routes, the date model, the reminder rule, the actions, the lab);
  - mark the tasks here [X].
- [X] T029 Run every lab: `lab:hours`, `lab:sheet`, `lab:spreadsheet`, `lab:header`, `lab:inbox`, `lab:notify`, `lab:brief` and `lab:attachments`. Then the typecheck, `bash scripts/preflight.sh` and `npx next build`.
- [X] T030 Running-app checks: every row of `quickstart.md` with two members on a production build, written as `scripts/hours-lab/realapp/run.cjs`. Record the results in `specs/014-daily-hours/validation.md`.
- [X] T031 Commit and push branch `claude/nice-noether-x4rgei` (with `specs/014-daily-hours/validation.md`). Open a PR titled "Daily working hours: My Day entry, reminder and admin report (spec 014)", and ask the user before merging.

---

## Dependencies & execution order

- **Setup (T001–T002):** T001 (design approval) gates every UI task (T011 onwards). T002 can run beside it.
- **Foundational (T003–T010):** blocks all stories. T004–T007 and T009 can run in parallel after T003. T008 needs T003–T005. T010 needs T005 and T008.
- **US1 (T011–T014):** needs Phase 2 and T001.
- **US2 (T015–T019):** needs Phase 2 and T001. It doesn't depend on US1, but shares the hours field styling from T013.
- **US3 (T020–T022):** builds on `TodayHours` (US1) and `DaysForm` (US2).
- **US4 (T023–T027):** needs only Phase 2 and T001. It can be built in parallel with US1–US3.
- **Polish (T028–T031):** after the stories you ship.

## Parallel examples

- **After T003:**
  - T004 (types), T005 (pure lib), T006 (tokens) and T007 (strings) together;
  - then T008 (actions) and T009 (API wrapper).
- **US1:** T013 (CSS) alongside T011 and T012.
- **US2:** T018 (CSS) alongside T015 and T016.
- **US4 beside US1–US3:** T023–T026 touch different files (`hours/page.tsx`, `HoursReport.tsx`, `export/route.ts`, `nav.tsx`).

## Implementation strategy

- **MVP:** Phases 1–4 (US1 and US2). Members log today and are reminded about a missed day, including several days at once. That is everything the user asked for in the first sentence.
- **Then:** US3 (recent days and corrections), then US4 (the admin report and download).
- **Each checkpoint:** run `lab:hours` and the typecheck, and commit.

## Progress

- **T001:** `design/hours.html` (https://claude.ai/artifact/RWRxwhYs4YE2enUCYPGSg9). Approved by the user ("approved, build the UI").
- **T002–T010 done.**
  - The schema is applied: `work_days` and `members.hours_prompted_on`.
  - `src/lib/hours.ts`, the types, `HOURS_UI` and `--hr-*`, and the `hours` namespace in English and Arabic.
  - `src/actions/hours.ts` and the `HoursApi` wrapper.
  - `lab:hours`: 8/8 pure checks. Smoke test: 20/20 against PostgreSQL.
  - As built, `teamHours` takes an optional `localDate`, so "logged every working day" counts only days up to the member's today.
- **T011–T031 done** (UI round). For the running-app results and the as-built notes, see `validation.md`. The UI lab scenarios are covered by `scripts/hours-lab/realapp/run.cjs` (39 checks, axe included).
