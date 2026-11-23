<!--
SYNC IMPACT REPORT
==================
Version change: 4.0.0 → 4.1.0 (2026-11-23)
Type of bump: MINOR — spec 023 Stage A (T002): required fields join the one
  move rule; milestones are calendar markers, not tasks; task types are data.

Modified principles:
  - §II: the move rule also refuses a stage while a field required from it
    (spec 023, "Required from stage") is empty, on every path, with the field
    named. Milestones (name, date, brand) are not tasks and never enter the
    pipeline.
  - §VI: task types are the content types as data (Arabic name, icon, colour,
    defaults, attached fields); fields, their values and milestones live in
    Postgres.

Templates: no changes needed.

Previous report (4.0.0)
-----------------------
Version change: 3.0.0 → 4.0.0 (2026-11-23)
Type of bump: MAJOR — §II redefined again: one workflow (simple tasks removed),
  media tasks on the Design and Video boards, and SLA working days from
  Settings on Cairo days. Done as the first task of spec 022 (T001).

Modified principles:
  - §II: every task is a pipeline task (11 stages, or 10 when its brand had
    C-Check off). Simple tasks are removed and migrated. Media tasks (Design,
    Video) are added: linked to a content task (automatically once at Ready For
    Design, or by hand) or unlinked. allowedStages holds a content task before
    F-Check until every linked media task has passed D-Check, and keeps a linked
    media task following its content task after D-Check. SLA counts the working
    days of the Settings › Due Dates weekend, on Africa/Cairo days. The hand-off
    creates linked media tasks. Space stages rename or split original stages in
    a Space's own views only.
  - §V: the simple-task celebration is removed; tasks migrated from simple
    tasks never celebrate.
  - §VI: `MediaBoard` joins the exhaustive unions; `TaskKind` and
    `SimpleStatus` are retired. Space stages and sub-stage positions are shared
    data in Postgres.
  - Tech stack: drag-and-drop moves cards across columns only; cards are not
    reordered within a column (boards sort by due date).

Templates:
  ✅ .specify/templates/plan-template.md — no changes needed
  ✅ .specify/templates/spec-template.md — no changes needed
  ✅ .specify/templates/tasks-template.md — no changes needed

Follow-up TODOs:
  - d-check ownership → Islam (HANDOVER §14) still needs its own amendment.

Previous report (3.0.0)
-----------------------
§II redefined (the 11 stages as built, plus simple tasks), stack corrected to
what runs in production (spec 021, research R9).
-->


# Momentum Creative Ops Constitution

Momentum was called Fluxo until August 2026. Cookie and storage keys keep their
`fluxo` prefixes on purpose (HANDOVER, top note).

## Core Principles

### I. Design System Fidelity

All UI code MUST use the established token map (`src/lib/tokens.ts`, mirrored
as CSS variables in `src/app/globals.css`). Ad-hoc color literals are forbidden
outside the token files.

**Color tokens (canonical):**

| Token    | Hex       | Role                          |
|----------|-----------|-------------------------------|
| `ink`    | `#1B1A13` | Primary text                  |
| `rail`   | `#17181A` | Sidebar / dark surface        |
| `lime`   | `#C8F24E` | Primary accent / CTA          |
| `coral`  | `#F5334F` | Danger / error / overdue      |
| `violet` | `#B79CF5` | Secondary accent / super-user |
| `cyan`   | `#5B93F5` | Informational blue            |
| `mint`   | `#3FA34D` | Success / available           |
| `muted`  | `#8A8D91` | Placeholder / secondary text  |
| `soft`   | `#F7F7F7` | Soft fill / backgrounds       |
| `panel`  | `#FFFFFF` | Card / modal surface          |
| `line`   | `#E1E1E0` | Borders / dividers            |

Brand colours and stage colours are data (`brands.color`, `STAGE_COLORS`), not
new tokens.

**Typography rules (non-negotiable):**
- Headings, stat numbers, wordmark: Montserrat, weight 700–900,
  letter-spacing −0.01em to −0.03em.
