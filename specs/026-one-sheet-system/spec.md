# Spec 026: One sheet system

**Asked for**: 24 Nov 2026 (user). **Branch**: `claude/wonderful-dirac-k1wflu`.
The user's text is the specification; this file records it with the decisions made while building.

Replace the linked Content and Video sheets and the Sheets section with one sheet system,
used as the Sheet view of every Space and Space › Brand folder.

## 1. Where sheets live

- No separate Sheets section; it leaves the sidebar.
- A sheet exists only as the Sheet view of a Space (all its rows, every brand) or of a Space › Brand folder (that Space's rows for that brand).
- The Brand page's Sheet view shows the brand's rows from every Space.
- One grid everywhere: columns, formatting, paste, undo, comments.

## 2. Structure

```
▾ Theme              group row, merged across the sheet, collapsible
   ▾ Pillar          sub-group under the theme, collapsible
        Row          plain or linked
          Child row  under a row, one level deeper
```

- A theme is mapped to a project; its owner, frequency and audience come from the project and show in the theme row's tooltip.
- A pillar is a sub-group of its theme. Rows with no pillar sit directly under the theme. A "+ Row" line ends each group.

## 3. Plain rows

- A planning line, not a task: no SLA, approvals or board.
- A Stage column, if added, is a label on a plain row (the Space's stage names) and triggers no stage rules.
- Anyone with access to the Space can edit plain rows.

## 4. Linked rows

- The "Task" column shows "Make task" on plain rows.
- Make task asks for the destination Space (Design, Video, Digital, or any Space made in the tool), then creates a pipeline task there or connects the row to an existing task there.
- Once linked: every column that matches a task field is that field (edit anywhere, updates everywhere); the task takes its brand from the folder and its theme and pillar from the row's groups; moving the row changes the task's theme or pillar; task permissions, required fields and stage rules apply to those cells; the Task cell shows the task's name as a link, its Space and its stage.
- Linking to an existing task: where both have a value, the task's value wins.
- Unlinking keeps the row with its last values as plain text; the task carries on in its Space.

## 5. Child rows

- Any row can have child rows (one level).
- Linking a child row whose parent is linked creates a subtask of the parent's task, in the same Space.
- A child row can't be linked while its parent is plain.

## 6. Columns

- **Task field**: from the field library. Linked rows show and save the task's value; plain rows hold their own until linked (then the task's value wins if it has one).
- **Sheet only**: stays on the row, stays when linked, never touches the task.
- All columns can be shown, hidden, reordered and renamed in the Fields drawer.

## 7. Remove

- The linked Content and Video sheets as special sheets.
- Clip detail columns and fields (#, Source, File name, In, Out, Length, File), fully, including from the task panel.
- Bulk linking. Paste plan stays, and only creates plain rows.

## 8. Convert existing sheets

- Content sheet → the Content Space's Sheet view: themes → theme groups on their projects; pillars → pillar groups; every piece → a linked row.
- Video sheet → the Video Space's Sheet view: each video → a linked row; its clips → linked child rows.
- Custom columns and their values, formatting and comments carry over.
- Before the clip detail columns are removed, their values are exported to a CSV file and kept. Nothing else is deleted.

## 9. Check

- A plain row with typed values, then Make task → the task is in the chosen Space with those values.
- Editing a linked row's Caption shows in the task panel, and the other way round.
- Moving a linked row to another pillar changes the task's pillar.
- Unlinking keeps the row's values as plain text; the task stays in its Space.
- A linked child row is a subtask of the parent's task.
- The Sheets section is gone; every sheet opens from a Space, a Space › Brand folder or a Brand page.

## Decisions made while building

Recorded here as they are made.
