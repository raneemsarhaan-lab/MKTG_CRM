# Feature Specification: Sheet Columns You Can Shape

**Feature Branch**: `claude/nice-noether-x4rgei`

**Created**: 2026-11-05

**Status**: Draft (clarified 2026-11-05: everyone may change columns)

**Input**: User description: "the content or the video sheet allow us to add columns, rearrange, change their names freely as they are excel sheet"

## Context

The Content sheet (spec 009) and the Video sheet (spec 008) have fixed columns.

The team's own spreadsheets don't work that way:
- people add a column when a new need comes up (a "Hook" column, a "Platform" column, a "Reviewer notes" column);
- they drag columns into the order that suits the week's work;
- they rename headings to the words they use.

Today, every such change needs a developer. That is why the Content sheet's columns were just rebuilt by hand to match the team's Google Sheet.

This feature lets the team shape both sheets themselves, as they would a spreadsheet:
- add their own columns;
- rename any column;
- rearrange, hide and resize columns.

The pipeline's own fields (title, status, assignee, links, dates) keep working exactly as they do today, whatever they are called and wherever they sit.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Rename any column (Priority: P1)

A content lead wants the Content sheet to use the team's words. They open a column's header menu, choose **Rename**, type "Copy status" over "Status", and press Enter. The heading changes, and everyone who opens the sheet sees "Copy status". Later they choose **Reset name**, and the heading goes back to "Status" in each person's own language.

**Why this priority**: Renaming is the smallest change, and the most asked for. It makes the sheet read like the team's own sheet with no change to how anything works.

**Independent Test**: Rename "Status" to "Copy status" in the Content sheet. Reload in another browser signed in as another member: the heading reads "Copy status", and the status cells and their menus work as before. Reset the name: "Status" (or "المرحلة" in Arabic) returns.

**Acceptance Scenarios**:

1. **Given** a sheet column, **When** any member chooses Rename and enters a new name, **Then** the heading shows the new name for everyone, and the column's cells keep their behaviour.
2. **Given** a renamed built-in column, **When** Reset name is chosen, **Then** the heading returns to its default name, translated in each person's language.
3. **Given** a new name that is empty, or the same as another column's name in that sheet, **When** it is entered, **Then** the rename is refused with a short reason, and the old name stays.
4. **Given** a renamed column, **When** someone views the sheet in Arabic, **Then** they see the name as it was typed. The default names alone are translated.

---

### User Story 2 - Add a column of your own (Priority: P1)

The team starts tracking the hook line of each post. A member chooses **+ Column**, names it "Hook", picks the kind **Text**, and adds it. A new column appears at the end of the sheet. They type a hook into a row and press Enter; it is saved, and their teammates see it after their next refresh. Another time they add **Platform** as a **Choice** column with LinkedIn, Instagram and X, each in its own colour, and pick a platform per row from a menu.

**Why this priority**: Adding columns is the heart of the request. It is what stops new tracking needs from waiting on a developer.

**Independent Test**: Add a Text column "Hook" to the Content sheet and a Choice column "Platform" with three options. Fill both on two rows. Reload as another member: both columns and all four values are there.

**Acceptance Scenarios**:

1. **Given** a sheet, **When** any member adds a column with a name and a kind, **Then** the column appears in the sheet for everyone, empty, at the end or where they chose to insert it.
2. **Given** a custom column, **When** a member who may edit a row enters a value in it, **Then** the value is saved for that row and shown to everyone.
3. **Given** the column kinds, **Then** these are offered:
   - **Text**;
   - **Number**;
   - **Date**;
   - **Link**: a web address, shown by its site's name, refused if it is not a link;
   - **Person**: one team member;
   - **Choice**: one option from a list the column defines, each option with a colour;
   - **Checkbox**.
4. **Given** a value that doesn't fit the column's kind (letters in a Number column, a non-address in a Link column, an unknown date), **When** it is entered, **Then** it is refused with a note in the cell, and the old value stays.
5. **Given** a custom column on the Video sheet, **When** a video or a clip row is shown, **Then** the column is available on both kinds of row.
6. **Given** the Content sheet's theme and pillar rows, **Then** they show no custom-column cells, as today. Custom values belong to pieces and clips.

---

### User Story 3 - Rearrange columns (Priority: P1)

A video editor wants File name next to Title while cutting. They drag the File name heading to just after Title and drop it. The column moves, the cells move with it, and the new order is what everyone sees. Someone using the keyboard does the same with **Move left** and **Move right** in the header menu.

**Why this priority**: The order of columns is how a sheet fits the work. It completes the "like a spreadsheet" promise with rename and add.

