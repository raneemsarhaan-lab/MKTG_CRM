# Quickstart: validating the Video Sheet

**Feature**: spec 008 · How to prove the feature works. The details are in [data-model.md](./data-model.md) and [contracts/](./contracts/).

## 1. Prerequisites

- Node 20+, with `npm ci` done.
- Local PostgreSQL with the seeded team.
- The schema applied: `bash scripts/migrate.sh` (runs `prisma db push`).
- Chromium at `/opt/pw-browsers/chromium` (used by the labs).
- Seed for the sheet: `npx tsx scripts/sheet-lab/seed.ts`. It creates the video "Strategy Execution and Leadership" with 13 clips from the team's real file names, mixed stages, two editors, one published clip without a link, and one dropped clip. Run it again to reset.

```bash
bash scripts/migrate.sh
```

```bash
npx tsx scripts/sheet-lab/seed.ts
```

## 2. Static checks and the lab

```bash
npm run typecheck
```

```bash
bash scripts/preflight.sh
```

```bash
npm run lab:sheet
```

```bash
npm run lab:attachments
```

`lab:attachments` is a regression check: the uploader moved out of `TaskModal`, and link tiles were added.

Expected: all pass. `lab:sheet` runs its Node checks first (parser, file names, `allowedStages`, time format, summary, column defaults, business days, tokens-only, messages-parity), then the browser scenarios.

| Scenario ids | Proves |
|---|---|
| `us1-1` … `us1-5` | Video row first, clip order, frozen header and title, summary, collapse, all-videos groups |
| `sc-007-rows` | ≥ 20 clip rows visible at a 1366×657 viewport |
| `us2-1` … `us2-5` | Video names with the real name on hover; the menu equals `allowedStages` for every seeded member; optimistic move, rollback with reason |
| `us3-1` … `us3-5` | Google Sheets HTML and TSV paste; preview counts; fix in place; add; + Clip draft |
| `us4-1` … `us4-5` | Inline edits, Esc cancels, editor list order, out-before-in refused, read-only rows |
| `us5-1` … `us5-5` | Link paste shows "Drive"; stub upload with progress; over-limit refusal offers a link; Retry; Files menu |
| `us6-1` … `us6-5` | Default set per role; switch, reload, kept; Mine |
| `us7-1` … `us7-5` | Published prompt; Missing link counted; Drop, Restore; Show dropped |
| `kbd-only` | Every story's action done without the mouse |
| `rtl-*` | Arabic: mirrored grid, ← moves to the next column, Western digits |
| `phone-*` | 390 px: the grid scrolls inside its area, the page doesn't |
| `axe-*` | Grid, menus, paste preview, prompt: no critical or serious issues |

## 3. The running app

Start `next dev` (delete `.next/dev` first if styles look stale; see HANDOVER.md). Sign in as each member below. After each step, check the database with `psql` where the step says so.

| # | As | Do | Expect |
|---|---|---|---|
| 1 | Marketing Manager (admin) | Board → **Sheet** | The video group shows 13 clips in order; the summary reads "12 clips · … · 1 dropped" and matches a manual count (SC-004) |
| 2 | Admin | Open the video's sheet; change clip 4 from **Editing** to **Edit Review** | Board → the card is in D-Check with today's stage date (SC-002). `psql`: `status = 'd-check'` |
| 3 | Video Editor (clip 13's assignee) | Sheet opens on the **Editing** columns (SC-006); move clip 13 Editing → Edit Review | Celebration plays; the board card moves |
| 4 | Video Editor (not assignee of clip 5) | Open clip 5's status | Plain badge, no menu. A forged `setTaskStage` call returns `not_authorized` |
| 5 | Content Creator (`user` level, not on the video) | Sheet opens on **Copy**. **Paste clips** with 3 rows copied from a Google Sheet: 1 new, 1 existing, 1 without a file name | Preview "1 new · 1 already in the sheet · 1 without a clip file name"; Add → 1 clip. `psql`: owner = Content Creator, `assignee_id` null, `content_type_label = 'Reel'`, `status = 'todo'`, a `task_clips` row with the parsed times, and a `text/uri-list` attachment |
| 6 | Content Creator | Look for **New task** | Still hidden (FR-036). A forged `createTask` call is refused |
| 7 | Two tabs, two members | Paste the same new row in both, then Add in both | One clip is created; the second tab says it was already added (unique index) |
| 8 | Admin | Paste 13 rows from the team sheet into an empty video | 13 correct clips in under a minute (SC-001) |
| 9 | Admin | Edit a title, the editor and an out time; then an out time before the in time | The card shows the title and assignee, and the length recomputes; the bad out time is refused with a note |
| 10 | Admin | Paste a Drive link into clip 2's Files cell | The cell shows "Drive"; the task panel lists a LINK tile that opens in a new tab |
| 11 | Admin, **no bucket** | Upload a 7 MB MP4 to a clip | Refused before reading: "about 5 MB" with **Paste a link instead**; nothing stored |
| 12 | Admin, no bucket | Upload a 2 MB MP4 | Progress, then "1 file". Stored byte for byte (SHA-256 matches); the card shows a poster if the browser decoded a frame |
| 13 | Admin | Move a clip to **Published**; Skip the prompt | The cell reads **Missing link**; the summary's "no link" goes up by one |
| 14 | Admin | Drop clip 9 | Greyed and struck through; gone from the board, the overview and alerts. `psql`: `dropped_at` set, status unchanged |
| 15 | Admin, 3 business days later (shift `dropped_at` back with `psql`) | Restore clip 9 | Back on the board at the same stage; its SLA days in stage are what they were at drop |
| 16 | Admin | From clip 6's task panel → **Open sheet** | The video's sheet, with clip 6's row highlighted |
| 17 | Any | Arabic (`fluxo-locale=ar`) | The grid, summary, preview and menus mirror; times stay in Western digits |
| 18 | Any | Keyboard only: steps 2, 5, 9, 10, 13, 14 | All possible (SC-008) |

## 4. Not verifiable here

| Item | Why |
|---|---|
| SC-005: a 120 MB clip with file storage | Needs the bucket; check on Cranl with spec 007 T045 |
| SC-009: the team stops using the Google Sheet | Ask the Marketing Manager after two weeks |
| Real screen readers | axe only, here |
