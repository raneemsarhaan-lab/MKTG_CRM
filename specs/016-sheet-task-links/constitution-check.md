# Constitution Check: spec 016 (for the PR description)

| Principle | How this PR meets it |
|---|---|
| **§I Design System Fidelity** | Badges, markers, notes, the linked tint (`--sh-linked`) and the dialogs use the existing `--sh-*` / `--inbox-*` / `--hr-*` tokens. They follow `design/sheet-task-links.html`. Stage pills are the board's own. |
| **§II Workflow Pipeline Integrity** | Every task change goes through the board's own actions: stage moves through `setTaskStage` and its move rules (with the celebration), the rest through `updateTask`, `updatePiece`, `setPieceLink` and `setValue`. New tasks start in the first stage. Deleting rows, columns or sheets never changes a task (checked with a task checksum in every lab run). |
| **§III Role-Based Feature Access** | Task edits need the board's rule (owner, assignee, admin or superuser; stage moves by the move rules). Creating tasks needs task-creator access. Protected sheets add the sheet's rule on top. Everything is enforced in the actions, and the UI shows the reason. |
| **§IV Design-Driven Development** | `design/sheet-task-links.html` was published and approved ("approved, build the UI") before any UI code. |
| **§V Cultural UX** | `sheets.links.*` is in English and Arabic, with Arabic plural forms. Stage names follow the member's language. Owned-stage moves celebrate as on the board. |
| **§VI State Architecture** | Types first (`TaskField`, `SheetTaskMap`, `LinkedTask`, `TaskFieldWrite`, `TaskFieldResult`). The mapping, row links and snapshots are server state, with undo. Dialogs are UI-only. |
| **Tech Stack** | No new dependency. |
| **Schema** | Additive only (`sheet_rows.task_id`, nullable, set null when a task is deleted; `sheets.task_map`), applied with `scripts/migrate.sh`. No backfill. |
