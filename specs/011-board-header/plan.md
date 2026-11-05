# Implementation Plan: A Calmer Board Header

**Branch**: `claude/nice-noether-x4rgei` (Spec Kit feature `011-board-header`) | **Date**: 2026-11-05 | **Spec**: [spec.md](./spec.md)

**Input**: `specs/011-board-header/spec.md` and the user's reference image (`reference.webp`). The design file is `design/board-header.html`, published as a clickable preview. Planning note from the user: "the header UI". The user confirmed the scope: only the band above the pipeline changes. The columns, cards, sidebar and sheets stay as they are.

## Summary

The Board's header becomes three rows, as in the reference:

1. **The top bar**:
   - the Pipeline | Content tabs;
   - search;
   - a compact Inbox;
   - the avatar.
2. **The title row**: Pipeline or Content, and + New task.
3. **The toolbar**:
   - My tasks | Team tasks;
   - a brand dropdown;
   - Filters;
   - Board | Sheet;
   - Display options.

Every control keeps its current behaviour. Only where it sits and how it looks change.

The technical approach is set out below; the reasoning is in [research.md](./research.md).

- **One header for all three views (R1).** Today the header only exists on Board. On Sheet and Content, `KanbanBoard` returns early and each sheet draws its own bar, each with its own Board | Sheet | Content switch.
  - A new `BoardHeader` (top bar and title row) renders above every view.
  - The sheets fill the height left below it.
  - The tabs, search, Inbox and New task are therefore the same everywhere.
- **The third row belongs to the view (R2):**
  - **Board**: the new `BoardToolbar`;
  - **Sheet**: the video sheet's existing bar;
  - **Content**: the Content sheet's existing bar.
  - The two sheet bars lose their three-way switch. The video sheet's bar gains the same `ViewPair` (Board | Sheet) as the board toolbar.
- **Existing parts, restyled rather than rewritten (R3–R5):**
  - The brand dropdown and Filters use the existing `FieldPill` popover. Filters keeps its current contents.
  - Display options is the existing `ViewMenu` with a new trigger.
  - The Inbox is the existing `InboxButton` in a compact variant: the summary moves to its tooltip and screen-reader text.
  - The avatar opens the existing `UserMenu` in a new `header` variant that opens downward.
- **Search on every view (R6).** On Board it filters cards, as today. On Sheet and Content it filters rows by title, keeping each match's video or theme row. Without this, a search box would sit there and do nothing on two of the three views. This is the only behaviour added.
- **Words in both languages (R8).** The header's English is hard-coded today ("Only me", "Filter", the placeholder). A new `header` namespace carries every label in English and Arabic.

## Technical Context

**Language/Version**: TypeScript 5 (strict), React 19, Next.js 16 App Router.

**Primary Dependencies**: Existing only:
- next-intl;
- `FieldPill`, `ViewMenu`, `InboxButton`, `UserMenu`, `HeroCards`;
- the pipeline tokens (`PIPE`, `INBOX_UI`).

No new dependency.

**Storage**: None. No schema change. The saved choices stay where they are:
- scope (`momentum.board.scope`);
- Columns before design;
- Show your week (member field);
- the view (`?view=`).

**Testing**:
- **A new `npm run lab:header`.** It is a standalone page that mounts `BoardHeader`, `BoardToolbar` and the sheet bars with stub data, and runs Playwright scenarios for each user story: keyboard, Arabic, phone and axe.
- **`lab:sheet` and `lab:inbox` as regressions.** Their selectors are updated where the switch and the Inbox button changed.
- **`lab:attachments` and `lab:brief` as regressions.**
- **`typecheck`, `preflight` and `next build`.**
- **Running-app checks** on local PostgreSQL. These measure SC-001 and SC-002: the first column's position at 1440 × 900 and at 390 × 700.

**Target Platform**: Desktop browsers (reference at 1440 wide) and phones from 390 px, in English and Arabic. Deployed on Cranl.

**Project Type**: Web application (single Next.js project).

**Performance Goals**:
- **Board at 1440 × 900:** the first column starts at 280 px or less (today about 355).
- **Phone at 390 × 700:** the first column starts at 320 px or less (today about 540).
- **Search** narrows the board or sheet within one frame, as it does now for the board.

**Constraints**:
- **No behaviour changes (FR-003):**
  - search: the same filtering on Board;
  - the Inbox: the same counts, panel, pinning and ring;
  - New task: the same gate (`access !== 'user'`) and the same form;
  - scope, brands, Filter and the View menu: the same saved choices;
  - the view: the same `?view=` links.
- **Token colours and fonts only (§I).** Every new word exists in English and Arabic (§V).
- **The pipeline columns, cards, sidebar and sheet grids are not touched.** That is the user's confirmed scope.

**Scale/Scope**:
- **Five new components:**
  - `BoardHeader` (top bar and title row);
  - `BoardToolbar`;
  - `ViewPair`;
  - `BrandMenu`;
  - `PhoneSearch`, which is part of the top bar.
- **Changes to existing components:**
  - `KanbanBoard` (layout and wiring);
  - `BoardFilters` (only its trigger and its export);
  - `InboxButton`, a variant;
  - `UserMenu`, a variant;
  - the two sheet bars;
  - `globals.css`;
  - both message files.
