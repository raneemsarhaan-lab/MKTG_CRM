# Feature Specification: Sheet Formatting, Editing Tools and Comments

**Feature Branch**: `claude/nice-noether-x4rgei`

**Created**: 2026-11-10

**Status**: Draft

**Input**: User description: "I need in the sheets to add all format, editing and coloring options we have in excel, and comments option as well"

## Context

Spec 013 gave Momentum's Sheets Excel-style editing and tabs:
- click and type;
- selection, copy and paste with Excel and Google Sheets;
- inserting, deleting and resizing rows and columns;
- undo;
- Excel's tab menu.

It deliberately left styling out. A cell holds text only, with no bold, no colours, no borders, no number formats, and nothing like a comment.

This feature adds what people reach for on **Excel's Home tab**, with **comments** like Excel's (and Google Sheets'). Formulas and calculations stay out, as in spec 013.

The groups, in Excel's terms:
- **Font**: typeface, size, bold, italic, underline, strikethrough, text colour.
- **Fill and borders**: cell colour; borders on any side, in a style and colour.
- **Alignment**: left, centre, right; top, middle, bottom; wrap text; merge and centre; indent; rotated text.
- **Number formats**: General, Number, Currency, Percentage, Date, Time, Text, decimal places, thousands separator.
- **Styles**: ready-made cell styles; conditional formatting; format as table (banded rows, a header row).
- **Editing**:
  - Format Painter;
  - Paste Special (values only, formats only);
  - Clear (all, formats, contents);
  - Fill down and right;
  - Find and Replace;
  - Sort and Filter;
  - Freeze Panes;
  - hide and unhide rows and columns.
- **Comments**: threaded comments on a cell, with replies, @mentions, Resolve, and a marker in the cell's corner.

## Clarifications

### Session 2026-11-10

- Q: Content and Video sheets? → A: **Everything everywhere.** Blank sheets and the linked Content and Video sheets both get formatting, editing tools and comments. The linked sheets have a few rules of their own, because their rows are tasks (FR-070–FR-075).
- Q: One release or stages? → A: **In stages.** Stage 1 is stories 1–3: formatting, number formats and comments. Stage 2 is story 4, the editing tools. Stage 3 is story 5: sort, filter, styles, tables and conditional formatting. Each stage ships on its own.
- Q: Who sees comments? → A: **Everyone who can open the sheet**, as in Excel and Google Sheets.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Make cells look the way I want (Priority: P1)

A content lead keeps the month's campaign plan in a blank sheet. They select the header row and make it **bold**, white on a dark purple fill, centred, with a thick bottom border. They colour the "Status" column's cells green, amber and red by hand, and wrap the long "Notes" column.

**Why this priority**: It is the heart of the request ("format and coloring"). Without it, sheets look nothing like the Excel files the team is used to.

**Independent Test**: Format a block of cells with each of the font, fill, border and alignment controls, then reload. Everything looks the same, and copying the block into Excel keeps it.

**Acceptance Scenarios**:

1. **Given** a selection, **When** the user picks Bold, Italic, Underline or Strikethrough (button or Ctrl/Cmd+B, I, U, 5), **Then** every selected cell changes. Picking it again turns it off.
2. **Given** a selection, **When** the user picks a typeface, a size, a text colour or a fill colour, **Then** every selected cell takes it. "No fill" and "Automatic" clear it.
3. **Given** a selection, **When** the user picks a border preset (all borders, outside, top, bottom, left, right, thick outside, none) with a line style and colour, **Then** the borders draw on the right edges of the block.
4. **Given** a selection, **When** the user picks horizontal or vertical alignment, Wrap text, Indent or a text rotation, **Then** the cells show it, and wrapped rows grow to fit.
5. **Given** a block, **When** the user picks Merge & Centre, **Then** the block becomes one cell showing the top-left value. Unmerge splits it back. Merging a block with more than one value warns that only the top-left value is kept.
6. **Given** formatted cells, **When** the page reloads or another member opens the sheet, **Then** they see the same formatting.
7. **Given** formatted cells, **When** the user copies them into Excel or Google Sheets, or pastes a formatted table from either, **Then** bold, italic, underline, colours, fills and alignment come along.

---

### User Story 2 - Numbers, dates and money shown properly (Priority: P1)

A member pastes a budget column. They pick **Currency (EGP)** with two decimals, and the numbers show as "EGP 12,500.00". A launch-date column is shown as "Mon, 16 Nov 2026". The underlying values don't change, so copying them out gives the real numbers.

**Why this priority**: Number and date formats are the most-used part of Excel's Home tab after fonts and colours. Budgets and schedules live in these sheets.

**Independent Test**: Type numbers and dates, apply each format, and check how they display. Copy them out and check the values are unchanged.

**Acceptance Scenarios**:

1. **Given** cells with numbers, **When** the user picks Number, Currency, Percentage or Scientific, with decimal places and the thousands separator, **Then** the cells show the numbers that way.
2. **Given** cells with dates or times, **When** the user picks a date or time format (short, long, or a custom pattern such as `dd/mm/yyyy`), **Then** they display that way, in the member's language.
3. **Given** a formatted cell, **When** the user edits it, **Then** the editor shows the plain value (12500, not "EGP 12,500.00").
4. **Given** a value that doesn't fit the format (text in a Currency cell), **Then** it shows as typed, with no error.
5. **Given** "Increase decimal" or "Decrease decimal", **Then** the shown decimal places change by one.

---

### User Story 3 - Comments on cells (Priority: P1)

A designer right-clicks a cell, picks **New Comment**, and writes "@Rana is this the final headline?". Rana gets a notification, opens the sheet at that cell, and replies. When it's settled, Rana resolves the thread. A small purple marker in the cell's corner shows a cell has comments, and hovering shows them.

**Why this priority**: The user asked for comments specifically. Today, talk about a sheet happens elsewhere and loses the link to the cell.

**Independent Test**: Comment on a cell with an @mention, reply as the mentioned member, then resolve. Check the marker, the notification, the reply and the resolved state.

**Acceptance Scenarios**:

1. **Given** a cell, **When** the user picks New Comment (right-click, Ctrl/Cmd+Alt+M, or the toolbar), **Then** a comment box opens beside the cell. Saving it adds a marker to the cell's corner.
2. **Given** a cell with comments, **When** a member hovers over it or selects it, **Then** the thread shows: author, time, text and replies.
3. **Given** a thread, **When** a member replies, edits their own comment or deletes their own comment, **Then** everyone sees the change.
4. **Given** a comment with an @mention, **Then** the mentioned member is notified, and the notification opens the sheet at that cell.
5. **Given** a thread, **When** a member resolves it, **Then** the marker disappears and the thread moves to the sheet's comments panel under "Resolved". Reopening brings it back.
6. **Given** the sheet's comments panel, **Then** it lists every open thread in the sheet. Choosing one jumps to its cell.
7. **Given** a row or column with commented cells is deleted, **Then** its threads are deleted too, and Undo brings them back.

---

### User Story 4 - Excel's editing tools (Priority: P2)

A member uses Excel's everyday tools:
- **Format Painter** copies the header's look to another row.
- **Paste Special › Values** pastes without formatting.
- **Clear formats** strips a block back to plain text.
- **Fill down** repeats a value.
- **Find and Replace** swaps "Q3" for "Q4" across the sheet.
- **Hide** a helper column.
- **Freeze** the top row and first column.

**Why this priority**: These make formatting practical on real sheets, but each can ship after the core formatting.

**Independent Test**: Use each tool once on a sample sheet and check the result, then undo each one.

**Acceptance Scenarios**:

1. **Given** a formatted cell, **When** the user picks Format Painter and then a target block, **Then** the target takes the formatting but keeps its values. A double-click keeps the painter on until Esc.
2. **Given** copied cells, **When** the user picks Paste Special › Values only, Formats only, or Transpose, **Then** only that part is pasted.
3. **Given** a selection, **When** the user picks Clear › All, Formats, Contents or Comments, **Then** only that part is cleared.
4. **Given** a selection, **When** the user picks Fill Down or Fill Right (Ctrl/Cmd+D, Ctrl/Cmd+R), **Then** the first row or column is copied, with its formatting, into the rest.
5. **Given** Find and Replace (Ctrl/Cmd+F, Ctrl/Cmd+H), **When** the user searches, **Then** matches are found one by one, with match case and whole cell options. Replace and Replace all change the values.
6. **Given** rows or columns, **When** the user hides them, **Then** they disappear and a marker shows where they are. Unhide brings them back.
7. **Given** Freeze Panes, **When** the user freezes the top row, the first column, or at the selection, **Then** those rows and columns stay in view while scrolling.
8. **Given** any of these, **Then** Undo reverses it as one step.

---

### User Story 5 - Sort, filter, styles and conditional formatting (Priority: P3)

A member turns the plan into a table with **Format as Table**, which gives banded rows, a bold header and filter buttons. They filter Status to "Late", sort by date, and add a **conditional format** that fills cells red when "Due" is before today.

**Why this priority**: These complete Excel's Home tab, but they're the most complex part and the least used.

**Independent Test**: Format a range as a table, filter and sort it, and add a conditional format rule. Check that the rule follows edits.

**Acceptance Scenarios**:

1. **Given** a range, **When** the user picks a cell style (Good, Bad, Neutral, Heading 1–4, Title, Total, Note), **Then** the cells take that style's font, fill and border.
2. **Given** a range, **When** the user picks Format as Table with a colour style, **Then** it gets a header row, banded rows and filter buttons in the header.
3. **Given** a table or a selected range, **When** the user sorts A→Z, Z→A, oldest→newest or by colour, **Then** whole rows move together, with their formatting and comments.
4. **Given** filter buttons, **When** the user ticks values, filters by colour or uses a text or number condition, **Then** non-matching rows are hidden until the filter is cleared.
5. **Given** a range, **When** the user adds a conditional format rule ("greater than", "less than", "between", "equal to", "text contains", "date is before today", "duplicate values", data bars, colour scales), **Then** matching cells show the rule's look, and change as the values change.
6. **Given** rules on a sheet, **When** the user opens Manage Rules, **Then** they can edit, reorder and delete them.

---

### Edge Cases

- **Linked sheets (Content and Video):**
  - formatting belongs to the task's cell in that sheet, so it follows the task when rows are regrouped or re-sorted;
  - a task that leaves the sheet (dropped, archived, deleted) takes its formatting and comments with it, and they come back if it does;
  - built-in coloured cells (status, editor, type and choice pills) keep their own colours, and a fill shows around them;
  - merged cells aren't offered there, because each row is a task.
- **Protected sheets:** only the protector and admins may change formatting. Everyone may still comment, as in Excel, where comments can be allowed on a protected sheet.
- **Merged cells and other actions:**
  - selecting a merged cell selects the whole merge;
  - sorting and filtering across merged cells is refused, with a reason;
  - inserting a row inside a merge extends it.
- **Large ranges:** formatting a whole column or the whole sheet (Ctrl+A) is one action, done in under a second, and one undo step.
- **Pasting from Excel:** styles Momentum can't show (gradients, patterns, pictures, sparklines) are dropped silently. Values and the styles it supports are kept.
- **Copying out:** copying a formatted block gives Excel the formatting it can read. Number formats travel as the shown text.
- **Fonts:** only a set list of web-safe and Google fonts. A pasted font that isn't in the list falls back to the default.
- **Comments:**
  - on hidden rows or columns, they stay, and show in the comments panel;
  - on a deleted sheet, they are deleted with it;
  - a member can only edit or delete their own comments; admins can delete any.
- **Arabic:** in right-to-left, "left" and "right" alignment mirror, as in Excel's right-to-left sheets. Number and date formats follow the member's language.
- **Phones:** formatting is in a compact toolbar sheet. Comments open full-screen.

## Requirements *(mandatory)*

### Functional Requirements

**Toolbar**

- **FR-001**: Blank sheets MUST have a formatting toolbar above the grid, grouped like Excel's Home tab: Clipboard, Font, Alignment, Number, Styles, Cells, Editing. Each control acts on the current selection.
- **FR-002**: Each control MUST show the selection's current state (for example Bold is pressed when the active cell is bold), and MUST be reachable by keyboard with a visible label.
- **FR-003**: The usual Excel shortcuts MUST work:
  - Ctrl/Cmd+B, I, U and 5 for bold, italic, underline and strikethrough;
  - Ctrl+Shift+$, %, # and ! for currency, percentage, date and number;
  - Ctrl/Cmd+D and Ctrl/Cmd+R for fill down and fill right;
  - Ctrl/Cmd+F and Ctrl/Cmd+H for find and replace;
  - Ctrl/Cmd+Alt+M for a new comment.

**Font, fill, borders, alignment**

- **FR-010**: Cells MUST support:
  - a typeface, from a set list;
  - a size, 6–72 pt;
  - bold, italic, underline (single or double) and strikethrough;
  - a text colour and a fill colour, from Excel's theme and standard palette plus a custom colour.
- **FR-011**: Cells MUST support borders on each side, in thin, medium, thick, dashed, dotted or double, in any colour, with Excel's presets.
- **FR-012**: Cells MUST support:
  - horizontal alignment (general, left, centre, right, justify);
  - vertical alignment (top, middle, bottom);
  - wrap text;
  - indent, 0–15 levels;
  - text rotation (horizontal, angled up or down, vertical).
- **FR-013**: Users MUST be able to Merge & Centre, Merge Across, Merge Cells and Unmerge. Merging a block that holds more than one value MUST warn first.

**Number formats**

- **FR-020**: Cells MUST support General, Number, Currency (EGP, USD, EUR, GBP, SAR, AED), Accounting, Percentage, Scientific, Short date, Long date, Time, and Text.
- **FR-021**: Each format MUST offer decimal places (0–10) and, for Number and Currency, the thousands separator, plus a negative style (−1,234 or (1,234), optionally in red).
- **FR-022**: Users MUST be able to enter a custom date pattern (for example `dd/mm/yyyy`, `ddd d mmm`).
- **FR-023**: A format MUST change only how the value is shown. The editor and copy-out MUST use the value as typed.

**Styles**

- **FR-030**: There MUST be ready-made cell styles: Normal, Good, Bad, Neutral, Title, Heading 1–4, Total, Note, Input, Output, Accent 1–6.
- **FR-031**: Format as Table MUST give a range a header row, banded rows, filter buttons and a choice of colour styles, and MUST be removable ("Convert to range").
- **FR-032**: Conditional formatting MUST support highlight rules (greater than, less than, between, equal to, text contains, date occurring, duplicate or unique values), top/bottom rules, data bars and colour scales. Rules MUST be manageable: edit, reorder, delete.

**Editing tools**

- **FR-040**: Format Painter MUST copy formatting from the selection to a target. A double-click MUST keep it on until Esc.
- **FR-041**: Paste Special MUST offer All, Values only, Formats only, Comments only, and Transpose. A normal paste MUST keep the formatting that comes with it.
- **FR-042**: Clear MUST offer All, Formats, Contents and Comments.
- **FR-043**: Fill Down and Fill Right MUST copy values and formatting.
- **FR-044**: Find and Replace MUST search the sheet's values, with match case and whole cell. It MUST step through matches, and MUST offer Replace and Replace all.
- **FR-045**: Sort MUST reorder whole rows, by one or more columns, A→Z or Z→A, by date, or by colour. A header row MUST be detected or chosen.
- **FR-046**: Filter MUST hide rows by values, by colour, or by text, number or date conditions. It MUST show which columns are filtered, and MUST be clearable.
- **FR-047**: Users MUST be able to hide and unhide rows and columns, and freeze rows and columns (top row, first column, or at the selection).
- **FR-048**: Every formatting, editing-tool and comment action MUST be one undo step, and MUST save on its own, like spec 013's edits.

**Comments**

- **FR-050**: Any member who can open a sheet MUST be able to add a threaded comment to a cell, reply, edit or delete their own, and resolve or reopen a thread.
- **FR-051**: Cells with open threads MUST show a marker in the corner. Hovering or selecting MUST show the thread.
- **FR-052**: @mentions in a comment MUST notify the member (spec 012), and the notification MUST open the sheet at that cell. Comments are visible to everyone who can open the sheet.
- **FR-053**: Each sheet MUST have a comments panel listing open and resolved threads, newest first. Choosing a thread MUST select its cell.
- **FR-054**: Comments MUST move with their cell when rows or columns are inserted, deleted, sorted or moved. Deleting a cell's row or column MUST delete its threads, and undo MUST restore them.

**Shared rules**

- **FR-060**: Formatting MUST survive reloads, and MUST be seen by every member.
- **FR-061**: On a protected sheet, only its protector and admins MAY change formatting. Comments MUST stay open to everyone.
- **FR-062**: Every control, menu, dialog and comment MUST work with the keyboard and a screen reader, and MUST be available in English and Arabic, with right-to-left mirroring.

**Content and Video sheets**

- **FR-070**: Formatting and comments MUST work on the Content and Video sheets as on blank sheets, with the exceptions below.
- **FR-071**: There, formatting and comments MUST belong to the task's cell in that sheet. They MUST follow the task through regrouping, sorting and filtering, and leave and return with it when it's dropped or archived and restored.
- **FR-072**: Formatting on those sheets MUST be open to every member, like the team's own columns (spec 013 R8). It MUST NOT change the task's data, and editing the task's fields keeps today's rule.
- **FR-073**: Built-in coloured cells (status, editor, type and choice pills) MUST keep their own colours. A fill shows around them, not instead of them.
- **FR-074**: Merge is not offered on those sheets, and the Merge controls say why.
- **FR-075**: On those sheets, sort and filter MUST work within their groups (a video's clips, a theme's pieces) and MUST NOT change the board's own order. Fill Down and Find and Replace MUST change task fields through the same rules as typing, and skip, with a count, the cells a member can't edit.

### Key Entities

- **Cell format**:
  - font (typeface, size, bold, italic, underline, strikethrough, colour);
  - fill;
  - borders per side;
  - alignment (horizontal, vertical, wrap, indent, rotation);
  - number format.

  Cells that share a look share one format.
- **Merge**: a rectangle of cells shown as one, anchored on its top-left cell.
- **Table**: a range with a header row, banded rows, a colour style and filters.
- **Conditional format rule**: a range, a condition, and a look, in an order.
- **Sheet view settings**: frozen rows and columns, hidden rows and columns, the active filter.
- **Comment thread**: a cell, open or resolved, and a list of comments (author, time, text, mentions, edited). On a blank sheet the cell is a row and column; on the Content and Video sheets it is a task and column.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A member can make a header row bold, white on a coloured fill, centred, with a bottom border, in under 20 seconds.
- **SC-002**: Applying any format to 10,000 cells (for example a whole column) takes under 1 second, and can be undone in one step.
- **SC-003**: A formatted table copied from Excel or Google Sheets keeps its bold, italic, colours, fills and alignment in at least 95% of cells.
- **SC-004**: A member mentioned in a comment sees the notification within 1 minute, and can open the cell in one click.
- **SC-005**: Formatting and comments are identical after a reload, and for every other member, every time.
- **SC-006**: An automated accessibility check finds no serious or critical issues in the toolbar, menus, dialogs or comments, in English and Arabic.

## Assumptions

- **Every sheet** gets this feature: blank sheets fully, and the Content and Video sheets with the rules in FR-070–FR-075.
- **Delivery in three stages**, each independently usable:
  1. stories 1–3: font, fill, borders, alignment, number formats, comments;
  2. story 4: the editing tools;
  3. story 5: sort, filter, cell styles, tables, conditional formatting.
- **Comments are visible to everyone who can open the sheet**, as in Excel and Google Sheets. Only the author can edit a comment; the author and admins can delete it.
- **No formulas or calculation**, as in spec 013. So there's no AutoSum, no "Total" row maths and no formula-based conditional rules. Number formats change only how a value looks.
- **Comments follow Excel's modern threaded comments**, not old-style Notes. "Note" in Excel maps to a comment here.
- **Fonts** are a set list of about 12 widely available faces (including Arial, Calibri-like, Inter, Montserrat and an Arabic face), because a browser can't use a member's installed fonts reliably.
- **Colours** offer Excel's 10 theme colours with tints, 10 standard colours, and a custom colour picker.
- **Excel features left out:** charts, pictures, shapes, sparklines, pivot tables, data validation lists, hyperlink cells beyond plain links, and print layout.
