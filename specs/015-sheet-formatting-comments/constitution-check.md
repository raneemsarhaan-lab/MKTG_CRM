# Constitution Check: spec 015 stage 1 (for the PR description)

| Principle | How this PR meets it |
|---|---|
| **§I Design System Fidelity** | The toolbar, pickers, dialog, panel and markers use `SHEETS_UI` / `--sh-*` and a new `FORMAT_UI` / `--fx-*` set made from existing colours. The colours members pick for cells (Excel's theme and standard palette) are content, kept in `src/lib/sheet-format.ts`, not UI tokens. The look follows `design/sheet-formatting.html`. |
| **§II Workflow Pipeline Integrity** | Formatting never changes tasks. On the Content and Video sheets it is stored by task id in `sheet_formats` and saved through `applyLinkedFormats`, which doesn't touch the `tasks` table (checked in the smoke test). Stages, moves and SLAs are unchanged. |
| **§III Role-Based Feature Access** | On a protected sheet only its protector and admins may format (checked in `applySheetChanges`). Comments are open to everyone who can open the sheet, even on a protected one. Only the author edits a comment; the author or an admin deletes it. All of this is enforced in the actions. |
| **§IV Design-Driven Development** | `design/sheet-formatting.html` was published and approved ("approved, build the UI") before any UI code. |
| **§V Cultural UX** | `sheets.format` and `sheets.comments` are in English and Arabic, with Arabic plural forms. Number and date formats follow the member's language (Arabic digits, Arabic month names), and Arabic digits are read when typed. Left and right alignment and borders are logical, so they mirror in Arabic. An Arabic font is in the font list. |
| **§VI State Architecture** | Types first (`CellStyle`, `NumberFormat`, `SheetFormatRecord`, `SheetCommentThread`…). Formats, merges and comments are server state. The open pickers, the Format Painter state and recent colours (per device) are UI-only. |
| **Tech Stack** | No new dependency: the colour picker is native plus a palette, and number and date display use `Intl`. |
| **Schema** | Additive only (`sheet_formats`, `sheet_merges`, `sheet_comments`), applied with `scripts/migrate.sh`. No backfill. |


# Constitution Check: spec 015 stage 2 (for the PR description)

| Principle | How this PR meets it |
|---|---|
| **§I Design System Fidelity** | The new menus, Find panel, Paste Special dialog, painter note and frozen and hidden markers use the existing `--sh-*` / `--fx-*` tokens and follow the Stage 2 boards in `design/sheet-formatting.html`. |
| **§II Workflow Pipeline Integrity** | On the Content and Video sheets, Fill, Replace, Clear contents and Paste values go through each task's existing save (`useLinkedEditing.writeCells`), with the same rules as typing. Cells a member can't edit are skipped and counted. Stages, moves and SLAs are unchanged. Hide and Freeze are off on these sheets. |
| **§III Role-Based Feature Access** | Hide, unhide and freeze are refused on another member's protected sheet (`applySheetChanges`). Clear Comments only removes your own comments; an admin's removes all (`clearCellComments`). |
| **§IV Design-Driven Development** | The stage 2 tools were in the approved `design/sheet-formatting.html` before any UI code. |
| **§V Cultural UX** | `sheets.format.edit.*` is in English and Arabic. Find matches Arabic text, and the panel and markers mirror in Arabic. The phone gets an Editing tab with 44 px targets. |
| **§VI State Architecture** | Types first (`ViewWrite`, the new `FormatCmd` kinds). Hidden and frozen state is server state, with undo through the outbox. The painter, Find query and open dialogs are UI-only. |
| **Tech Stack** | No new dependency. |
| **Schema** | Additive only (`sheets.frozen_rows`, `frozen_cols`, `view`; `sheet_rows.hidden`, `sheet_cols.hidden`, all with defaults), applied with `scripts/migrate.sh`. No backfill. |
