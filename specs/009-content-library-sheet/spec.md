# Feature Specification: Content Library Sheet

**Feature Branch**: `claude/nice-noether-x4rgei`

**Created**: 2026-11-04

**Status**: Draft

**Input**: "Content Library sheet: a sheet view of the team's content plan." The reference is the team's **Content Library** Google Sheet, tab "Plan (Organized)". Its columns are Theme, Owner, Frequency, Target Audience, Pillar, Piece Title, Type, Status, Working Doc, Design Link, Task Link, LinkedIn Link and Published Link. The user said: "Use this as reference". Build on the video sheet (spec 008), using the recommended defaults.

## Context

The team plans its content in a Google Sheet called Content Library. Each theme is a stream of work:
- **Strategy**: owned by Samaa, 2 pieces a week, for C-Level, Strategy Heads and Top Management;
- **Newsjacking**: owned by Noran, 1 piece a week, for Strategy Heads, Top Management and 2nd Line Management.

Themes split into **pillars** (AI, Decision Making). Each row is one **piece**, such as an article, a framework, a social post or a report, with its type, status and up to four links: the working document, the design, the LinkedIn post and the published page.

The sheet and Momentum have drifted apart:
- **Half the pieces aren't on the board.** About half the rows have no Task Link, so the work isn't in Momentum at all.
- **Statuses don't match the board.** The sheet's statuses (Initial Design, Final Design, Ready to Publish, Published, Archived, blank) are typed by hand and don't follow the board.
- **Links break unnoticed.** One published link says "Link error", and some LinkedIn links are pasted as post titles rather than links.
- **Cadence is a guess.** Nobody can see whether a theme is meeting its frequency this week.

This feature brings the Content Library into Momentum. It is a second sheet beside the video sheet, built the same way:
- **Every row is a real task.** Each piece is a card on the board, so status in the sheet and on the board is always the same.
- **Themes are projects.** Each theme carries its owner, frequency and audience, and pillars group pieces inside it.
- **Videos are pieces too.** A video in the library is a piece like any other, and expands into its clips (spec 008).

How this spec maps the reference sheet:

| Reference column | In Momentum |
|---|---|
| Theme, Owner, Frequency, Target Audience | The theme (a project) and its details |
| Pillar | A group of pieces inside a theme |
| Piece Title, Type, Status | The piece (a task): its name, content type and stage, in content words |
| Working Doc, Design Link | The piece's links |
| Task Link | No longer needed: the row *is* the task. Used once, when bringing the sheet in, to match existing tasks |
| LinkedIn Link, Published Link | The piece's post link and published link |

## User Scenarios & Testing *(mandatory)*

### User Story 1 - See the whole content plan in one sheet (Priority: P1)

The Marketing Manager opens the **Content** sheet. Each theme is a group, with its owner, frequency and audience on the group's row. Inside each theme, pieces are grouped by pillar, and each row shows title, type, status (in content words), owner, assignee and the four links. A line above sums it up: "21 pieces · 9 published · 3 in design · 2 missing a published link · 1 archived".

**Why this priority**: This is the view itself. It replaces the Google Sheet as the place to look.

**Independent Test**: Create two themes with pillars and 18 pieces matching the reference sheet. Open the Content sheet. Every piece appears once under its theme and pillar, the group rows show owner, frequency and audience, and the summary matches a count of the rows.

**Acceptance Scenarios**:

1. **Given** themes with pieces, **When** a member opens the Content sheet, **Then** each theme is a collapsible group whose row shows its owner, frequency and target audience, and its pieces follow, grouped by pillar (pieces without a pillar last).
2. **Given** the sheet, **When** it is shown, **Then** each piece row shows: title, type, status, owner, assignee, working doc, design, post link, published link, and the date it was published or is due.
3. **Given** the sheet, **When** it is shown, **Then** the header row and the title column stay in place while the grid scrolls, with row numbers down the edge, as in the video sheet.
4. **Given** the sheet, **When** it is shown, **Then** a summary line counts pieces, published pieces, pieces in design stages, published pieces without a published link, and archived pieces. Archived pieces are left out of the other counts.
5. **Given** a theme row, **When** the member collapses it, **Then** its pieces are hidden and the row shows how many it holds.

---

### User Story 2 - Bring the Google Sheet in without retyping (Priority: P1)

