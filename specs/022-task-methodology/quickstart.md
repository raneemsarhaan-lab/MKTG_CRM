# Quickstart: validating the task methodology (022)

## Prerequisites
- Local Postgres and the dev server (`npm run dev`, port 3100); demo data loaded.
- Signed in as the admin, then as the Content Creator, Graphic Designer and Video Editor demo members.
- Run `prisma db push` and the seed so the `once()` migrations run.

## Checks (each maps to a real-app scenario in `scripts/spaces-lab/realapp/scenarios-022*.cjs`)

1. **Migration**: a task that was simple "In progress" is now at C-In Progress; a "Done" one is Published, with no celebration and not in the brand Library or on the FFNT Calendar.
2. **Default assignee**: create a task in the Content Space → assigned to the Content Creator. Change the role in Settings › Spaces → only the next task follows.
3. **C-Check per brand**: switch it off for a brand → the next task has 10 stages; a task already in C-Check still finishes it.
4. **Automatic link, one board**: move a Reel to Ready For Design → the box shows Video with the Video Space's default editor; confirm → a linked media task on the Video board.
5. **Automatic link, both boards**: a type set to Design + Video → two media tasks. Pass D-Check on Design only → the content task stays at Video's stage. Move the content row to F-Check → the Video task moves there with it (its permissions apply), and the row is at F-Check.
5a. **Linked rows** (user, 2026-11-23): the Link task cell shows each linked task's name (opens it) and board, with ⇄ and ×; Status follows the linked task; a linked row's status menu offers Ready For Design to F-Check only; unlink keeps Status and makes it editable.
6. **Create task**: on the Design board → an unlinked media task at Ready For Design; its SLA counts from there.
7. **Link task**: in the Content sheet, type in a row's Link task cell → the list shows the unlinked Design task from check 6 → pick it → linked. Create task with Both → two linked media tasks. On a Content calendar day, type a name → Link task → the content task is made with that publishing date and linked.
8. **Unlink**: as the designer (anyone may) → both tasks stay, unlinked, and move separately.
9. **Assignee is not a link**: make the designer the assignee of an unlinked content task → in their My tasks, not on the Design board.
10. **Shows in**: change the assignee → the old assignee's Space goes unless it was the created-in Space.
11. **Space stages**: split D-In Progress into Sketch and Final art in Design; move a task between them → stage, SLA, other Spaces unchanged. Move it to D-Check and back → it starts at Sketch.
12. **Sheets**: rename C-In Progress to "Writing" in the Content Space → the Content sheet shows "Writing"; typing "writing" moves the task there.
13. **SLA days**: a task entering a stage on Thursday shows 1 day in stage on Sunday.
14. **Related task**: the field kind and picker say Related task.

## Regression
`npm run typecheck`, `npm run lab:spaces`, `lab:sheet`, `lab:inbox`, `lab:notify`, `lab:spreadsheet`, and every real-app scenario, with the simple-task and status-word scenarios replaced.
