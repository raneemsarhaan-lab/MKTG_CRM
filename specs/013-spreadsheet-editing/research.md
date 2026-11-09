# Research: Spreadsheet Editing and Sheet Tabs

**Feature**: [spec.md](./spec.md) · **Plan**: [plan.md](./plan.md) · **Date**: 2026-11-09

Decisions for spec 013. Each has the decision, why, and what else was weighed. The code facts come from reading `src/components/sheet/GridCore.tsx`, `SheetGrid.tsx`, `VideoSheet.tsx`, `src/components/content/ContentSheet.tsx`, `useSheetColumns.tsx`, `src/actions/sheet-columns.ts`, `src/actions/tasks.ts`, `src/components/kanban/KanbanBoard.tsx` and `prisma/schema.prisma`.

## R1. One grid engine for every sheet: grow `GridCore`, don't fork it

**Decision.** `GridCore` stays the only grid. It is shared today by the Video and Content sheets and already handles:
- a roving tabindex;
- arrows, Enter, Tab, F2 and Esc;
- typing to edit;
- spec 010's header menu, column drag and column resize.

It gains, in this order:
1. **Selection:** a rectangular range (anchor plus focus) as well as the active cell. Drag, Shift+click, Shift+arrows, row-number and heading clicks, and Ctrl/Cmd+A.
2. **Clipboard** (R4).
3. **Undo and redo** (R5).
4. **Row heights:** a drag handle on the row number's bottom edge, and wrapped text in taller rows.
5. **Editing changes:**
   - a double-click puts the caret where clicked;
   - Alt+Enter adds a line break, using a textarea editor that grows with the text;
   - Ctrl/Cmd+arrow jumps to the edge of the data;
   - Shift+Enter and Shift+Tab move back.
6. **Row and column menus:** right-click, ⋯, or Shift+F10 on a row number or heading.
7. **Windowing** (R7).

The model interface (`GridModel`) gets a few optional hooks so each sheet says what it allows:
- `readCells(range)` and `writeCells(changes)`;
- `canWrite(row, col)`;
- `rowHeight(row)` and `onRowResize`;
- `rowMenu`.

New is the **blank-sheet model** (`src/components/sheets/blank/model.ts`). It implements `GridModel` over the blank sheet's rows, columns and cells: letter headings, numbered rows, and every cell text.

**Why.**
- The request is one editing experience everywhere, and spec 008 already chose one keyboard model for both sheets.
- A second engine would split behaviour and double the checks.
- The existing labs (150 sheet scenarios) keep guarding the linked sheets while the engine grows.

**Alternatives.**
- **A spreadsheet library** (Handsontable, AG Grid, Glide, RevoGrid). Rejected:
  - each is a major new dependency (constitution: Tech Stack amendment);
  - most charge for commercial use or take over rendering;
  - none renders our existing cells: stage pills, person chips, files and link cards.
- **A new engine for blank sheets only.** Rejected: two keyboard models, and linked sheets wouldn't get range copy and paste.

## R2. Where it lives: `/sheets` and `/sheets/[folder]`, reusing the board's sheet host

**Decision.** Two new routes:
- **`/sheets`:** the home page of folder cards. A Server Component lists the folders, with counts and last edits.
- **`/sheets/[folderId]`:** an open folder. `?sheet=<id>` names the tab. Without it, the folder opens on the member's last tab there (R10), else the first visible tab.

The workbook (`Workbook.tsx`) draws the breadcrumb, the toolbar (undo, redo, save status), the open sheet, and the tab bar.

For the Content and Video folders, the linked tab is drawn by **the board's own sheet host**: `KanbanBoard` in a new `surface="sheets"` mode. In that mode it:
- draws only the Content sheet or the Video sheet (no board header, toolbar or board);
- keeps everything it already wires: `sheetApi`, `contentApi`, `columnsBundle`, the task panel, uploads, celebrations, the Inbox state.

`/sheets/[folderId]` loads the same data as `/board` through one shared loader, `loadBoardData(member)`. It is moved out of `src/app/(app)/board/page.tsx`, and both routes call it.

**Why.**
- The linked sheets are a few thousand lines of carefully checked wiring (moves, drops, uploads, task panel, celebrations).
- Hosting them a second time would duplicate it, and drift.
- One loader means `/board` and `/sheets/content` can't disagree.
- FR-078 holds automatically: the Board's Content tab and Sheet view are the same component.