- **One new lab.**

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-checked after Phase 1 design (below).*

| Principle | Gate | Status |
|---|---|---|
| **I. Design System Fidelity** | Tokens only; the agreed fonts. | **Pass.** Colours come from `PIPE` and `INBOX_UI` (lime CTA, purple soft fill, urgent orange). Montserrat for the title and the tabs, Inter for the rest. The new CSS block uses the existing variables. |
| **II. Workflow Pipeline Integrity** | No stage or SLA change. | **Pass.** Nothing about stages, moves or celebrations changes. |
| **III. Role-Based Feature Access** | Gates unchanged. | **Pass.** + New task stays hidden for `user` members. The Content toolbar keeps its existing gates (+ Theme for admins). |
| **IV. Design-Driven Development** | Design file before UI. | **Pass.** `design/board-header.html` is committed and published (a clickable preview with desktop, phone, Arabic, Inbox states and a member switch). Plain HTML, as in specs 005–010. |
| **V. Cultural UX** | Arabic; the header mirrors. | **Pass.** A new `header` namespace in both files, checked for parity. Logical properties throughout, so the header mirrors. The greeting stays on My Day. |
| **VI. State Architecture** | No new persisted store state; unions in the types first. | **Pass.** `BoardTab = 'pipeline' \| 'content'` goes in `src/types/index.ts`, derived from `BoardView`. The phone search's open state is local. Nothing new is persisted. |
| **Tech Stack** | No new dependency. | **Pass.** |

No violations. **Recorded supersession:** spec 006 FR-012a (a filled, tall Inbox button) is replaced by spec 011 FR-012 (a compact button with a badge). Every other spec 006 rule stands, including the urgent colour, "All clear", the ring and the panel.

## Project Structure

### Documentation (this feature)

```text
specs/011-board-header/
├── spec.md · plan.md · research.md (R1–R12) · data-model.md · quickstart.md
├── contracts/header-ui.md      # components, props, data attributes, keyboard, breakpoints
├── reference.webp              # the user's target image
├── current-desktop.png · current-phone.png   # today's header, measured
└── checklists/requirements.md
design/board-header.html        # the clickable preview (design file, §IV)
```

### Source Code (repository root)

```text
src/types/index.ts                         # + BoardTab
src/components/board/
├── BoardHeader.tsx       # NEW: top bar (tabs, search, Inbox, avatar) + title row (title, New task)
├── BoardToolbar.tsx      # NEW: scope pair, BrandMenu, Filters, "no project" note, ViewPair, Display options
├── BrandMenu.tsx         # NEW: All brands ▾ on FieldPill, logos + checks
├── ViewPair.tsx          # NEW: Board | Sheet (used by BoardToolbar and the video sheet bar)
└── TitleTicks.tsx        # NEW: the purple tick accent (SVG)
src/components/kanban/KanbanBoard.tsx      # one page column: BoardHeader, then the view's row 3 and body;
                                           # greeting, PIPELINE heading and old tools removed; search passed to sheets
src/components/kanban/BoardFilters.tsx     # the top line (scope, logo row, dark Board label) moves out;
                                           # FiltersButton (the Filter popover) is exported for the toolbar
src/components/inbox/InboxButton.tsx       # + variant "compact": summary → title + sr text; badge as today
src/components/inbox/ViewMenu.tsx          # trigger label "Display options" + toolbar style
src/components/shared/UserMenu.tsx         # + variant "header": avatar trigger, panel opens downward
src/components/sheet/VideoSheet.tsx        # bar: 3-way switch → ViewPair at the end; + query prop
src/components/content/ContentSheet.tsx    # bar: 3-way switch removed; + query prop
src/components/sheet/rows.ts, content/rows.ts  # title filter that keeps parent rows
src/app/globals.css                        # "board header (spec 011)" block; old .fx-board-head phone rules removed;
                                           # .fx-sheet fills the space left under the header
messages/en.json, messages/ar.json         # + header.*
scripts/header-lab/                        # NEW lab (entry, fixtures, scenarios), npm run lab:header
scripts/sheet-lab/, scripts/inbox-lab/     # selectors updated for the switch and the compact Inbox
```

**Structure Decision**: These are the existing Next.js `src/` folders. The header gets its own `src/components/board/` folder, because it now serves three views and isn't only the kanban's. The existing popovers and menus are reused. A new lab, following the inbox lab's pattern, checks the header without a database.

## Phase 0 → Phase 1

- [research.md](./research.md): R1–R12, with no open questions.
- [data-model.md](./data-model.md): no stored data. It covers the UI state, where each choice is kept, and the view and tab mapping.
- [contracts/header-ui.md](./contracts/header-ui.md): the components, their props, the data attributes for tests, the keyboard behaviour and the breakpoints.
- [quickstart.md](./quickstart.md): the lab, the regressions, the build, and the running-app measurements.

## Constitution Check (post-design)

The design adds no stored state and no dependency. It keeps every gate, and uses only tokens and translated strings. **Still passing.** It still contains the one recorded supersession (spec 006 FR-012a).

## Complexity Tracking

No violations to justify.
