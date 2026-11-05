# Feature Specification: Task Attachments, Tidy and Seamless

**Feature Branch**: `claude/nice-noether-x4rgei`

**Created**: 2026-11-04

**Status**: Draft

**Input**: User description: "Option A (Tidy) for the task panel's Attachments section, with the Latest pill in the app's neon green, click-the-name-to-rename, click the dark area to close the preview, and the seamless extras S1 to S11 (all except S12)." Chosen from the Attachments analysis and the interactive preview "Task Attachments Options" (tab "Option A · Tidy").

## Context

The Attachments section of the task panel is where designers hand over work and reviewers pick it up. Today it makes that hard. These problems were found in the analysis (U) and the follow-up review (S):

| Finding | Problem today | Addressed by |
|---|---|---|
| U1, U9 | Files are listed oldest first, with an avatar but no date, so the newest version sits last and unlabelled. | FR-001 to FR-004 |
| U2 | Names are cut short, losing the part that tells versions apart ("v2", "FINAL"). | FR-005 |
| U3 | The red ✕ deletes a file and its stored copy at once, with no undo. | FR-030 to FR-035 |
| U4 | The preview shows one file. There is no way to step to the next version. | FR-020, FR-021 |
| U5 | The picture can't be reached or opened with the keyboard. | FR-060, FR-061 |
| U6 | The picture opens a preview but the name opens a new tab. | FR-010, FR-040 |
| U8 | Portrait posts sit in short boxes with wide white bands. | FR-006 |
| U10, U11 | A large drop box stays above the files; uploads show one "Uploading…" for the whole batch. | FR-050, FR-053 |
| S1 | Pasting a screenshot does nothing outside the brief. | FR-051 |
| S2 | A failed upload becomes one red sentence and the file disappears. | FR-055 |
| S3 | The size limit is only discovered by failing. | FR-052, FR-054 |
| S4 | The same name twice creates a silent duplicate. | FR-056 |
| S5 | Files load only when the section opens, so it starts empty, then jumps. | FR-070 |
| S6 | The 📎 count in the panel header does nothing. | FR-072 |
| S7 | Closing the panel during a pending delete leaves its outcome unclear. | FR-034 |
| S8 | The comment box's paperclip attaches a file, but the comment never mentions it. | FR-073, FR-074 |
| S9 | Long lists make the section very tall. | FR-071 |
| S10 | The preview can't zoom or swipe, and PDFs can't open in a tab. | FR-022 to FR-025 |
| S11 | On phones, the hover buttons are always showing; there is no keyboard shortcut to delete. | FR-062, FR-063 |
| Q1 | Without file storage, pictures are shrunk and re-compressed to fit, so the stored file is not the designer's original. | FR-059, FR-054 |

S12 (files imported without an uploader are attributed to the task owner) is out of scope at the user's request.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - See which file is newest, and who added it (Priority: P1)

A reviewer opens a task with three versions of a post. The newest is first, with a neon-green **Latest** pill. Each tile shows a tall picture, a name that keeps its ending ("…Post v3 FINAL.png"), the person who added it, and when ("yosra · 2h ago").

**Why this priority**: Picking the right version is the job this section exists for. Today the newest file is last and nothing says so.

**Independent Test**: Attach three images to a task an hour apart, with long names ending in v1, v2 and v3 FINAL. Open the task. The v3 tile is first and carries the Latest pill. Every tile shows its uploader and age, and every name's ending is readable at desktop and phone widths.

**Acceptance Scenarios**:

1. **Given** a task with several files, **When** the panel shows them, **Then** they are ordered newest first and the section header says so ("Newest first").
2. **Given** a task with images, **When** the panel shows them, **Then** only the newest image carries a **Latest** pill, in the app's neon green with dark text.
3. **Given** any file, **When** its tile is shown, **Then** it shows the uploader's first name with their avatar and how long ago it was added ("2h ago", "yesterday", "3d ago").
4. **Given** a long file name, **When** its tile is shown, **Then** the name takes at most two lines: the start on the first line, cut with "…" if needed, and the ending, including the extension, whole on the second.
5. **Given** a portrait image, **When** its tile is shown, **Then** the picture fills a tall tile without white bands at the sides.

---

### User Story 2 - Preview and step through files without leaving the task (Priority: P1)