**Alternatives.**
- **Render ContentSheet and VideoSheet directly with a new host.** Rejected for the duplication above.
- **Put the tab bar inside `/board`.** Rejected: the chosen design is a Sheets section, and blank sheets have no place on the Board.

## R3. Storing blank sheets: stable row and column ids, one row per filled cell

**Decision.** Rows and columns of a blank sheet are records with stable ids and a sortable position:
- `sheet_rows (id, sheet_id, position, height)`;
- `sheet_cols (id, sheet_id, position, width)`.

Cells are stored only when they hold text: `sheet_cells (sheet_id, row_id, col_id, value)`.
- **Inserting a row** creates a record whose position falls between its neighbours (a fractional position, R3a). Nothing else changes.
- **Deleting a row** removes its record and its cells.
- **Positions:** `double precision`. A new position is the midpoint of its neighbours. When two neighbours get closer than 1e-6, the sheet's positions are renumbered 1…n in one statement.

**Why.**
- Cells are addressed by (row id, column id), not by index. Two people can edit the same sheet while one inserts rows, and every value still lands in the cell its author meant. This is the edge case "edits to different cells never overwrite each other".
- An index-based store would shift other people's pending edits onto the wrong row.
- A new sheet starts with 100 row records and 26 column records, a cheap insert. The ceiling (5,000 × 200) stays far below what PostgreSQL handles comfortably.

**Alternatives.**
- **One JSON document per sheet.** Rejected: every save rewrites the whole sheet, so two people overwrite each other.
- **Index-based cells with shifting updates.** Rejected for the concurrency reason above.
- **A CRDT.** Rejected: live co-editing is out of scope.

## R4. Clipboard: HTML table and TSV in both directions

**Decision.**
- **Copy and cut** put two formats on the clipboard:
  - `text/html`: a `<table>`. Excel and Google Sheets both read it, and it keeps line breaks inside cells.
  - `text/plain`: tab-separated, with Excel's quoting (a cell holding a tab, a quote or a line break is wrapped in quotes, and inner quotes are doubled).
