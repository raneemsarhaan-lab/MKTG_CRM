---

description: "Task list for Sheet Formatting, Editing Tools and Comments (spec 015)"
---

# Tasks: Sheet Formatting, Editing Tools and Comments

**Input**: Design documents from `specs/015-sheet-formatting-comments/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/](./contracts/), [quickstart.md](./quickstart.md)

**Tests**: As in specs 012–014, each story is checked with labs (`lab:spreadsheet`, `lab:sheet`), a server smoke test and running-app checks, so lab tasks are included per story. There is no separate unit-test framework.

**Organization**: Tasks are grouped by user story (spec.md US1–US5) and by delivery stage (research R10):
- **Stage 1** = US1, US2, US3 (one PR);
- **Stage 2** = US4 (one PR);
- **Stage 3** = US5 (one PR).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no unfinished dependency).
- **[Story]**: US1–US5 from spec.md.

---

## Phase 1: Setup

**Purpose**: The design gate and the lab skeleton.

- [X] T001 Write `design/sheet-formatting.html` (constitution §IV), publish it as an artifact and get the user's approval **before any UI task**. It shows, with `SHEETS_UI` / `--sh-*` tokens:
  - the format toolbar in Excel's Home-tab order (contracts/ui.md §1), with the stage 2 and 3 controls drawn but marked as later;
  - the colour picker (theme × tints, standard, recent, More colours) and the border picker (13 presets, line style, colour);
  - Format Cells with its five tabs (Number, Alignment, Font, Border, Fill) and the live preview;
  - a formatted blank sheet: header row, fills, borders, wrapped text, a merge, Currency and date columns;
  - a comment marker, the thread popover (replies, @mention picker, ⋯ menu, Resolve) and the comments panel (Open / Resolved);
  - the Content sheet with a filled task row around a status pill, and Merge disabled with its reason;
  - stage 2 dialogs (Find & Replace, Paste Special) and frozen and hidden headings; stage 3 (Sort, New rule, Manage rules, a table with banding and filter buttons);
  - a 390 px phone (bottom-sheet Format tabs, full-screen thread) and Arabic (RTL).
- [X] T002 [P] Extend the lab in `scripts/spreadsheet-lab/`:
  - add `format` and `comments` sections to `pure-entry.ts` and `pure.mjs`;
  - add fixtures for a real Excel HTML clip with a `<style>` block (`scripts/spreadsheet-lab/fixtures/excel-styled.html`) and a Google Sheets clip with inline styles (`scripts/spreadsheet-lab/fixtures/gsheets-styled.html`);
  - the browser scenarios live where the sheet UI lab already runs: `scripts/sheet-lab/scenarios/format.mjs` and `comments.mjs`, registered in its `scenarios/index.mjs` (added with the UI tasks).

---

## Phase 2: Foundational (blocks every story)

**Purpose**: Schema, types, the pure format module, strings, the save path and the grid hook that every story uses.

**⚠️ No story work starts until this phase is done.**

- [X] T003 Add the stage 1 schema to `prisma/schema.prisma` (data-model §1):
  - `SheetFormat` → `sheet_formats`, primary key `(sheet_id, row_key, col_key)`, `style Json`, `updated_by` (set null on delete), `updated_at`, cascade from `Sheet`;
  - `SheetMerge` → `sheet_merges` (`id`, `sheet_id`, `top_row`, `bottom_row`, `left_col`, `right_col`), cascade from `Sheet`;
  - `SheetComment` → `sheet_comments` with `root_id` self-relation, `author_id` (set null), `mentions String[] @db.Uuid`, `created_at`, `edited_at`, `deleted_at`, `resolved_at`, `resolved_by`; indexes `(sheet_id, row_key, col_key)` and `(root_id)`;
  - apply with `bash scripts/migrate.sh`.
- [X] T004 [P] Add the types to `src/types/index.ts` (data-model §3): `CellStyle`, `BorderSide`, `NumberFormat`, `SheetFormatRecord`, `SheetMergeRecord`, `SheetCommentThread`, `SheetCommentItem`, `SheetThreadSummary`, `SheetView`; extend `SheetDoc` with `formats`, `merges`, `view` and `threads`; add `'sheet_mention' | 'sheet_reply'` to `NotificationKind` and its list (around line 326).
- [X] T005 [P] Write the pure module `src/lib/sheet-format.ts` (research R1–R3):
  - `FONTS` (Inter, Montserrat, IBM Plex Sans Arabic, Caveat, Calibri→Carlito/Arial, Arial, Georgia, Times New Roman, Courier New, Verdana, Tahoma, Trebuchet MS) and `PALETTE` (10 theme colours × 5 tints, 10 standard colours);
  - `validateStyle(input)`: keeps only known fields in range (size 6–72, indent 0–15, dp 0–10, `#RRGGBB` colours, known enums), returns `null` when empty;
  - `mergeStyle(base, patch)`, `diffStyle`, `resolveStyle(formats, rowKey, colKey)` layering sheet → column → row → cell;
  - `styleKey(style)` and `toCss(style, { rtl })`: inline CSS, borders as inset box-shadows, mirrored `left`/`right` in RTL, cached by key;
  - `display(text, num, locale)`: reads numbers (`12500`, `1,250.5`, `12.5%`, Arabic digits) and dates (ISO, `16/11/2026`, `16 Nov 2026`); formats with `Intl` or a custom pattern (`dd/mm/yyyy`, `ddd d mmm`, `yyyy-mm-dd`); returns the text as typed when it can't be read;
  - `bumpDecimals(num, ±1)`.
