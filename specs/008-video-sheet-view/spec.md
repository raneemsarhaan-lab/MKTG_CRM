# Feature Specification: Video Sheet View

**Feature Branch**: `claude/nice-noether-x4rgei`

**Created**: 2026-11-04

**Status**: Draft

**Input**: User description: "The sheet view." That is, the compact, spreadsheet-like view of a long-form video and its clips from the design preview "Momentum Video Sheet", with the user's decisions from the sheet analysis:
- **Stage names:** video-friendly names in the sheet; the real stage names stay on board cards.
- **Who adds clips:** anyone.
- **Files:** both Drive links and uploads.

## Context

The team cuts each recorded talk into many short clips (Reels), each with its own title, editor, in/out times, Drive link and, once posted, a published link. Today this lives in a Google Sheet, apart from the board, so the sheet and the board drift apart.

This feature brings that sheet into Momentum as a second view of the same work:
- **The video is a task.** Each clip is a subtask of it, so every clip row is also a real card on the board.
- **Status in either place is the same.** Moving a clip in the sheet moves its card, and the reverse.

Findings from the sheet analysis, and where they are addressed:

| Finding | Problem | Addressed by |
|---|---|---|
| S1 | The design's status menu let anyone jump to any stage | FR-020–FR-024 |
| S2 | Video stage names differ from the pipeline's | FR-010–FR-013 (decision: names in the sheet only) |
| S3 | Video Editors and Content Creators can't create tasks, so they couldn't add clips | FR-030–FR-034 (decision: anyone adds clips) |
| S4 | "Editor" listed roles, not people | FR-025 |
| S5 | No uploads; storage limits | FR-040–FR-046 (decision: links and uploads) |
| S6 | Clip details had nowhere to live | FR-005, Key Entities |
| S7 | Every role saw the same columns | FR-050–FR-053 |
| S8 | "Mine" vs "team" undefined for the sheet | FR-054 |
| S9 | Published clips without a post link | FR-047, FR-048 |
| S10 | "Drop" had no board equivalent | FR-060–FR-063 |
| S11 | Unrecognised paste rows were only counted | FR-034 |
| S12 | Arabic not designed | FR-080 |

## User Scenarios & Testing *(mandatory)*

### User Story 1 - See every clip of a video in one dense sheet (Priority: P1)

The Marketing Manager opens the "Strategy Execution and Leadership" video and switches to **Sheet**. One compact grid shows:
- the full video as the top row;
- its clips underneath, in clip order, one row each, with title, clip #, type, status (in video words such as "Editing"), editor, source, file name, in, out, length, Drive and published link.

A line above the grid sums it up: "13 clips · 15m 40s · 5 editing · 3 published (1 no link) · 1 dropped".

**Why this priority**: This is the view itself. Without it there is nothing to edit, assign or link.

**Independent Test**: Give a video task 13 clip subtasks with details. Open its sheet. Every clip appears once, in clip order, under the video row; the summary line matches the rows; rows are 24–28 px tall, like a spreadsheet.

**Acceptance Scenarios**:

1. **Given** a video task with clips, **When** the member opens its sheet, **Then** the video is the first row and its clips follow in clip-number order, each with the columns listed above.
2. **Given** the sheet, **When** it is shown, **Then** the header row and the title column stay in place while the grid scrolls in either direction, and row numbers run down the left edge.
3. **Given** the sheet, **When** it is shown, **Then** a summary line shows the number of clips, their total length, how many are in editing stages, how many are published (and how many of those lack a published link), and how many are dropped.
4. **Given** the video row, **When** the member collapses it, **Then** its clips are hidden and the row shows "13 clips".
5. **Given** the board, **When** the member chooses **Sheet**, **Then** they see every video that has clips, each as a collapsible group, and can open a single video's sheet on its own.

---

### User Story 2 - Change status in the sheet, with the board's rules (Priority: P1)

A Video Editor finishes a clip. In the sheet, its status cell reads **Editing**. They open it and see only the moves the board allows them, with the next stage first: **Edit Review**. They choose it. The clip's card on the board moves to **D-Check** at the same moment, its SLA clock restarts, and, because it is their stage, the celebration plays.

