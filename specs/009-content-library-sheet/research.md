# Research: Content Library Sheet

**Feature**: spec 009 · **Date**: 2026-11-04 · **Plan**: [plan.md](./plan.md)

Every open question is settled here. Each decision gives what was chosen, why, and what else was considered. Spec 008's research (the video sheet) is the base, and is cited as 008-Rn.

---

## R1. What a theme is

**Decision**: A theme is a `Project` with a new `is_theme` flag. The project gains:
- `owner_id`: a member;
- `frequency_count` and `frequency_period` (`week` or `month`);
- `audience`: a text array of audience keys.

The Content sheet shows only theme projects.

**Rationale**:
- Projects already group tasks on the board, the Projects page and Overview (spec FR-010).
- Not every project is a content stream. Campaigns and plans would clutter the sheet, so the flag keeps them out.
- Paste plan and **+ Theme** set the flag. An existing project with the same name is matched and flagged, not duplicated.

**Alternatives considered**:
- *Every project is a theme*: shows plan projects that aren't content streams.
- *A separate `Theme` table*: duplicates projects, and tasks would need two containers.

## R2. Pillars

**Decision**: A new table, `ContentPillar` (`id`, `project_id`, `name`, `sort_order`, `created_at`), unique on (`project_id`, lower-cased name). Tasks gain `pillar_id`, with `onDelete: SetNull`, so removing a pillar keeps its pieces (FR-012).

**Rationale**: It is a real, ordered group inside one theme (FR-003, FR-011).

**Alternatives considered**:
- *`ProjectStep`*: steps are plan items with dates. A step's `task_id` is unique, so it can't hold many pieces.
- *A text field on tasks*: no ordering, no rename in one place.

## R3. The four links

**Decision**:
- **Post link** is a new `tasks.post_url`. **Published link** is spec 008's `tasks.published_url`.
- **Working doc** and **Design** are link attachments (008-R7, `content_type = text/uri-list`), with a new `TaskAttachment.link_role` column (`working_doc` or `design`).
- Saving a role's link replaces that role's previous link on the piece. Other links and files are untouched.

**Rationale**:
- FR-041 wants working doc and design in the Attachments section; attachments are already there and open in a new tab.
- Post and published links are one value each, shown and counted per piece. Plain columns make the summary a simple count.

**Alternatives considered**:
- *All four as attachments*: the published link already lives on the task (spec 008), and counting "missing link" from attachments would need joins everywhere.

## R4. Content stage names

**Decision**: Message strings `content.stage.<stageId>`, as in 008-R4.

- **Mapping**: as in FR-020.
- **Reading pasted statuses**: content names, real stage names and video names are all accepted, ignoring capitals and spaces. **Archived** means dropped (FR-022). A blank status means To Do.

**Rationale**: Display labels only (§II). The reference's own words, "Initial Design" and "Final Design", read as they always have.

## R5. Archive is drop

**Decision**: The same `dropped_at` flag as spec 008. `dropClip` and `restoreClip` are generalised into `dropTask` and `restoreTask`.
- A task may be dropped when it is a clip of a video **or** a piece of a theme.
- The old names stay as aliases, so spec 008 code and tests are unchanged.

**Rationale**: One flag means every exclusion already built for dropped clips applies: the board, overview, capacity and projects (FR-022).

## R6. Cadence and dates

**Decision**: Cadence counts the theme's live pieces in `publish` whose `stage_date` falls on or after the start of the current period:
- **week**: Monday 00:00 local time, matching `businessDaysBetween`, which already treats Saturday and Sunday as the weekend;
- **month**: the 1st.

The Date column shows the published date (`stage_date`) for published pieces, and the due date otherwise. Only the due date is editable.

