# Implementation Plan: Board Inbox

**Branch**: `claude/nice-noether-x4rgei` (Spec Kit feature `006-board-inbox`) | **Date**: 2026-11-05 | **Spec**: [spec.md](./spec.md)

**Input**: `specs/006-board-inbox/spec.md`. The approved design is the preview "Board For-You Options", tab "Option B · Inbox button", committed as `design/board-inbox.html`.

## Summary

The Board's "for you" cards and the bell are replaced by one **Inbox** button in the header:
- It is purple when something is waiting, shows a count badge on its icon, and has a line saying what is waiting.
- It opens a panel over the board with four tabs: **To do**, **Mentions**, **Team** and **Done**.
- **To do** lists:
  - reviews waiting for the member's role, with Approve and Send back;
  - the member's own late, due-today or undated work, with Set date, Move on and Tomorrow.
- **Mentions** keeps a real read state, so the number goes down and stays down on every device.
- A **pin** keeps the panel beside the board.
- A **View** menu holds "Show your week" (off by default) and "Columns before design".

Technical approach (details in [research.md](./research.md)):
- **Computed, not stored (R1):** every Inbox list is worked out on the client from the tasks the board already loads (comments, attachments, stages), by one pure module (`src/lib/inbox.ts`). The number and the lists come from the same function, so they cannot disagree (SC-002).
- **Three small records (R4–R7):**
  - `mention_reads`, per member and comment;
  - `task_snoozes`, per member and task;
  - three member fields: `inbox_since`, `inbox_pinned` and `show_week`.
- **Actions reuse the board (R8):** Approve, Send back and Move on go through the board's `moveTo` (same rule, same celebration). Set date uses `updateTask`. Only read state, replies, snoozes and preferences are new server actions.
- **Host interface (R14):** the Inbox components talk to an `InboxApi`, as the sheets do, so a lab can drive them with a stub host.

## Technical Context

**Language/Version**: TypeScript 5 (strict), React 19, Next.js 16 App Router.

**Primary Dependencies**: Existing only: next-intl, Prisma v5, the stage-move rule from spec 008. No new dependency.

**Storage**: PostgreSQL via Prisma `db push`:
- new `mention_reads` and `task_snoozes` tables;
- `members` gains `inbox_since`, `inbox_pinned` and `show_week`.

**Testing**:
- a new `npm run lab:inbox`: Node checks on the pure module, and Playwright scenarios on the real components with a stub host;
- `lab:sheet`, `lab:attachments` and `lab:brief` as regressions;
- `typecheck`, `preflight` and `next build`;
- running-app checks on local PostgreSQL.

**Target Platform**: Desktop browsers first; phone width supported (full-width panel). Deployed on Cranl.

**Project Type**: Web application (single Next.js project).

**Performance Goals**:
- The pipeline is visible without scrolling at 1366×768 (SC-001).
- Count and lists update within 1 s of an action (SC-004).
- The panel opens and closes in under 0.5 s (SC-008).

**Constraints**:
- No stage or SLA change (§II).
- Approve and Move on follow `allowedStages`, and celebrate under the board's rule (§V).
- Only token colours (§I).
- Every string in English and Arabic, laid out right to left in Arabic (FR-070).

**Scale/Scope**:
- One header button, one panel with four tabs, one View menu.
- One pure module and 6 server actions.
- 2 tables and 3 member fields.
- Changes to the board page loader, `KanbanBoard`, `HeroCards`, `BoardFilters` and `TaskModal` (open at a comment).

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-checked after Phase 1 design (below).*

| Principle | Gate | Status |
|---|---|---|
| **I. Design System Fidelity** | Token colours only. | **Pass.** New `INBOX_UI` tokens in `src/lib/tokens.ts`, built from `PIPE`, plus `--inbox-*` CSS variables. A lab check rejects raw colours in `src/components/inbox/`. |
| **II. Workflow Pipeline Integrity** | No stage changes; SLA computed on render. | **Pass.** Moves use the existing `setTaskStage`. SLA status in review rows is computed with `getAlertStatus`. |
| **III. Role-Based Feature Access** | Gates in UI and server. | **Pass.** Action buttons are shown only when `allowedStages` allows the move (FR-028), and the server checks again. Read state and snoozes belong to the signed-in member only; actions never take a member id. |
| **IV. Design-Driven Development** | Design file before UI. | **Pass, with a task.** The approved preview is committed as `design/board-inbox.html` before UI work. It is plain HTML; the same sign-off as in specs 005, 007, 008 and 009 applies. |
| **V. Cultural UX** | Arabic strings; celebrations unchanged. | **Pass.** A new `inbox` namespace in both languages. Approve and Move on use the board's move, so the celebration plays exactly when a drag would play it. |
| **VI. State Architecture** | No persisted store state; unions in types first. | **Pass.** Pin and Show your week are per-member database fields, because they follow the member across devices. The pulse's "seen" list is a per-device view preference in `localStorage` (§VI 2.1.0). `InboxTab` and `InboxReason` go in `src/types/index.ts` first. |
| **Tech Stack** | No new dependency. | **Pass.** |

No unjustified violations.

## Project Structure

### Documentation (this feature)

```text
specs/006-board-inbox/
├── spec.md · plan.md · research.md (R1–R16) · data-model.md · quickstart.md
├── contracts/server.md · contracts/inbox-ui.md
├── tasks.md · validation.md · constitution-check.md
└── checklists/requirements.md
```

### Source Code (repository root)

```text
prisma/schema.prisma                 MentionRead, TaskSnooze; Member.inbox_since, inbox_pinned, show_week
src/types/index.ts                   InboxTab, InboxReason, InboxState; Member prefs
src/lib/inbox.ts                     pure: inboxModel, summary, team, done, nextMidnight, dateWords
src/lib/tokens.ts                    INBOX_UI
src/actions/inbox.ts                 markMentionsRead, replyToMention, snoozeTask, unsnoozeTasks, setInboxPrefs
src/components/inbox/
├── types.ts                         InboxApi (host interface)
├── InboxButton.tsx                  the header button, badge, summary, pulse
├── InboxPanel.tsx                   panel, tabs, pin, close
├── InboxRows.tsx                    review, your-task, mention, team, done rows
└── ViewMenu.tsx                     Show your week · Columns before design
src/components/kanban/KanbanBoard.tsx   bell → Inbox; hero cards → View menu; pinned layout; host api
src/components/kanban/HeroCards.tsx     only Week Momentum + Daily Spark, when Show your week is on
src/components/kanban/BoardFilters.tsx  a trailing slot for the View menu
src/components/kanban/TaskModal.tsx     initialCommentId: scroll to and flash a comment
src/app/(app)/board/page.tsx            loads read ids, live snoozes and the member's prefs
messages/en.json, messages/ar.json      `inbox` namespace
design/board-inbox.html              the approved preview
scripts/inbox-lab/                    lab: build.sh, entry.tsx, fixtures.ts, pure.mjs, scenarios.mjs
```

**Structure Decision**: Follow specs 008 and 009:
- a feature folder of components behind a host interface;
- a pure module shared by the board and the lab;
- server actions in their own file.

## Complexity Tracking

None.

## Post-design Constitution Check

Re-checked after research, data model and contracts:
- **§III:** read state and snoozes are keyed by the session member on the server.
- **§VI:** the only browser storage is the pulse's per-device "seen" list and the existing "Columns before design" key.

All gates still pass.
