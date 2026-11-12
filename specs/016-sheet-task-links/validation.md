# Validation: spec 016 (a blank sheet's columns linked to board tasks)

Run on 2026-11-12 against a production build (`next build` + `next start`) and local PostgreSQL.

## Labs and server checks

| Check | Result |
|---|---|
| `npx tsc --noEmit` | clean |
| `npx next build` | builds |
| `npm run lab:spreadsheet` (adds `links-match`, `links-map`, `links-undo`) | 28/28 |
| `scripts/spreadsheet-lab/smoke/run.ts`: every link action and guard (links and titles, shared titles, misses, cleaned mapping, not applicable, not linked, a member vs another member's task, a refused stage move, a member who can't create tasks, To do / no project / owner on create, deletes change no task, protected sheet, Content sheet refused) | all passed |
| `scripts/spreadsheet-lab/smoke/links-perf.ts`: link 2,000 rows (SC-004) | 89 ms |
| `npm run lab:sheet` | 150/150 |
| `npm run lab:notify` | 46/46 |
| realapp `run.cjs` / `perf-axe.cjs` | 56/56 / 18/18 (arrow keys median 33 ms, p95 35 ms) |
| realapp `format.cjs` / `editing.cjs` / `styles.cjs` (spec 015) | 52/52 / 50/50 / 54/54 |
| Task table checksum before and after every lab | unchanged |

## Running-app checks

`node scripts/spreadsheet-lab/realapp/links.cjs`: **38 passed, 0 failed.**

```
1. Link to board (US1)
  ✓ axe: Link to board, step 1 
  ✓ axe: Link to board, step 2 
  ✓ links, ties and misses are counted 5 linked 1 to choose 1 not found
  ✓ five rows carry the task marker 
  ✓ badges on the Task column and the five mapped headings 
  ✓ mapped Title shows the task’s name Strategy in 90 seconds
  ✓ Stage shows the stage pill 
  ✓ a video row shows Theme as Not applicable 
  ✓ Not linked and “2 tasks have this title” notes 
2. Choose a task (US1)
  ✓ axe: Choose a task 
  ✓ both tasks are offered 
  ✓ picking links the row and puts the link in the Task cell 
  ✓ one undo goes back 
3. Edits go to the task (US2)
  ✓ renaming in the sheet renames the task on the board 
  ✓ one undo puts the old name back on the task 
  ✓ a mapped Due date saves to the task 
  ✓ an unmapped column stays a sheet cell 
4. Refusals and a member (US2)
  ✓ a member can’t rename a task they don’t own 
  ✓ the refused cell says why 
  ✓ a paste counts the cells the member can’t edit 
  ✓ and the tasks are unchanged 
5. Board changes come back (US2)
  ✓ Refresh from the board shows the new name 
6. Create tasks for rows (US3)
  ✓ axe: Create tasks preview 
  ✓ the unlinked row is in the preview 
  ✓ a plain board task in To do, with no theme 
  ✓ and the row is linked 
  ✓ undo unlinks the row; the task stays 
7. Add tasks (US4)
  ✓ axe: Add tasks 
  ✓ a linked row is added below the selection 
8. Rows, columns and the board (US4)
  ✓ deleting a linked row changes no task 
  ✓ undo brings the row back, still linked 
  ✓ still no task changed 
9. Arabic and a phone
  ✓ axe: Board menu in Arabic 
  ✓ axe: Link to board in Arabic 
  ✓ phone: the dialog fits the screen 
  ✓ phone: 44 px targets 
  ✓ axe: Link to board on a phone 
  ✓ no page errors 

38 passed, 0 failed
```

## Notes

- **Headings.** When a column is linked, its first row counts as the sheet's headings unless it holds a task link. So "Task" in A1 isn't reported as a title that matched nothing.
- **One undo step per action.** A paste that touches mapped and ordinary cells is saved together: the task fields through the board's rules, the rest through the outbox. Undo of mapped cells writes the earlier values back through the same rules, and counts any it can't put back.
- **Refusals.** A single refused cell shows its reason in a note on the cell. A batch shows "N not changed (you can't edit them)". Stage moves follow the board's move rules. A move into your own stage plays the board's celebration.
- **Board changes** show when the tab is focused, every 60 seconds while it's visible, or from Board ▾ › Refresh from the board.
- **Snapshots.** A mapped cell keeps the last value the sheet showed, so unlinking, unmapping or a deleted task leaves plain text. Stage snapshots use the English stage name.
- **Create tasks** makes plain board tasks in To do, with no project, theme or pillar, owned by the creator. Members with view-only access see the menu item disabled, with the reason.