**Why this priority**: The sheet must never become a back door around the pipeline (Constitution §II and §V), and the card and the row must always agree.

**Independent Test**: As the clip's assignee, change a clip in Editing to Edit Review in the sheet. The board shows the card in D-Check, with stage date today, and the celebration fires. As a member with no right to move it, the status cell offers no moves.

**Acceptance Scenarios**:

1. **Given** a clip, **When** its status is shown in the sheet, **Then** it uses the video name for its stage (FR-010), and hovering shows the real one ("Editing · D-In Progress").
2. **Given** a member opens a clip's status cell, **When** the menu shows, **Then** it lists only the moves the board would allow that member for that task: when they hold its current stage (or are an admin or superuser), any other stage on the task's path, with the next stage first, then earlier stages (to send work back), then later ones. Otherwise it lists nothing.
3. **Given** a status change in the sheet, **When** it is saved, **Then** the clip's board card shows the same stage, the stage date resets, SLA status recomputes, and the celebration plays under the same rules as on the board.
4. **Given** a card moved on the board, **When** the sheet is open or next opened, **Then** the clip's row shows the new stage.
5. **Given** a status change that fails, **When** the server refuses it, **Then** the cell returns to its previous value and says why.

---

### User Story 3 - Anyone adds clips by pasting from Google Sheets (Priority: P1)

A Content Creator copies the File Name, Suggested Title and Drive Link columns from the team's Google Sheet and pastes them into **Paste clips**. The sheet previews: "2 new · 1 already in the sheet · 1 row without a clip file name". It shows the new clips with their clip number, source, in → out and length, read from file names such as `30_IMG_0296_6m12.4s-7m20.9s.mp4`. They press **Add 2 clips**. Two rows appear, and two new cards appear on the board in To Do.

**Why this priority**: Clips arrive in batches of ten or more. Typing them one by one is what makes people keep the Google Sheet. The user decided anyone may add them.

**Independent Test**: As a member with the "user" access level who is neither owner nor assignee of the video, paste three rows (one new, one already present, one without a valid file name). Preview counts match; Add creates exactly one clip, owned by that member, in To Do, with its details and Drive link.

**Acceptance Scenarios**:

1. **Given** any signed-in member who can open the video, **When** they paste rows copied from a spreadsheet, **Then** each row with a clip file name is recognised, with its clip number, source, in and out times and length read from the file name, its title from the longest other text cell, and its Drive link from the row's link.
2. **Given** the preview, **When** it is shown, **Then** it says how many rows are new, how many are already in the sheet (same file name), and how many have no clip file name.
3. **Given** rows without a clip file name, **When** the preview shows, **Then** each one is listed with what was pasted, and can be fixed in place (title and file name) or left out.
4. **Given** the member confirms, **When** clips are added, **Then** each becomes a subtask of the video, owned by the member who added it, with content type Reel, status To Do, no assignee, and the parsed details. Its Drive link is attached as a link.
5. **Given** the member prefers one at a time, **When** they press **+ Clip** under the last row, **Then** an empty clip row is added and its title cell is ready to type in.

---

### User Story 4 - Assign editors and fill details inline (Priority: P2)

The Marketing Manager tabs across a row, typing a title, picking an editor (a person) from the editing roles, and correcting an out time. Each change saves on leaving the cell, and the board card shows the new title and assignee.

**Why this priority**: Most work in the Google Sheet is exactly this: fast inline edits. It ranks below the first three because they establish the rows.

**Independent Test**: Edit a title, an editor and an out time in the sheet. The board card shows the new title and assignee; the length recomputes; a member without edit rights on that clip can't change those cells.

**Acceptance Scenarios**:

1. **Given** a member who may edit a clip, **When** they edit its title, editor, in, out, source, file name, type or published link, **Then** the change saves on Enter, Tab or leaving the cell, and Esc cancels.
2. **Given** the Editor cell, **When** it opens, **Then** it lists people (not roles), editing roles first, plus Unassigned.
3. **Given** in and out times, **When** either changes, **Then** length recomputes, and an out time before the in time is refused with a note.
4. **Given** a member who may not edit a clip, **When** they view its row, **Then** its cells are read-only (status shows no moves), but they can still add clips (FR-030).
5. **Given** the keyboard, **When** the member uses arrow keys, Tab and Enter, **Then** focus moves between cells like a spreadsheet.

---

### User Story 5 - Attach the cut: a Drive link, an upload, or both (Priority: P2)

A Video Editor finishes clip 13. In its **Files** cell they press **Upload** and choose a 120 MB MP4. A progress bar fills in the cell, then the cell shows "1 file · Drive". The clip's card on the board now has the file and a cover picture. For the 2 GB full-length source, they paste a Drive link on the video row instead.

**Why this priority**: The user decided both should work. Links work everywhere today; uploads depend on file storage being set up.

**Independent Test**: With file storage, upload a 120 MB clip file: it is stored byte for byte on the clip's task and appears on its board card. Without storage, the same upload is refused with the limit and an offer to paste a Drive link instead. A Drive link pasted into a row is attached to that clip as a link.

**Acceptance Scenarios**:

1. **Given** a clip row, **When** the member pastes a Drive (or any web) link into its Files cell, **Then** the link is attached to that clip as a link-only attachment and the cell shows "Drive".
2. **Given** file storage is set up, **When** the member uploads a file to a clip, **Then** it is stored exactly as picked (no compression, as in spec 007) on that clip's task, with progress in the cell. The file appears in the clip's Attachments section and on its card.
3. **Given** a file over the limit for this deployment (200 MB with storage, about 5 MB without), **When** it is chosen, **Then** nothing is uploaded and the cell says so, offering to paste a Drive link instead.
4. **Given** an upload that fails, **When** it stops, **Then** the cell keeps the file's name with the reason and Retry, as in the Attachments section.
5. **Given** a clip with files, **When** the member clicks the Files cell, **Then** they can open the Drive link, preview an uploaded file, or open the clip's task.

---

### User Story 6 - Each role opens on the columns it needs (Priority: P2)

A Video Editor opens the sheet and sees the **Editing** columns: title, #, status, editor, source, in, out, length, files. A Content Creator sees **Copy**: title, #, type, status, editor, published link. A **Full** set shows everything. Each person's choice is remembered.

**Why this priority**: In/out times are noise for copywriters, and captions are noise for editors. One choice makes the sheet readable for both.

**Independent Test**: Sign in as a Video Editor: the sheet opens on Editing. As a Content Creator: Copy. As the Marketing Manager: Full. Switch sets; reload; the choice is kept.

**Acceptance Scenarios**:

1. **Given** a member whose role is an editing role (video, editor, motion, design), **When** they open the sheet for the first time, **Then** it shows the Editing column set.
2. **Given** a member whose role is a writing role (content, copy, writer), **When** they open it for the first time, **Then** it shows the Copy set.
3. **Given** any other member, **When** they open it for the first time, **Then** it shows Full.
4. **Given** a member switches sets, **When** they come back, **Then** their last choice is shown.
5. **Given** the sheet's scope, **When** a member opens it, **Then** they see the whole video by default, with a **Mine** toggle that shows only clips assigned to them or owned by them.

---

### User Story 7 - Published links and dropped clips (Priority: P3)

When a clip moves to **Published**, the sheet asks for the post link. Clips that won't be used are **dropped**: struck through and greyed in the sheet, off the board, and restorable.

**Why this priority**: Closing the loop on published work and tidying the list matter, but come after the main flow.

**Independent Test**: Move a clip to Published in the sheet: a link prompt appears; skipping it marks the row "Missing link" and the summary counts it. Drop a clip: it leaves the board, stays greyed in the sheet, and Restore puts it back on the board at its stage.

**Acceptance Scenarios**:

1. **Given** a clip moved to Published, **When** the move succeeds, **Then** the sheet asks for its published link, which can be pasted or skipped.
2. **Given** a published clip without a link, **When** its row shows, **Then** its published link cell reads "Missing link", and the summary line counts it.
3. **Given** a clip, **When** a member who may edit it presses **Drop**, **Then** the row is struck through and greyed, the clip is removed from the board and from SLA alerts, and the summary counts it as dropped.
4. **Given** a dropped clip, **When** the member presses **Restore**, **Then** it returns to the board at the stage it had.
5. **Given** the sheet, **When** **Show dropped** is off, **Then** dropped clips are hidden.

---

### Edge Cases

- **Video with no clips**: the sheet shows the video row and an empty grid with **Paste clips** and **+ Clip**.
- **A clip on its own**: opening the sheet from a clip's task shows its parent video's sheet with that row highlighted.
- **Two people paste the same clip at once**: the second add skips clips whose file name already exists under that video, and says so.
- **File name pattern not matched**: the row goes to the "fix or leave out" list (FR-034). A clip may exist without a file name or times, which are then blank.
- **Clip numbers repeat**: allowed (re-cuts). Rows order by clip number, then by when they were added.
- **9-stage tasks (the Islam Check toggle)**: C-Check gets the video name "Script Check". Clips follow their own task's stage path.
- **A clip moved to another video**: out of scope. A clip belongs to one video.
- **Deleting a clip**: done from its task, as today. The sheet offers Drop instead, which is reversible.
- **Members with the "user" level**: they may add clips (owned by them) but still may not create standalone tasks. The New task form stays hidden for them.
- **Long titles**: cells cut with "…", and the full text shows on hover and while editing.
- **Phone width**: the sheet scrolls sideways inside its own area with the title column frozen. The page itself does not scroll sideways.
- **Arabic**: the grid, the summary, the paste preview and the menus mirror. Times and lengths stay in Western digits.

## Requirements *(mandatory)*

### Functional Requirements

**The view**

- **FR-001**: A video task (content type Video) MUST have a Sheet view showing the video as the first row and its clip subtasks beneath it, in clip-number order.
- **FR-002**: The board MUST offer **Board | Sheet**. Sheet lists every video that has clips as a collapsible group, and each can be opened on its own.
- **FR-003**: The grid MUST be compact (24–28 px rows), with gridlines, row numbers, and a frozen header row and title column.
- **FR-004**: A summary line MUST show: clip count, total length, number in editing stages (Ready to Edit through Final Cut), number published, how many of those lack a published link, and number dropped. Dropped clips are excluded from the other counts.
- **FR-005**: Each clip row MUST show: title, clip #, type, status, editor, source, file name, in, out, length, files (link and uploads), published link, and drop or restore.

**Stage names**

- **FR-010**: The sheet MUST show video names for stages:
  - To Do → To Do
  - C-In Progress → Script
  - C-Review → Script Review
  - C-Check → Script Check
  - Ready For Design → Ready to Edit
  - D-In Progress → Editing
  - D-Check → Edit Review
  - F-Check → Final Cut
  - Ready to Publish → Ready to Publish
  - Scheduled → Scheduled
  - Published → Published
- **FR-011**: Board cards, the task panel, SLA alerts, reports and every other view MUST keep showing the real stage names.
- **FR-012**: Hovering or focusing a video stage name MUST show the real name ("Editing · D-In Progress").
- **FR-013**: The video names MUST be display labels only: no stage is added, removed, renamed or reordered in the pipeline (Constitution §II).

**Status changes**

- **FR-020**: A status change in the sheet MUST go through the same move as the board, with the same permission rules, stage date reset, SLA recomputation and celebration rules (Constitution §II, §V).
- **FR-021**: The status menu MUST list only the moves the board allows that member for that task: any stage on the task's path, when the member holds its current stage or is an admin or superuser. The next stage comes first. A member with no allowed move sees the status without a menu. *(Corrected during planning: the board allows any stage on the path, not only the next one.)*
- **FR-022**: A refused or failed move MUST return the cell to its previous status, with the reason.
- **FR-023**: A move made on the board MUST appear in the sheet, and the reverse. The two never disagree after a refresh.
- **FR-024**: Moving the video row MUST NOT move its clips. Each task moves on its own.
- **FR-025**: The Editor cell MUST set the clip's assignee, a person, listing editing roles first, plus Unassigned. It is available to members who may edit that clip.

