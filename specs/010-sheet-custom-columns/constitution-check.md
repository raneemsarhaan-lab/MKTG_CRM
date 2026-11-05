# Constitution Check: spec 010 (for the PR description)

| Principle | How this PR meets it |
|---|---|
| **§I Design System Fidelity** | Uses the sheet's existing `--sheet-*` variables and `SHEET_UI`. Adds `CHOICE_COLORS` to `src/lib/tokens.ts`: 10 Choice colours, each readable with white text at AA contrast. The lab's tokens-only check still covers `src/components/sheet/` and `src/components/content/`. |
| **§II Workflow Pipeline Integrity** | Columns change only how the sheets look. Stages, moves and celebrations are unchanged. Status keeps its menu after a rename, because it is matched by key, not by name. A content type added from the Type cell gets an SLA row for every stage, copied from Post, as §II requires of every type. |
| **§III Role-Based Feature Access** | **Decision (asked and answered in the spec):** every member may shape the shared layout: rename, add, move, hide, resize and delete columns. Each change records who made it and when (FR-004). Deleting a column can be undone for 10 s, and its values are kept for a day. Values in custom cells follow the existing row rule: owner, assignee, admin or superuser. The server checks this again on every write, pastes included. Adding a content type stays admin-only, as in Settings. |
| **§IV Design-Driven Development** | `design/sheet-columns.html`, a fully clickable mock of both sheets, was committed and published before the UI work. The type-ahead for Type and Choice cells was added to the design at the user's request ("type directly… suggest to add"), then built. |
| **§V Cultural UX** | A `sheet.columns` namespace in English and Arabic, checked for parity. Header menus, the resize handle and drag mirror in right-to-left layouts. The Arabic strings should be checked by a native speaker. |
| **§VI State Architecture** | No store change. `SheetId`, `ColumnKind`, `ChoiceOption`, `SheetColumnRecord` and `SheetValues` were added to `src/types/index.ts` first. Layout is shared server state; nothing new is kept in browser storage. |
| **Tech Stack** | No new dependency. |
| **Schema** | `sheet_columns` and `sheet_values` (new), applied with `db push`. Nothing existing changes. |
