# Feature Specification: Brief Editor UX Overhaul

**Feature Branch**: `005-brief-editor-ux`

**Created**: 2026-11-04

**Status**: Draft

**Input**: User description: "Brief editor UX overhaul" — accompanied by a 23-item audit (E1–E23) produced by exercising every control of the current brief editor in a browser on 2026-11-04.

**Revised 2026-11-04** after reviewing the [interactive preview](https://claude.ai/artifact/Kmwf5sJKJunFtvGMfwdSNR): (F1) editing starts by clicking the brief and ends by clicking away, with no Edit or Done button; (F2) table columns can be resized.

---

## Context

The brief is where a task's instructions live: what to make, for whom, with which references. It is edited in the task panel and in the Create Task form, saves itself as you type, and is shown read-only again once you click away from it.

The editor already does a lot right. Autosave never lets an older save overwrite a newer one; Markdown shortcuts (`# `, `- `, `1. `, `> `, `[ ] `, `**bold**`) work; pasted Markdown arrives formatted; pasting a URL over selected text makes a link; ticking a checkbox saves; New subtask creates a real task and links it; toggle lists and tables survive closing and reopening.

What it gets wrong falls into four groups, and each is a user story below:

1. **It can lose or damage work without saying so** — a failed save still reads "Saved"; Esc with a menu open closes the editor; Clear format with nothing selected strips the whole brief; a mistyped image address inserts a broken image that later disappears.
2. **Links and images, the two things briefs are made of, are awkward** — clicking a link opens it instead of letting you edit it; there is no way to remove one; an address without `https://` is saved broken; pasting or dropping a screenshot does nothing.
3. **Its features are hard to find and hard to reach without a mouse** — no "/" menu, menus ignore arrow keys, the advertised Ctrl+K does nothing, and screen readers get no structure.
4. **Its blocks and layout behave unexpectedly** — Task converts the current line instead of adding one, tables can't be resized, YouTube is inserted as bare text, the toolbar scrolls out of sight in long briefs and wraps to three rows on a phone, labels are English-only.

### Audit traceability

Every audit item maps to at least one requirement.

| Audit | Topic | Requirements |
|---|---|---|
| E1 | Esc with a menu open closes the editor | FR-010, FR-011 |
| E2 | Clicking a link opens it while editing | FR-020, FR-021 |
| E3 | Link without `https://` saved broken | FR-022, FR-023 |
| E4 | Invalid image address accepted, image later lost | FR-030, FR-031 |
| E5 | Clear format strips the whole brief; no Undo button | FR-012, FR-013 |
| E6 | Pasting or dropping an image does nothing | FR-032 – FR-036 |
| E7 | Failed save shows "Saved" and is never retried | FR-001 – FR-004 |
| E8 | Ctrl+K advertised but does nothing | FR-024 |
| E9 | No way to remove a link | FR-021 |
| E10 | YouTube inserted as bare text | FR-060, FR-061 |
| E11 | Task converts the current line | FR-062 |
| E12 | Tables can't gain or lose rows and columns | FR-063, FR-064 |
| E13 | Toolbar scrolls out of view | FR-070 |
| E14 | No "/" menu; shortcuts undiscoverable | FR-040 – FR-043 |
| E15 | Underline lost after Done | FR-080 |
| E16 | Menus and toolbar not keyboard / screen-reader accessible | FR-044 – FR-046 |
| E17 | Toolbar wraps to three rows on a phone | FR-071 |
| E18 | Labels English-only | FR-090, FR-091 |
| E19 | Re-picking the current heading reverts it; no ✓ | FR-047 |
| E20 | Filler text in toggles; raw `[[toc]]` | FR-065, FR-066 |
| E21 | Status shown twice; selection popup duplicates toolbar | FR-005, FR-025 |
| E22 | List items look double-spaced | FR-081 |
| E23 | Editor colours outside the shared palette | FR-082 |
| F1 | Click to edit, click away to finish; no Edit or Done button | FR-014 – FR-017 |
| F2 | Resizable table columns | FR-067 – FR-069 |

---

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Saving I can trust (Priority: P1)

A marketing manager writes a brief on a flaky connection. If a save fails, they need to know, and the text must not be silently dropped.

**Why this priority**: Every other improvement is worthless if the brief itself can be lost while the screen says "Saved". This is the only item in the audit that can lose work with no visible sign.

**Independent Test**: Make saves fail (for example by going offline), type, and confirm the status changes to a failure state; restore the connection and confirm the text saves, by retry or automatically, and reads correctly after reopening.

**Acceptance Scenarios**:

1. **Given** the editor is open, **When** a save fails, **Then** the status reads "Couldn't save" with a Retry action, and the unsaved text stays in the editor.
2. **Given** a save has failed, **When** the person presses Retry or keeps typing, **Then** the latest text is sent again and, on success, the status returns to "Saved".
3. **Given** a save has failed and not yet succeeded, **When** the person clicks outside the brief or presses Esc, **Then** they are warned that changes are not saved and can choose to stay or leave.
4. **Given** the editor is open, **When** saving succeeds, **Then** the save status appears in exactly one place.

---

### User Story 2 — Links that behave (Priority: P1)

A designer opens a brief to update the Canva link. They click into the link, change it, or remove it, without the link opening in a new tab.

**Why this priority**: Nearly every brief carries links to designs, folders and references. Today a link can't be edited by clicking it, can't be removed at all, and a common typo produces a broken link.

**Independent Test**: In a brief with one link, click the link, edit its address, remove it, then add a new link by typing an address without `https://`; reopen the brief and confirm each result.

**Acceptance Scenarios**:

1. **Given** a brief with a link, **When** the person clicks the link while editing, **Then** the cursor is placed in the link text, nothing opens, and a small card appears offering Open, Edit and Remove.
2. **Given** the link card is showing, **When** the person chooses Open, **Then** the link opens in a new tab and the editor stays as it was.
3. **Given** the link card is showing, **When** the person chooses Remove, **Then** the text stays and is no longer a link.
4. **Given** text is selected, **When** the person presses Ctrl+K (⌘K on Mac), **Then** the link box opens, pre-filled with the current address if the text is already a link.
5. **Given** the link box is open, **When** the person enters `forefront.consulting`, **Then** the link is saved as `https://forefront.consulting`.
6. **Given** the link box is open, **When** the person enters text that cannot be an address (for example `see the deck`), **Then** the link is not created and the box explains what's wrong.

---

### User Story 3 — Screenshots straight into the brief (Priority: P1)

A manager takes a screenshot of a reference post and pastes it into the brief, or drags in an image from the desktop. It appears where they pasted it and is kept with the task.

**Why this priority**: Briefs are where visual references get shared, and the fastest way to share one is to paste it. Today a paste or drop does nothing, and inserting by address accepts nonsense.

**Independent Test**: Paste a screenshot, drop an image file, and insert an image by address (one valid, one invalid); confirm the images appear in the brief, are listed among the task's attachments, and are still there after reopening.

**Acceptance Scenarios**:

1. **Given** the editor is open, **When** the person pastes an image from the clipboard, **Then** a placeholder reading "Uploading…" appears at the cursor and is replaced by the image once it has been saved to the task's attachments.
2. **Given** the editor is open, **When** the person drops one or more image files onto it, **Then** each is uploaded and inserted at the drop point, in order.
3. **Given** an upload fails or the file is too large, **When** the failure is known, **Then** the placeholder is removed and a message names the file and the reason.
4. **Given** the image box is open, **When** the person enters an address that is not a reachable image, **Then** nothing is inserted and the box says the image couldn't be loaded.
5. **Given** the image box is open with a valid address, **When** the image has loaded, **Then** a small preview is shown before inserting.
6. **Given** a brief with an inserted image, **When** it is closed and reopened, **Then** the image is still there.

---

### User Story 4 — No accidental damage (Priority: P1)

A writer opens the Insert menu, changes their mind and presses Esc. Only the menu closes. If they clear formatting by mistake, one click undoes it.

**Why this priority**: Two common actions currently cause outsized damage: Esc throws the person out of the editor, and Clear format with nothing selected flattens the whole brief.

**Independent Test**: Click a word in the read brief and confirm the cursor lands on it; click outside and confirm editing ends. With each menu open, press Esc and confirm only the menu closes; press Clear format with no selection and confirm nothing in the brief changes; make edits and undo and redo them with the toolbar.

**Acceptance Scenarios**:

1. **Given** any menu, popup or input box is open in the editor, **When** the person presses Esc, **Then** only that menu, popup or box closes and the editor stays open with the cursor where it was.
2. **Given** nothing is open, **When** the person presses Esc, **Then** the brief leaves editing and shows as read, subject to the unsaved-changes warning in Story 1.
3. **Given** the brief is being read, **When** the person clicks anywhere in it other than a link or checkbox, **Then** editing starts with the cursor exactly where they clicked, the text does not jump, and there is no Edit button to press first.
4. **Given** the brief is being edited, **When** the person clicks anywhere outside it, **Then** editing ends and the brief shows as read; there is no Done button.
5. **Given** the brief is being read, **When** the person clicks a link, **Then** it opens in a new tab; **When** they tick a checkbox, **Then** it is saved without entering editing.
6. **Given** no text is selected, **When** the person looks at Clear format, **Then** it is unavailable; with text selected, it clears formatting from that text only.
7. **Given** the person has made changes, **When** they press Undo or Redo in the toolbar, **Then** the change is undone or redone, the same as Ctrl+Z and Ctrl+Shift+Z.

---

### User Story 5 — Keyboard-first and findable (Priority: P2)

A person who prefers the keyboard types "/" at the start of a line, types "tab", presses Enter, and has a table. Every menu can be used with arrow keys, and a screen reader announces the toolbar and which formatting is on.

**Why this priority**: Most of the editor's features sit behind a dropdown nobody opens. A "/" menu makes them findable at the point of writing; keyboard and screen-reader support make them reachable for everyone.

**Independent Test**: Using only the keyboard, insert each block type from the "/" menu, apply a heading from the Text style menu, and open and close every menu; separately, check with a screen reader that the toolbar, buttons and editor are announced.

**Acceptance Scenarios**:

1. **Given** the cursor is at the start of a line or after a space, **When** the person types "/", **Then** a menu opens listing the text styles, lists, task, image, table, toggle list, divider, YouTube video and table of contents.
2. **Given** the "/" menu is open, **When** the person keeps typing, **Then** the list narrows to matching items; Arrow keys move the highlight, Enter inserts it, and Esc closes the menu, leaving the "/" as typed text.
3. **Given** "/" is typed inside a word (for example "and/or"), **Then** no menu opens.
4. **Given** any toolbar menu is open, **When** the person presses the arrow keys, **Then** focus moves through the items; Enter chooses; Esc returns focus to the button that opened the menu.
5. **Given** the Text style menu is open, **Then** the current style shows a ✓, and choosing it again leaves the style unchanged.
6. **Given** a screen reader is running, **Then** the toolbar is announced as a toolbar, each formatting button is announced as on or off, and the writing area is announced as "Brief".

---

### User Story 6 — Blocks that do what they say (Priority: P2)

A producer inserts a checklist under a paragraph, a YouTube reference that shows its preview, and a shot-list table they can grow column by column.

**Why this priority**: Each block works, but each surprises: Task rewrites the current line, YouTube shows as bare text, tables can't be reshaped, toggles arrive with filler text to delete.

**Independent Test**: Insert each block type below an existing paragraph and confirm each behaves as described below; reopen the brief and confirm each block is unchanged.

**Acceptance Scenarios**:

1. **Given** the cursor is in a paragraph with text, **When** the person inserts a Task, **Then** a new empty checklist item appears on the line below and the paragraph is unchanged.
2. **Given** the person inserts a YouTube video with a valid address, **Then** a video block with the video's preview appears on its own line; an address that is not a YouTube video is rejected with an explanation.
3. **Given** the cursor is in a table, **Then** a small table menu offers: add row above or below, add column left or right, delete row, delete column and delete table.
4. **Given** a new table is inserted, **Then** it fills the editor's width and has a header row.
5. **Given** a toggle list is inserted, **Then** its title and body are empty, with grey hints ("Toggle title", "Hidden content") that disappear as the person types.
6. **Given** a table of contents is inserted, **Then** it appears as a labelled block ("Table of contents — built from this brief's headings"), not as raw text.
7. **Given** a table, **When** the person drags the border between two columns (mouse or touch), **Then** those two columns resize live, showing their widths as percentages, and no column can shrink below a readable minimum.
8. **Given** a table whose columns were resized, **When** the brief is read or reopened, **Then** the columns keep their widths; **When** the person chooses Equal widths in the table menu, **Then** all columns become equal.

---

### User Story 7 — Long briefs and phones (Priority: P2)

A creative director scrolls a long brief and still has the toolbar at hand; on a phone, the toolbar is a single row.

**Why this priority**: Long briefs are where formatting matters most, and phones are how many approvals happen.

**Independent Test**: In a brief long enough to scroll, scroll to the bottom and confirm the toolbar is visible; at phone width (390px), confirm the toolbar is one row that scrolls sideways and no stray divider shows.

**Acceptance Scenarios**:

1. **Given** a brief taller than the visible area, **When** the person scrolls within it, **Then** the toolbar stays visible at the top of the editor.
2. **Given** a screen 390px wide, **Then** the toolbar occupies one row, scrolls sideways to reveal the rest, never starts a row with a divider, and the save status is a small indicator that still reads "Saved", "Saving…" or "Couldn't save" to assistive technology.

---

### User Story 8 — Arabic (Priority: P2)

A team member using the app in Arabic sees every editor label, menu item, hint and message in Arabic, with the toolbar laid out right-to-left.

**Why this priority**: The app runs fully in Arabic and English; the editor is currently the one English-only surface in the task panel.

**Independent Test**: Switch the app to Arabic, open a brief, and confirm every visible string in the editor is translated and the layout mirrors.

**Acceptance Scenarios**:

1. **Given** the app language is Arabic, **When** the brief editor is open, **Then** every label, tooltip, menu item, placeholder, hint and message is in Arabic.
2. **Given** the app language is Arabic, **Then** the toolbar, menus, link card and "/" menu are laid out right-to-left.

---

### User Story 9 — What you see is what's saved (Priority: P3)

What the person sees while editing looks the same after clicking away: underlines stay underlined, lists keep their spacing, and the editor's colours match the rest of Momentum.

**Why this priority**: Small mismatches, but they make the read view feel like a different document from the one just written.

**Independent Test**: Write a brief using every formatting option, click away, and compare the read view to the editing view.

**Acceptance Scenarios**:

1. **Given** text is underlined with Ctrl+U, **When** the person clicks away from the brief, **Then** the text is still underlined in the read view.
2. **Given** a bulleted or numbered list, **Then** items are evenly and tightly spaced in both the editing and read views.

---

### Edge Cases

- **Click-away onto another control in the panel** (a field, the stage button): editing ends and that control receives the click as normal.
- **Click-away while a menu or prompt is open**: the first click closes the menu or prompt only; editing continues (same rule as Esc).
- **Selecting text by dragging that ends outside the brief**: does not end editing.
- **Save fails, then the person closes the panel**: they are warned (Story 1, scenario 3); if they leave anyway, the newest text is still attempted once on the way out, as today.
- **Several saves fail in a row**: the status stays "Couldn't save" and Retry always sends the newest text, never an older one.
- **Pasting text and an image together** (for example from a web page): the text is pasted as today; images inside are uploaded only if they are image files, not remote addresses.
- **Pasting a non-image file** (PDF, video): it is not inserted into the brief; a message suggests adding it as an attachment.
- **Pasting or dropping more images than one upload batch allows**: the first batch is uploaded and a message says how many were skipped.
- **Undo after an image was uploaded**: removes the image from the brief; the attachment stays on the task.
- **The person has no permission to add attachments**: pasting or dropping an image shows "You can't add attachments to this task" and inserts nothing.
- **Link card near the editor's edge or on a phone**: it stays fully on screen.
- **A very long link address**: the card shortens it for display ("drive.google.com/…") and shows the full address on hover.
- **YouTube Shorts, youtu.be and timestamped links**: accepted as YouTube videos.
- **Existing briefs** that already contain filler toggle text, raw `[[toc]]`, bare YouTube addresses or relative links: they open and render as before; nothing is rewritten unless the person edits that part.
- **"/" typed as content** (dates like 4/11, paths, "and/or"): no menu opens.
- **Esc while an upload is in progress**: closes only the upload's menu if one is open; otherwise the unsaved-changes rule applies until the upload finishes.

## Requirements *(mandatory)*

### Functional Requirements

**Saving (Story 1)**

- **FR-001**: The editor MUST treat text as saved only after a save has succeeded.
- **FR-002**: When a save fails, the editor MUST show "Couldn't save" with a Retry action, and MUST keep the unsaved text.
- **FR-003**: After a failure, any further typing or Retry MUST send the newest text; no older text may overwrite newer text.
- **FR-004**: Leaving editing (clicking outside the brief, Esc, or closing the panel) with unsaved changes after a failure MUST ask the person to confirm leaving.
- **FR-005**: The save status MUST appear in exactly one place in the editor.

**Undo and accidental damage (Story 4)**

- **FR-010**: Esc MUST close the innermost open menu, popup, card or input box first, and close the editor only when none is open.
- **FR-011**: Closing a menu with Esc MUST return focus to where it was before the menu opened.
- **FR-012**: Clear format MUST act only on selected text and MUST be unavailable when nothing is selected.
- **FR-013**: The toolbar MUST offer Undo and Redo, matching the keyboard shortcuts, and disabled when there is nothing to undo or redo.

**Entering and leaving editing (Story 4, F1)**

- **FR-014**: There MUST be no Edit button and no Done button. Clicking anywhere in the read brief, except on a link or a checkbox, MUST start editing; keyboard users start it with Enter or Space on the focused brief.
- **FR-015**: Editing MUST start with the cursor at the clicked position, and the brief's text MUST stay where it was on screen when the toolbar appears.
- **FR-016**: Editing MUST end when the person clicks outside the brief or presses Esc with nothing open; a drag-selection that ends outside the brief does not count as a click outside.
- **FR-017**: While the brief is being read, links MUST open in a new tab and checkboxes MUST be tickable, saving without entering editing.

**Links (Story 2)**

- **FR-020**: While editing, clicking a link MUST place the cursor and MUST NOT open the link.
- **FR-021**: When the cursor is in a link, a link card MUST offer Open (in a new tab), Edit and Remove; Remove keeps the text and removes the link.
- **FR-022**: An address entered without a scheme MUST be saved with `https://` added.
- **FR-023**: Text that cannot be a web or email address MUST be rejected with a message, and no link created.
- **FR-024**: Ctrl+K (⌘K on Mac) MUST open the link box, pre-filled when the selection is already a link.
- **FR-025**: The editor MUST NOT show the same formatting control twice at once; the floating popup on a text selection, if kept, MUST offer only actions absent from the visible toolbar.

**Images (Story 3)**

- **FR-030**: Inserting an image by address MUST check that the address loads as an image and show a preview before inserting; otherwise MUST insert nothing and say why.
- **FR-031**: An inserted image MUST still be present after the brief is closed and reopened.
- **FR-032**: Pasting image data or image files into the editor MUST upload each image as an attachment of the task and insert it at the cursor.
- **FR-033**: Dropping image files onto the editor MUST upload and insert them at the drop point, in the order dropped.
- **FR-034**: While an image uploads, a visible "Uploading…" placeholder MUST occupy its place, and the person MUST be able to keep typing.
- **FR-035**: A failed or rejected upload MUST remove its placeholder and show a message naming the file and the reason, applying the same size and count limits as task attachments.
- **FR-036**: Uploads MUST follow the same permission rules as adding attachments to the task.

**Finding and reaching features (Story 5)**

- **FR-040**: Typing "/" at the start of a line or after a space MUST open an insert menu covering every text style and insertable block.
- **FR-041**: Typing after "/" MUST filter the menu; Arrow keys, Enter and Esc MUST navigate, insert and dismiss it.
- **FR-042**: "/" typed inside a word MUST NOT open the menu.
- **FR-043**: The editor MUST make its Markdown shortcuts discoverable, for example by naming them beside the matching items in the menus.
- **FR-044**: Every toolbar menu MUST be fully operable by keyboard: arrows to move, Enter to choose, Esc to close and return focus.
- **FR-045**: The toolbar MUST be announced to assistive technology as a toolbar, and each formatting button MUST expose whether it is on.
- **FR-046**: The writing area MUST have an accessible name ("Brief").
- **FR-047**: The Text style menu MUST mark the current style, and choosing the current style MUST leave it unchanged.

**Blocks (Story 6)**

- **FR-060**: Inserting a YouTube video MUST create a video block on its own line that shows the video's preview while editing.
- **FR-061**: An address that is not a YouTube video MUST be rejected with a message.
- **FR-062**: Inserting a Task MUST add a new empty checklist item below the current line, leaving existing text unchanged.
- **FR-063**: When the cursor is in a table, the person MUST be able to add rows and columns on either side, delete a row, delete a column and delete the table.
- **FR-064**: A newly inserted table MUST fill the editor's width and include a header row.
- **FR-065**: A newly inserted toggle list MUST have an empty title and body, showing grey hints until typed into.
- **FR-066**: A table of contents MUST appear while editing as a labelled block, not as raw text.
- **FR-067**: Table columns MUST be resizable by dragging the border between two columns, with mouse or touch, showing both widths while dragging, with a minimum column width so no column collapses.
- **FR-068**: Resized column widths MUST be kept when the brief is saved and reopened, and MUST display the same in the read view.
- **FR-069**: The table menu MUST offer Equal widths, which also serves as the keyboard way to reset widths.

**Layout (Story 7)**

- **FR-070**: In a brief taller than the visible area, the toolbar MUST remain visible while the person scrolls the brief.
- **FR-071**: At widths of 390px and below, the toolbar MUST occupy one row that scrolls sideways, MUST NOT begin a row with a divider, and MUST show the save status as a compact indicator with a readable label for assistive technology.

**Consistency (Story 9)**

- **FR-080**: Underlined text MUST appear underlined in the read view after Done.
- **FR-081**: List items MUST have the same tight spacing in the editing and read views.
- **FR-082**: The editor MUST draw its colours from the product's shared design palette (Constitution §I); the editor's blue and lime colours are added to that palette rather than defined inside the editor.

**Language (Story 8)**

- **FR-090**: Every editor string — labels, tooltips, menu items, placeholders, hints and messages — MUST be available in Arabic and English and follow the app's language setting.
- **FR-091**: In Arabic, the toolbar, menus, link card, table menu and "/" menu MUST be laid out right-to-left.

**Compatibility (all stories)**

- **FR-100**: Briefs MUST continue to be stored in the same format, so existing briefs open unchanged and briefs written after this change still display correctly everywhere briefs are shown.
- **FR-101**: Existing editor behaviour listed under Context as working (autosave ordering, Markdown shortcuts, pasting Markdown, pasting a URL over a selection, checkbox ticking, New subtask, toggle and table round-trips, Copy Markdown) MUST keep working.

### Key Entities

- **Brief**: the formatted instructions on a task. Stored as text in the task's existing format; this feature adds no new stored fields.
- **Task attachment**: a file kept with a task. Images pasted or dropped into the brief become task attachments and are referenced from the brief.
- **Save state**: what the editor shows about the brief: Saved, Saving… or Couldn't save. It is not stored anywhere.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: In a test where every save fails, the editor never shows "Saved", and 100% of the text typed is saved once saving works again.
- **SC-002**: Pressing Esc with any menu, popup or box open closes the editor 0 times out of 20 attempts across all menus.
- **SC-003**: A person can paste a screenshot into a brief and see it in place in under 5 seconds on a normal office connection, for images up to 5 MB.
- **SC-004**: A person can change or remove an existing link in at most 3 actions (click the link, choose Edit or Remove, confirm).
- **SC-005**: 0 links saved without a scheme, and 0 broken images inserted, across the scenarios in Stories 2 and 3.
- **SC-006**: Every block type can be inserted using only the keyboard, from the "/" menu, in under 5 seconds each.
- **SC-007**: An automated accessibility check of the open editor, with each menu open in turn, reports no critical issues.
- **SC-008**: At 390px wide, the toolbar is one row tall and nothing on the page scrolls sideways except the toolbar itself.
- **SC-009**: In Arabic, 0 English strings are visible in the editor across every menu, card and message.
- **SC-010**: All existing briefs open, display and save without visible change unless edited.
- **SC-011**: Clicking a word in the read brief puts the cursor on that word in 100% of tested clicks on paragraphs, list items, headings and table cells, and the clicked text moves by no more than 4 px on screen.
- **SC-012**: Column widths set by dragging are identical (±1%) after closing and reopening the brief, and in the read view.

## Assumptions

- The audit of 2026-11-04 is the scope. Other ideas from it (comments in briefs, version history, collaborative editing) are out of scope.
- **E23 resolution**: rather than amending Constitution §I, the editor's blue and lime colours are added to the shared design palette, so the design chosen in #80 and #81 stays and the rule is honoured (FR-082). If the team prefers to amend the constitution instead, FR-082 changes accordingly.
- **E15 resolution**: underline stays (people expect Ctrl+U) and the read view is made to show it, rather than removing underline from the editor.
- **E21 resolution**: the save status lives in the toolbar; the hint line next to Done is reduced to the Done button and any one-off messages.
- Pasted and dropped images use the existing attachment storage, limits and permissions; no new storage is introduced.
- Images are uploaded only from image data or files, not by fetching remote images found in pasted web content.
- The unsaved-changes warning (FR-004) appears only after a save has failed; ordinary in-flight saves keep the current "nothing is discarded" behaviour.
- Both places the editor appears, the task panel and the Create Task form, get these changes. Where the Create Task form has no task yet, pasted images wait for the task to be created before uploading, or the form explains that images can be added after creating the task. The planning phase decides which.
- The read-only brief view is changed only where needed for FR-080, FR-081, FR-066 and FR-068.
- **F1**: the `TaskModal` read view keeps its rich rendering (embeds, link chips, Expand); the editor replaces it on click, at the clicked position. The Create Task form has no read view, so it is always in editing and click-away does not apply there.
- **F2**: only columns resize; rows grow with their content. Tables whose columns were never resized keep being stored exactly as today.
