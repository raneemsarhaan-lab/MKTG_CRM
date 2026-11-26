# Spec 024: Space settings

**Asked for**: 24 Nov 2026 (user). **Branch**: `claude/wonderful-dirac-k1wflu`.

Each team Space has settings that control how it works, and clip creation follows them.
The user's text is the specification; this file records it with the decisions made while
building.

## What a Space sets

| Section | Settings |
|---|---|
| 1 Basics | Name (English, Arabic), icon, colour; members; who can see it (its members, or everyone) |
| 2 Flow | Starts at, Hands off at (and the Spaces it goes to), Returns at, Ends at; stage names (rename or split, as built in spec 022) |
| 3 New tasks | New task label (English, Arabic); allowed task types; default type; default assignee by role; default priority; who can create; child rows allowed |
| 4 Task panel | Per field the type has: Shown/Hidden, Required/Optional, Required before a stage; order of the sections under the top rows |
| 5 Views | Default view; default sort; default group; default sheet columns |
| 6 Linking and hand-off | Who can link and unlink; at hand-off ask for a person, or use the receiving Space's default assignee |
| 7 Rules and alerts | Owner or approver per stage; SLA per stage in working days; who is told when a task enters, goes overdue, or is handed back |

Defaults:

| Space | Starts at | Hands off at | Returns at | Ends at |
|---|---|---|---|---|
| Content | To Do | Ready For Design → Design / Video | F-Check | Published |
| Design | Ready For Design | D-Check → Content | — | D-Check |
| Video | Ready For Design | D-Check → Content | — | D-Check |
| Planning | To Do | — | — | Published |

Planning's row was marked "[confirm]" in the request. It is set to the whole pipeline with
no hand-off, which is what Planning did before; it is one setting to change.

## Rules

- **R1 Range.** A Space's views show only the stages from Starts at to Ends at; a task outside
  that range isn't listed there.
- **R2 Ownership.** For a task, one Space's rules apply: its board's Space for a media task;
  else the Space it was created in; else Content. A Space owns the stages in its range, minus
  those it has handed off (from Hands off at up to Returns at).
- **R3 New tasks** made in a Space start at its Starts at stage (on its board when it is a
  Design or Video board), with SLA counting from there, and take its default type, assignee
  and priority. Only its creators may create, with a type it allows.
- **R4 Fields.** The task type decides which fields exist. The Space being looked at decides
  which show. A required field is checked only when a move crosses its stage, by the Space
  whose rules apply; a field required before a stage earlier than that Space's start is never
  asked for. A hidden field keeps its value and is never asked for. A brand's switch still
  hides a field everywhere for that brand.
- **R5 Clips** (from + Clip, Paste clips or a child row) are created in the Video Space at its
  Starts at stage, on the Video board, and still sit under their video in the Video sheet.
  Existing clips at To Do move there once; clips past To Do stay.
- **R6 Stage names.** Inside a Space, the board, list, sheet and task panel use that Space's
  names. The Video Space is named Editing, Edit Review and Final Cut (when it had no names).
- **R7 Who changes settings.** Admins and superusers. Creating, archiving and deleting a
  Space stays with admins.

## Decisions made while building

- **Child rows** default to allowed in every Space (sheet 2b lets any Content row have child
  rows); a Space can switch them off.
- **Section order** covers the sections under the panel's top rows (fields above, Description,
  fields below, Fields box, Subtasks, Attachments). The top rows and the activity rail stay put.
- **"Handed back"** is a task reaching its Space's Returns at stage; **"enters"** is a task
  created at, or moved to, its Starts at stage.
- **Owner/approver**: an approver named for a review stage replaces the workspace's reviewer for
  that Space's tasks; an owner named for a working stage holds it alongside the task's people.
- **Who can link** defaults to Content Creator and Digital Marketing Specialist (the workspace's
  role names). Before this, anyone could link and unlink.
- **Default sheet columns** are saved; they take effect with the unified sheet (the next spec),
  which replaces the two special sheets.

## Checks (request §10)

See `validation.md`.

## Changed on 25–26 Nov 2026 (owner, release QA review)

Decisions from the owner's answers to the QA review (fixes F01–F31). They replace anything above that says otherwise. Ids are `FR-QA-nn`, shared across specs 022, 024, 026 and 027.

- **FR-QA-02** (F03, F21) A clip is not a separate kind of thing: it is another name for a Video task, with the same Theme › Pillar › Task structure. A task that shows in several Spaces is one task, not linked copies; in each Space it shows with its theme, pillar and all its details.
- **FR-QA-04** (F05, F06) Admins and superusers may move a task to any stage of its path, skipping approval stages, and repair a task that is off its path. Anyone else may move back, or forward up to and including the next approval stage; stages past it are shown greyed ("after approval").
- **FR-QA-05** (F01) Every member who isn't an admin has at least one Space: at release each gets the Spaces of their title (unknown titles: Content and Planning), and a new member gets them when added. Release counts report `members.without_space`.
- **FR-QA-11** (F15, F25, F26) Add buttons use the Space's new-task label ("+ New task" by default). The task panel has no Subtasks section; templates speak of "tasks made with it".
- **FR-QA-13** (F12, F13) Mine / Everyone is one switch per page, shared by its Board, List, Calendar and Sheet views. The board can group by brand, and filters by brand when it holds two or more.
- **FR-QA-15** (F31) Checks: `npm run lab:qa` (pure rules) and `scripts/spaces-lab/realapp/scenarios-qa.cjs` (in the app).

- Not changed yet: F22 (the "Videos · No brand" theme's name) waits for the owner. F24 (a hydration warning) could not be reproduced in 6 fresh loads.
