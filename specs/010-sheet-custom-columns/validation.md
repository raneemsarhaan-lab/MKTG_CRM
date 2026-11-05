# Validation record: Sheet columns you can shape

**Date**: 2026-11-05 · **Branch**: `claude/nice-noether-x4rgei`

How spec 010 was checked, and what wasn't.

## 1. Static checks and build

| Check | Result |
|---|---|
| `npm run typecheck` | Pass |
| `bash scripts/preflight.sh` | Pass |
| `next build` (production) | Pass |
| `prisma db push` on local PostgreSQL | Pass: `sheet_columns` and `sheet_values` |
| `npm run lab:inbox` (regression) | 11 Node checks and 38 scenarios, all pass |
| `npm run lab:attachments` (regression) | 60/60 pass |
| `npm run lab:brief` (regression) | 55/55 pass |

## 2. Sheet lab: `npm run lab:sheet` (both sheets)

**Full run: 145/145 pass.** That is the checks from specs 008 and 009, plus spec 010's.

- **5 Node checks:**
  - `cols-layout`: the default layout, records, a built-in added later, and Title first;
  - `cols-ops`: rename, move, shown per set, width;
  - `cols-parse`: the seven kinds, including dates written DD/MM/YYYY and checkbox words in English and Arabic;
  - `cols-names`: empty, too long, a name already taken (including built-in names), and headings matched by current name;
  - `cols-paste`:
    - 18 plan rows with Hook, Words and Go-live give 54 values (SC-006);
    - a bad number is a warning, never a stored value;
    - Notes is listed as not imported;
    - the renamed "Copy status" column is still read as Status;
    - a clips heading row fills Hook and Music cleared, without taking the hook as the title.
- **Browser scenarios `col-*`, `vcol-*` and `cols-*`:**
  - rename, including a name already taken or empty;
  - add each kind, and insert before or after a column;
  - typed values, and refusals ("Not a number", "Not a link");
  - row-rule read-only cells, while the column menu stays open to everyone;
  - move from the menu, by dragging (nothing goes before Title), and from the Columns panel, which shows "Changed by …";
  - hide and show;
  - delete with its count, then Undo with the values back;
  - kind change with a review first, and an option in use replaced;
  - resize, and double-click to fit;
  - Video sets: hide in Editing only;
  - type-ahead for Type and Choice cells: fast typing stays in order, a missing option is added, and only admins may add a type;
  - paste (`col-7-*`, `vcol-7-*`):
    - all 18 pieces get their three values;
    - existing values are kept, and only empty cells are filled;
    - a bad value is listed and not stored;
    - Not imported, then Add as a column, then filled;
    - clips get their values, including a clip already in the sheet;
  - keyboard: Alt+↓, and focus moving into the panel;
  - Arabic;
  - axe on the sheet, the panel, the editor, the type-ahead and the paste preview: no critical or serious issues;
  - `cols-span-scroll` (see §4).

## 3. Running app

Local PostgreSQL and `next start`, signed in as two members: the admin, and the Content Creator (a `user`). The script is the quickstart §2 walk-through. It checks the database after each step. **25/25 pass, no page or console errors.**

| # | Check | Result |
|---|---|---|
| 2 | The `user` renames Status to "Copy status", adds Hook (Text) and Platform (Choice: LinkedIn, Instagram, X), and fills both on their piece | Stored, with the type-ahead picking Instagram from "ins" |
| 3 | The admin opens the sheet | Heading, both columns and both values are there. Columns shows "Changed by Content Creator, this minute" (SC-003, FR-004) |
| 4 | The admin drags Assignee after Title, hides Pillar and widens Hook; the `user` reloads | All three hold (width 240, shown at 240) |
| 5 | Status moved to the far end; a piece moved to Published | The status menu still works. The move goes through, then the sheet asks for the published link, as in spec 009 (SC-004, SC-005) |
| 6 | Delete Hook | "1 row has a value" shown first. Undo within 10 s brings back the column and its value (SC-007) |
| 7 | Paste the 18 reference rows with Hook, Platform and Notes | Hook and Platform matched. Notes was listed, added as a Text column, then filled. The 17 live pieces got 51 values. The archived piece is read-only and got none. The `user`'s own values were kept (SC-006) |
| 8 | Video sheet: hide Source in Editing; add a Video "Hook" | Source is still in Full. The Content sheet's Hook is unchanged |
| 9 | Arabic | Custom names show as typed. Reset name restores «المرحلة» |

## 4. Found and fixed during validation

- **Theme and video rows scrolled out of view.** On a row whose title spans the whole row (a theme, a video), the name moved off screen when the grid scrolled sideways. This was already the case in specs 008 and 009; wider and added columns made it common. The span's content now stays at the start (`globals.css`). The lab check `cols-span-scroll` fails without the fix and passes with it.
- **The paste preview over-counted values.** It counted values for pieces already in the sheet that the member can't edit, such as archived pieces or other people's. It now counts only the values that will be stored. The server already refused them.

## 5. Not checked

- The Arabic strings (`sheet.columns.*`) still need a native speaker's review.
- Two people editing the layout at the same moment were not tried in a browser. The advisory lock and re-read are covered by reading the code, not by a test.
- Paste clips' preview counts values for clips the member can't edit. The server skips those, as it does for Paste plan, but the preview number can be higher than what is stored.
- Not yet run on Cranl.
