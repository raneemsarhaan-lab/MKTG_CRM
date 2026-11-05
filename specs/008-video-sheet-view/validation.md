# Validation record: Video Sheet View

**Date**: 2026-11-04 · **Branch**: `claude/nice-noether-x4rgei`

How spec 008 was checked, and what wasn't. Use this in the PR description.

## 1. Static checks and build

| Check | Result |
|---|---|
| `npm run typecheck` | Pass |
| `bash scripts/preflight.sh` | Pass |
| `next build` (production) | Pass: every route compiles |
| `prisma db push` on local PostgreSQL | Pass: `task_clips`, `tasks.published_url`, `tasks.dropped_at` |
| `npm run lab:attachments` (regression: the uploader moved, link tiles added) | 60/60 pass |
| `npm run lab:brief` (regression) | 55/55 pass |
| `npm run lint` | **Not run.** `next lint` no longer exists in Next.js 16 and the repo has no ESLint config (unchanged since spec 005). |

## 2. Sheet lab: `npm run lab:sheet`

**68/68 pass**: 10 checks in Node, then 58 browser scenarios against the real `VideoSheet` with a stub host.

| Group | Covered |
|---|---|
| Node checks | File names (the team's real names, spaces, capitals, out-before-in), **`allowedStages` against the old inline rule in over 5,000 combinations** (every stage × member × assignee × 8/9-stage × dropped), clip times, row order and filters, the summary against a hand count, the paste parser (new / existing / unmatched, 200-row cap), column sets per role, `subtractBusinessDays` against `businessDaysBetween`, **tokens-only**, **messages-parity** |
| US1–US7 | Every acceptance scenario, as `usN-M` |
| SC checks | `sc-007-rows` (≥ 20 rows at 1366×657), `us2-2-*` (the menu equals the board's moves for five members, SC-003), `paste-13` (SC-001) |
| Extra | `us1-highlight`, `us2-tip-focus` (real name on keyboard focus), `us2-video-alone` (FR-024), `us3-text`, `paste-210`, `us5-readonly`, `us6-no-storage`, `us7-restore-editing` |
| Cross | `kbd-only` (SC-008), `rtl-grid`, `rtl-arrows`, `rtl-paste`, `phone-390`, axe on the grid, the three menus, the paste preview and the link prompt (no critical or serious issues) |

## 3. The running app (quickstart §3)

Local PostgreSQL with the seeded team and `scripts/sheet-lab/seed.ts`, `next dev`, **no bucket**. A script drove three signed-in members (Marketing Manager admin, Video Editor, Content Creator) and checked the database after each step: **32/32 pass, no console errors.**

| # | Check | Result |
|---|---|---|
| 1 | Board → Sheet; summary against a database count | Pass ("12 clips … 3 published (1 no link) · 1 dropped") |
| 2 | Admin moves a clip; board card | D-Check, stage date today; card in the D-Check column (SC-002) |
| 3 | Video Editor | Opens on Editing (SC-006); menu starts with the next stage; own stage, forward: the celebration plays |
| 4 | Video Editor, clip they don't hold | Plain badge, no menu |
| 5 | Content Creator ("user") pastes 3 rows | "1 new · 1 already in the sheet · 1 without a clip file name"; one clip stored: theirs, unassigned, Reel, To Do, parsed times, link attached |
| 6 | Content Creator | No New task button (FR-036) |
| 7 | Two members add the same row at the same moment | One clip; the other says "1 was already added by someone else" |
| 8 | 13 rows into an empty video | 13 clips with times and links, in about half a second (SC-001) |
| 9 | Title, editor, out time; an out time before the in | Saved; refused with a note; length recomputes |
| 10 | Drive link pasted into Files | Stored as `text/uri-list`; LINK tile in the panel, opens in a new tab |
| 11 | 9 MB video, no bucket | Refused before reading, with Paste a link instead; nothing stored |
| 12 | 17 KB real MP4 | Stored byte for byte (same SHA-256); a poster frame saved as the card cover |
| 13 | Published, Skip | Missing link; summary's "no link" goes up by one |
| 14 | Drop | `dropped_at` set, status unchanged; gone from the board |
| 15 | Dropped for days, then Restore | Back at its stage; business days in stage the same (4 → 4) |
| 16 | Open sheet from a clip's panel | The video's sheet, that row highlighted |
| 17 | Arabic | Right to left, Arabic stage names, Western digits |
| 19 | Room at 1366×768 | 23 rows (SC-007) |

**Fixed during validation** (all in this branch):

- **Unmatched paste rows were added by default.** The spec's own test ("Add creates exactly one clip") says a row without a clip file name is added only once fixed in place. The preview, its test and the design file now do that.
- **Dropped rows were `aria-disabled`.** That told assistive technology the whole row was disabled, while Restore inside it must work. The row now says "dropped" in hidden text instead.
- **axe findings**: the grid is now a `treegrid` (its rows expand and collapse); quiet text, Missing link and dropped text were darkened to meet contrast; menu items' spoken names now match what is shown.
- **The link field used `type="url"`**, so the browser's own check hid ours. It is a text field with a URL keyboard now.
- **Upload names**: every upload was being renamed "(2)"; only a real name clash is renamed now.
- **Delete on a title cell** did nothing; it now opens Drop, as on the row number.
- The status tooltip no longer shows through an open menu.

## 4. Deviations from tasks.md

| Task | What differs | Why |
|---|---|---|
| T043 | `src/actions/members.ts` counts were **not** filtered by `dropped_at` | They decide whether a member can be deleted. Leaving dropped clips out would let someone who still owns a dropped clip be deleted, and the delete would then fail on the foreign key |
| T028 | `paste-race` runs against the running app (§3 row 7), not the lab | Only the real database proves the lock |

## 5. Not verified here

| Item | Why |
|---|---|
| **Uploads with a bucket** (SC-005: a 120 MB clip byte for byte) | No object storage in this environment. The bucket path is spec 007's, unchanged, moved to `src/lib/attachment-upload.ts`. Check on Cranl with spec 007 T045 |
| **SC-009** (the team stops using the Google Sheet) | Ask the Marketing Manager after two weeks |
| **Arabic video stage names** | Proposed; need a native speaker's check |
| **Screen readers and phones** | axe and device emulation only |