The Marketing Manager copies the "Plan (Organized)" rows from the Content Library and pastes them into **Paste plan**. A preview shows:
- **themes and pillars** it will create or match;
- **pieces**: how many are new, how many match an existing task through their Task Link, and how many are already in the sheet;
- **rows with problems**: no status, a link that isn't a web address, a Task Link to a task that doesn't exist.

They fix two rows in place and press **Add**. New pieces appear on the board; pieces that already had a task gain their theme, pillar and links instead of being duplicated.

**Why this priority**: The plan already exists in the Google Sheet. If moving it means retyping 20+ rows, the team will keep the Google Sheet.

**Independent Test**: Paste the reference rows: 18 pieces, 7 with a Task Link to existing tasks, 1 with "Link error" as its published link, 2 with no status. Preview counts match. Adding creates 11 new tasks, updates 7 existing ones, and creates no duplicates. A second paste of the same rows adds nothing.

**Acceptance Scenarios**:

1. **Given** rows copied from the Content Library, **When** they are pasted, **Then** each row is read as: theme, owner, frequency, audience, pillar, piece title, type, status, working doc, design link, task link, post link and published link, by matching the reference's column headings in any order. Merged theme cells carry down to every row below them.
2. **Given** a row whose Task Link points to an existing task, **When** the plan is added, **Then** that task gains the row's theme, pillar, type and links. Its name and stage are only changed if the member chooses to, and no new task is made.
3. **Given** a row with no Task Link whose title matches a piece already in that theme, **When** the preview shows, **Then** it is counted as "already in the sheet" and not added again.
4. **Given** rows with problems, **When** the preview shows, **Then** each problem is listed with the row, and can be fixed in place or the row left out:
   - a link cell that isn't a web address (such as "Link error", or a LinkedIn post title);
   - a status the sheet doesn't know;
   - a Task Link to a task that doesn't exist.
5. **Given** a theme or pillar name that doesn't exist yet, **When** the plan is added, **Then** it is created with the row's owner, frequency and audience. If it exists, it is matched by name, ignoring capitals and spaces.
6. **Given** a status in the reference's words, **When** it is read, **Then** it maps to a stage (FR-020), "Archived" marks the piece archived, and a blank status means To Do.

---

### User Story 3 - Status in content words, with the board's rules (Priority: P1)

Noran opens a report's status cell: it reads **Initial Design**. The menu offers only the moves the board allows her, next stage first. She chooses **Final Design**, and the card on the board moves to D-Check, with its SLA clock restarting and the celebration playing if it was her stage.

**Why this priority**: As with the video sheet, the Content sheet must not be a way around the pipeline (Constitution §II, §V).

**Independent Test**: Spec 008's US2 test, run on a piece instead of a clip: the menu equals the board's allowed moves for every member, and a move in either place shows in both.

**Acceptance Scenarios**:

1. **Given** a piece, **When** its status is shown, **Then** it uses the content name for its stage (FR-020), and hovering or focusing it shows the real stage name.
2. **Given** a member opens a status cell, **When** the menu shows, **Then** it lists exactly the moves the board allows that member for that piece, next stage first, as in the video sheet.
3. **Given** a status change, **When** it saves, **Then** the board card, stage date, SLA and celebration behave exactly as a move on the board.
4. **Given** a piece moved to Published from the sheet, **When** the move succeeds, **Then** the sheet asks for its published link, and the post link if the type is posted on social media.

---

### User Story 4 - Every link in one row, checked (Priority: P2)

Samaa pastes the Google Doc link of a new article into its **Working doc** cell, the Claude design link into **Design**, and, once it is live, the LinkedIn post into **Post** and the page into **Published**. A cell holding something that isn't a web address shows "Not a link" instead of the text.

**Why this priority**: Links are half the reference sheet's columns, and the most broken half.

**Independent Test**: Paste a web link into each of the four link cells of a piece: each is stored and opens in a new tab. Try "Link error": it is refused with a note. The piece's task panel lists the working doc and design links as attachments.

**Acceptance Scenarios**:

1. **Given** a piece, **When** a member who may edit it pastes a web link into Working doc, Design, Post or Published, **Then** it is saved and shown as the site's name (for example "Google Docs", "claude.ai", "linkedin.com"), opening in a new tab.
2. **Given** text that isn't a web address, **When** it is pasted into a link cell, **Then** it is refused with "That isn't a web address", and nothing is saved.
3. **Given** a piece with a working doc or design link, **When** its task panel opens, **Then** those links appear in its Attachments section (spec 007), marked as links.
4. **Given** a published piece without a published link, **When** its row shows, **Then** the Published cell reads "Missing link", and the summary counts it.