- [X] T006 [P] Add `FORMAT_UI` (toolbar, picker, panel and marker colours from existing tokens only) to `src/lib/tokens.ts` and matching `--fx-*`/`--sh-*` variables to `src/app/globals.css` (§I).
- [X] T007 [P] Add the `sheets.format` and `sheets.comments` namespaces (about 180 keys: toolbar groups and controls with shortcuts, picker labels, Format Cells tabs, number-format names, merge warnings, comment UI, errors `protected`, `merge_overlap`, `linked`, `not_author`, `too_long`, `empty`, ICU plurals) to `messages/en.json` and `messages/ar.json`, plus the notification strings for `sheet_mention` and `sheet_reply`. Keys stay flat where `messages-parity` needs it.
- [X] T008 Extend undo and the doc in `src/lib/sheet-undo.ts` and `src/lib/sheet-doc.ts` (research R6): new change kinds `formats` (`{ rowKey, colKey, before, after }[]`), `merges` (`add` / `remove`) and `view`; `invert`, `inverseSteps` and `applyChange` handle them; a whole-column or Ctrl+A format is one record and one step.
- [X] T009 Extend the server in `src/actions/sheets.ts` (contracts/server.md):
  - `loadSheet` returns `formats`, `merges`, `view` and thread summaries;
  - `applySheetChanges` accepts `formats` (`set` / `merge`, validated with `validateStyle`, at most 20,000 records, empty style deletes), `merges` (refuses overlaps with `merge_overlap`) and `view`;
  - formats and merges are refused on a protected sheet unless the member is the protector or an admin (`protected`);
  - new `loadLinkedSheetExtras(sheetId)` and `applyLinkedFormats(sheetId, { formats, view })` for the Content and Video sheets: any member, never touches tasks, `merges` refused with `linked`.
