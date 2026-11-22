# Quickstart: checking spec 021, stage by stage

## Before any stage

```bash
npm install
```

```bash
npm run typecheck
```

```bash
bash scripts/migrate.sh
```

`migrate.sh` runs `prisma db push`, then the seed with the new `once()` markers. The seed log must show the task count unchanged, and `spaces-v1` and `task-spaces-v1` written once. Running it a second time writes nothing (FR-008).

The new lab, once Stage A adds it:

```bash
npm run lab:spaces
```

Every earlier lab is re-run at each stage:

```bash
npm run lab:sheet && npm run lab:spreadsheet && npm run lab:inbox && npm run lab:notify
```

## Stage 0: constitution

- `.specify/memory/constitution.md` reads version 3.0.0.
- It lists the 11 stages from `src/lib/stage-meta.ts`, simple tasks in §II, the Done celebration in §V, and users creating their own tasks in §III.
- The stack table matches HANDOVER §4.

## Stage A: Spaces and the hand-off

Sign in as an admin, then as each seeded role.

1. **Sidebar**: Me, Teams and Brands sections. A Video Editor sees only Video under Teams; an admin sees all four (spec US1 scenario 3).
2. **Starting Shows in**: open a Video task at D-In Progress. Its panel shows Content and Video, both "from migration" (FR-008).
3. **Hand-off from Advance**:
   1. As a Content Creator, create a Video task from the Content Space ("+ Task").
   2. Advance it to C-Check.
   3. Advance again: the box opens with Video ticked and the Video Editor listed.
   4. Confirm: the task is at Ready For Design, shows in Content and Video, and the editor gets an "assigned" notification (US6 scenarios 3–4).
4. **Assign first**: on another task at C-In Progress, set the assignee to the Video Editor. Video is added at once. Advancing to Ready For Design opens no box (scenario 6).
5. **Every one-task path**: repeat step 3 from the stage menu, by dragging across Board columns, from the Inbox, and by typing the stage in the Content sheet. Each opens the box (contracts/handoff.md).
6. **Bulk**: select three tasks at C-Check, one of which already shows in Design, and bulk-move them to Ready For Design. One moves. The message reads "2 need a hand-off" (FR-030a).
7. **Paste plan**: paste a plan row at "Ready for Design" for a new piece. It is skipped and counted.
8. **Users create**: a Content Creator can create a task they own, and can't set another owner (FR-027a).
9. **Names**: the nav says "Plan" and the Board toggle says "Mine / Everyone"; `/team` still loads (FR-012a).
10. **Lab**: `npm run lab:spaces` passes its pure checks (`startingSpaces`, `spacesForAssignee`, `needsHandoff`) and its UI scenarios (the box from each path, Arabic, phone).

## Stage B: Views, brands, Me

1. **Calendar**: on Forefront › Calendar, go back and forward through months and weeks, and press Today. Finished work shows a ✓ on its day. Drag a task to another day: the Board and the Content Space show the new date, and Undo reverts it (FR-014).
2. **Campaign filter**: choose a campaign (project) and only its tasks remain.
3. **Brand Sheet**: Forefront › Sheet shows the Content and Video sheets with only Forefront rows, then Forefront's own blank tabs. A column added on the all-brand Content sheet appears here (clarification: shared columns).
4. **Space Sheet tab**: the Content Space's Sheet tab is today's Content sheet, unchanged. `/board?view=content` still opens it (FR-012).
5. **Assets and Library**: Assets lists the brand's asset links and its open Design tasks. Library lists only published tasks, with post links.
6. **Saved views**: add a personal List view to the Design Space with a filter, then reload. It is kept and only you see it. A shared view shows for others (FR-010).
7. **My tasks**:
   - `/me` lists the member's tasks across brands, grouped as Working on, Handed off, Planning and Published.
   - Type a Content word in Status: the task moves and the Board shows it.
   - Type in "My notes", sign in as someone else, and the note isn't there (FR-013b).
8. **My sheets**: pinned folders show under Me and open as today. "Create task" on a row creates a task owned by the member, in the row's brand (FR-013c).
9. **Performance**: with the 5,000-task seed from `scripts/spreadsheet-lab/realapp/perf-axe.cjs`, a Space, a brand and Everything each show their first screen in under 2 s (SC-003).

## Stage C: Words, features, simple tasks

1. **Status words**:
   - In the Design Space, write "Client review" for D-Check.
   - In the Space's Sheet, type it on a task at D-In Progress: the task moves to D-Check. The Board still says "D-Check" (FR-013a, FR-016).
   - A word used twice is refused (FR-017).
2. **Content and Video words**: the Content Space's words panel shows the Content sheet's existing words. Editing one changes the Content sheet too (research R5).
3. **Brand features**: switch Platform off for The Strategy Community. Its tasks show no Platform in TaskModal, cards, filters, sheets or team Spaces; Forefront's still do. Switch it back on: the values return (FR-019–FR-021, SC-005).
4. **Islam Check per brand**: set it off for one brand. New tasks there have 10 stages, and existing ones keep theirs.
5. **Simple tasks**:
   - From the Planning Space, "+ Task" makes a simple task: To Do › In progress › Done, no SLA badge.
   - It never appears in the Inbox, a review queue, the Content and Video sheets or the Library.
   - Moving it to Done celebrates for its assignee (FR-022–FR-026).
6. **Mixed parent**: a simple parent with pipeline subtasks. Moving the parent to Done leaves the subtasks' stages alone (FR-025).

## Done means

- Every stage's lab and the earlier labs pass.
- `typecheck` is clean.
- The spec's acceptance scenarios for that stage's stories have each been walked through once in the real app.
- Arabic and phone layouts have been looked at for each new screen.