---

### User Story 5 - Themes keep their cadence (Priority: P2)

The Marketing Manager sees on the Strategy row: "Samaa · 2 per week · this week 1 of 2". On Newsjacking: "Noran · 1 per week · this week 1 of 1 ✓".

**Why this priority**: Frequency is in the reference sheet but nobody checks it. Showing it is cheap and makes the plan accountable.

**Independent Test**: A theme with a frequency of 2 per week and one piece published this week shows "this week 1 of 2". Publish a second: it shows "2 of 2 ✓".

**Acceptance Scenarios**:

1. **Given** a theme with a frequency, **When** its row shows, **Then** it reads "this week {published} of {target}", counting pieces published since the start of the current week. It is marked done when the target is met.
2. **Given** a theme row, **When** a member who may edit the theme opens its owner, frequency or audience, **Then** they can change them. Frequency is "{n} per week" or "{n} per month".
3. **Given** target audience, **When** it is edited, **Then** it is chosen from the team's audience list (C-Level of large companies, Strategy Heads, Top Management, 2nd Line Management, CEO of medium-sized companies). More than one may be chosen.

---

### User Story 6 - Videos and their clips inside the plan (Priority: P2)

A video in the Strategy theme shows as a piece with its own row. Opening it expands its clips underneath, exactly as in the video sheet, with the clip columns available.

**Why this priority**: The user chose one sheet. Videos are planned alongside articles and reports, so they belong in the same plan.

**Independent Test**: Give a Video piece in a theme three clips. In the Content sheet the video row has an expand control. Expanding shows the three clips with their status cells working as in spec 008. "Open in video sheet" opens the spec 008 view of that video.

**Acceptance Scenarios**:

1. **Given** a piece of type Video with clips, **When** the Content sheet shows it, **Then** its row can expand to show its clips, in clip order, with status and editor cells working as in the video sheet.
2. **Given** an expanded video, **When** the member wants the full clip columns (in, out, file name, files), **Then** "Open in video sheet" opens that video's sheet.
3. **Given** clips, **When** the Content summary counts pieces, **Then** clips are not counted as pieces. The video counts once.

---

### User Story 7 - Add and edit pieces inline (Priority: P3)

Noran adds next week's newsjacking report with **+ Piece** under the Newsjacking theme. She types the title, picks the type Report and the pillar, and it appears on the board in To Do, owned by her, in the Newsjacking project.

**Why this priority**: After the import, new pieces are added one at a time. This replaces adding a row to the Google Sheet.

**Independent Test**: Use + Piece under a theme, type a title, then Enter. A task appears in To Do, in that theme's project, owned by the member, with the theme's brand. Its title, type, pillar and assignee are editable inline.

**Acceptance Scenarios**:

1. **Given** a theme, **When** a member who may add pieces (FR-052) presses + Piece and types a title, **Then** a task is created in To Do in that theme, owned by them, with the theme's brand.
2. **Given** a piece, **When** a member who may edit it changes its title, type, pillar, assignee or due date inline, **Then** it saves on Enter, Tab or leaving the cell, and Esc cancels, as in the video sheet.
3. **Given** a piece, **When** a member who may edit it presses Archive, **Then** it is greyed and struck through, leaves the board, and can be restored, as with dropped clips.

### Edge Cases

- **A piece in no theme**: tasks with no project don't show in the Content sheet. The Content sheet is for planned content.
- **A theme with no pieces**: the theme row shows, with + Piece.
- **A Task Link to a task in another theme**: the preview says so, and adding moves it to the pasted theme only if the member confirms.
- **The same title twice in one theme**: allowed when both rows carry different Task Links. Without Task Links, the second is "already in the sheet".
- **A LinkedIn "link" that is a post title** (as in the reference): listed as a problem, to fix or leave empty.
- **Merged cells**: theme, owner, frequency and audience carry down from a merged cell to every row below until the next value.
- **Statuses with different capitals or spaces** ("Ready to publish", "Final design "): matched ignoring capitals and spaces.
- **9-stage pieces**: the Content Check stage gets the content name "Content Check".
- **Archived pieces**: hidden from the board; shown greyed in the sheet with Show archived (on by default).
- **Arabic**: the grid, summary, preview and menus mirror; counts and dates stay in Western digits.
- **Phone width**: the grid scrolls sideways inside its area, with the title column frozen.

## Requirements *(mandatory)*

