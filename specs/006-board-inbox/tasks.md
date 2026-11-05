---
description: "Task list for Board Inbox"
---

# Tasks: Board Inbox

**Input**: Design documents from `specs/006-board-inbox/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/](./contracts/), [quickstart.md](./quickstart.md)

**Tests**: Each story ends with lab scenarios, as in specs 008 and 009. The sheet, attachments and brief labs are regression gates.

**Conventions**

| Term | Meaning |
|---|---|
| Inbox dir | `src/components/inbox/` |
| Model | `src/lib/inbox.ts` (pure) |
| Actions | `src/actions/inbox.ts` |
| Board | `src/components/kanban/KanbanBoard.tsx` |
| Lab | `scripts/inbox-lab/`, `npm run lab:inbox` |
| Strings | `useTranslations('inbox')`, English and Arabic in the same task |
| Colours | `INBOX_UI` and `--inbox-*` only |

## Format: `[ID] [P?] [Story] Description`

---

## Phase 1: Setup

- [X] T001 Commit the approved preview as `design/board-inbox.html` (tab "Option B · Inbox button" is the design; the other tabs stay for comparison).
- [X] T002 [P] Lab skeleton in `scripts/inbox-lab/`:
  - `build.sh`, `index.html`, `entry.tsx`, `fixtures.ts`, `pure-entry.ts`, `pure.mjs`, `scenarios.mjs`;
  - `lab:inbox` in `package.json`.

  Fixtures: five members, tasks in every review stage, late, today, undated, published this week and earlier, comments with mentions, attachments by others.

---

## Phase 2: Foundational (blocks every story)

- [X] T003 In `prisma/schema.prisma`:
  - `Member.inbox_since`, `inbox_pinned`, `show_week`;
  - the `MentionRead` and `TaskSnooze` models with their relations (data-model §1).

  Run `npx prisma generate` and `bash scripts/migrate.sh`.
- [X] T004 [P] In `src/types/index.ts`: `InboxTab`, `InboxReason` and `InboxState`. The member's prefs travel in `InboxState` (from the loader), not on `Member`, so they are never sent with other members' records.
- [X] T005 [P] Add an `inbox` namespace to `messages/en.json` and `messages/ar.json`: button, summary parts, heading, tabs, groups, reasons, actions, notes, errors, the Team lines, Done, the View menu, empty states.
- [X] T006 [P] `INBOX_UI` in `src/lib/tokens.ts` and the `--inbox-*` variables, plus the inbox CSS block in `src/app/globals.css`.
- [X] T007 The Model in `src/lib/inbox.ts` (data-model §3, research R2–R4, R9–R11): `inboxModel`, `inboxSummary`, `nextMidnight`, `dateWords`.
- [X] T008 Actions in `src/actions/inbox.ts` per contracts/server.md.
- [X] T009 Loader: in `src/app/(app)/board/page.tsx`, read ids, live snoozes and prefs, then pass `inbox` to Board.
- [X] T010 Lab Node checks in `scripts/inbox-lab/pure.mjs`:
  - counts equal rows (SC-002);
  - reviews by role (SC-003);
  - the 7-day window (SC-007);
  - snoozes;
  - summary order;
  - date words;
  - next midnight;
  - tokens-only for the Inbox dir;
  - messages parity for `inbox`.

**Checkpoint**: schema applied, model tested, strings in place.

---

## Phase 3: User Story 1: see how much needs me, open it in one click (P1) 🎯 MVP

- [X] T011 [US1] `InboxButton.tsx`: fill, badge, urgent colour, summary line, All clear, accessible name, `aria-expanded`, pulse (R9, reduced motion).
- [X] T012 [US1] `InboxPanel.tsx`: heading, tabs (tablist keyboard), opening tab (FR-016), close on Esc / ✕ / outside, focus back to the button, row click opens the task.
- [X] T013 [US1] In Board:
  - remove the bell and the Needs your attention and Activity feed cards;
  - render the button and panel;
  - wire `InboxApi` (`openTask` marks a mention read when opened from one).
- [X] T014 [US1] Lab scenarios `us1-1`…`us1-6`.

---

## Phase 4: User Story 2: reviews, and acting on them in place (P1)

- [X] T015 [US2] Review rows in `InboxRows.tsx`: stage pill, waiting time, due words, SLA chip; Approve → and Send back with a note. Approve and Send back go through the host's `move`; the note through `comment`. Errors per contracts §3.
- [X] T016 [US2] Lab scenarios `us2-1`…`us2-5` (role match, admin without the role sees none, Approve celebrates under the rule, Send back with a note, already moved).

---

## Phase 5: User Story 3: my own work that needs a decision today (P2)

- [X] T017 [US3] Your-task rows: reason, Set date (date input), Move on →, Tomorrow; the "Put off until tomorrow · n · Bring back" line.
- [X] T018 [US3] Lab scenarios `us3-1`…`us3-4`.

---

## Phase 6: User Story 4: mentions I haven't read (P2)

- [X] T019 [US4] Mention rows: unread first, reply in place, Mark read, Mark all read; opening from a mention marks it read. Board wiring for `markRead` and `reply`.
- [X] T020 [US4] Lab scenarios `us4-1`…`us4-5` (opening the panel marks nothing).

---

## Phase 7: User Story 5: what the team did on my work (P3)

- [X] T021 [US5] Team rows. `TaskModal` gains `initialCommentId` (scroll and flash; `data-comment-id` on comment rows).
- [X] T022 [US5] Lab scenarios `us5-1`…`us5-3`.

---

## Phase 8: User Story 6: what I finished (P3)

- [X] T023 [US6] Done rows and the all-time total.
- [X] T024 [US6] Lab scenarios `us6-1`, `us6-2`.

---

## Phase 9: User Story 7: keep it open, and bring back "Your week" (P3)

- [X] T025 [US7] `ViewMenu.tsx`, in a new trailing slot of `BoardFilters`: Show your week (`setPrefs`) and Columns before design (the existing upstream toggle). `HeroCards` renders only Week Momentum and Daily Spark, and only when `show_week` is on.
- [X] T026 [US7] Pin: the split layout in Board (`.fx-board-split`), stacked under 900 px, remembered through `setPrefs`.
- [X] T027 [US7] Lab scenarios `us7-1`…`us7-5`.

---

## Phase 10: Polish

- [X] T028 [P] Lab scenarios `inbox-kbd`, `inbox-rtl`, `inbox-phone`, `inbox-axe`, `inbox-perf` (open and close in under 500 ms).
- [X] T029 Run:
  - `npm run typecheck`;
  - `bash scripts/preflight.sh`;
  - `next build`;
  - `lab:inbox`, `lab:sheet`, `lab:attachments` and `lab:brief`.
- [X] T030 Running-app checks (quickstart §2) on local PostgreSQL, including the first-screen check at 1366×768 (SC-001). Record them in `specs/006-board-inbox/validation.md`.
- [X] T031 [P] `specs/006-board-inbox/constitution-check.md`, and an "Inbox" section in `HANDOVER.md`.

---

## Dependencies

- **Setup** (T001, T002) → **Foundational** (T003–T010) → **US1** (T011–T014) → US2–US7.
- US2 and US3 share `InboxRows.tsx` (sequential). US4 to US7 are independent of each other after US1.
- **Polish** last.

**Parallel**: T004–T006 together; T021 alongside T025.

## Implementation strategy

1. **MVP**: US1. The cards and bell go, and the button and panel list what needs you.
2. **US2 + US3**: act in place.
3. **US4–US7**: mentions with read state, Team, Done, pin and View menu.
