# Validation record: Content Library Sheet

**Date**: 2026-11-04 · **Branch**: `claude/nice-noether-x4rgei`

How spec 009 was checked, and what wasn't. Run end to end without stopping, at the user's request.

## 1. Static checks and build

| Check | Result |
|---|---|
| `npm run typecheck` | Pass |
| `bash scripts/preflight.sh` | Pass |
| `next build` (production) | Pass |
| `prisma db push` + seed on local PostgreSQL | Pass: `content_pillars`; theme fields on `projects`; `tasks.pillar_id`, `tasks.post_url`; `task_attachments.link_role`; Article, Report and Framework/Model with 11 SLA rows each |
| `npm run lab:attachments` (regression) | 60/60 pass |
| `npm run lab:brief` (regression) | See §2 |

## 2. Sheet lab: `npm run lab:sheet` (both sheets)

**The shared grid core (T008).** Spec 008's video sheet runs on the core extracted for this feature. Its 68 checks passed on the core before any content UI was built, and pass again in the full run.

**Full run: see the result recorded below.** Spec 008's checks, plus spec 009's:
- **4 Node checks**:
  - readers: status words including "Initial Design", "Final Design", Archived and blank; types including "Social Media" → Post; frequency, audience, Task Links and links;
  - reading the reference rows as plain text: 18 pieces, merged cells carried down, pillars not carried into the next theme, "Link error" and the post title never links;
  - classifying them: **11 new, 7 matched (SC-001)**, and a `user` blocked from new themes but allowed in her own;
  - cadence and summary.
- **Browser scenarios**, `cus1-*` to `cus7-*`:
  - the reference pasted as Google Sheets HTML with `rowspan` merged cells;
  - a second paste adds nothing;
  - the status menu equals `allowedStages` for four members;
  - the published and post link prompts;
  - "Not a link" refused;
  - cadence "2 of 2 ✓";
  - the theme editor;
  - video pieces expanding into clips;
  - + Piece for the theme owner and not for others;
  - Archive, due date and pillar.
- **Cross-cutting**: `content-kbd`, `content-rtl`, `content-phone`, `content-rows` (≥ 20 rows, SC-006) and `content-axe` (grid, theme editor, plan preview: no critical or serious issues).

The lab now also fails any scenario that logs a missing message (`MISSING_MESSAGE`). That check was added after the running app found one (§3).

## 3. Running app

Local PostgreSQL, `next dev`. `scripts/sheet-lab/seed-content.ts` creates the seven board tasks the reference links to, under their real ids, and writes the reference rows as Google Sheets HTML. A script then drove the admin and the Content Creator, checking the database after each step: **23/23 pass, no console errors.**

| # | Check | Result |
|---|---|---|
| 0 | Board → Content | Switches in place (`?view=content`) |
| 1 | Paste the 18 reference rows | "11 new · 7 matched by Task Link · 0 already in the sheet · 0 with problems"; 2 new themes, 2 pillars; "Link error" and the post title listed as cells left empty |
| 2 | Add | 2 themes, 2 pillars, 18 pieces, 7 of them the linked tasks, in about 2 s (SC-001). A second paste: "0 new · 7 matched · 11 already in the sheet"; still 18 pieces (FR-035) |
| 3 | Statuses | Initial Design → D-In Progress; blank → To Do; iPhone 18 archived and off the board; matched tasks keep their stage unless "Use the sheet's title and status" is ticked |
| 5 | Links (SC-005) | No post or published link and no role link that isn't http(s); 7 design links stored as link attachments |
| 6 | Summary and cadence (SC-004) | Match the database ("17 pieces · 9 published (2 no link) · 3 in design · 1 archived"); pieces imported as Published don't count toward this week, so Strategy reads "this week 1 of 2" |
| 7 | Move in the Content sheet (SC-002) | D-Check in the database, and the card in the board's D-Check column |
| 4 | Content Creator (`user`) owning Strategy (SC-009) | No New task button; + Piece works in Strategy (owned by her) and is refused in Newsjacking |
| 8 | Arabic | Right to left, Arabic stage names |

**Fixed during validation:**
- **The advisory lock returned `void`**, which Prisma's `$queryRaw` can't read, so every Paste plan failed in the real app. It now uses `$executeRaw`. The lab's stub host couldn't catch this; only the real database did.
- **The status menu's group headings were missing** from the `content` strings (`content.menu.*`). The lab now fails on missing messages.
- **Cells that aren't links**: the reference's Working Doc column holds document names, not links. Treating each as a blocking problem would have blocked most rows, so they are now warnings: the row is added and the cell left empty unless a link is pasted. FR-034 was refined to match.
- **Matched tasks in an ordinary project** were skipped. Now only a task in another **theme** needs Move here.
- **Fast typing on "+ Clip" / "+ Piece"** lost the first letter, and could start a second draft: keys typed before the new input mounted were handled by the grid. The grid core now keeps those keys for the new input (spec 008's `kbd-only` caught it).
- **Enter selected the whole cell**, so typing replaced it. Enter, F2 and double-click now edit with the caret at the end. Arriving by Tab still selects, like a form field, and typing a character still replaces.
- **Cadence colour** below contrast: a new `SHEET_UI.ok` / `--sheet-ok`.
- **The import inflated cadence.** Pieces pasted as Published got today's date, so Newsjacking read "this week 6 of 1". The sheet doesn't say when they were published, so they are now dated just before the current week. Only pieces published in Momentum count toward cadence (checked in §3 row 6).

## 4. Not verified here

| Item | Why |
|---|---|
| SC-008 (the team stops editing the Google Sheet) | After launch |
| Samaa and Noran as owners | Not in the local team; the paste correctly fell back to the person pasting and said so. On Cranl, their names will match |
| Real screen readers, phones | axe and emulation only |
