# Quickstart: validating sheet columns

## 1. Lab (no database)

Run:

```bash
npm run lab:sheet
```

The stub host gains in-memory column records and values. The stub actions call the same pure checks as the server (`checkName`, `parseValue`, `applyLayout`).

**Node checks:**
- `applyLayout`: defaults, positions, a new built-in inserted, deleted columns hidden, Title first, Video sets;
- `parseValue` and `formatValue` for each kind;
- `checkName`;
- heading matching;
- tokens-only and message parity for the new files.

**Scenarios, Content sheet (`col-*`):** rename and reset; add Text and Choice and fill them; reorder by drag and by keyboard; hide and show; resize and fit; delete with Undo; kind change review; option removal; paste with custom headings; built-in behaviour after a move and a rename (status menu, link prompt, Published asking for its link).

**Scenarios, Video sheet (`vcol-*`):** hide in Editing only; a new column shown in Full and in its set; clip timings after a move; Paste clips with a custom heading.

**Shared:** keyboard-only (the Columns panel and Alt+↓), right to left, phone, axe.

Expected: every check passes, and the existing 111 still pass.

## 2. Running app (local PostgreSQL)

1. Run `bash scripts/migrate.sh`, then `next build` and `next start`. Sign in as two members in two browsers: an admin, and a `user`.
2. As the `user`:
   - rename Status to "Copy status";
   - add "Hook" (Text) and "Platform" (Choice: LinkedIn, Instagram, X);
   - fill both on a piece they're assigned.
3. As the admin, reload. The heading, both columns and the values are there. Columns shows "Changed by {user}" on each (SC-003, FR-004).
4. As the admin:
   - drag Assignee after Title;
   - hide Pillar;
   - widen Hook.
   Reload as the `user`: all three hold.
5. Move Status to the far end, and move a piece to Published. The status menu still works, and Published still asks for its link (SC-004, SC-005).
6. Delete Hook. The count is shown. Undo within 10 s, and the values are back (SC-007).
7. Paste 18 rows with Hook, Platform and an unknown "Notes" heading. All matched values are added, and "Notes" is offered as a column (SC-006).
8. On the Video sheet:
   - hide Source in Editing only: it is still in Full;
   - add "Hook" there: the Content sheet's Hook is unaffected.
9. Switch to Arabic. Custom names show as typed; "Reset name" restores the Arabic built-in name.

Record the results in `validation.md`.