The reviewer clicks a picture. It opens large, with "1 of 4", arrows, and a strip of every file along the bottom. They press → to see the previous version, click the picture to zoom in on the small print, click again to fit, and click the dark area to go back to the task. On a phone they swipe instead.

**Why this priority**: Comparing versions is what reviewers do here. Today each comparison means closing and reopening the preview.

**Independent Test**: Open the preview on the first of four files. Press → three times: the counter reads "4 of 4". Click the picture: it zooms in. Click the dark area: the preview closes and the task panel is as it was.

**Acceptance Scenarios**:

1. **Given** a tile, **When** the member clicks its picture, **Then** a preview opens showing the file large, its name, uploader, age and size, a counter ("2 of 4"), previous and next buttons, a strip of all the files, Download, and a close button.
2. **Given** the preview is open, **When** the member presses ← or →, uses the arrow buttons, or clicks a file in the strip, **Then** the preview moves to that file, in the same order as the grid.
3. **Given** an image in the preview, **When** the member clicks the picture, **Then** it zooms in and can be scrolled; another click fits it back to the screen.
4. **Given** the preview is open, **When** the member clicks the dark area around the file, presses Esc, or clicks ✕, **Then** the preview closes and focus returns to the tile that was showing.
5. **Given** the preview is open on a touch screen, **When** the member swipes left or right, **Then** the preview moves to the next or previous file.
6. **Given** a PDF, **When** it is previewed, **Then** it shows inline and offers "Open in new tab" as well as Download.
7. **Given** a file with no preview (for example .docx, .zip, .srt), **When** it is previewed, **Then** the preview says there is no preview for that file type and offers Download.

---

### User Story 3 - Delete without fear (Priority: P1)

A designer deletes the wrong version. The tile turns into "Deleted *name* · **Undo**" with a 5-second bar. They press Undo and it's back. If they close the panel during those 5 seconds, the deletion goes through, and the message at the bottom of the screen still offers Undo for a few more seconds.

**Why this priority**: Today one slip permanently loses a deliverable and its stored copy.

**Independent Test**: Delete a file, then press Undo within 5 seconds: it is back in place, unchanged, and still downloads. Delete another file and wait 5 seconds: it is gone after a reload. Delete a third and close the panel at once: the message at the bottom offers Undo, and Undo restores it.

**Acceptance Scenarios**:

1. **Given** a member who may edit the task, **When** they press Delete on a tile, **Then** the tile is replaced by "Deleted *name* · Undo" with a visible 5-second countdown, and keyboard focus moves to Undo.
2. **Given** a pending delete, **When** the member presses Undo within 5 seconds, **Then** the file returns to its place, unchanged.
3. **Given** a pending delete, **When** 5 seconds pass, **Then** the file and its stored copy are removed for good.
4. **Given** a pending delete, **When** the member closes the panel, **Then** the deletion completes, and a message at the bottom of the screen says "Deleted *name*" with Undo for at least 6 seconds; Undo restores the file.
5. **Given** a second delete while one is pending, **When** it starts, **Then** the first one completes and the second gets its own Undo.

---

### User Story 4 - Add files every way, with honest feedback (Priority: P2)

A designer copies a screenshot and presses Ctrl+V anywhere on the panel; it appears as a new tile with its own progress bar. They drop three files on the panel; each gets its own tile and progress. One is too large: its tile says so at once, with the limit. Another fails halfway: its tile stays, says why, and offers **Retry**. A file with the same name as an existing one asks **Replace it · Keep both · Cancel**.

**Why this priority**: Adding files is the other half of the hand-over. Today a failed or refused file vanishes into a sentence, and pasting does nothing.

**Independent Test**: Paste a screenshot: a tile named "Screenshot HH.MM.png" appears and finishes uploading. Choose a file over the limit: a "Too large" tile appears immediately, with the limit, and nothing is uploaded. Cut the connection mid-upload: the tile shows "Not uploaded", the reason and Retry; restore the connection and press Retry: it completes. Upload a file named like an existing one: the Replace / Keep both / Cancel choice appears.

**Acceptance Scenarios**:

1. **Given** a member who may edit the task, **When** they paste one or more files anywhere in the task panel, **Then** each is attached exactly as if chosen with "Add files". A pasted image with no real name gets "Screenshot HH.MM.png".
2. **Given** files dropped anywhere on the panel, or chosen with "Add files" in the header or the last tile, **When** they are accepted, **Then** each gets its own tile at the front of the list, with an "Uploading" pill and its own progress bar.
3. **Given** the "Add files" tile, **When** it is shown, **Then** it says how files can be added ("Paste, drop or browse") and the size limit that applies on this deployment.
4. **Given** a file over the limit, **When** it is added, **Then** nothing is uploaded, and a tile marked "Too large" shows the file's size, the limit and what to do instead, with Remove.
5. **Given** an upload that stops partway, **When** it fails, **Then** its tile stays, marked "Not uploaded", with the reason, **Retry** and **Remove**; Retry starts it again.
6. **Given** a file whose name matches an attached file (ignoring capitals), **When** it is added, **Then** a bar asks "*name* is already attached. Replace it · Keep both · Cancel". Replace swaps the old file for the new one, with Undo. Keep both saves it as "*name* (2).ext". Cancel adds nothing.
7. **Given** more than one file arriving with clashing names, **When** they are added, **Then** the choices are asked one file at a time.

---

### User Story 5 - Rename by clicking the name (Priority: P2)

A designer clicks a file's name. It becomes a text box with the name selected and the extension shown fixed beside it. They type "AI Gap Post v3 approved" and press Enter. The file is renamed and still opens as an image.

**Why this priority**: Clear names are how versions get told apart.

**Independent Test**: Click a name, type a new one, and press Enter: the tile shows the new name with the old extension. Click again and press Esc: nothing changes. Type a name ending in ".png" for a .png file: the extension is not doubled.

**Acceptance Scenarios**:

1. **Given** a member who may edit the task, **When** they click a file's name, **Then** it becomes an editable box holding the name without its extension, fully selected, with the extension shown beside it and not editable.
2. **Given** the name is being edited, **When** the member presses Enter or clicks elsewhere, **Then** the new name is saved with the original extension. Esc cancels.
3. **Given** a new name that ends with the same extension, **When** it is saved, **Then** the extension is not added twice.
4. **Given** an empty name, **When** it is saved, **Then** the old name is kept.
5. **Given** a member who may not edit the task, **When** they look at a name, **Then** it is plain text and can't be edited.

---

### User Story 6 - Reach the files from the top of the panel and from comments (Priority: P3)

The member clicks the 📎 count under the task title and lands on the Attachments section, briefly highlighted. While writing a comment, they use the comment box's paperclip: the file is attached to the task and also shown on their comment as a small chip that opens the preview.

**Why this priority**: These remove two small dead ends: a count that does nothing, and a comment that never mentions the file it came with.

**Independent Test**: Click 📎 4: the panel scrolls to Attachments, opens it if collapsed, and highlights it. In the comment box, press the paperclip and post: the posted comment shows the file's chip, and clicking the chip opens the preview on that file.

**Acceptance Scenarios**:

1. **Given** a task with files, **When** the member clicks the 📎 count in the panel header, **Then** the panel scrolls to Attachments, opens the section if collapsed, and highlights it briefly.
2. **Given** the comment box, **When** the member attaches a file with its paperclip or pastes a file into it, **Then** the file is attached to the task and shown as a chip in the comment being written; the chip can be taken off before posting.
3. **Given** a posted comment with file chips, **When** anyone clicks a chip, **Then** the preview opens on that file. If the file has since been deleted, the chip says so and does nothing.

---

### User Story 7 - Long lists and loading stay calm (Priority: P3)

A task with fifteen files shows the newest seven and "Show all 15 files". While files load, grey placeholder tiles hold their places.

**Why this priority**: Comfort rather than capability, but it keeps the task panel usable on busy tasks.

**Independent Test**: Open a task with fifteen files: placeholders appear first, then seven tiles and "Show all 15 files"; pressing it shows all fifteen and offers "Show fewer".

**Acceptance Scenarios**:

1. **Given** the section is loading, **When** it is shown, **Then** grey placeholder tiles of the final size appear, one per file up to seven, with "Loading N files…" for screen readers, and nothing shifts when the files arrive.
2. **Given** more than seven files, **When** the section is shown, **Then** the seven newest are shown, followed by "Show all N files"; pressing it shows all and changes to "Show fewer".

---

### User Story 8 - Phones and keyboard (Priority: P3)

