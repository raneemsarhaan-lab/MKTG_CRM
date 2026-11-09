# Constitution Check: spec 013 (for the PR description)

| Principle | How this PR meets it |
|---|---|
| **§I Design System Fidelity** | Colours are `SHEETS_UI` in `src/lib/tokens.ts` and the matching `--sh-*` variables (selection, tab bar, Excel's ten tab colours), with the existing `--sheet-*` and `--inbox-*` for surfaces and text. The look follows `design/sheets.html`. |
| **§II Workflow Pipeline Integrity** | Stages, move rules, SLAs and celebrations are unchanged. On the linked sheets, every pasted, cleared or undone cell goes through the same single-cell save as typing, so stage, permission and notification rules apply unchanged. |
| **§III Role-Based Feature Access** | Blank sheets: any member, except a protected sheet (its protector and admins), enforced in every sheet action. Task fields: unchanged (`canAct`). **Widened: team columns (spec 010) are now open to any member on a live task (R8, FR-060), in `setValues` and on screen.** This was the user's choice in the clarifications. Please sign off. |
| **§IV Design-Driven Development** | `design/sheets-options.html` (option C chosen) and `design/sheets.html` were published and approved before the UI work. |
| **§V Cultural UX** | A `sheets` namespace in English and Arabic. Every surface mirrors in Arabic with logical CSS properties; headings stay A, B, C. New sheets are named from the translated pattern ("Sheet {n}"). |
| **§VI State Architecture** | Types first in `src/types/index.ts`. Server state: `sheet_folders`, `sheets`, `sheet_rows`, `sheet_cols`, `sheet_cells`, `linked_row_heights`, and `members.sheet_pins` / `sheet_pins_set`. Browser storage: only the last tab per folder (`momentum.sheets.last.<folderId>`). |
| **Tech Stack** | No new dependency. |
| **Schema** | Additive only (data-model §1–§2), applied with `scripts/migrate.sh`. Launch backfill `scripts/sheets-backfill.ts` in `scripts/backfill.sh`, safe to run twice. |
