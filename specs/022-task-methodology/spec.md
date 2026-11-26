# Feature Specification: Task methodology — one pipeline, media links, Space stages

**Feature Branch**: `claude/wonderful-dirac-k1wflu` (feature folder `022-task-methodology`)
**Created**: 2026-11-23
**Status**: Draft, from the user's decisions of 2026-11-23
**Supersedes in spec 021**: US5 (simple tasks), the Space default kind, US3 (status words) and the name "Link task" for the task-to-task field.

## Overview

Every task in Momentum runs the same content pipeline. Spaces change how that pipeline looks and who gets new work. The Design and Video boards hold media tasks, linked to a content task or standing alone.

## User Scenarios & Testing

### User Story 1 — Every task is a pipeline task (P1)

A member creates a task in any Space. It is a pipeline task with that Space's defaults: the Space's default assignee role decides who gets it.

**Independent test**: create a task in the Content Space; it is assigned to the Content Creator and starts at To Do with 11 stages (10 when its brand has C-Check off).

**Acceptance scenarios**
1. **Given** a brand with C-Check off, **When** a task is created for it, **Then** it has 10 stages; a task already in C-Check finishes that stage.
2. **Given** the Content Space's default assignee role is Content Creator, **When** a task is created in it, **Then** the member holding that role is the assignee.
3. **Given** existing simple tasks, **When** the migration runs, **Then** To Do → To Do, In progress → C-In Progress, Done → Published, with no celebration and no new post on the FFNT Calendar.

### User Story 2 — Content reaches Ready For Design and is linked to media (P1)

