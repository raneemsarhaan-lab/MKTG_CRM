# Feature Specification: Spreadsheet-Style Sheet Toolbar

**Feature Branch**: `claude/nice-noether-x4rgei`

**Created**: 2026-11-16

**Status**: Draft (design awaiting approval)

**Input**: User description: "can we have same UI experience for the sheet formatting option" (with a screenshot of the Google Sheets header: a menu bar, then one rounded toolbar strip)

**Design**: [design/sheet-toolbar.html](../../design/sheet-toolbar.html)

## Context

Today the sheet header has two parts:

- A workbook row with undo, redo, the selection text, Board ▾ and Comments.
- A long formatting toolbar of grouped buttons and ▾ menus. It was built across spec 015 stages 1–3.

People know the Google Sheets header, and want the sheets to feel the same:

- a menu bar (File, Edit, View, Insert, Format, Data, Help);
- one rounded strip with the everyday tools, in the usual order;
- a name box beside the cell's content.

This is a layout change. **No tool is added or removed.** Every command keeps its shortcut, its undo and its permission rules.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - The familiar toolbar strip (Priority: P1)

A member opens a sheet and finds the tools where Google Sheets puts them, in one rounded strip:

1. find, undo, redo, Format Painter;
2. currency, percent, fewer decimals, more decimals, number formats ▾;
3. font ▾;
4. size − / +;
5. bold, italic, strikethrough, text colour ▾;
6. fill ▾, borders ▾, merge ▾;
7. horizontal align ▾, vertical align ▾, wrapping ▾, rotation ▾;
8. comment, filter.

**Independent Test**: On a blank sheet, make a cell EGP currency with 0 decimals, bold, a yellow fill, centred, middle-aligned and wrapped, using only the strip. Every change saves, and each undoes in one step.

**Acceptance Scenarios**:

1. **Given** a sheet is open, **When** the member looks at the header, **Then** one strip holds the tools above, in that order. It shows the active cell's state: B pressed, the font name, the size, and the colour bars.
2. **Given** the active cell is size 10, **When** the member clicks +, **Then** it becomes 11. **When** they click −, it goes back to 10. They can also type a size into the box.
3. **Given** the align ▾ is opened, **When** the member picks Center, **Then** the cell centres and the button's icon shows centre. The same applies to vertical align, wrapping (Overflow, Wrap, Clip) and rotation.
4. **Given** a window too narrow for every group, **When** the sheet opens, **Then** the lowest-priority groups go under a ⋮ button at the end, and nothing wraps to a second line.

---

### User Story 2 - The menu bar (Priority: P1)

Above the strip, the menu bar holds every command, including those that today sit only in toolbar ▾ menus.

**Independent Test**: Use only the menu bar to do each of these: Paste special › values, Fill down, Freeze › 1 row, Hide columns, Format › Conditional formatting, Data › Create a filter, Insert › Row above.

**Acceptance Scenarios**:

1. **Given** the menu bar, **When** the member opens each menu, **Then** they find these items, each with its shortcut shown:
   - **File**: new, duplicate, rename, protect, hide and delete a sheet.
   - **Edit**: undo, redo, cut, copy, paste, Paste special ›, Fill down and right, Find and replace, Clear ›.
   - **View**: Freeze ›, hide and unhide, row height, column width.
   - **Insert**: rows, columns, comment.
   - **Format**: Number ›, Text ›, Alignment › (with indent), Wrapping ›, Rotation ›, Font size ›, Merge ›, Cell styles, Format as table, Conditional formatting, Format cells, Clear formatting.
   - **Data**: sorts, filter, and the Board items.
   - **Help**: keyboard shortcuts.
2. **Given** a menu is open, **When** the member uses the arrow keys, **Then** focus moves through the items and into submenus. Enter runs the item, and Escape closes the menu. Alt+/ (Option+/ on a Mac) searches the menus by name.
3. **Given** a linked sheet or several areas (spec 017), **When** a menu item doesn't apply, **Then** it is disabled and shows its reason, as the toolbar does today.