On a phone, tiles sit two per row and each has one **⋯** button (Download, Rename, Delete). On a computer, a keyboard user tabs to a picture and presses Enter to preview, Delete to delete it (with Undo), or F2 to rename it.

**Why this priority**: Everything above must work for everyone; this story covers the parts that differ by device.

**Independent Test**: At 390 px wide on a touch device, the page doesn't scroll sideways, tiles are two per row, and each has a single ⋯ menu. With a keyboard only, preview, rename, delete and undo a file.

**Acceptance Scenarios**:

1. **Given** a touch screen, **When** tiles are shown, **Then** each has a single ⋯ button whose menu holds Download, Rename and Delete; the separate hover buttons are not shown.
2. **Given** a mouse, **When** the pointer is over a tile, **Then** Download and Delete appear on the picture's corner.
3. **Given** keyboard focus on a picture, **When** the member presses Enter, Delete or F2, **Then** it opens the preview, starts a delete with Undo, or starts renaming.
4. **Given** a phone-width screen, **When** the section is shown, **Then** tiles sit two per row and the page doesn't scroll sideways.

---

### Edge Cases

- **Members who can't edit the task** (not the owner or assignee, and not an admin or superuser): they see tiles, previews and Download, but no Add files tile, no rename, no delete, and pasting or dropping does nothing except a short note explaining why.
- **Deployment without file storage**: the limit shown is about 5 MB per file, for pictures as for every other file. A picture over it is refused with its size and the limit, never shrunk to fit. With storage, the limit is 200 MB per file.
- **More than 12 files at once**: the first 12 are added, and a note says the rest were skipped and can be added in a second go.
- **File deleted by someone else while previewed**: the preview moves to the next file, or closes if none is left, with a short note.
- **Undo after the file was removed by someone else**: Undo says the file can no longer be restored.
- **Page closed or reloaded during the 5-second Undo**: the deletion is completed if possible. If it can't be sent, the file stays, so nothing is lost by accident.
- **Replace on the newest image**: the replacement becomes the newest file and takes the Latest pill, and the board card's cover updates as it does for any new image.
- **Rename to a name already used**: allowed; the names are told apart by age and uploader. The duplicate check applies to added files only.
- **Paste while typing in the brief**: the brief's own image paste (spec 005) handles it, so the file is not added twice. On deployments without file storage, where the brief can't hold images, its note says to paste below the brief to attach the file to the task instead.
- **Arabic (right-to-left)**: tiles, pills, the preview's arrows and the strip are mirrored. ← and → follow the reading direction.
- **Imported files with no size or uploader**: they show no size, and the uploader is shown as today; correcting the attribution (S12) is out of scope.

## Requirements *(mandatory)*

### Functional Requirements

**Tiles and order**

- **FR-001**: Files MUST be listed newest first. The section header MUST say "Newest first".
- **FR-002**: The newest image MUST carry a "Latest" pill in the app's neon green (the same colour as "+ New task") with dark text. No other tile carries it.
- **FR-003**: Each tile MUST show the uploader's avatar and first name and the time since upload ("just now", "2h ago", "yesterday", "3d ago").
- **FR-004**: An image's tile MUST show the image. Any other file's tile MUST show a file icon and its extension in a colour for its kind (PDF, video, document, spreadsheet, archive, subtitles, other).
- **FR-005**: Names MUST use at most two lines. A name too long for that MUST show its start on line one, cut with "…", and its ending (about the last 17 characters, starting at a word) whole on line two, so the extension and version markers stay visible.
- **FR-006**: Tiles MUST use a tall picture area (4:5) that the picture fills, so portrait work has no side bands.

**Preview**

- **FR-010**: Clicking a tile's picture MUST open the preview. Clicking the name MUST NOT open the preview (see FR-040).
- **FR-020**: The preview MUST show the file, its full name, uploader, age and size, a position counter ("2 of 4"), previous/next buttons, a strip of every file, Download and Close.
- **FR-021**: The preview MUST move between files with ← and →, the buttons, the strip, and, on touch screens, a horizontal swipe, in the grid's order. It MUST include every stored file, including ones hidden behind "Show all" (FR-071); files still uploading or failed are left out.
- **FR-022**: Clicking an image in the preview MUST toggle between fitted and zoomed-in (scrollable) views. Moving to another file MUST reset the zoom.
- **FR-023**: Clicking the dark area outside the file and controls MUST close the preview, as Esc and Close do, and return focus to the tile of the file last shown. If that tile is hidden behind "Show all", the section MUST show all files first.
- **FR-024**: PDFs MUST preview inline and offer "Open in new tab".
- **FR-025**: Files that can't be previewed MUST say so and offer Download.

