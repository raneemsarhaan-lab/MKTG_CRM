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