**Independent Test**: Drag "Assignee" in the Content sheet to after "Title". Reload as another member: the order holds. Move it back with the keyboard (header menu, Move right) and check it lands where it started.

**Acceptance Scenarios**:

1. **Given** a sheet, **When** any member drags a heading to a new position, **Then** the column and its cells move there, and the order is saved for everyone.
2. **Given** the header menu, **When** Move left or Move right is chosen, **Then** the column moves one place, with no pointer needed.
3. **Given** the Title column, **Then** it stays first and frozen, and other columns can't be placed before it.
4. **Given** the Video sheet's column sets (Editing, Copy, Full), **When** columns are rearranged, **Then** every set shows its columns in the new order.

---

### User Story 4 - Hide, show and delete columns (Priority: P2)

The Video sheet's Copy set doesn't need Source. A member hides it from the header menu, and it disappears from the sheet. **Columns** in the toolbar lists every column with a checkbox, and ticking Source brings it back. A custom column that is no longer used ("Hook" after the campaign ends) is **deleted**. A confirmation says how many rows have a value in it, and an Undo stays available for 10 seconds.

**Why this priority**: Hiding keeps the sheet focused, and deleting cleans up. Both matter once people start adding columns, but neither is needed on day one.

**Independent Test**: Hide "Pillar" in the Content sheet. Reload as another member: it is hidden. Show it from Columns. Delete a custom column with values: the confirmation states the count. Undo restores it, values included.

**Acceptance Scenarios**:

1. **Given** any column except Title, **When** it is hidden, **Then** it disappears from the sheet for everyone, and it stays listed, unticked, in the Columns list.
2. **Given** the Columns list, **When** a hidden column is ticked, **Then** it returns in its place in the order.
3. **Given** a built-in column, **Then** it can be hidden but not deleted, because the pipeline needs its data.
4. **Given** a custom column with values, **When** Delete is chosen, **Then** a confirmation states how many rows have a value. Once confirmed, the column and its values are removed for everyone, with Undo available for 10 seconds.
5. **Given** the Video sheet, **When** a column is hidden, **Then** it is hidden in the column set it was hidden from (Editing, Copy or Full). The other sets are unchanged.

---

### User Story 5 - Change a custom column's settings (Priority: P2)

The Platform column needs a fourth option, "YouTube", and "X" should read "X (Twitter)". From the header menu, **Edit column** opens its settings. The member adds the option, renames another, and changes a colour. Every row that had "X" now shows "X (Twitter)".

**Why this priority**: Choice lists grow over time, and a column added in a hurry often needs fixing. It comes after adding columns at all.

**Independent Test**: Add an option to a Choice column, and rename an option that is in use: the rows using it show the new name. Try to remove an option that is in use: you are asked which option those rows should take, or to clear them.

**Acceptance Scenarios**:

1. **Given** a Choice column, **When** an option is added, renamed or recoloured, **Then** every row using it reflects the change.
2. **Given** an option in use, **When** it is removed, **Then** the member chooses another option for those rows, or clears them, and the count of affected rows is shown first.
3. **Given** a custom column, **When** its kind is changed (for example Text to Choice), **Then** the values that fit the new kind are kept, the rest are listed for review before the change is confirmed, and nothing is lost without that confirmation.

---

### User Story 6 - Resize columns (Priority: P3)

A member drags the edge of the "Hook" heading to make it wider. The width is kept for everyone, and double-clicking the edge fits the column to its longest value.

**Why this priority**: Comfort, not capability. The current widths work, and resizing becomes useful once custom columns hold longer text.

**Independent Test**: Widen a column and reload as another member: the width holds. Double-click its edge: it fits its content.

**Acceptance Scenarios**:

1. **Given** a column edge, **When** it is dragged, **Then** the column's width changes and is saved for everyone, within a minimum and maximum width.
2. **Given** a column edge, **When** it is double-clicked, **Then** the column fits its longest visible value.

---

### User Story 7 - Paste into custom columns (Priority: P3)

The team copies its Google Sheet, now with a "Hook" column, and uses **Paste plan** (Content) or **Paste clips** (Video). The preview matches the pasted "Hook" heading to the custom "Hook" column, by name and ignoring case. On Add, each piece gets its hook. A pasted heading with no matching column is listed as "Not imported: Hook2", with a one-click **Add as a column**.

**Why this priority**: It closes the loop with the team's spreadsheet. But the paste tools already work for the built-in columns, so it can follow.

**Independent Test**: Add a Text column "Hook". Paste 18 rows that include a Hook column through Paste plan. All 18 pieces get their hook. Paste again with an extra "Notes" heading: it is offered as "Add as a column".

