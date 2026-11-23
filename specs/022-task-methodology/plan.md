# Plan: task methodology (pipeline tasks, media links, Space stages)

**Branch:** `claude/wonderful-dirac-k1wflu` · **Status:** for approval, nothing built yet
**Source:** the decisions of 2026-11-23 (user's "Decisions on your review"). This plan replaces the parts of spec 021 that conflict with them: simple tasks (US5), the Space default kind, status words (US3) and "Link task" as the name of the task-to-task field.

---

## 1. The rules being built

**Stages.** Every task is a pipeline task with 11 stages, or 10 when its brand had C-Check off when the task was created:
To Do › C-In Progress › C-Review › C-Check › Ready For Design › D-In Progress › D-Check › F-Check › Ready to Publish › Scheduled › Published.
Each stage keeps its owner, SLA and approvals; Published plays the celebration. C-Check on/off is per brand and applies to new tasks only; a task already in C-Check finishes it.

**Content tasks and media tasks.** A *content task* runs the pipeline in the content Spaces. A *media task* lives on a media board (Design or Video).
- **Linked** media task: tied to a content task. It shows on its media board, and its progress shows on the content task in the content Spaces.
- **Unlinked** media task: not tied to anything. Content and media move separately.
- A task becomes linked in two ways:
  1. **Automatically**, once, when the content task reaches Ready For Design: to every board its content type needs (Design, Video, or both). The hand-off box asks for a designer or editor for each; if skipped, the board Space's default assignee gets it.
  2. **By hand**, on a media board: **Link task** (choose a content task, choose Design, Video or both) or **Create task**.
- **Create task** on a media board makes an unlinked media task that starts at Ready For Design. Its SLA starts there; the content stages before it are not part of its SLA or reports.
- **Unlink**: only Content (Content Creator) and Digital Media (Digital Marketing Specialist) can unlink. The content task stays in its Spaces, the media task stays on its board, and from then on each moves on its own.
- A manual unlink is respected: the automatic link never happens twice.
- Assigning a designer or editor to a content task that isn't linked does **not** put it on a media board. It shows in their My tasks only.

**Two boards at once.** A content task linked to both Design and Video has two media tasks. Each moves through Ready For Design › D-In Progress › D-Check on its own. The content task moves on to F-Check only when every linked media task has passed D-Check.

**Where tasks show.**
- In Spaces through "Shows in": the Space it was created in, the creator's Space and the assignee's Space. When the assignee changes, the old assignee's Space is removed only when it was added for the assignee and isn't the Space it was created in.
- On a media board, once linked (or when made there).
- In its brand: every task of the brand.
- Once per Space, in that Space's stage names.

**Space stages.**
- The 11 original stages are the source of truth for SLA, approvals, overdue, reports and the main pipeline board, which always shows the original names.
- Each Space maps its own stages onto them: it can rename an original stage, or split one into several Space stages. Each Space stage maps to exactly one original stage; every original stage has at least one Space stage.
- Moving between Space stages of the same original stage changes only the position in that Space. It doesn't change the original stage, restart SLA, trigger approvals or move the task in other Spaces. Anyone with access to the Space can do it.
- When the original stage changes, every Space shows the task in that stage's first Space stage. A Space remembers the sub-stage only while the task stays in that original stage.
- The mapping is set in the Space's settings. Changing it never moves a task's original stage.
- Sheets use their Space's stages: the Content sheet uses the Content Space's, the Video sheet the Video Space's.

**Default assignee per Space.** A role (e.g. Content Creator), set when the Space is created and changeable in its settings, for new tasks only. A new task made in the Space is assigned to the member who holds that role.

**SLA and dates.**
- SLA applies to every stage of every task, except a task made on a media board, whose SLA starts at Ready For Design.
- SLA counts working days, Sunday to Thursday. Overdue and SLA are judged on Cairo days.
- Publishing date and due date work as built (due = 7 days before publishing, moved off Friday/Saturday, unless set by hand). Boards sort by due date unless the person changes it.

**Brand switches.** Unchanged: a switched-off field hides, its values stay.

**Related task.** The task-to-task field built as "Task link" stays, renamed **Related task**, so it never shares a name with "Link task".

---

## 2. What changes in what's built

| Built | Becomes |
|---|---|
| Simple tasks (US5): three statuses, dashed columns, Kind filter, three-step control, "starts simple" rule (commit `4fcbc23`) | Removed. Existing simple tasks migrate (§5). |
| Space default kind (`team_spaces.default_kind`) | Unused; replaced by the default assignee role. |
| Status words (US3: `team_spaces.words`, the Content/Video sheets' `view.words`) | Space stages (§3). Existing words migrate to one renamed Space stage each. |
| Hand-off box at Ready For Design (adds the task to the Design or Video Space) | Creates linked media tasks, one per board, and asks for the designer/editor of each. |
| "Shows in": assignee's Spaces added, never removed; a designer as assignee adds the Design Space | Old assignee's Space removed on change (rule above); Design/Video Spaces are never added through creator or assignee. |
| Task link field and its "Link task" picker | Renamed Related task / "Pick a related task". No longer changes a task's kind. |
| SLA business days Monday–Friday on the server's clock (`businessDaysBetween`) | Sunday–Thursday, Cairo days. |

---

## 3. Data model

All changes are additive (`prisma db push`); no column is dropped in this plan.

**`tasks`**
- `media_board` text, null: `'design'` or `'video'` for a media task, null for a content task.
- `content_task_id` uuid, null: for a linked media task, its content task. Null means unlinked (or a content task).
- `entry_stage` text, default `'todo'`: the stage the task began at. `'r-design'` for a task made on a media board; SLA reports skip stages before it.
- `auto_linked_at` timestamptz, null, on a content task: when the automatic link at Ready For Design happened (so it happens once).
- `migrated_simple` boolean, default false: set by the migration; such tasks never celebrate and aren't new posts on the FFNT Calendar.
- `kind` and `simple_status` stay in the table, all `'pipeline'` / null, and are no longer read.

**`team_spaces`**
- `default_assignee_role` text, null.
- `media_board` text, null: `'design'` / `'video'` marks a media board Space (Design and Video today).

**`space_stages`** (new): `id`, `space_id`, `stage_id` (original), `name`, `position`, `aliases text[]` (other names typed in sheets, carried over from status words).
Rules checked on save: every original stage has ≥1 row; names unique within the Space; no row maps two stages.

**`task_space_stages`** (new): `task_id`, `space_id`, `space_stage_id`, `stage_id` (the original stage it was recorded under). It's valid only while the task's current stage equals `stage_id`; otherwise the first Space stage of the current stage applies.

---

## 4. Behaviour, piece by piece

**4.1 Moves**
- Content task:
  - Normal moves as today, up to Ready For Design.
  - Entering Ready For Design for the first time runs the automatic link: the hand-off box lists the boards the content type needs, each with a designer/editor picker, defaulting to that Space's default assignee.
  - While it has linked media tasks before D-Check is passed, its stage is the earliest of theirs (Ready For Design › D-In Progress › D-Check), and it can't be moved by hand past D-Check. The card says "waiting on Design" (or Video, or both).
  - When the last linked media task passes D-Check, the content task moves to F-Check.
- Linked media task:
  - Moves Ready For Design › D-In Progress › D-Check under the usual owners, SLA and approvals.
  - After D-Check it follows its content task (F-Check onward) and shows those stages on the media board, read-only.
- Unlinked media task: the whole pipeline from its current stage to Published, as any task.
- **Unlink** (Content Creator, Digital Marketing Specialist, and admins): clears `content_task_id`. The content task is no longer held back; the media task continues alone from where it is.

**4.2 Media boards**
- The Design and Video Space boards show that board's media tasks (linked and unlinked). They show no content tasks.
- New board actions:
  - **Link task:** search content tasks that aren't yet linked to this board, then pick Design, Video or both.
  - **Create task:** an unlinked media task at Ready For Design.
- A linked card shows its content task's name and a link to it. An unlinked card says so.

**4.3 Content Spaces**
- The content task card shows one chip per linked board, with its stage, e.g. "Design · D-In Progress" and "Video · D-Check".
- Unlink sits in the task panel, beside those chips, for the allowed roles.

**4.4 Space stages UI**
- Space settings get a Stages section:
  - the 11 original stages in order, each with its Space stage(s);
  - rename, add a split, reorder within the stage, remove (never the last one).
  - It replaces the "Status words" button.
- Space Board, List, Calendar and Sheet group and show by Space stage. A drag or a typed value between Space stages of the same original stage is a sub-stage move; to another original stage it's a normal move.
- The main board (Everything) and brand Boards keep the original names.

**4.5 Default assignee**
- Space settings: a role picker. A new task made in the Space is assigned to the member who holds that role.
- If several members hold the role, the first of them in the Space's member list gets it; if none does, the creator does. This is the one choice I've made here; see §7.

**4.6 SLA**
- `businessDaysBetween` counts Sunday–Thursday on Cairo days.
- Reports and alerts skip stages before `entry_stage`.

---

## 5. Migrations (one-time, in `scripts/migrate.sh`, recorded so they run once)

1. **Simple tasks → pipeline.**
   - Mapping: To Do → To Do, In progress → C-In Progress, Done → Published. `kind='pipeline'`, `simple_status=null`, `migrated_simple=true`.
   - `stage_date` is the migration day for To Do and C-In Progress, so their SLA counts from now. It stays as it was for Done → Published.
   - No celebration and no notifications fire.
2. **Status words → Space stages.**
   - For every Space and every original stage: one Space stage, named the Space's first word for it (else the original name), with the other words as aliases.
   - The Content and Video Spaces take their words from their sheets.
3. **Hand-offs already made → media tasks.**
   - A content task now at Ready For Design or later that shows in the Design or Video Space gets a linked media task per board.
   - Each media task gets the same stage (if it's still before F-Check) and the current assignee. The content task gets `auto_linked_at`.
   - After this, Design and Video "Shows in" rows for content tasks are removed.
4. **Default assignee roles:** Content → Content Creator, Design → Graphic Designer, Video → Video Editor, others none. All editable afterwards.

---

## 6. Phases (each ends with its checks passing and a local commit)

| # | Phase | Main files |
|---|---|---|
| 0 | Spec: amend `specs/021` (mark US3/US5/Task link superseded), add `specs/022` spec, data model and tasks; **your approval** | `specs/` |
| 1 | Remove simple tasks + migration 5.1; revert the "starts simple" rule | `actions/tasks.ts`, `lib/spaces*.ts`, Board/List/TaskModal/TaskForm, `scripts/` |
| 2 | SLA Sunday–Thursday on Cairo days; `entry_stage` | `lib/utils.ts`, `lib/alert-status.ts`, reports |
| 3 | Default assignee role; "Shows in" changes (removal on assignee change; no media Spaces via creator/assignee) | `actions/spaces.ts`, `lib/spaces.ts`, Settings › Spaces |
| 4 | Media tasks: model, automatic link with the multi-board hand-off box, Link task / Create task, Unlink, F-Check gate, after-D-Check follow, migration 5.3 | `actions/tasks.ts`, new `actions/media.ts`, `lib/media.ts` (pure), handoff, Board |
| 5 | Space stages: tables, settings UI, sub-stage moves, views and sheets on Space stages, migration 5.2; retire status words | new `lib/space-stages.ts` (pure), `actions/space-stages.ts`, views, sheets |
| 6 | Rename Task link → Related task | sheet columns, picker, messages |
| 7 | Arabic review, full regression, handover note | all labs |

Phases 1–3 are small and independent. Phase 4 depends on 1. Phase 5 depends on 1 and can run beside 4.

**Checks to add:**
- Pure:
  - media gating (F-Check only when every linked media task passed D-Check);
  - Space stage mapping rules;
  - sub-stage memory;
  - SLA Sunday–Thursday;
  - the default assignee pick.
- Real app:
  - auto-link to both boards with the box;
  - Create task on the Design board starts at Ready For Design;
  - Unlink by Content, refused for a designer;
  - content waits for both media tasks;
  - a designer assigned to an unlinked content task doesn't reach the Design board;
  - a split stage and sub-stage moves that change nothing else;
  - a migrated simple task.

---

## 7. Points to confirm before Phase 4 and 5 (my recommendation in bold)

1. **Linking by hand before the content task reaches Ready For Design:** **the media task shows at once on the board's Ready For Design column, and its SLA starts when the content task reaches Ready For Design.**
2. **Linking after the content task passed D-Check:** **Link task only offers content tasks that haven't reached F-Check.**
3. **One weekend for SLA and due dates:** **SLA uses the weekend days set in Settings › Due Dates (Friday and Saturday by default), so there's one definition.**
4. **Several members with the default role:** **the first in the Space's member list; none → the creator** (as in §4.5).
5. **Who can unlink:** **Content Creator, Digital Marketing Specialist and admins.**
