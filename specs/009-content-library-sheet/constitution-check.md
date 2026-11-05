# Constitution Check: spec 009 (for the PR description)

| Principle | How this PR meets it |
|---|---|
| **§I Design System Fidelity** | Reuses `SHEET_UI` and the `--sheet-*` variables; adds `SHEET_UI.ok` (`--sheet-ok`) for a met cadence. The lab's tokens-only check covers `src/components/content/`. |
| **§II Workflow Pipeline Integrity** | Content stage names (Planned, Writing, Initial Design, Final Design…) are message strings shown only in the Content sheet. Archive is spec 008's drop flag. The three new content types get SLA rows for every stage (seeded from Post's), as §II asks of every type. |
| **§III Role-Based Feature Access** | Edit, move, link and archive controls show only when allowed, and every action checks again on the server. **Sign-off requested:** `user`-level members may add pieces (+ Piece, Paste plan) to themes they own or are assigned to, owned by them. New themes are admins' and superusers' only. The New task form is unchanged. This is the second narrow exception after spec 008's clips (checked in the running app, §3 row 4). |
| **§IV Design-Driven Development** | `design/content-sheet.html` was committed and published before UI work. Plain HTML, as in specs 005, 007 and 008 (sign-off requested there too). |
| **§V Cultural UX** | A `content` namespace in English and Arabic, checked for parity, with no missing keys at run time. Arabic content stage names are proposed and need a native speaker's check. Moves use the board's move, so celebrations follow its rule. |
| **§VI State Architecture** | No store change. `BoardView` gains `'content'`; `FrequencyPeriod`, `AudienceKey`, `LinkRole` and `ContentTheme` are added to the types first. Show archived is a per-device preference (§VI 2.1.0). |
| **Tech Stack** | No new dependency. |
| **Schema** | `content_pillars` (new); theme fields on `projects`; `tasks.pillar_id`, `tasks.post_url`; `task_attachments.link_role`. All nullable or defaulted, applied with `db push`; the seed adds three content types. |
