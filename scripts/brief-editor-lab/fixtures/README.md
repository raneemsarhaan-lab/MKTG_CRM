# Round-trip fixtures

Real-shaped briefs that every editor change must open and save without
changing (FR-100, FR-101, SC-010). The `roundtrip-fixtures:*` scenarios open
each one, type a character and delete it, and compare what gets saved.

`baseline.json` records the fixtures that the editor did **not** save back
unchanged when this lab was first run (2026-11-04, before spec 005 work). A
fixture listed there is compared with its recorded output instead. Remove an
entry once the editor saves that fixture unchanged. Re-record with
`LAB_RECORD=1 npm run lab:brief -- roundtrip`.

Baseline differences found on 2026-11-04:

| Fixture | What the editor did | Why it matters |
|---|---|---|
| `clickup-import` | The image line was glued to the table that follows it: `![cover](…)\| Channel \| Owner \|`. | **Existing data bug**: the table is no longer a table once saved. **Fixed** by spec 005 T022 (images are saved as their own block); the entry was removed from `baseline.json`. |
| `default`, `tasks` | Checklist items are saved as a "loose" list, with a blank line between items. | Cosmetic: they still render as checklists. |