---

### User Story 3 - Name box and cell bar (Priority: P2)

Under the strip:

- a **name box** shows the selection ("B8:D9", or "3 areas");
- a **cell bar** shows the active cell's content;
- the **cell count** sits at the end.

**Independent Test**: Select B8:D9: the name box reads B8:D9 and the count reads 6 cells. Type D20 into the name box and press Enter: D20 is selected. Click the cell bar, change the text and press Enter: the cell saves, with one undo step.

**Acceptance Scenarios**:

1. **Given** a selection, **When** it changes, **Then** the name box, the cell bar and the count update. This replaces today's selection text.
2. **Given** the name box, **When** the member types a cell or range ("D20", "B2:C5") and presses Enter, **Then** it is selected. Text that isn't a cell or range is refused with a short note.
3. **Given** the cell bar, **When** the member edits it and presses Enter (or Alt+Enter for a line break), **Then** the active cell saves through the same path as typing in the cell. Escape cancels the edit.
4. **Given** a linked sheet, **When** the active cell is a field that can't be typed into (stage, person), **Then** the cell bar shows the value but is read-only, with the usual note.

### Edge Cases

- **Arabic.** The bar, the strip and the menus mirror, and the shortcuts read the same.
- **Phones.** The phone keeps the Format sheet at the bottom (spec 015). The menu bar is hidden there; the ⋮ in the workbook row opens the same commands.
- **Protected sheet.** Every changing item is disabled with "🔒 …", as now. Find, Copy and the View items still work.
- **Format Painter.** A single click paints once; a double click keeps painting, as now.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The sheet header MUST have, top to bottom:
  - a title row: name, save status, Board ▾ and Comments;
  - a menu bar;
  - one rounded toolbar strip;
  - a name box and cell bar row.
- **FR-002**: The strip MUST hold the groups in US1's order, show the active cell's state, and send the same commands as today, so each is one undo step.
- **FR-003**: The strip MUST NOT wrap. When it doesn't fit, its lowest-priority groups MUST move into a ⋮ menu, in this order of first to go: comment and filter, then number tools, then font and alignment, then fill and borders.
- **FR-004**: The menu bar MUST offer every command listed in US2, show each item's shortcut, support full keyboard use (arrows, Enter, Escape, submenus), and disable items with their reason.
- **FR-005**: Every command available today MUST stay reachable. Each is either on the strip, in a menu, or both.
- **FR-006**: Font size MUST have − and + buttons around an editable size box (6–96).
- **FR-007**: Horizontal align, vertical align, wrapping (Overflow, Wrap, Clip) and rotation MUST each be one ▾ button whose icon shows the current choice.
- **FR-008**: The name box MUST show the selection and jump to a typed cell or range. The cell bar MUST show the active cell's text and save edits through the existing commit path. The count MUST show the selected cells.
- **FR-009**: Blank, Content and Video sheets MUST share the header. Phones keep the Format sheet.
- **FR-010**: All labels MUST exist in English and Arabic. The layout MUST mirror in Arabic and meet the existing accessibility checks (roles: menubar, menu, toolbar; axe clean).

## Success Criteria *(mandatory)*

- **SC-001**: The US1 independent test is done with the strip alone, in under 20 seconds.
- **SC-002**: Every command in today's toolbar can be found in the new header. This is checked in an automated test that walks the old list.
- **SC-003**: Every spec 013–017 lab passes after the change, with only selector updates where a button moved.
- **SC-004**: axe finds no serious or critical issue on the header, the menus or the ⋮ menu, in English and Arabic.

## Assumptions

- Zoom, print, charts and functions are not part of Momentum sheets, so they are left out. The Gemini and Extensions menus are left out too.
- Colour pickers, the border picker, Format Cells, the Conditional formatting dialogs and the Paste Special dialog stay as they are; only how they are opened changes.
- Underline stays available as Ctrl+U and under Format › Text, as in Google Sheets.