**Acceptance Scenarios**:

1. **Given** a pasted heading that matches a column's current name (built-in or custom), **When** the preview is built, **Then** that pasted column fills the matched column.
2. **Given** a pasted value that doesn't fit the column's kind, **Then** it is listed as a problem in the preview, as invalid links are today, and is never stored.
3. **Given** a pasted heading with no matching column, **Then** the preview lists it as not imported, and offers to add it as a Text column before adding.

---

### Edge Cases

- **Two people change columns at the same time.** Each change is saved on its own (one rename, one move). The last one saved wins for the same column, and others see the result on their next refresh.
- **A column is deleted while someone is editing its cell.** Their edit is refused with "This column was removed", and the sheet refreshes.
- **Many columns.** Up to 30 custom columns per sheet. Beyond that, + Column says the limit is reached.
- **Long names.** Names are up to 40 characters, and are shortened with an ellipsis in the heading, with the full name on hover.
- **Arabic.** Custom names and choice options show as typed, in both languages. Right-to-left layout mirrors the order, as for built-in columns.
- **Phone width.** The sheet scrolls sideways as today. Column changes are available on phones from the header menu. Dragging is not needed there.
- **A piece that appears in both sheets** (a video piece in the Content sheet and its own Video sheet). Each sheet has its own custom columns. A value in the Content sheet's "Hook" doesn't appear in the Video sheet, unless the Video sheet has its own column.
- **Archived pieces and dropped clips.** They keep their custom values, read-only, like their other cells.
- **Copying out of the sheet.** Custom values copy as plain text, like other cells.
- **A Person column naming someone who later leaves the team.** The cell shows their name, greyed, until changed.
- **Built-in behaviour after a rename or move.** Every built-in cell keeps its own behaviour wherever it sits and whatever it is called: the status menu, the link checks, Published asking for its link, and the clip timings.

## Requirements *(mandatory)*

### Functional Requirements

**Columns as a shared layout**

- **FR-001**: Each sheet (Content, Video) MUST have one column layout: which columns exist, their names, order, visibility and widths. It is the same for every member who opens that sheet.
- **FR-002**: Changes to the layout MUST be saved and reach other members on their next load or refresh of the sheet.
- **FR-003**: Every member who can open a sheet MAY change its layout: add, rename, move, hide, resize and delete custom columns. This is like a shared spreadsheet (decided 2026-11-05).
- **FR-004**: Because one member's change reaches everyone, each layout change MUST record who made it and when. The Columns list MUST show, for each column, who last changed it and when (on hover or focus).

**Rename**

- **FR-010**: Any column, built-in or custom, MUST be renamable from its header menu.
- **FR-011**: A name MUST be 1 to 40 characters, and unique within its sheet, ignoring case.
- **FR-012**: A renamed built-in column MUST offer Reset name, which returns it to its default, translated name.
- **FR-013**: Renaming MUST NOT change what a column's cells do or hold.

**Add**

- **FR-020**: + Column MUST add a custom column with a name and one kind: Text, Number, Date, Link, Person, Choice or Checkbox.
- **FR-021**: A custom column MAY be inserted at the end, or before or after an existing column, from that column's header menu.
- **FR-022**: Custom values MUST be stored per row (piece or clip) and per column, and edited in the cell like other cells. Keyboard editing, Enter, Escape and Tab behave as in the rest of the grid.
- **FR-023**: Values MUST be checked against the column's kind:
  - numbers for Number;
  - a date for Date, accepting YYYY-MM-DD and DD/MM/YYYY;
  - a web address for Link;
  - a team member for Person;
  - one of the options for Choice.
  A refused value MUST leave the old value and show a note in the cell.
- **FR-024**: Who may edit a row's custom values MUST follow the existing rule for editing that row (its owner, its assignee, admins and superusers).
- **FR-025**: There MUST be at most 30 custom columns per sheet.

**Rearrange, hide, resize**

- **FR-030**: Columns MUST be reorderable by dragging their headings, and by Move left / Move right in the header menu.
- **FR-031**: Title MUST stay first and frozen. It can be renamed and resized, but not moved or hidden.
- **FR-032**: Any other column MUST be hideable from its header menu. A Columns list in the toolbar MUST show every column, with a tick for those shown.
- **FR-033**: On the Video sheet, hiding and showing MUST apply to the current column set (Editing, Copy or Full). Order MUST be shared by all sets.
- **FR-034**: A new custom column on the Video sheet MUST be shown in Full and in the set it was added from.
- **FR-035**: Column widths MUST be resizable by dragging a heading's edge, between 60 and 600 pixels, and fit to content on double-click.