### Functional Requirements

**The view**

- **FR-001**: The board MUST offer **Board | Sheet | Content**, alongside the video sheet's Board | Sheet.
- **FR-002**: The Content sheet MUST show every theme as a collapsible group. Its row shows name, owner, frequency, cadence this week (FR-061) and target audience.
- **FR-003**: Inside a theme, pieces MUST be grouped by pillar, in the order the pillars were created, with pieces without a pillar last. Inside a pillar, pieces are ordered by due date, then by when they were added.
- **FR-004**: Each piece row MUST show: title, type, status, owner, assignee, pillar, working doc, design, post link, published link, due or published date, and archive or restore.
- **FR-005**: The grid MUST behave like the video sheet: compact rows, gridlines, row numbers, a frozen header row and title column, the same keyboard model, and the same cell editing.
- **FR-006**: A summary line MUST count, for the themes shown: pieces, published, in design stages (Ready for Design through Final Check), published without a published link, and archived. Archived pieces are left out of the other counts.
- **FR-007**: A **Mine** toggle MUST limit pieces to those the member owns or is assigned. **Show archived** MUST hide or show archived pieces; on by default.

**Themes and pillars**

- **FR-010**: A theme MUST be a project, which also carries an owner, a frequency (n per week or per month) and a target audience (one or more from the team's audience list).
- **FR-011**: A pillar MUST be a named group of pieces within one theme. A piece belongs to at most one pillar.
- **FR-012**: Members who may edit a theme (admin, superuser, or the theme's owner) MUST be able to rename it and change its owner, frequency and audience, and add, rename or remove pillars. Removing a pillar leaves its pieces in the theme with no pillar.

**Status words**

- **FR-020**: The Content sheet MUST show content names for stages. They are display labels only; the board keeps the real names:

  | Stage | Content name |
  |---|---|
  | To Do | Planned |
  | C-In Progress | Writing |
  | C-Review | Content Review |
  | C-Check | Content Check |
  | Ready For Design | Ready for Design |
  | D-In Progress | Initial Design |
  | D-Check | Final Design |
  | F-Check | Final Check |
  | Ready to Publish, Scheduled, Published | unchanged |

- **FR-021**: Status changes MUST follow spec 008 FR-020 to FR-022: the board's own move, exactly the board's allowed moves, rollback with the reason on refusal.
- **FR-022**: **Archived** MUST be the Content sheet's word for dropped (spec 008 FR-060 to FR-063): hidden from the board, greyed in the sheet, restorable at its stage with its SLA as it was.

**Bringing the Google Sheet in**

- **FR-030**: **Paste plan** MUST accept rows copied from the Content Library ("Plan (Organized)" layout, rich or plain text), matching columns by their headings. Merged cells carry down.
- **FR-031**: Before adding, a preview MUST show the themes and pillars to create or match, and pieces split into new, matched by Task Link, already in the sheet, and rows with problems.
- **FR-032**: A row with a Task Link to an existing task MUST update that task's theme, pillar, type and empty links instead of creating a new one. Its title and stage change only if the member ticks "Use the sheet's title and status" in the preview.
- **FR-033**: A new piece MUST be created in the stage its status maps to (FR-020), owned by the row's owner where that name matches a team member (otherwise by the member pasting), with the theme's brand, and its links.
- **FR-034**: Rows with problems (a link cell that isn't a web address, an unknown status, a Task Link to a missing task, no title) MUST be listed. Each can be fixed in place or left out. Adding never stores a non-link as a link.
- **FR-035**: Pasting the same rows again MUST add nothing new.

**Links**

- **FR-040**: Each piece MUST have four link cells: Working doc, Design, Post and Published. A cell accepts only web addresses, and opens in a new tab.
- **FR-041**: Working doc and Design links MUST appear in the piece's Attachments section as links (spec 008 R7). Post and Published are the piece's post link and published link.
- **FR-042**: A published piece without a published link MUST show "Missing link" and be counted in the summary.
- **FR-043**: Moving a piece to Published from the Content sheet MUST ask for its published link, and for its post link when its type is posted on social media.

**Videos**

- **FR-050**: A Video piece with clips MUST be expandable in the Content sheet, showing its clips with spec 008's status and editor behaviour.
- **FR-051**: "Open in video sheet" MUST open the spec 008 sheet of that video. Clips MUST NOT count as pieces in the Content summary.

**Adding and editing**

- **FR-052**: **+ Piece** and **Paste plan** MUST be available to [NEEDS CLARIFICATION: Who may add pieces to the plan? Today "user"-level members (Content Creators) can't create tasks. Spec 008 made an exception for clips only. Samaa and Noran own the two themes in the reference sheet; if they are "user"-level, they couldn't add their own pieces.].
- **FR-053**: Members who may edit a piece (its owner, assignee, admin or superuser) MUST be able to edit its title, type, pillar, assignee, due date and links inline, and archive or restore it.
- **FR-054**: The content types MUST include **Article**, **Report** and **Framework/Model**, with SLA thresholds per stage like the others. "Social Media" in the reference maps to Post.

**Language, design and access**

- **FR-080**: Every new string MUST exist in English and Arabic, and the Content sheet, summary, preview and menus MUST lay out right to left in Arabic.
- **FR-081**: The look MUST follow an approved design file, committed before UI work, that reuses the video sheet's design.
- **FR-082**: Every action MUST be usable with the keyboard alone, and the grid MUST expose its rows, groups, columns and headers to screen readers.

### Key Entities

- **Theme**: an existing project, used as a content stream. It gains an owner (a member), a frequency (a count per week or per month) and a target audience (one or more audience segments).
- **Pillar**: a named group inside one theme, in a set order. A piece belongs to at most one pillar.
- **Piece**: an existing task that belongs to a theme. It gains a pillar, a post link and its links (working doc and design as link attachments; the published link from spec 008).
- **Audience segment**: one of the team's fixed audience list.
- **Content stage names**: a fixed display mapping from each pipeline stage to a content name, used only in the Content sheet.
- **Cadence**: derived, never stored: pieces in a theme published since the start of this week (or month) against its frequency.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Pasting the 18 rows of the reference "Plan (Organized)" tab brings the whole plan into Momentum in under 2 minutes:
  - both themes and their 2 pillars;
  - 11 new pieces and 7 matched;
  - every valid link in place;
  - no duplicates, and no retyping.
- **SC-002**: In 100% of checks, a piece's stage in the Content sheet matches its card on the board after either is changed.
- **SC-003**: In 100% of checks, the status menu offers exactly the moves the board allows that member.
- **SC-004**: The summary and each theme's cadence ("this week n of m") match a manual count in 100% of checks.
- **SC-005**: No cell in the Content sheet ever holds a non-link as a link. Every link cell opens a working web address or is empty.
- **SC-006**: On a 1366×768 screen, at least 20 rows are visible at once.
- **SC-007**: Every action in this spec can be done with the keyboard alone.
- **SC-008**: Within two weeks of launch, the team stops editing the Content Library Google Sheet (checked with the Marketing Manager).

## Assumptions

- **The reference**: the "Plan (Organized)" tab of the Content Library Google Sheet, read on 2026-11-04: 18 pieces in 2 themes. The older "Plan" tab has the same rows in a less tidy layout. Paste plan accepts both, by their headings.
- **Themes are projects (recommended default)**: projects already group tasks on the board and the Projects page, and "standing" projects already exist for ongoing streams. A theme is a standing project with owner, frequency and audience.
- **Pillars are a new group inside a theme**: Momentum has nothing between a project and a task for this.
- **Status names (recommended default)**: content names in the Content sheet only, mapped onto the pipeline as display labels (FR-020). "Initial Design" and "Final Design" are the reference's own words. The pipeline is unchanged (Constitution §II).
- **Archived = dropped**: the same flag spec 008 added for clips, so archived pieces leave the board and every count, and can be restored.
- **One sheet for content, with videos inside (recommended default)**: the video sheet stays, for full clip work. The Content sheet shows videos as pieces that expand into their clips.
- **New content types**: Article, Report and Framework/Model are added. Their SLA thresholds default to Post's until an admin sets them in Settings.
- **"Social Media" type** in the reference maps to Post, and "Framework/Model" to the new Framework/Model type.
- **Owner names** in the reference (Samaa, Noran) are matched to team members by name when pasting. An unknown name falls back to the member pasting, and is listed in the preview.
- **Task Link** is used only when bringing the sheet in. After that, the row is the task.
- **Built on spec 008**: the grid, keyboard model, status menu, paste reading, link checks and archive are the video sheet's, reused.
- **Out of scope**:
  - two-way sync with the Google Sheet (paste in only);
  - a content calendar view;
  - analytics on published pieces;
  - per-platform captions;
  - automatic checking that a link still works (links are checked for being web addresses only).