**Independent test**: move a Reel to Ready For Design; the hand-off box offers Video; confirming creates a linked media task on the Video board assigned to the chosen editor (or the Video Space's default assignee).

**Acceptance scenarios**
1. **Given** a content task reaching Ready For Design for the first time, **When** its content type needs Design and Video, **Then** two linked media tasks are created, one per board, and the box asks for a person for each.
2. **Given** a content task with two linked media tasks, **When** only one has passed D-Check, **Then** the content task cannot move to F-Check; **When** both have, **Then** it moves to F-Check.
3. **Given** a content task that was unlinked by hand after Ready For Design, **When** it moves again, **Then** no automatic link happens.

### User Story 3 — Link task where you type, Create task, Unlink (P1)

**Independent test**: on the Design board, Create task makes an unlinked media task at Ready For Design. In the Content sheet's Link task cell (or on a Content calendar day), typing opens Link task, which lists that unlinked task; picking it links it to the row's content task. Anyone can unlink it.

**Acceptance scenarios**
1. **Given** the Design board, **When** a designer uses Create task, **Then** an unlinked media task starts at Ready For Design, its SLA counting from there.
2. **Given** a content row in the Content, Video or Digital Media Space's sheet, **When** someone types in its Link task cell, **Then** Link task lists the unlinked tasks from the Design and Video boards, then Create task (Design, Video or both); picking one links it, Create task makes a new linked media task.
2a. **Given** a content calendar day, **When** someone types on it, **Then** the same Link task list opens; the day becomes the content task's publishing date.
3. **Given** a linked media task, **When** any member unlinks it, **Then** both tasks remain, unlinked, and move separately from then on.
4. **Given** a content task that isn't linked, **When** a designer is made its assignee, **Then** it shows in the designer's My tasks and not on the Design board.

### User Story 4 — Space stages (P2)

**Independent test**: in the Design Space, split D-In Progress into "Sketch" and "Final art"; move a task from Sketch to Final art; its original stage, SLA and other Spaces are unchanged.

**Acceptance scenarios**
1. **Given** a Space stage mapping, **When** it is saved, **Then** every original stage has at least one Space stage and no Space stage covers two.
2. **Given** a task in "Sketch", **When** someone in the Space moves it to "Final art", **Then** only that Space's position changes.
3. **Given** a task whose original stage changes, **When** it lands in a stage with several Space stages, **Then** it shows in the first one; **When** it returns later, **Then** it starts at the first again.
4. **Given** the Content Space's stages, **When** the Content sheet shows a status, **Then** it uses the Content Space's names; renaming in the Space updates the sheet.
5. **Given** any Space mapping, **When** the main pipeline board shows the task, **Then** it uses the original stage name.

### User Story 5 — Where tasks show (P2)

**Acceptance scenarios**
1. A task shows in: the Space it was created in, the creator's Space and the assignee's Space; once per Space, in that Space's stage names.
2. **When** the assignee changes, **Then** the old assignee's Space is removed only if it was added for the assignee and isn't the Space it was created in.
3. Design and Video boards are reached only by linking (automatic at Ready For Design, or Link task in a content sheet or calendar) or by Create task on the board, never through creator or assignee.
4. A brand shows every task of the brand.

### User Story 6 — SLA on working days (P2)

**Acceptance scenarios**
1. SLA counts working days, Sunday to Thursday, on Cairo days.
2. A media task made on a media board counts SLA from Ready For Design; earlier stages are not part of its SLA or reports.

### Edge cases
- A content task linked by hand before it reaches Ready For Design.
- Linking a content task that has already passed D-Check.
- Several members holding a Space's default role, or none.
- A Space stage mapping changed while tasks sit in a removed Space stage (they show in the first Space stage of their original stage).
- Unlinking while the content task is waiting at D-Check.
- A media task linked to a content task that is dropped (archived).

## Requirements

### Functional requirements
- **FR-001** Every task MUST be a pipeline task with 11 stages, or 10 when its brand had C-Check off at creation. Simple tasks MUST be removed; existing simple tasks MUST migrate as in US1.3.
- **FR-002** Each Space MUST have a default assignee role, set at creation and editable in its settings, applying to new tasks only.
- **FR-003** A content task reaching Ready For Design for the first time MUST be linked automatically, once, to every media board its content type needs; the hand-off box MUST ask for a person per board, falling back to that board Space's default assignee.
- **FR-004** A media board MUST offer Create task (an unlinked media task starting at Ready For Design). The sheets and calendars of the Content, Video and Digital Media Spaces MUST offer Link task where people type (a Link task column, a calendar day): a list of the unlinked tasks from the Design and Video boards, then Create task (Design, Video or both), with ⇄ change and × unlink beside a link. Link task appears nowhere else.
- **FR-005** A content task with linked media tasks MUST NOT move past D-Check until every linked media task has passed D-Check, and MUST move to F-Check when they all have.
- **FR-006** Any member MAY unlink (user, 2026-11-23). Unlinking MUST keep both tasks, their stage histories and fields.
- **FR-007** Assigning a designer or editor to an unlinked content task MUST NOT put it on a media board.
- **FR-008** Each Space MUST be able to rename or split each original stage; each Space stage maps to exactly one original stage; every original stage MUST have at least one Space stage.
- **FR-009** Moves between Space stages of one original stage MUST change only that Space's position, and MAY be made by anyone with access to the Space.
- **FR-010** Entering an original stage MUST place the task in that stage's first Space stage in every Space.
- **FR-011** The main pipeline board MUST always show the original stage names. Sheets MUST use their matching Space's stages.
- **FR-012** "Shows in" MUST follow US5.
- **FR-013** SLA MUST count Sunday–Thursday on Cairo days; a task made on a media board MUST count from Ready For Design.
- **FR-014** The task-to-task field MUST be named Related task.
- **FR-015** Publishing date, due date, board sort and brand switches MUST keep working as built.

### Key entities
- **Content task**: a pipeline task in the content Spaces.
- **Media task**: a pipeline task on the Design or Video board; linked (to a content task) or unlinked.
- **Space stage**: a Space's name for one original stage, one of possibly several.
- **Default assignee role**: a Space's role for new tasks.

## Success criteria
- **SC-001** No simple tasks remain after the migration; every task shows on the pipeline board.
- **SC-002** A Reel reaching Ready For Design ends on the Video board with the chosen editor in one confirmation.
- **SC-003** A content task needing Design and Video reaches F-Check only after both media tasks pass D-Check, in every tested order.
- **SC-004** A sub-stage move changes nothing outside its Space (stage, SLA, other Spaces) in every test.
- **SC-005** All earlier labs and real-app checks pass, with the ones for simple tasks and status words replaced.

## Assumptions
- Media boards are the Design and Video Spaces.
- "Content" and "Digital Media" mean the Content Creator and Digital Marketing Specialist roles.
- The five points in research.md R10–R14 take the recommended defaults until the user says otherwise.

## Changed on 25–26 Nov 2026 (owner, release QA review)

Decisions from the owner's answers to the QA review (fixes F01–F31). They replace anything above that says otherwise. Ids are `FR-QA-nn`, shared across specs 022, 024, 026 and 027.

- **FR-QA-01** (F17, F18, F21) There are no parent tasks, subtasks or child rows. The structure is Theme › Pillar › Task; not every task has a pillar. Rows nested before show flat; their stored link is kept, not deleted. Moving or dropping a row never nests it. Deleting a row that still has rows under it from before moves them up a level unless told otherwise.
- **FR-QA-02** (F03, F21) A clip is not a separate kind of thing: it is another name for a Video task, with the same Theme › Pillar › Task structure. A task that shows in several Spaces is one task, not linked copies; in each Space it shows with its theme, pillar and all its details.
- **FR-QA-04** (F05, F06) Admins and superusers may move a task to any stage of its path, skipping approval stages, and repair a task that is off its path. Anyone else may move back, or forward up to and including the next approval stage; stages past it are shown greyed ("after approval").
- **FR-QA-06** (F04, F16) A task added in a Space's brand folder gets that brand. A Brand page shows only tasks from Spaces the person can open (admins: all), plus their own tasks.
- **FR-QA-11** (F15, F25, F26) Add buttons use the Space's new-task label ("+ New task" by default). The task panel has no Subtasks section; templates speak of "tasks made with it".
- **FR-QA-14** (F08) The old /board address opens the task's home Space (or the person's landing page).
- **FR-QA-15** (F31) Checks: `npm run lab:qa` (pure rules) and `scripts/spaces-lab/realapp/scenarios-qa.cjs` (in the app).

- Not changed yet: F22 (the "Videos · No brand" theme's name) waits for the owner. F24 (a hydration warning) could not be reproduced in 6 fresh loads.