**Rationale**: `stage_date` is set when a piece reaches Published (by the board's move), so nothing new is stored (spec: "Cadence: derived, never stored").

**Alternatives considered**:
- *A `published_at` column*: duplicates `stage_date` for the publish stage.
- *Sunday weeks (the Egyptian work week)*: would disagree with the SLA's business-day rule. A setting can come later.

## R7. Who may add pieces and themes

**Decision**: `mayAddPiece(project, member)` is true for:
- admins and superusers;
- the theme's owner;
- any member who owns or is assigned a live piece in that theme ("assigned to the theme").

Creating a new theme (by **+ Theme** or by pasting a theme name that doesn't exist) is for admins and superusers only. Editing a theme's details is for admins, superusers and the theme's owner (FR-012).

**Rationale**:
- This is the spec's FR-052.
- New themes are plan-level decisions, so a "user" can't create one by pasting.

## R8. Reading the pasted plan

**Decision**: A pure module, `src/components/content/parse-plan.ts`.

- **HTML**: Google Sheets copies merged cells as `rowspan`. `gridFromHtml` expands `rowspan` and `colspan` into a full grid by repeating the value, which also makes merged cells carry down (FR-030). Plain text carries down by repeating the last non-empty Theme, Owner, Frequency and Audience until the theme changes; Pillar carries down within a theme.
- **Headings**:
  - The first row containing "Piece Title" (or "Title") is the heading row. Columns are matched by name, ignoring case, spaces and punctuation.
  - Aliases: Working Doc / Doc; Design Link / Design; LinkedIn Link / Post / Post Link; Published Link / Published; Task Link / Task.
  - Without a heading row, the reference's column order is assumed.
- **Values**:
  - **Task Link**: the `task=<uuid>` query parameter of any Momentum board URL, or a bare UUID.
  - **Frequency**: "2 per week", "1/week", "3 per month".
  - **Audience**: split on commas and matched to the five segments by keyword ("C-Level", "Strategy", "Top Management", "2nd Line", "CEO").
  - **Type**: Social Media → Post; Article, Report and Framework/Model as themselves; otherwise a known content type by name, or Other.
- **Problems**, per row:
  - no title;
  - a link cell that isn't a web address (it is cleared, and the row is listed);
  - an unknown status;
  - a Task Link to a task that doesn't exist;
  - an owner who isn't a team member (falls back to the person pasting);
  - a new theme pasted by a non-admin.

**Rationale**: The "Plan (Organized)" tab has a heading row. The older "Plan" tab has headings only for its first five columns, so it is read by position. The spec's assumption is updated to say so.

## R9. Adding the plan on the server

**Decision**: `addPlan(rows, { useSheetTitleStatus })` runs in one interactive transaction, holding the advisory lock `pg_advisory_xact_lock(hashtext('content-plan'))`, so two pastes never create the same theme or piece twice (FR-035). For each row, it:
1. matches or creates the theme (admins only for new themes) and fills its empty details;
2. matches or creates the pillar;
3. if there is a Task Link:
   - updates that task's project, pillar, type and empty links;
   - changes its title and stage only when `useSheetTitleStatus` is set;
4. otherwise:
   - skips the row if a live or archived piece in the theme has the same title (ignoring case);
   - else creates the task in the mapped stage, owned by the matched owner (or the caller), with the theme's brand, the pillar and the links.

The server re-reads statuses, types and links. It never trusts the preview.

**Rationale**: As with clips (008-R2): an exact, reviewable server path, and a lock instead of catching unique violations inside a transaction.

## R10. The grid is shared

**Decision**: Extract the keyboard, focus, editing and ARIA core of spec 008's `SheetGrid` into `src/components/sheet/GridCore.tsx`, driven by a model object (`isText`, `textValue`, `isMenu`, `render`, `colsOf`, `onCommit`, `onOpen`…). The video sheet's `SheetGrid` and the new `ContentGrid` are thin models over it.

- **Spanning rows**: theme and pillar rows render one cell spanning the columns (`colsOf(row) = ['rowNo', 'title']`). Arrow keys landing on a missing column go to the nearest one present.

**Rationale**:
- FR-005 asks for the same keyboard model and editing.
- Copying 450 lines would let the two drift. Spec 008's lab (68 checks) guards the refactor.

## R11. Where the Content sheet lives

**Decision**: A third view in `KanbanBoard`: **Board | Sheet | Content**, with `?view=content`, using the same `tasks` state and the same host `api` (008-R5).
- The board page also loads the theme projects (with owner, frequency, audience and pillars) and the `pillar_id`, `post_url` and link-role attachments of tasks.
- New host calls: `addPlan`, `addPiece`, `updatePiece`, `setPieceLink`, `saveTheme`, `addTheme`, `savePillar`, `removePillar`.

**Rationale**: One state means the Content sheet, the video sheet and the board always agree (SC-002).

## R12. New content types

**Decision**: `prisma/seed.ts` adds Article, Report and Framework/Model, each with SLA rows copied from Post's defaults. The seed runs on every deploy and only creates rows, so existing tuning is kept.

## R13. Tests

**Decision**: Extend the sheet lab with a `#view=content` mode: a `ContentSheet` stub host with fixtures from the reference rows.
- **Node checks**: `parse-plan` on the reference rows (HTML with `rowspan`, and TSV), status, type, audience and frequency reading, cadence, the theme summary, and messages parity for the `content` namespace.
- **Browser scenarios**: each acceptance scenario.
- **Real app**: quickstart §3 pastes the 18 reference rows into the local database.