**Adding clips**

- **FR-030**: Any signed-in member who can open the video MUST be able to add clips to it, whatever their access level (user decision).
- **FR-031**: An added clip MUST be a subtask of the video: owned by the member who added it, with content type Reel, status To Do, no assignee, the video's brand and project, and its parsed details.
- **FR-032**: **Paste clips** MUST accept rows copied from a spreadsheet (rich or plain text). It recognises clip file names of the form `NN_SOURCE_XmYY.Ys-XmYY.Ys.ext` (mp4, mov, m4v), and reads clip #, source, in, out and length from them. The title is the longest other text cell; the Drive link is the row's link.
- **FR-033**: Before adding, a preview MUST list new rows (with #, title, source, in → out, length, link) and say how many are already in the sheet (same file name under this video) and how many have no clip file name.
- **FR-034**: Rows without a clip file name MUST be listed, and each can be fixed in place or left out.
- **FR-035**: **+ Clip** MUST add one empty clip row, with the same ownership and defaults, with its title cell focused.
- **FR-036**: Adding clips MUST NOT let "user"-level members create standalone tasks. The exception covers clip subtasks of a video only.

**Editing inline**

- **FR-037**: Members who may edit a clip (its owner, assignee, admin or superuser, as for tasks today) MUST be able to edit its title, editor, type, source, file name, in, out and published link inline. Changes save on Enter, Tab or blur, and Esc cancels.
- **FR-038**: Length MUST be recomputed from in and out. An out time before the in time MUST be refused with a note.
- **FR-039**: Arrow keys, Tab, Shift+Tab, Enter and Esc MUST move and edit like a spreadsheet.

**Files**

- **FR-040**: A clip's Files cell MUST accept a pasted web link (Drive or other) and attach it to the clip as a link-only attachment.
- **FR-041**: A clip's Files cell MUST offer **Upload**, which stores the file on the clip's task through the same upload path as spec 007: no compression, per-file progress, Retry on failure, and the size limit shown and checked before reading.
- **FR-042**: The limit MUST be the deployment's: 200 MB per file with file storage, about 5 MB without. Over the limit, the cell MUST say so and offer to paste a link instead.
- **FR-043**: Uploaded files and links MUST appear in the clip's Attachments section and on its board card (including its cover picture for images and video posters where available).
- **FR-044**: The video row's Files cell MUST work the same way, for the full-length source.
- **FR-045**: Clicking a Files cell MUST offer: open the link, preview an uploaded file (the spec 007 preview), and open the clip's task.
- **FR-046**: Uploading MUST follow the same permission as editing the clip. Pasting a link while adding clips is part of adding (FR-030).
- **FR-047**: When a clip moves to Published, the sheet MUST ask for its published link (paste or skip).
- **FR-048**: A published clip without a published link MUST show "Missing link" and be counted in the summary.

**Columns, scope and roles**

- **FR-050**: The sheet MUST offer three column sets:
  - **Editing**: title, #, status, editor, source, file name, in, out, length, files;
  - **Copy**: title, #, type, status, editor, published link;
  - **Full**: everything.
- **FR-051**: A member's first view MUST be Editing for editing roles (role text containing video, editor, motion or design), Copy for writing roles (content, copy or writer), and Full otherwise.
- **FR-052**: The chosen set MUST be remembered per member.
- **FR-053**: The video row and the summary line MUST show in every set.
- **FR-054**: The sheet MUST show the whole video by default, with a **Mine** toggle limited to clips the member is assigned to or owns.

**Dropping**

- **FR-060**: Members who may edit a clip MUST be able to **Drop** it: it is struck through and greyed in the sheet, hidden from the board, excluded from SLA alerts and from the summary's counts other than "dropped".
- **FR-061**: **Restore** MUST return a dropped clip to the board at its previous stage, with its SLA clock as it was when dropped.
- **FR-062**: **Show dropped** MUST hide or show dropped clips in the sheet; on by default.
- **FR-063**: Dropping MUST NOT delete the clip or its files.

**Language, design and access**

- **FR-080**: Every new string MUST exist in English and Arabic, and the sheet, summary, paste preview and menus MUST lay out right to left in Arabic.
- **FR-081**: The look MUST follow the approved design (the "Momentum Video Sheet" preview, updated for these decisions) and use only the project's design tokens.
- **FR-082**: Every action MUST be usable with the keyboard alone, and the grid MUST expose rows, columns and headers to screen readers.

### Key Entities

- **Video**: an existing task with content type Video, the parent of its clips. Its sheet row shows the full-length source.
- **Clip**: an existing task created as a subtask of a video (content type Reel by default), with its own stage, SLA, owner and assignee. Gains clip details.
- **Clip details**: per clip, the clip number, source (the recording it was cut from), file name, in time, out time, published link and a dropped flag. Length is derived from in and out.
- **Clip files**: the clip's existing attachments: link-only attachments for Drive links, uploaded files for cuts.
- **Stage display names**: a fixed mapping from each pipeline stage to its video name, used only in the sheet.
- **Column set choice**: per member, which of Editing, Copy or Full they last used.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Pasting 13 clip rows from the team's Google Sheet creates 13 correct clips (number, source, in, out, length, title, Drive link) in under 1 minute, with no retyping.
- **SC-002**: In 100% of checks, a clip's stage in the sheet matches its card on the board after either is changed.
- **SC-003**: In 100% of checks, the sheet's status menu offers exactly the moves the board allows that member, and no others.
- **SC-004**: The summary line's numbers match a manual count of the rows in 100% of checks.
- **SC-005**: A 120 MB clip uploaded from the sheet (with storage) is stored byte for byte and shows on the clip's board card.
- **SC-006**: A Video Editor and a Content Creator each see their own column set on first opening, with no setup.
- **SC-007**: On a 1366×768 screen, at least 20 clip rows are visible at once in the sheet.
- **SC-008**: Every action in this spec can be done with the keyboard alone.
- **SC-009**: After two weeks, the team stops updating the separate Google Sheet for videos tracked in Momentum (checked with the Marketing Manager).

## Assumptions

- **Clips are subtasks**: Subtasks already exist (a subtask is an ordinary task that knows its parent), so each clip is a real board card with its own stage, SLA and owner. Nothing in the pipeline changes.
- **Adding clips is open to everyone (user decision)**: This is a deliberate exception to the "user" access level, which can't create tasks today. It covers clip subtasks of a video only (FR-036). Constitution §III describes "user" as "own tasks only", and the person who adds a clip owns it. The PR's constitution check will call out the exception for sign-off.
- **Stage names (user decision)**: Video names in the sheet only, as display labels (FR-010–FR-013). The pipeline is unchanged, so Constitution §II holds.
- **Files (user decision)**: Both links and uploads. Uploads reuse spec 007's path and limits. With file storage, clips up to 200 MB upload; full-length recordings are expected to stay as Drive links. Whether Cranl has file storage is still to be confirmed (spec 007 T045). Without it, uploads over about 5 MB are refused with the offer to paste a link.
- **Who may edit a clip**: The existing rule (owner, assignee, admin or superuser) applies to inline edits, status moves (with the stage-owner rules), uploads and dropping. Anyone may add clips, and anyone who can open the video may view the sheet.
- **Column-set choice and Show dropped** are remembered per member on their device; nothing about them is shared.
- **The file-name pattern** is the team's current export format (`04_IMG_0293_2m20.2s-3m49.0s.mp4`). Other formats go to the "fix or leave out" list.
- **The design**: the "Momentum Video Sheet" preview will be updated for these decisions (video stage names, the restricted status menu, the Files cell, column sets) and committed to `design/` before UI work, per Constitution §IV.
- **Out of scope**:
  - two-way sync with Google Sheets (paste in only);
  - moving a clip between videos;
  - bulk status changes;
  - captions and scheduling fields beyond the published link;
  - sheets for content types other than Video.