- **Paste** prefers `text/html` when it contains a `<table>` (Excel, Google Sheets, web pages, Momentum itself), and otherwise parses `text/plain` as TSV with the same quoting rules.
- **Where the code lives:** `src/lib/sheet-clipboard.ts`, a pure module. It grows from today's `cellsFromHtml` and `cellsFromText` in `src/components/sheet/parse-clips.ts` (which then re-export it), so Paste clips and Paste plan keep their behaviour.
- **What arrives:** formulas arrive as their shown value, because that's what Excel and Sheets put in the HTML. Images and styling are dropped.
- **Cut** is copy plus a pending clear. The clear is applied when the cut cells are pasted (FR-021). Esc, or a new copy, drops it.
- **Fill:** a single pasted value over a selected block fills it (FR-023).
- **Rows:** in a linked sheet, a paste whose shape "looks like new rows" (today's `looksLikeRows` rule) still opens the Paste clips or Paste plan preview (FR-026). Any other paste fills existing cells through `writeCells`.

**Why.**
- These are the formats both target products read and write, and what spec 008 already parses.
- Clipboard events (`copy`, `cut`, `paste` on the grid) work in every browser without permission prompts.
- The menu items use `navigator.clipboard` where allowed. Where a browser refuses to paste from a menu, they say to use Ctrl/Cmd+V.

**Alternatives.** CSV (rejected: comma ambiguity and locale issues); an internal clipboard only (rejected: it wouldn't reach Excel or Sheets).

## R5. Undo and redo: a per-sheet stack of inverse change sets

**Decision.** Each open sheet keeps an in-memory stack of steps, at least 100 deep. A step records a forward change set and its inverse.
- **Blank sheets:**
  - cell changes (with old and new values);
  - inserted rows and columns (with their ids);
  - deleted rows and columns (with their ids, positions, sizes and cells, so undo puts them back with the same ids);
  - resizes.
- **Linked sheets:** a step lists `{ taskId, field, before, after }` for task fields and team columns. A deleted row's inverse is `restoreTask`.
- **Undo and redo** send the inverse or the forward set through the same save path as any edit (R6), so the same rules apply (FR-032).
- **Refusals:** a step the server refuses (a stage move that's no longer allowed, a task archived meanwhile) is reported and dropped, and the rest of the step stands.
- **One step** per paste, clear, cut, fill, or row and column change, whatever its size.
- **Lifetime:** history lives in the workbook's state, one stack per sheet id. It survives switching tabs and is cleared on reload.

**Why.** Inverse change sets are exact, cheap, and work the same for local and server-side data. They also give FR-030's "one step per paste" for free.

**Alternatives.** Snapshots of the whole sheet (rejected: heavy, and wrong for linked sheets, whose data is shared tasks); server-side history (rejected: not needed; the spec keeps undo per visit).

## R6. Saving: an outbox with batching, retries and a status

**Decision.** Each workbook has an **outbox**: a queue of change sets.
- **Batching:** a change is applied on screen at once and queued. The queue flushes 400 ms after the last change, or at once on blur, tab switch or page hide.
- **Blank sheets:** a flush calls `applySheetChanges(sheetId, changes)`, one server action and one transaction. It applies:
  - cell upserts and deletes;
  - row and column inserts and deletes;
  - sizes.

  Large pastes are split into chunks of 2,000 cells.
- **Linked sheets:** a flush calls `writeTaskCells(entries)` (contracts/server.md). It groups entries by task and applies each task's fields under today's rule (FR-060). Stage changes go through the existing `setTaskStage` rule, title through `updateTask`'s path, and team columns through `setValues`. It returns what it saved and what it refused, with reasons.
- **Status:**
  - "Saving…" while a flush runs;
  - "Saved" after;
  - "Not saved, retrying (N)" on network failure, with backoff at 2, 4, 8 and 16 s, then every 30 s.
- **Leaving:** a `beforeunload` guard while anything is queued or in flight.
- **Refusals** roll that cell back to the server's value and show the reason (FR-083). They never block the rest of the queue.
- **Order:** the outbox is per workbook, so a tab switch doesn't lose queued changes, and sheet-level changes (rename, colour, move, hide, protect) go through the same queue in order.

**Why.** It keeps typing instant, gives at-least-once delivery within a session, and makes "Saved" mean saved. It's the pattern spec 005's brief editor already uses (`useSaveQueue`), generalised.

**Alternatives.** A save per keystroke (rejected: chatty, and it races itself); a periodic full save (rejected: it overwrites others).

## R7. Speed: window the rows; columns only when wide

**Decision.**
- **Rows:** `GridCore` renders only the rows in view, plus 10 above and below, inside a spacer of the full height. Row heights come from the model (default 32 px, or the stored height), and a prefix-sum gives each row's offset.
- **Columns:** windowing starts above 40 columns. Under that, every column renders, which keeps today's linked sheets exactly as they are (they have at most 20 columns).
- **ARIA:** `aria-rowcount` and `aria-rowindex` keep the full counts, so screen readers hear the real position.
- **Focus:** the active cell is always rendered, even out of view, so focus never drops.

**Why.**
- 5,000 rows × 26 columns is 130,000 cells. Rendering all of them makes every keystroke slow (SC-005: under 100 ms).
- The linked sheets have hundreds of rows and gain the same speed.

**Alternatives.** A virtualisation library (rejected: one more dependency for about 120 lines of code); canvas rendering (rejected: it loses the existing DOM cells, links and accessibility).

## R8. Who may edit (FR-060), enforced on the server

**Decision.**
- **Blank sheets:** any signed-in member, unless the sheet is protected. A protected sheet can be edited only by its protector and admins. Checked in every sheet action.
- **Team columns (spec 010):** any member, on any live task. This changes `setValues`' check from `canAct(task)` to "member and task not archived" (contracts/server.md). Spec 010's own column tools (add, rename, delete) are unchanged.
- **Task fields:** unchanged. The task's owner, its assignee, admins and superusers, through the existing `canAct` and `setTaskStage` rules.
- **The UI** mirrors this with `canWrite(row, col)`. A cell that can't be written gets the existing read-only note on Enter or typing, and is counted in a paste or clear (FR-025).

**Why.** It's the user's choice from the clarifications, and the server stays the enforcement point (constitution §III).

**Alternatives.** None; this was decided in the spec.

## R9. Sheet tabs and Excel's menu: what each item does

**Decision.** The tab bar (`TabBar.tsx`) uses ARIA tabs:
- arrow keys move along the tabs, and Home and End jump to the ends;
- Enter opens a tab, and Shift+F10 or the context-menu key opens its menu;
- tabs are drawn in saved order, with their colour as a bottom stripe;
- the open tab is highlighted (raised, with a purple top edge);
- grouped tabs get a soft fill;
- a protected tab shows a lock, and the linked tab shows 🔗.

The menu items map to these server actions (contracts/server.md):

| Item | Action | Notes |
|---|---|---|
| Insert | `createSheet(folderId, { before })` | Next free "Sheet N" in the folder |
| Delete | `deleteSheets(ids)` | Confirm first; refused for the linked tab or the last visible sheet |
| Rename | `renameSheet(id, name)` | Inline; Excel's forbidden characters refused |
| Move or Copy… | `moveSheets(ids, folderId, beforeId, copy)` | Copy duplicates rows, cols and cells with new ids in one statement |
| Protect / Unprotect | `protectSheet(id, on)` | Protector and admins |
| Tab Color | `colorSheets(ids, color)` | Palette keys, not free hex |
| Hide / Unhide… | `hideSheets(ids, hidden)` | Last visible sheet refused |
| Select All Sheets | — | Client-side grouping for the four group actions |
| Drag / Ctrl+drag | `moveSheets` with or without copy | Same action as the dialog |

- **Overflow:** scroll arrows at the bar's start, as in Excel, plus a ≡ list.
- **Shortcuts:** Ctrl+Page Up/Down, and Shift+F11 (new sheet).

**Why.** It matches Excel's menu one to one, which is what the user asked for, with one action per verb so every path shares its rules.

## R10. Pins and the last open tab

**Decision.**
- **Pins** are per member, on the server: `members.sheet_pins uuid[]`. Null means the default (Content, then Video), so new members get the defaults without a backfill. Deleted folders drop out when read.
- **The last open tab per folder** is a per-device view preference in `localStorage` under `momentum.sheets.last.<folderId>`, as constitution §VI 2.1.0 allows. It's read after mount, wrapped in try/catch, and harmless when missing (the first visible tab opens). The `?sheet=` in the address wins over it.

**Why.** The spec makes pins per member (FR-072) and the last tab per device (FR-076). Both are the smallest store that does the job.

## R11. The two linked folders exist from the start

**Decision.** `sheet_folders` has a `kind`: `content`, `video` or `team`. `sheets` has a `kind`: `linked_content`, `linked_video` or `blank`.
- `scripts/sheets-backfill.ts` (run by `scripts/backfill.sh`, safe to run twice) creates:
  - the Content and Video folders;
  - each folder's linked sheet, at position 0;
  - nothing else.
- Partial unique indexes guarantee one folder and one linked sheet of each linked kind.
- The server refuses to delete, rename, hide, protect or move the linked folders and sheets.
- The linked sheets' column widths stay where spec 010 keeps them (`sheet_columns.width`). Their row heights go in `linked_row_heights (sheet_kind, task_id, height)`.

**Why.** The folders are data like any other, so the home page, pins and tabs need no special cases beyond the guards.

## R12. Deleting a team folder: a 10-second undo

**Decision.** Delete hides the folder at once and shows "Folder deleted · Undo" for 10 seconds. The server delete runs only when the 10 seconds end, or when the page is left. This reuses the pending-delete pattern spec 007 built for attachments (`src/lib/pending-deletes.ts`, `PendingDeletes`). Deleting a sheet asks for confirmation instead, as Excel does.

**Why.** Folders hold many sheets, and an accidental delete is the costliest mistake in this feature. The pattern already exists and is checked.

## R13. Phones and Arabic

**Decision.**
- **Phones (≤ 767 px):**
  - tap selects, double-tap edits;
  - long-press opens the cell, row, column or tab menu;
  - a "Select range" item in the cell menu starts range selection, and a tap on another cell completes it;
  - the tab bar sits above the bottom navigation, and its tabs are at least 44 px tall.
  - **Navigation:** Sheets joins the bottom bar. Today's bar holds four items (`PHONE_TABS = 4`); Sheets takes third place, and Team moves into More.
- **Arabic:**
  - the grid already mirrors with logical properties;
  - selection, resize handles and tab order follow, and the Arabic arrow keys move as seen;
  - letter headings stay A, B, C, as in Excel and Google Sheets in Arabic;
  - new strings go in a `sheets` namespace in both languages.

**Why.** It matches the rest of the app (spec 011's header and spec 008's sheets) and the edge cases in the spec.
