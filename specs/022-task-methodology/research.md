# Research: task methodology (022)

**Approved by the user on 2026-11-23**: the design (`design/task-methodology.html`, version 3) and the defaults R10–R13, with R14 (anyone can unlink) and R19 (Link task in content sheets and calendars) as the user decided.

Each item: **Decision**, **Rationale**, **Alternatives considered**.

## R1. A media task is its own task row
- **Decision**: a media task is a `tasks` row with `media_board` = `'design' | 'video'`. A linked media task also has `content_task_id`. A content task linked to both boards has two media rows.
- **Rationale**: two boards must move independently, each with its own assignee, SLA, comments and files. A row per board makes that natural, and unlinking only clears a column. Everything existing (Board, panel, SLA, notifications, sheets) already works on task rows.
- **Alternatives**: (a) one task row with a per-board progress table — every view would need a second stage source; (b) the content task itself on the media board for single-board links — two code paths for one and two boards.

## R2. The content task's stage while it waits
- **Decision**: while a content task has linked media tasks that haven't passed D-Check, its stage is set by the server to the earliest of theirs (Ready For Design › D-In Progress › D-Check), and manual moves past D-Check are refused by `allowedStages`. When the last linked media task passes D-Check, the server moves the content task to F-Check (one move, notifying the F-Check owner).
- **Rationale**: the content Spaces keep seeing a real stage, the main board stays truthful, and the "both done" gate is enforced in the one move rule (constitution §II).
- **Alternatives**: a separate "waiting" flag — it would hide the progress the content team wants to see.

## R3. After D-Check, a linked media task follows
- **Decision**: once its D-Check passes, a linked media task mirrors its content task's stage (F-Check onward). Its card on the media board is read-only from then on and says "with Content".
- **Rationale**: "linked: moves through the shared stages". It stays visible on the board until published without a second set of approvals.
- **Alternatives**: closing the media task at D-Check — the board would lose track of work still on its way out.

## R4. Unlink
- **Decision**: clears `content_task_id`. The media task keeps its current stage and continues alone through the rest of the pipeline. The content task is released from the gate (R2) and moves normally. Any member may unlink (user, 2026-11-23); the server action only checks the member is signed in and the task is live.
- **Rationale**: the user's rule; both sides keep their history and fields.

## R5. The automatic link
- **Decision**: in the move action, a content task entering Ready For Design with `auto_linked_at` null gets one media task per needed board (Design for every type except Video and Reel; Video for Video and Reel; both where the content type is configured to need both, see R6), and `auto_linked_at` is set. The hand-off box (already built) gets one person picker per board, defaulting to that Space's default assignee.
- **Rationale**: "once, at the moment it reaches Ready For Design"; a manual unlink is then respected.

## R6. Which boards a content type needs
- **Decision**: a per content type setting, `content_types.media_boards text[]`, editable in Settings › SLA & Workflow beside the SLA table. Default: `{video}` for Video and Reel, `{design}` for everything else.
- **Rationale**: "based on content type", and some types need both (e.g., a carousel with a teaser). Today's rule (Video/Reel → Video, else Design) becomes the default.
- **Alternatives**: hard-coded rule — can't express "both".

## R7. Space stages storage
- **Decision**: `space_stages` (one row per Space stage) and `task_space_stages` (a task's sub-stage in one Space, valid only while its original stage equals the recorded one).
- **Rationale**: the "remember only while in that original stage" rule becomes a comparison, with no cleanup job; changing the mapping never touches tasks.

## R8. Status words become Space stages
- **Decision**: one-time: per Space and original stage, one Space stage named by the first word (else no name, which shows the original name), other words as `aliases`. Content and Video read their words from their sheets' `view.words`. The status-words panel and the sheets' own words settings are retired; sheets read their Space's stages.
- **Rationale**: no team loses a name it chose.

## R9. Default assignee role
- **Decision**: `team_spaces.default_assignee_role`. Resolved when a task is created: the first member of the Space (by name) holding the role; none → the creator. The new-task form preselects that person and can be changed.
- **Rationale**: user answer 1; the tie and none cases need a rule.

## R10. Linking by hand before Ready For Design *(recommended default, user may change)*
- **Decision**: the media task shows at once in its board's Ready For Design column; its SLA starts when the content task reaches Ready For Design (its `stage_date` is set then).
- **Rationale**: designers can see what's coming without being timed for it.

## R11. Linking after D-Check *(recommended default)*
- **Decision**: Link task shows only on content rows that haven't reached F-Check.
- **Rationale**: the gate (R2) has nothing to hold back after D-Check.

## R12. One weekend definition *(recommended default)*
- **Decision**: SLA uses the weekend days from Settings › Due Dates (Friday and Saturday by default, matching "Sunday to Thursday").
- **Rationale**: one definition for SLA and due dates; today SLA skips Saturday and Sunday on the server's clock, which is wrong for Cairo.

## R13. Several members with the default role *(recommended default)*
- **Decision**: as R9.

## R14. Who can unlink *(decided by the user, 2026-11-23)*
- **Decision**: anyone can unlink.

## R15. Where the data changes run
- **Decision**: the simple-task, status-word, hand-off and default-role migrations run as `once()` markers in `prisma/seed.ts` (constitution §VI). The due-date migration built on 2026-11-23 (`scripts/due-dates-migrate.ts` with a workspace flag) moves to a `once()` marker too.
- **Rationale**: the constitution's rule for data changes to existing rows.

## R16. Simple-task removal
- **Decision**: `kind` and `simple_status` stay in the table (all `'pipeline'` / null) and are no longer read; the UI and code paths for simple tasks are deleted; commit `4fcbc23`'s rule ("start simple, a link makes pipeline") is reverted.
- **Rationale**: no destructive column drop on a live database.

## R17. Migrated Published tasks and the FFNT Calendar
- **Decision**: `migrated_simple = true` keeps those tasks out of the brand Library and off the brand Calendar's published markers, and skips the celebration.
- **Rationale**: user answer 5.

## R18. Related task
- **Decision**: the `task` column kind keeps its storage; every label becomes "Related task"; its picker title becomes "Pick a related task". It never changes a task's kind or links media.

## R19. Where Link task lives *(user, 2026-11-23)*
- **Decision**: Link task is where people type on the content side, as agreed for Stage C: a Link task column in the Content, Video and Digital Media Spaces' sheets, and a day on their calendars. Its list shows the unlinked tasks from the Design and Video boards, then Create task (Design, Video or both). Media boards keep only Create task.
- **Calendar**: the day becomes the content task's publishing date; on a day with no content row, Link task makes the content task with the typed name.
- **Relation to Related task**: Related task (the task-to-task field, R18) stays a separate field kind; the Link task column is built in and only links media.
