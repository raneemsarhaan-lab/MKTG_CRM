# Constitution Check: spec 014 (for the PR description)

| Principle | How this PR meets it |
|---|---|
| **§I Design System Fidelity** | Colours are `HOURS_UI` in `src/lib/tokens.ts` and the matching `--hr-*` variables, made from existing colours: the app's warning amber for Missing, a neutral grey for Off, and purple for today. The look follows `design/hours.html`. |
| **§II Workflow Pipeline Integrity** | Stages, moves, SLAs and celebrations are unchanged. Hours aren't tied to tasks. |
| **§III Role-Based Feature Access** | Members read and write only their own days, and only the last 30. The report, the CSV and other people's days are admin-only, checked in every action, on the page and in the route. Superusers are treated as members. |
| **§IV Design-Driven Development** | `design/hours.html` was published and approved ("approved, build the UI") before any UI code. |
| **§V Cultural UX** | An `hours` namespace in English and Arabic, with Arabic plural forms. The working week is Sunday to Thursday. Weekday names and numbers use the member's locale. Arabic digits and `٫` are accepted when typing. Every surface mirrors, and the CSV has a BOM so Excel shows Arabic names. |
| **§VI State Architecture** | Types first in `src/types/index.ts`. Server state: `work_days`, and `members.hours_prompted_on` so the reminder holds across devices. No browser storage. |
| **Tech Stack** | No new dependency. The CSV is written by hand. |
| **Schema** | Additive only, applied with `scripts/migrate.sh`. No backfill: with no rows, a day is Missing. |