**Delete with Undo**

- **FR-030**: Delete MUST be available only to members who may edit the task. With a mouse it MUST appear on hover or focus, not permanently in red.
- **FR-031**: Delete MUST replace the tile with "Deleted *name* · Undo" and a visible 5-second countdown, and move keyboard focus to Undo.
- **FR-032**: Undo within 5 seconds MUST restore the file exactly as it was, with nothing removed from storage.
- **FR-033**: After 5 seconds the file and its stored copy MUST be removed for good.
- **FR-034**: Closing the panel during the countdown MUST complete the deletion and show a message at the bottom of the screen, "Deleted *name*", with Undo for at least 6 seconds, which restores the file.
- **FR-035**: Starting a second delete MUST complete any pending one first.

**Rename**

- **FR-040**: For members who may edit the task, clicking a file's name, or pressing Enter or F2 on it, MUST turn it into a text box holding the name without its extension, fully selected, with the extension shown beside it and not editable.
- **FR-041**: Enter or clicking away MUST save, keeping the original extension and never doubling it. Esc MUST cancel. An empty name MUST keep the old one.
- **FR-042**: The rename control on the hover buttons MUST be removed; Rename stays in the phone ⋯ menu.

**Adding files**

- **FR-050**: The large dashed drop box MUST be replaced by an "Add files" button in the section header and an "Add files" tile at the end of the grid. Dropping files anywhere on the panel MUST attach them, with a "Drop to attach to this task" overlay while dragging.
- **FR-051**: Pasting files anywhere in the task panel, outside the brief, MUST attach them. A pasted image without a real name MUST be named "Screenshot HH.MM.png" from the local time.
- **FR-052**: The "Add files" tile MUST state the ways to add ("Paste, drop or browse") and the size limit that applies on this deployment, written as "Up to 200 MB each" with file storage and "Up to about 5 MB each" without it. File sizes are shown exactly ("7.0 MB").
- **FR-053**: Each file being uploaded MUST get its own tile at the front of the list, with an "Uploading" pill and its own progress. When it finishes, it becomes a normal tile.
- **FR-054**: A file over the limit, pictures included, MUST be refused before any upload, shown as a tile marked "Too large" with its size, the limit and a suggestion ("shrink it, or share a link in a comment"), and a Remove button.
- **FR-055**: An upload that fails MUST keep its tile, marked "Not uploaded", with the reason in plain words, Retry and Remove. Retry MUST try again without choosing the file again.
- **FR-056**: A file whose name matches an attached file (ignoring capitals) MUST trigger a choice: "Replace it", which swaps the old file for the new one and offers Undo for 5 seconds; "Keep both", which saves as "*name* (2).ext" or the next free number; or "Cancel". Several clashing files MUST be asked about one at a time. Undo after "Replace it" MUST put the task back as it was: the old file returns and the new one is deleted.
- **FR-057**: At most 12 files MUST be added in one go. Any extra MUST be skipped with a note saying how many and that they can be added next.
- **FR-058**: Members who may not edit the task MUST NOT be able to add, rename or delete files. Pasting or dropping MUST show a short note explaining why.
- **FR-059**: The stored file MUST be exactly the file the member added: never resized, re-compressed or converted, on any deployment. Downloading it MUST return the same file, byte for byte. Small preview copies (such as the board card's cover thumbnail) MAY be made for display only and MUST never replace the original.

**Keyboard and phones**

- **FR-060**: Each picture MUST be focusable, and Enter MUST open the preview.
- **FR-061**: Each name MUST be focusable for members who may edit, and Enter or F2 MUST start renaming.
- **FR-062**: With keyboard focus on a picture, Delete or Backspace MUST start a delete with Undo, and F2 MUST start renaming it.
- **FR-063**: On touch screens, each tile MUST show a single ⋯ button with Download, Rename and Delete, instead of hover buttons. At phone width, tiles MUST sit two per row and the page MUST NOT scroll sideways.

**Loading, long lists, header count, comments**

- **FR-070**: While files load, the section MUST show grey placeholder tiles of the final size, one per file up to seven, and announce "Loading N files…" to screen readers.
- **FR-071**: With more than seven stored files, the section MUST show the seven newest and a "Show all N files" button that reveals the rest and becomes "Show fewer". Uploading, too-large and failed tiles MUST always show, ahead of the seven, and MUST NOT count towards them.
- **FR-072**: The 📎 count in the panel header MUST be a button that scrolls to Attachments, opens it if collapsed, and highlights it briefly.
- **FR-073**: Attaching or pasting a file from the comment box MUST attach it to the task and add a chip for it to the comment being written. The chip can be removed before posting.
- **FR-074**: A posted comment MUST show its file chips. Clicking a chip MUST open the preview on that file. A chip whose file was deleted MUST say so and do nothing else.

**Language, design and access**

- **FR-080**: Every new string MUST exist in English and Arabic, and the section and preview MUST lay out right to left in Arabic.
- **FR-081**: The look MUST follow the approved preview ("Task Attachments Options", tab "Option A · Tidy") and use only the project's design tokens.
- **FR-082**: Every action MUST be usable by keyboard alone, with visible focus. Countdown, upload and error states MUST be announced to screen readers.

### Key Entities

- **Attachment**: A file on a task, with its name, kind, size (when known), uploader and upload time. Already exists; this feature changes how it is shown, renamed, added and deleted, not what is stored about it.
- **Pending delete**: A delete waiting out its 5-second Undo window. It exists only in the open panel, and the file is kept until the window ends or the panel closes.
- **Upload in progress or failed**: A file being added, with its progress, or the reason it failed and whether Retry is possible. It exists only in the open panel until the file is stored or removed.
- **Comment file reference**: The link between a posted comment and the files shown as chips on it. Recorded as part of the comment's own content, so no new stored record is needed.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Asked "which file is the latest?", at least 4 of 5 team members point to the right tile within 3 seconds of opening a task with three versions.
- **SC-002**: Every delete can be undone within its 5-second window. In testing, 100% of undone files come back unchanged and still download.
- **SC-003**: A pasted screenshot shows as a tile within 1 second of pressing Ctrl+V.
- **SC-004**: 100% of files over the limit are refused before any upload starts, each with its size and the limit shown.
- **SC-005**: 100% of failed uploads keep a tile with a reason and Retry; none disappear silently.
- **SC-006**: A reviewer can go from the first to the fourth of four versions in the preview with 3 key presses, without closing it.
- **SC-007**: Renaming takes one click, typing and Enter. In testing, a file's extension is never lost or doubled.
- **SC-008**: Every action in this spec can be done with the keyboard alone.
- **SC-009**: At 390 px wide, the section shows two tiles per row with no sideways scrolling, and every action is reachable from the ⋯ menu.
- **SC-010**: Nothing in the section shifts position when files finish loading.
- **SC-011**: In 100% of checks, a downloaded attachment is identical to the file that was added: same size and same content, on deployments with and without file storage.

## Assumptions

- **Size limits**: The limit shown is the deployment's own: 200 MB per file with file storage, about 5 MB without it. The preview's "5 MB" was a sample.
- **Image quality (user decision)**: Pictures are never shrunk or re-compressed. Today, deployments without file storage shrink pictures to fit under about 5 MB; that behaviour is removed, so on those deployments larger pictures are refused instead. The board card's small cover thumbnail is a separate display copy, which keeps the original untouched.
- **Who may edit**: As today, the task's owner and assignee, admins and superusers. Others can view and download only.
- **No database change**: Order, pills, rename, Undo, retries and duplicate handling are display and flow changes. The server-side changes are that a delete is sent only after the Undo window, or when the panel closes, and that pictures are stored as sent, with no shrinking. Comment file chips are kept inside the comment's own text.
- **"Latest" means the newest image**: Not the newest file of any kind, because the pill is about which picture is current. A newer PDF does not take it.
- **The board cover**: The board card's cover keeps following the newest image, as today. Choosing a cover was part of Option B, which was not chosen.
- **The approved design**: The preview "Task Attachments Options" (tab "Option A · Tidy", with the extras) is the approved design. Per the constitution's Design-Driven Development principle, it will be committed to `design/` before UI work starts.
- **Out of scope**: Marking a final version, choosing a cover, side-by-side compare (Option B); fixing attribution of imported files (S12); folders; bulk select.