- Body, labels, inputs: Inter, weight 300–700.
- Cursive accent text only: Caveat, weight 600–700.
- Font sizes: 10px (micro chips) → 38px (BigStat headline).
- No system fonts for branded text.

**Rationale**: a consistent visual language is what makes Momentum feel like a
product. Diverging from tokens breaks the unified feel across views and makes
redesigns expensive.

### II. Workflow Integrity

Momentum has **one workflow**: every task is a pipeline task.

#### The content pipeline

The pipeline is the core model of the system and MUST NOT be altered without a
constitution amendment. Its definition lives in `src/lib/stage-meta.ts`.

**Canonical stages (in order):**

| # | ID              | English label     | Arabic label                | Phase   | Owner role          |
|---|-----------------|-------------------|-----------------------------|---------|---------------------|
| 1 | `todo`          | To Do             | افكار للتنفيذ               | Intake  | Assignee            |
| 2 | `c-prog`        | C-In Progress     | كتابة المحتوى               | Content | Assignee            |
| 3 | `c-final`       | C-Review          | مراجعة المحتوى              | Content | Marketing Manager   |
| 4 | `c-check`       | C-Check           | موافقة نهائية على المحتوى  | Content | Managing Director   |
| 5 | `r-design`      | Ready For Design  | جاهز للتصميم               | Design  | Assignee            |
| 6 | `d-prog`        | D-In Progress     | تصميم                       | Design  | Assignee            |
| 7 | `d-check`       | D-Check           | مراجعة التصميم             | Design  | Brand Director      |
| 8 | `final-check`   | F-Check           | المراجعة النهائية          | Ship    | Marketing Manager   |
| 9 | `ready-publish` | Ready to Publish  | جاهز للنشر                  | Ship    | Assignee            |
| 10| `scheduled`     | Scheduled         | مجدول                       | Ship    | Assignee            |
| 11| `publish`       | Published         | تم النشر                    | Ship    | — (terminal)        |

**Rules:**
- **C-Check is optional per task.** A task created "with C-Check" has 11 stages;
  without it, 10 (`EIGHT_STAGE` in code, named for history). The choice is made
  at creation from the task's brand default (`brands.nine_stage_default`), else
  the workspace default (`workspace_settings.nine_stage_default`), and is
  immutable afterwards.
- **Ownership is by role, never by name.** Review stages belong to members whose
  `role` equals the stage's owner role. Working stages belong to the task's
  assignee or owner.
- **One move rule.** `allowedStages` (`src/lib/stage-moves.ts`) decides every
  stage change — Advance, the stage menu, Board drag across columns, Inbox,
  sheet cells and bulk moves. Admins and superusers override ownership. No
  screen may add a second path around it.
- **Published is terminal.** Nothing moves a task out of `publish`.
- **Media tasks (spec 022).** The Design and Video boards hold media tasks
  (`tasks.media_board`). A media task is *linked* to a content task
  (`tasks.content_task_id`) or *unlinked*.
  - A content task reaching Ready For Design for the first time is linked
    automatically, once, to every board its content type needs; the hand-off
    box asks for a person per board.
  - A media board can Link task (by hand) or Create task (an unlinked media task
    that starts at Ready For Design and counts SLA from there).
  - Any member may unlink (user, 2026-11-23); both tasks keep their history
    and move separately afterwards.
  - `allowedStages` MUST hold a content task before F-Check until every linked
    media task has passed D-Check, and MUST keep a linked media task following
    its content task after D-Check.
