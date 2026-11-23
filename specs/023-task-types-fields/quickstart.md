# Quickstart: checking spec 023

## Prerequisites
- Local database with the demo data (`bash /tmp/claude-0/reset-demo.sh` in the dev container), dev server on port 3100.
- Spec 022 shipped (gate for Stage A).
- Checks run with `npx tsc --noEmit -p .`, `npm run lab:spaces`, `npm run lab:sheet`, and `node scripts/spaces-lab/realapp/run.cjs 023-` (scenarios per stage in `scripts/spaces-lab/realapp/scenarios-023-*.cjs`).

## Stage A
1. **Types**: Settings › Task types lists every former content type with its SLA and boards; give Reel an Arabic name, an icon and a colour; a new Reel task shows them; old Reel tasks keep their SLA and Video board.
2. **Fields**: create "Caption" (text) and attach it to Post, required from C-Review. Fill it on the Content sheet; see it in the task panel and the Planning Space's sheet.
3. **Required**: empty Caption; try to move the task to C-Review by drag, stage menu, sheet typing, bulk, and through a linked row. Each is refused with "Caption is required before C-Review".
4. **Make it a task field**: on a task sheet's custom column with values, choose it; the values appear in the task panel.
5. **Not applicable**: a Video row under a Post-only field shows a hatched cell that refuses typing.
6. **Status groups**: group a Space's list by status group.
7. **Milestones**: add "Ramadan launch" for Forefront on a day; it shows on Forefront's and the Content Space's calendars; it can't be dragged into a stage.

## Stage B
8. **Priorities**: old Medium tasks read Normal; set one Urgent: it's first in its column and its assignee is notified; its SLA badge is unchanged.
9. **Tags**: create "Eid" while tagging two tasks; filter by it; as an admin merge it into "Eid 2026".
10. **Assignees**: add Noran after Samaa (lead); both see it in My tasks; Shows in follows Samaa only; make Noran lead and Samaa's assignee-only Space goes; set hours 6/2 and see workload follow.

## Stage C
11. **Start date**: start Sunday, due Thursday, 10 hours; calendar spans five days; workload shows 2 h a day; a start after due is refused.

## Stage D
12. **Templates**: save a Monthly recap task as a template with two subtasks; create from it for 30 Dec; names, fields, people and dates are right; editing the template leaves that task alone.
13. **Recurring**: repeat weekly on Sunday with the default lead time; the next occurrence appears on its creation day, once; "Skip next" skips one; a shorter lead time is refused naming the minimum; the standing project's count includes the occurrences.

## Regression (each stage)
Typecheck, every lab, every real-app scenario (specs 021–023), Arabic and phone axe on the new screens.