**Delete and settings**

- **FR-040**: Built-in columns MUST NOT be deletable.
- **FR-041**: Deleting a custom column MUST first state how many rows hold a value, then remove the column and its values for everyone, and offer Undo for 10 seconds.
- **FR-042**: A Choice column's options MUST be editable: add, rename, recolour, reorder and remove. Removing an option in use MUST ask for a replacement option, or for clearing.
- **FR-043**: Changing a custom column's kind MUST keep values that fit the new kind, and list the others for confirmation before anything is cleared.

**Paste**

- **FR-050**: Paste plan (Content) and Paste clips (Video) MUST match pasted headings to columns by current name, ignoring case and extra spaces, as well as by the existing built-in heading names.
- **FR-051**: Pasted values for custom columns MUST be checked as in FR-023. Problems MUST be listed in the preview, and never stored.
- **FR-052**: A pasted heading that matches no column MUST be listed as not imported, with an option to add it as a Text column before adding the rows.
- **FR-053**: A row already in the sheet MUST NOT have its existing values overwritten by a paste. Only its empty cells are filled, and only under the row rule (FR-022).

**Type-ahead** *(added at the user's request after planning)*

- **FR-055**: Typing on a Type cell or a Choice cell MUST open a list that filters as you type. ↑ and ↓ move through it, Enter picks, and Esc closes.
- **FR-056**: When nothing matches what was typed, the list MUST offer to add it. Anyone may add a Choice option. Only admins may add a content type, and a new type starts with Post's deadlines for every stage (constitution §II).

**Language, accessibility and design**

- **FR-060**: Every new control and message MUST exist in English and Arabic. Custom names and options show as typed.
- **FR-061**: Every column action MUST be possible with the keyboard alone, from the header menu.
- **FR-062**: Choice colours MUST come from the project's colour tokens, with text readable at AA contrast. The look MUST follow a design file made before the UI work.

### Key Entities

- **Sheet layout**: For one sheet (Content or Video):
  - its columns in order, each with its current name, whether it is shown (per column set on the Video sheet), and its width.
  - who changed it last, and when.
- **Column**: Either built-in (one of today's columns, with fixed behaviour and data) or custom. A custom column has a name, a kind, and, for Choice, its options.
- **Choice option**: A name and a colour, in order, belonging to one Choice column.
- **Custom value**: The value of one custom column for one row (a piece or a clip). Removed with its column.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A member can add a new column and fill its first value in under 30 seconds, with no help.
- **SC-002**: Renaming a column takes at most 3 actions (open header menu, Rename, type and Enter).
- **SC-003**: In 100% of checks, a layout change made by one member is what another member sees after reloading the sheet.
- **SC-004**: Renaming, moving, hiding or resizing a built-in column never changes or loses any data. Every value is the same before and after, in 100% of checks.
- **SC-005**: Built-in behaviours (status menu and moves, link checks, Published asking for its link, clip timings) work the same in every position and under any name.
- **SC-006**: Pasting 18 rows with 3 custom columns through Paste plan fills all 54 values correctly in one paste.
- **SC-007**: A deleted custom column can be fully restored, values included, with Undo within 10 seconds.
- **SC-008**: Every column action is completed with the keyboard alone in the accessibility check, with no serious issues.
- **SC-009**: After a month, the team asks for no developer change to sheet columns. Each such need is met by the team itself.

## Assumptions

- **Shared, like a spreadsheet**: A sheet's columns are the same for everyone, as in a shared spreadsheet. Personal views (my own order or hidden columns) are out of scope; the existing "Mine" filter and the Video sheet's column sets stay as they are.
- **One layout per sheet, not per theme or per video**: The Content sheet has one set of columns for every theme. The Video sheet has one for every video.
- **Built-in columns stay**: Today's columns keep their data and behaviour. They can be renamed, moved, hidden and resized, but not deleted or changed in kind.
- **No formulas**: Custom columns hold values typed or pasted. Formulas, calculated columns and conditional colouring are out of scope.
- **Row values only**: Custom values belong to piece and clip rows. Theme, pillar and video header rows carry none, except the video row itself on the Video sheet, which is a task like its clips.
- **Freshness**: As elsewhere in the app, others see changes after their next load or refresh. Live, instant updates are out of scope.
- **History**: Column changes record who made them and when. A full change history and an undo beyond the 10-second delete Undo are out of scope.
- **Limits**: 30 custom columns per sheet, 40-character names, 50 options per Choice column, widths 60–600 pixels.
- **The board and task panel**: Custom values show only in the sheet they belong to. Showing them on board cards or in the task panel is out of scope for this feature.