- [X] T010 [P] Extend the injected API in `src/components/sheets/types.ts` and `src/components/sheets/api.ts` with `loadLinkedSheetExtras`, `applyLinkedFormats` and the comment actions (T029); and teach `src/components/sheets/useOutbox.ts` to queue `formats`, `merges` and `view` with the cell changes.
- [X] T011 Add the style hook to `src/components/sheet/GridCore.tsx`: `GridModel` gains optional `cellStyle(row, col): CellCss | null` (from `toCss`: the cell's style, rotated text and a border overlay with real line styles). The shown text (number formats) comes from each model's own `render`, so the editor keeps the raw text; wrapped rows growing is wired in T018 (reuse `rowHeight` / `onRowResize`).
- [X] T012 Lab: pure checks in `scripts/spreadsheet-lab/pure.mjs` for `validateStyle` (drops unknown and out-of-range fields), `resolveStyle` layering, `toCss` (borders, RTL mirroring, cache), undo of `formats` / `merges` / `view`, and a server smoke test in `scripts/spreadsheet-lab/smoke/run.ts` for `applySheetChanges` formats (protected refusal, 20,000 cap, empty style deletes) and `applyLinkedFormats` (no task change, merges refused).

**Checkpoint**: schema applied, `lab:spreadsheet` pure checks and the smoke test pass, typecheck clean. **T001 approved** before Phase 3.

---

## Phase 3: User Story 1 - Make cells look the way I want (Priority: P1) 🎯 MVP · Stage 1

**Goal**: Font, fill, borders, alignment and merges on every sheet, saved for everyone, and kept through copy and paste with Excel and Google Sheets.

**Independent Test**: Format a block with each font, fill, border and alignment control, merge a header, reload, and open as another member: same look. Copy into Excel and paste a formatted table back: styles kept (quickstart rows 1, 3–6).

- [X] T013 [P] [US1] Build the colour picker in `src/components/sheets/format/ColorPicker.tsx` (`data-color-picker`): Automatic / No fill, theme columns × tints, standard colours, recent colours (kept in `localStorage`, wrapped in try/catch), More colours (native `<input type="color">`), keyboard grid navigation, labelled swatches.
- [X] T014 [P] [US1] Build the border picker in `src/components/sheets/format/BorderPicker.tsx` (`data-border-picker`): 13 presets (all, outside, inside, top, bottom, left, right, thick outside, thick bottom, top and bottom, top and thick bottom, no border, more…), line style and line colour; a pure `bordersFor(preset, rect)` in `src/lib/sheet-format.ts` returns the per-cell side changes for a block.
- [X] T015 [US1] Build the toolbar in `src/components/sheets/format/FormatToolbar.tsx` (`data-format-bar`, contracts/ui.md §1): Font group (font ▾, size ▾, B I U S, text colour, fill, borders), Alignment group (left/centre/right, top/middle/bottom, wrap, indent − +, rotate ▾, Merge ▾); every control has `data-fmt`, a label, a tooltip with its shortcut and `aria-pressed` from the active cell's resolved style; groups that don't fit fold into More ▾; stage 2 and 3 controls are not rendered yet.
- [X] T016 [US1] Write the formatting commands in `src/components/sheets/format/useFormatCommands.ts`: turn a selection into `formats` records (whole column, whole row and Ctrl+A become one record; cells with their own style are updated), toggle logic for B/I/U/S, apply as one undo step through the outbox; keyboard shortcuts Ctrl/Cmd+B, I, U, 5 (FR-003).
- [X] T017 [US1] Merges in `src/components/sheet/GridCore.tsx` and `src/lib/sheet-format.ts` (research R4): the anchor cell is drawn over the covered area, covered cells render empty and can't be focused, selecting into a merge selects all of it; Merge & Centre, Merge Across, Merge Cells and Unmerge; merging a block with more than one value asks first (reuse `Modal` from `src/components/sheets/Dialogs.tsx`) and the undo step restores the cleared values; inserting inside a merge widens it, deleting an edge row or column shrinks it.
- [X] T018 [US1] Wire formatting into blank sheets in `src/components/sheets/BlankSheet.tsx` and `src/components/sheets/Workbook.tsx`: the toolbar under the workbook toolbar, `cellStyle` / `display` from the doc's formats, merges passed to GridCore, protected sheets show the toolbar disabled with the reason for non-protectors.
- [X] T019 [US1] Clipboard styles in `src/lib/sheet-clipboard.ts` (research R6, SC-003): `parseHtmlTable` reads Excel's `<style>` block (`.xl65 { … }`), each cell's `class` and `style`, mapping `font-weight`, `font-style`, `text-decoration`, `color`, `background`, `text-align`, `vertical-align`, `border-*`, `white-space` and `mso-number-format` to `CellStyle`; unsupported styles and unknown fonts are dropped; `serialise` writes inline styles and the shown text in HTML, the raw value in TSV; paste writes cells and formats in one step.
- [X] T020 [US1] Content and Video sheets in a new `src/components/sheet/useLinkedFormats.ts`, used by `src/components/sheet/SheetGrid.tsx` and `src/components/sheet/VideoSheet.tsx` (FR-070–FR-074): loads `loadLinkedSheetExtras`, keys formats by task id and column key so they follow regrouping, dropping and restoring; saves with `applyLinkedFormats`; undo through the linked toolbar undo (spec 013); built-in pills keep their colours with the fill drawn around them; Merge disabled with its reason.
- [X] T021 [US1] CSS for the toolbar, pickers, merges and fill-around-pills in `src/app/globals.css` (`.fx-fmt-*`), 44 px targets on phones.
- [X] T022 [US1] Lab: `scripts/spreadsheet-lab/pure.mjs` checks the clipboard style parser against both fixtures (≥95% of styled cells kept), `bordersFor`, merge widen/shrink; `scripts/spreadsheet-lab/scenarios/format.mjs` checks each toolbar control, shortcuts, toggle-off, Ctrl+A as one undo step, Merge & Centre with the warning and undo, and the protected-sheet refusal; `scripts/sheet-lab/scenarios/` gains a Content-sheet case (fill a task row, pill keeps its colour, Merge disabled) and the existing `lab:sheet` scenarios still pass.
  - *As built:* the browser checks for this story are in the running-app script `scripts/spreadsheet-lab/realapp/format.cjs` (see validation.md). The component labs bundle the grids without a server, and the sheet lab confirms they still work with no formatting context.

**Checkpoint**: US1 works on its own on blank and linked sheets.

---

## Phase 4: User Story 2 - Numbers, dates and money shown properly (Priority: P1) · Stage 1

**Goal**: Number, currency, percentage, scientific, date and time formats that change only what's shown.

**Independent Test**: Type numbers and dates, apply each format, check the display in English and Arabic; edit a cell and copy it out: the raw value comes back (quickstart row 2).

- [X] T023 [P] [US2] Build the number-format menu in `src/components/sheets/format/NumberFormatMenu.tsx`: format ▾ (General, Number, Currency, Accounting, Percentage, Scientific, Short date, Long date, Time, Text, More…), currency ▾ (EGP, USD, EUR, GBP, SAR, AED), % , thousands, increase / decrease decimal; each shows a sample from the active cell.
- [X] T024 [US2] Add the Number group to `src/components/sheets/format/FormatToolbar.tsx` and the shortcuts Ctrl+Shift+$, %, #, ! to `src/components/sheets/format/useFormatCommands.ts` (FR-003, FR-020, FR-021).
- [X] T025 [US2] Build Format Cells in `src/components/sheets/format/FormatCellsDialog.tsx` (Ctrl/Cmd+1, `data-format-dialog`): Number (kind, decimals 0–10, thousands, negative style, currency, custom date pattern with validation), Alignment (horizontal, vertical, wrap, indent, rotation), Font, Border, Fill tabs, a live preview using `toCss` and `display`, one undo step on OK, Esc cancels; opened from the toolbar, the cell menu and the shortcut.
- [X] T026 [US2] Make sure the editor and copy-out use raw text (FR-023): GridCore's editor reads the stored text, `serialise` puts the raw value in TSV; Arabic-digit input is read by `display` in `src/lib/sheet-format.ts`.
- [X] T027 [US2] Lab: `scripts/spreadsheet-lab/pure.mjs` checks `display` for every kind in `en` and `ar` (EGP 12,500.00, `(1,234)` in red, 12.5%, 1.25E+04, `dd/mm/yyyy`, `ddd d mmm`, text in a Currency cell shown as typed, `bumpDecimals`); `scenarios/format.mjs` checks the menu, Format Cells tabs and preview, editing shows 12500, copy-out gives the raw value.
  - *As built:* the browser checks for this story are in the running-app script `scripts/spreadsheet-lab/realapp/format.cjs` (see validation.md). The component labs bundle the grids without a server, and the sheet lab confirms they still work with no formatting context.

**Checkpoint**: US1 and US2 work together; number formats layer with fonts and fills.

---

## Phase 5: User Story 3 - Comments on cells (Priority: P1) · Stage 1

**Goal**: Threaded cell comments with replies, @mentions, resolve, a corner marker, a panel and notifications that open the cell.

**Independent Test**: Comment with an @mention, reply as the mentioned member from the notification, resolve, reopen; delete the commented row and undo (quickstart rows 7–10, 12).

- [X] T028 [P] [US3] Add the notification kinds in `src/lib/notify/recipients.ts`, `src/lib/notify/notify.ts`, `src/lib/notify/render.ts`, `src/lib/notify/email.ts` and `src/lib/notify/settings.ts` (research R5): events `{ kind: 'sheet_mention' | 'sheet_reply'; actorId; sheetId; commentId; mentionedIds | participantIds }`, `task_id` null, `meta` `{ sheet_id, folder_id, sheet_name, cell, row_key, col_key, snippet }`, `sheet_reply` grouped per thread, `sheet_mention` urgent like `mention`; the link is `/sheets/<folderId>?sheet=<sheetId>&cell=<rowKey>:<colKey>`; both kinds appear in `src/components/notifications/NotificationSettings.tsx`.
- [X] T029 [US3] Write the comment actions in `src/actions/sheet-comments.ts` (contracts/server.md): `listThreads`, `getThread`, `addComment` (allowed on protected sheets), `reply`, `editComment` (author only, `not_author`), `deleteComment` (author or admin, soft delete; a root with replies shows "Comment deleted"), `resolveThread`, `reopenThread`; body 1–5,000 characters (`empty`, `too_long`), at most 20 mentions; access checked through the sheet's folder; notifications sent through `src/lib/notify/notify.ts`.
- [X] T030 [P] [US3] Build the thread popover in `src/components/sheets/comments/CommentThread.tsx` (`data-comment-thread`): comments with author, time and "edited", reply box with the spec 012 @mention picker (reuse `src/lib/notify/mentions.ts`), ⋯ on own comments (Edit, Delete), Resolve ✓ / Reopen, Ctrl/Cmd+Enter to send, Esc to close, focus returns to the cell.
- [X] T031 [P] [US3] Build the comments panel in `src/components/sheets/comments/CommentsPanel.tsx` (`data-comments-panel`): Open and Resolved tabs, newest first, each thread named by its cell (B4, or the task and column on linked sheets), a click selects the cell and opens the thread; re-fetches when opened.
- [X] T032 [US3] Add markers to `src/components/sheet/GridCore.tsx` and `src/components/sheets/comments/CommentMarker.tsx`: a purple corner triangle (`data-comment-marker`) on cells with open threads; hover shows the thread, selecting a cell with a thread shows it beside the cell; New Comment from the cell's right-click menu, Ctrl/Cmd+Alt+M and the toolbar; 💬 button on the workbook toolbar opens the panel.
- [X] T033 [US3] Wire comments into `src/components/sheets/BlankSheet.tsx`, `src/components/sheets/Workbook.tsx` and `src/components/sheet/useLinkedFormats.ts` (threads keyed by row and column ids, or by task id and column key); the deep link in `src/app/(app)/sheets/[folderId]/page.tsx` reads `sheet` and `cell`, switches to the sheet, selects the cell and opens its thread; undoing a row or column delete brings its threads back (keys reused, FR-054).
- [X] T034 [US3] Phone and Arabic for comments: threads open full-screen on 390 px, 44 px targets, mirrored layout; CSS `.fx-cmt-*` in `src/app/globals.css`.
- [X] T035 [US3] Lab: server smoke in `scripts/spreadsheet-lab/smoke/run.ts` for every comment action and refusal (`not_author`, admin delete, `empty`, `too_long`, comment allowed on protected sheet, notifications created with the right `meta` and link); `scripts/spreadsheet-lab/scenarios/comments.mjs` for marker, hover, reply, edit, delete, resolve hides the marker, reopen, panel jump, delete-row-then-undo; a `scripts/notify-lab` case renders `sheet_mention` and `sheet_reply`.
  - *As built:* the browser checks for this story are in the running-app script `scripts/spreadsheet-lab/realapp/format.cjs` (see validation.md). The component labs bundle the grids without a server, and the sheet lab confirms they still work with no formatting context.

**Checkpoint (stage 1)**: US1–US3 all work. Stage 1 is shippable.

---

## Phase 6: Stage 1 validation and PR

- [X] T036 Run `npm run lab:spreadsheet`, `npm run lab:sheet`, `npm run lab:notify`, the typecheck and `npx next build`; fix any regressions.
- [X] T037 Running-app checks on `next build` + `next start` with Playwright (`scripts/spreadsheet-lab/realapp/run.cjs` and `perf-axe.cjs`): quickstart rows 1–14, including 10,000-cell format under 1 s (SC-002), the mention notification within 1 minute (SC-004), axe with no serious or critical issues in EN and AR (SC-006). Record results in `specs/015-sheet-formatting-comments/validation.md`.
- [ ] T038 Update `HANDOVER.md` (a "Sheet formatting and comments" section: tables, keys, actions, notification kinds) and write `specs/015-sheet-formatting-comments/constitution-check.md`; open the stage 1 PR and ask before merging.

---

## Phase 7: User Story 4 - Excel's editing tools (Priority: P2) · Stage 2

**Goal**: Format Painter, Paste Special, Clear, Fill, Find & Replace, hide and unhide, Freeze Panes, each one undo step.

**Independent Test**: Use each tool once on a sample sheet and on the Content sheet, then undo each.

- [ ] T039 [US4] Add the stage 2 schema to `prisma/schema.prisma` (data-model §2): `hidden Boolean @default(false)` on `SheetRow` and `SheetCol`; `frozen_rows Int @default(0)`, `frozen_cols Int @default(0)` and `view Json @default("{}")` on `Sheet`; apply with `bash scripts/migrate.sh`; `loadSheet` and `loadLinkedSheetExtras` return them, `applySheetChanges` / `applyLinkedFormats` accept `view` changes for hide, unhide and freeze.
- [ ] T040 [P] [US4] Format Painter in `src/components/sheets/format/useFormatPainter.ts` and the toolbar's Clipboard group: click applies the source's cell-layer style to the next selection as `set` (values kept), double-click stays on until Esc, a painter cursor and `aria-pressed`.
- [ ] T041 [P] [US4] Paste Special in `src/components/sheets/format/PasteSpecialDialog.tsx` (Ctrl/Cmd+Shift+V and Paste ▾): All, Values only, Formats only, Comments only, Transpose; one undo step.
- [ ] T042 [P] [US4] Clear ▾ and Fill ▾ in `src/components/sheets/format/useEditingTools.ts`: Clear All / Formats / Contents / Comments; Fill Down / Fill Right (Ctrl/Cmd+D, R) copying values and formats; on linked sheets values go through `useLinkedEditing`'s per-cell saves and skipped cells are counted in a status message (FR-075).
- [ ] T043 [P] [US4] Find & Replace in `src/components/sheets/format/FindReplaceDialog.tsx` (Ctrl/Cmd+F, H): client-side search over the loaded sheet's values, match case, whole cell, next / previous selecting each match, Replace and Replace all through `writeCells` (one undo step; skipped linked cells counted).
- [ ] T044 [US4] Hide, unhide and freeze in `src/components/sheet/GridCore.tsx`: hidden rows and columns are skipped with a double-line marker on the heading that unhides on click; Format ▾ (row height, column width, hide, unhide) and the row and column menus; Freeze ▾ (top row, first column, at selection, unfreeze) makes the first N rows and columns sticky with a thicker edge; linked sheets keep hidden task rows and columns in `sheets.view`.
- [ ] T045 [US4] Add the Clipboard, Cells and Editing groups (stage 2 controls) to `src/components/sheets/format/FormatToolbar.tsx` and the phone bottom sheet; strings already in T007, add any missing to `messages/en.json` and `messages/ar.json`.
- [ ] T046 [US4] Lab: `scripts/spreadsheet-lab/scenarios/editing.mjs` covers each tool and its undo, painter double-click and Esc, transpose, find with match case and whole cell, replace all count, hidden marker unhide, frozen rows staying in view while scrolling; a `lab:sheet` case for Fill Down and Replace on the Content sheet with skipped-cell counts; smoke checks for `view` saves.
- [ ] T047 Stage 2 validation: labs, build, running-app checks for each tool in EN, AR and 390 px, axe on the new dialogs; update `validation.md` and `HANDOVER.md`; open the stage 2 PR and ask before merging.

**Checkpoint (stage 2)**: US4 works on top of stage 1.

---

## Phase 8: User Story 5 - Sort, filter, styles and conditional formatting (Priority: P3) · Stage 3

**Goal**: Cell styles, Format as Table, sort, filter and conditional formatting.

**Independent Test**: Format a range as a table, filter and sort it, add a rule that fills overdue dates red, edit a value and watch the rule follow; on the Content sheet sort and filter stay within groups and don't change the board.

- [ ] T048 [US5] Add the stage 3 schema to `prisma/schema.prisma` (data-model §1): `SheetRule` → `sheet_rules` and `SheetTable` → `sheet_tables`, cascade from `Sheet`; apply with `bash scripts/migrate.sh`; add `ConditionalRule` and `SheetTableRecord` to `src/types/index.ts`; `loadSheet` / `loadLinkedSheetExtras` return them; `applySheetChanges` accepts `rules` and `tables` changes (tables blank-only), with undo kinds in `src/lib/sheet-undo.ts`.
- [ ] T049 [P] [US5] Write the pure module `src/lib/sheet-rules.ts` (research R8): rule evaluation for `gt`, `lt`, `between`, `eq`, `contains`, `date`, `dup`, `unique`, `top`, `bottom`, `bar`, `scale` over visible rows in priority order (first match wins per property); `sortRows(rows, keys)` (A→Z, Z→A, date, by colour; header row detection); `filterRows(rows, filter)` (values, colour, text/number/date conditions); refuses sort and filter across merges.
- [ ] T050 [P] [US5] Cell styles in `src/lib/sheet-format.ts` (`CELL_STYLES`: Normal, Good, Bad, Neutral, Title, Heading 1–4, Total, Note, Input, Output, Accent 1–6) and a Cell Styles ▾ gallery in `src/components/sheets/format/CellStylesMenu.tsx` that applies as `merge`.
- [ ] T051 [US5] Format as Table in `src/components/sheets/format/TableMenu.tsx` and GridCore: table styles gallery, header row and banding drawn at render, filter buttons in the header, Convert to range (FR-031).
- [ ] T052 [US5] Sort and filter in `src/components/sheets/format/SortDialog.tsx`, `src/components/sheets/format/FilterMenu.tsx` and GridCore: Sort & Filter ▾ (A→Z, Z→A, Custom sort…, Filter Ctrl/Cmd+Shift+L, Clear); blank sheets rewrite row positions in one undoable change and rows carry their formats and comments; filtered headings show ▾ highlighted; linked sheets store sort and filter in `sheets.view`, applied within groups and never to the board (FR-075).
- [ ] T053 [US5] Conditional formatting in `src/components/sheets/format/RuleDialog.tsx` and `src/components/sheets/format/ManageRulesDialog.tsx`: New rule for each kind with its arguments and a look (or bar / scale colours), Manage rules to edit, reorder and delete; GridCore draws rule styles over resolved styles, data bars and colour scales.
- [ ] T054 [US5] Add the Styles group and Sort & Filter to `src/components/sheets/format/FormatToolbar.tsx` and the phone bottom sheet; any missing strings in `messages/en.json` and `messages/ar.json`.
- [ ] T055 [US5] Lab: `scripts/spreadsheet-lab/pure.mjs` checks every rule kind, sort stability and colour sort, filter conditions, merge refusal; `scripts/spreadsheet-lab/scenarios/styles.mjs` covers cell styles, table banding and filter buttons, sort with formats and comments moving with rows, filter and clear, a rule following an edit, Manage rules reorder; a `lab:sheet` case for sort and filter within groups on the Content sheet with the board order unchanged.
- [ ] T056 Stage 3 validation: labs, build, running-app checks in EN, AR and 390 px, axe on the new dialogs and menus; update `validation.md` and `HANDOVER.md`; open the stage 3 PR and ask before merging.

**Checkpoint (stage 3)**: all five stories work.

---

## Phase 9: Polish and cross-cutting

- [ ] T057 [P] Add a daily cleanup of orphaned `sheet_formats` and `sheet_comments` (rows, columns and tasks gone for more than 30 days) to `src/lib/notify/scheduler.ts` or a new `src/lib/sheet-cleanup.ts` called from it (research R1).
- [ ] T058 [P] Performance pass on a 5,000-row formatted sheet: `toCss` cache hit rate, keystroke under 100 ms, Ctrl+A format under 1 s; record numbers in `validation.md`.
- [ ] T059 Run `/speckit-analyze`-style consistency check of spec, plan and tasks against what was built; close any gaps as new tasks.

---

## Dependencies and execution order

- **Phase 1 (Setup)**: T001 must be approved before any UI task (T013 onward). T002 can start at once.
- **Phase 2 (Foundational)**: after T001 starts; blocks every story. T003 → T009 → T010; T004–T007 in parallel; T008 after T004; T011 after T004 and T005; T012 last.
- **US1 (Phase 3)**: after Phase 2 and T001's approval.
- **US2 (Phase 4)**: after Phase 2; shares `FormatToolbar.tsx` and `useFormatCommands.ts` with US1, so T024 follows T015 and T016. The pure work (`display`) is already in T005.
- **US3 (Phase 5)**: after Phase 2; independent of US1 and US2 except for the GridCore marker hook (T032 after T011) and the toolbar button (after T015).
- **Stage 1 PR (Phase 6)**: after US1–US3.
- **US4 (Phase 7, stage 2)**: after stage 1 is merged.
- **US5 (Phase 8, stage 3)**: after stage 2 is merged (it uses `sheets.view` and hidden rows from T039).
- **Polish**: T057 and T058 can run any time after stage 1; T059 last.

### Within each story

Schema → types → pure logic → actions → components → wiring → CSS → lab.

## Parallel examples

**Phase 2:**
```text
T004 types · T005 sheet-format.ts · T006 tokens/CSS · T007 strings   (all [P], different files)
```

**US1:**
```text
T013 ColorPicker.tsx · T014 BorderPicker.tsx   (then T015 toolbar uses both)
```

**US3:**
```text
T028 notify kinds · T030 CommentThread.tsx · T031 CommentsPanel.tsx   (then T032–T033 wire them)
```

**US4:**
```text
T040 Format Painter · T041 Paste Special · T042 Clear/Fill · T043 Find & Replace
```

**US5:**
```text
T049 sheet-rules.ts · T050 cell styles
```

## Implementation strategy

- **MVP**: Phases 1–3 (design approved, foundation, US1). Formatting on every sheet is usable on its own.
- **Stage 1 release**: add US2 and US3, validate (Phase 6), one PR. This is what the user asked for first: formatting, colours, number formats and comments.
- **Stage 2 release**: US4, its own PR.
- **Stage 3 release**: US5, its own PR.
- Each stage keeps `lab:sheet` green so the Content and Video sheets never regress.