- **Required fields (spec 023).** A task type's field may be required from a
  stage. `allowedStages`' move gate MUST refuse moving a task to or past that
  stage while the field is empty, on every path (Advance, stage menu, Board
  drag, Inbox, sheets, bulk, and a linked row's move), naming the field. When
  linked media tasks pass D-Check, the content task waits instead of moving.
- **Milestones (spec 023)** are calendar markers (a name, a date, a brand). They
  are not tasks and never enter the pipeline.
- **Space stages (spec 022).** A team Space may rename or split each original
  stage in its own views. Each Space stage maps to exactly one original stage;
  every original stage has at least one. A move between Space stages of one
  original stage changes nothing outside that Space. The original stages stay
  the source of truth for SLA, approvals, overdue, reports and the main board.

**SLA enforcement:**
- Every pipeline stage carries an SLA threshold per content type, stored in
  `sla_config`; admins edit it in Settings.
- Breach is computed on render, never stored:
  `businessDaysBetween(stage_date, today) > sla[stage][type]`, counting the
  working days of the Settings › Due Dates weekend (Friday and Saturday by
  default) on Africa/Cairo days.
- A brand may switch SLA tracking off; its tasks then show no breach.

**Rationale**: the pipeline encodes the agency's real approval chain; changing
it risks corrupting task data and SLA. One workflow, with media work split into
linked media tasks, keeps every deliverable on that chain.

### III. Role-Based Feature Access

Three access tiers. Every feature gate MUST be enforced in the server action or
page guard that performs it; hiding a control in the UI is presentation only.

| Tier        | Badge color               | Capabilities |
|-------------|---------------------------|--------------|
| `admin`     | lime `#C3F53D` / `#111`   | Everything: Settings, members, team Spaces and their members, brand feature switches, SLA. |
| `superuser` | violet `#B79CF5` / `#111` | Full pipeline; creates tasks for anyone; edits team Space stages. No Settings. |
| `user`      | neutral `#EDEDEA` / `#6B` | Creates tasks they own; acts on tasks they own or are assigned; moves the stages they hold. |

Rules:
- **There is no row-level security.** Prisma connects as one database user.
  Every server action carries its own permission check (HANDOVER §6); a missing
  check is a privilege escalation, not a style issue.
- Settings is admin-only and rejects non-admins on the server.
- `currentUser.access` is resolved on the server from the session on every
  request.

**Rationale**: senior stakeholders and junior executors share the tool.
Over-privileged access risks accidental data corruption.

### IV. Design-Driven Development

Every new view or major component MUST be preceded by a standalone HTML design
file in `design/`. The design file is the source of truth for:
- Layout structure and responsive breakpoints
- Component hierarchy and naming
- Color usage (mapping to the tokens above)
- Interaction patterns (hover states, transitions, animations)
- Copy / microcopy (including Arabic labels)

Implementation MUST match the design file before shipping. Deviations require
explicit sign-off and a note in the PR. A design is re-implemented in the
codebase's React/TypeScript architecture, never pasted in.

**Rationale**: standalone HTML prototypes are the team's design handoff format.
Treating them as the spec removes interpretation gaps.

### V. Cultural UX & Celebration System

The Arabic celebration system is a first-class product feature. It MUST be
preserved in every refactor.

**Four reactions (non-negotiable):**

| Key        | Arabic label      | Emoji | Accent color |
|------------|-------------------|-------|--------------|
| `zaghrota` | زغروطة            | 🎉    | `#D4537E`    |
| `tasqeef`  | تسقيف             | 👏    | `#378ADD`    |
| `mabhour`  | انا مبهور بيا     | ⭐    | `#EF9F27`    |
| `tabla`    | طبلة              | 🥁    | `#534AB7`    |

**Rules:**
- A celebration fires for **one person**, the one who acted, never broadcast.
- Pipeline tasks: it fires when a member advances a stage they personally own
  (working stages for the assignee/owner, review stages for the matching role).
  The server's move result (`shouldCelebrate`) is authoritative.
- Tasks migrated from simple tasks (spec 022) never celebrate.
- Celebrations are opt-in per member (`celebrationsOn`).
- Sound plays the recorded assets in `public/sounds/`; the four Web Audio
  patterns in `src/lib/celebration-audio.ts` are the fallback and MUST NOT be
  replaced with generic sounds. Audio only plays off a user gesture.
- Arabic copy (stage labels, reaction copy, celebration messages) is content
  data, not hardcoded strings.

**Rationale**: the celebration system is a cultural expression of the team's
identity and makes completing work feel rewarding.

### VI. State Architecture & Persistence

- **Application data lives in PostgreSQL** and is read in server components
  (loaders such as `loadBoardData`) and written through server actions. Prisma
  results that feed components go through `src/lib/mappers.ts`.
- **Zustand (`src/store/useUIStore.ts`) holds UI ephemera only** — the open
  task, the celebration payload, dialogs (such as the hand-off box), pending
  deletes. No `persist` middleware.
- **Per-device view preferences** (a toggle, a column set, a collapsed panel,
  a calendar layout) MAY be kept in `localStorage` under `momentum.*` keys.
  They MUST be read after mount, wrapped in try/catch, and the view MUST render
  correctly without them. They MUST NOT hold application data or anything
  another member needs to see; shared things (saved views, team Space words)
  belong in Postgres, as do team Space stages and each task's sub-stage.
- **Task types are data (spec 023).** The content types are the task types:
  each has an Arabic name, an icon, a colour, defaults for new tasks and the
  fields attached to it. Field definitions, their attachments, every task's
  values and milestones live in Postgres.
- **Types**: `StageId`, `ContentType`, `Priority`, `Platform`, `AccessLevel`,
  `MediaBoard` are exhaustive unions in `src/types/index.ts`; adding a value
  updates that file first. (`TaskKind` and `SimpleStatus` are retired.)
- **Session**: one signed cookie, `fluxo_session`, verified by the same HMAC
  function in middleware and on the server (`src/lib/session.ts`). Email and
  password login only; accounts are created by admins.
- **Data changes to existing rows** go through `once()` markers in
  `prisma/seed.ts`; importers never overwrite what exists, and deletions are
  recorded as tombstones.

**Rationale**: separating server data from UI ephemera prevents stale-state
bugs and keeps authorization in one place per action.

## Tech Stack

Adding or swapping a major dependency requires a constitution amendment.

| Layer         | Choice                                                         |
|---------------|----------------------------------------------------------------|
| Framework     | Next.js 16 (App Router) + TypeScript (strict)                  |
| Database      | PostgreSQL (Cranl-hosted)                                      |
| ORM           | Prisma 5 — pinned; v7 breaks the schema (HANDOVER §4)          |
| Auth          | Custom HMAC session (`src/lib/session.ts`), bcryptjs passwords |
| Styling       | Tailwind CSS v4 + CSS variables from the token map             |
| State         | Zustand v5, no `persist` — UI ephemera only                    |
| i18n          | next-intl, Arabic + English, full RTL (cookie locale)          |
| Drag-and-drop | @dnd-kit — move across columns (no reorder within a column)    |
| Icons         | Lucide React                                                   |
| Fonts         | Google Fonts (Montserrat, Inter, Caveat)                       |
| Deployment    | Cranl, from `main`                                             |
| Testing       | `npm run typecheck`, plus per-feature labs (`scripts/*-lab`): pure checks in Node and Playwright scenarios |

**Source layout:**

```
src/
├── middleware.ts         Session guard (cookie check, redirect to /login)
├── app/                  App Router pages, layouts, route handlers
├── actions/              Server Actions — each carries its own permission check
├── components/           React components organized by view
├── lib/                  Pure logic (stage-moves, spaces, workload…), loaders, Prisma helpers
├── store/                useUIStore.ts (Zustand, UI ephemera only)
├── types/                index.ts — shared TypeScript union types
└── app/globals.css       CSS token variables, base reset, RTL logical props
```

## Governance

- This constitution supersedes all other practices. When implementation
  conflicts with a principle, the implementation MUST change.
- Amendments require documented rationale, a version bump, and updates to any
  affected templates or skill files.
- Version bump rules:
  - **MAJOR**: principle removed or fundamentally redefined.
  - **MINOR**: new principle or section added.
  - **PATCH**: wording, clarity, or typo fixes.
- PRs introducing new views, components, or state shape changes MUST include a
  "Constitution Check" referencing the relevant principles.
- Spec Kit skills (`/speckit-plan`, `/speckit-specify`, …) read this file to
  enforce compliance gates.

**Version**: 4.1.0 | **Ratified**: 2026-07-15 | **Last Amended**: 2026-11-23
