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
5. **Automatic link, both boards**: a type set to Design + Video → two media tasks. Pass D-Check on Design only → the content task can't move to F-Check. Pass Video's → the content task is at F-Check.
6. **Create task**: on the Design board → an unlinked media task at Ready For Design; its SLA counts from there.
7. **Link task**: on the Video board, pick a content task at C-In Progress → its media task shows in Ready For Design; SLA starts when the content task reaches Ready For Design.
8. **Unlink**: as Content Creator → both tasks stay, unlinked; as the designer → refused.
9. **Assignee is not a link**: make the designer the assignee of an unlinked content task → in their My tasks, not on the Design board.
10. **Shows in**: change the assignee → the old assignee's Space goes unless it was the created-in Space.
11. **Space stages**: split D-In Progress into Sketch and Final art in Design; move a task between them → stage, SLA, other Spaces unchanged. Move it to D-Check and back → it starts at Sketch.
12. **Sheets**: rename C-In Progress to "Writing" in the Content Space → the Content sheet shows "Writing"; typing "writing" moves the task there.
13. **SLA days**: a task entering a stage on Thursday shows 1 day in stage on Sunday.
14. **Related task**: the field kind and picker say Related task.

## Regression
`npm run typecheck`, `npm run lab:spaces`, `lab:sheet`, `lab:inbox`, `lab:notify`, `lab:spreadsheet`, and every real-app scenario, with the simple-task and status-word scenarios replaced.
