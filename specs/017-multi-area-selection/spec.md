# Feature Specification: Select Separate Cells with Ctrl+Click

**Feature Branch**: `claude/nice-noether-x4rgei`

**Created**: 2026-11-16

**Status**: Draft

**Input**: User description: "I need the selection of multiple cells using ctrl + click as the excel sheet"

## Context

Today a sheet selection is one block. Drag, Shift+click, Shift+arrows, the column letters and the row numbers all grow or replace that one block (spec 013 FR-010–FR-012).

In Excel, Ctrl+click (Cmd+click on a Mac) adds another block without losing the first. A member can pick B2, E5 and the whole of column G, then make them all bold or clear them in one step. Momentum members expect the same.

This applies to every sheet that uses the shared grid: blank sheets and the linked Content and Video sheets.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Pick separate cells and blocks (Priority: P1)

A member clicks B2, then holds Ctrl (Cmd on a Mac) and clicks E5. Then they hold Ctrl and drag from B8 to D9. All three are selected. Each one is highlighted, and the cell clicked last is the active cell. The status line reads "B2, E5, B8:D9 · 3 areas, 8 cells".

**Why this priority**: Nothing else in this feature works without it.

**Independent Test**: Make the selection above on a blank sheet. All 8 cells show as selected, E5's selection survives the drag, and the status line gives the area and cell counts.

**Acceptance Scenarios**:

1. **Given** B2 is selected, **When** the member Ctrl+clicks E5, **Then** both B2 and E5 are selected and E5 is the active cell.
2. **Given** two areas are selected, **When** the member Ctrl+drags across B8:D9, **Then** a third area B8:D9 is added and the first two stay.
3. **Given** several areas, **When** the member Ctrl+clicks column letter G (or row number 12 on a blank sheet), **Then** the whole column (or row) is added as one more area.
4. **Given** several areas, **When** the member Shift+clicks a cell or presses Shift+arrow keys, **Then** only the newest area changes size; the others stay.
5. **Given** several areas, **When** the member clicks any cell without Ctrl, or presses an arrow key without Shift, **Then** the selection goes back to one cell.
6. **Given** a selected cell inside any area, **When** the member Ctrl+clicks it, **Then** that cell is removed from the selection and the rest of its area stays selected. Ctrl+dragging over selected cells removes that whole block.
7. **Given** Ctrl+A, **When** pressed with several areas, **Then** the whole sheet becomes one area, as today.

---

### User Story 2 - Change every area at once (Priority: P1)

With several areas selected, the member uses the tools they already know. Each one applies to every selected cell in one step, and one undo reverts it.

**Why this priority**: This is why people pick separate cells.

**Independent Test**: Select B2, E5 and B8:D9. Make them bold, set a fill colour, then press Delete. Every one of the 8 cells changes and no other cell does. Undo three times: each step reverts all 8 cells together.

**Acceptance Scenarios**:

1. **Given** several areas, **When** the member applies any cell format (bold, italic, font, size, colours, alignment, wrap, number format, cell style, Format Painter's paste, Clear formats), **Then** every selected cell changes and one undo reverts all of them.
2. **Given** several areas, **When** the member applies a border preset, **Then** each area gets the preset as if it had been selected alone. "Outside borders" outlines each area separately.
3. **Given** several areas, **When** the member presses Delete or Backspace, or uses Clear contents, Clear all or Clear comments, **Then** every selected cell is cleared in one undo step.
4. **Given** several areas on a linked sheet (Content or Video), **When** the member clears them or changes their format, **Then** the changes save as they do for one block. Cells the member may not edit are skipped with the usual "not changed" message.
5. **Given** several areas, **When** the member types a value and presses Ctrl+Enter, **Then** that value goes into every selected cell, as in Excel.
6. **Given** several whole rows (or several whole columns) selected as separate areas, **When** the member uses Hide, Resize or Delete from the row (column) menu, **Then** it applies to all of the selected rows (columns).

---

### User Story 3 - Copy and paste with several areas (Priority: P2)

Copy, cut and paste follow Excel's rules for several areas.

**Why this priority**: People copy what they selected. When the copy can't work, they need to know why.

**Independent Test**: Select B2:B5 and D2:D5, copy, paste into a new sheet: you get a 2-column block. Select B2 and E9, copy: a message explains why that can't be copied.

**Acceptance Scenarios**:

1. **Given** areas that cover the same rows (B2:B5 and D2:D5), **When** the member copies, **Then** the clipboard holds one block of the areas side by side, in column order, with their formats. The same goes for areas that cover the same columns: they are stacked in row order.
2. **Given** areas that don't line up, **When** the member copies, **Then** nothing is copied and a message reads: "These areas can't be copied together. Pick areas that share the same rows or the same columns."
3. **Given** several areas, **When** the member cuts, **Then** nothing is cut and a message reads: "Cut works on one area. Click a cell without Ctrl to start again."
4. **Given** one copied cell, **When** the member pastes onto several areas, **Then** that value (and its format) goes into every selected cell.
5. **Given** a copied block bigger than one cell, **When** the member pastes onto several areas, **Then** nothing changes and a message explains that a block pastes into one area.

---

### User Story 4 - Tools that need one area say so (Priority: P2)

Some tools only make sense on one block: Merge, Sort, Filter, Format as Table, Fill Down/Right, Paste Special, a new conditional formatting rule, Insert rows/columns, and Board ▾ → Create tasks for rows.

**Why this priority**: Without this, those tools would quietly use only one of the areas, and the member wouldn't know.

**Independent Test**: Select two areas, open Sort & Filter. Its items are disabled with the reason shown.

**Acceptance Scenarios**:

1. **Given** several areas, **When** the member opens a toolbar menu or the cell menu, **Then** the tools above are disabled and show "Works on one area. Click a cell without Ctrl to start again."
2. **Given** several areas, **When** the member uses a keyboard shortcut for one of them (Ctrl+D, Ctrl+R, Ctrl+Shift+L, Ctrl+Shift+V), **Then** nothing changes and the same message shows.

---

### User Story 5 - Add areas from the keyboard (Priority: P3)

A member who uses the keyboard presses Shift+F8, as in Excel. The status line shows "Add to selection". Arrow keys now move the active cell without dropping the selected areas. Shift+arrows start a new area from there. Shift+F8 or Escape ends the mode.

**Why this priority**: Keyboard users need a way to do what Ctrl+click does.

**Independent Test**: Using only the keyboard, select B2:C3 and E5:E6, then make them bold.

**Acceptance Scenarios**:

1. **Given** Add to selection is on, **When** the member presses arrows and then Shift+arrows, **Then** a new area is added and the earlier ones stay.
2. **Given** Add to selection is on, **When** the member presses Shift+F8 or Escape, **Then** the mode ends and the selection stays.
3. **Given** several areas, **When** a screen reader is running, **Then** it announces the areas and cell count, as it does for one block today.

### Edge Cases

- A Ctrl+click on a merged cell adds the whole merge, as a click does today.
- Areas that overlap: a cell in two areas counts once in the status line and is changed once.
- On a Mac, Cmd+click adds an area. Ctrl+click there opens the cell menu, as the system does.
- Right-clicking a cell inside the selection opens the menu for the whole selection. Right-clicking outside it selects just that cell first, as today.
- A filtered sheet: hidden rows inside an area are not changed, matching what one block does today.
- Phones and tablets have no Ctrl key. Touch selection stays as it is today; adding areas by touch is out of scope.
- A protected (read-only) sheet still allows selecting and copying several areas. Changes are refused with the usual message.
- Up to 100 areas. A Ctrl+click past that shows "You can select up to 100 areas."
- When the sheet changes under the selection (rows deleted by someone else), areas that no longer exist are dropped and the rest stay.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Ctrl+click (Cmd+click on a Mac) on a cell MUST add that cell as a new area and make it the active cell, keeping the existing areas.
- **FR-002**: Ctrl+drag (Cmd+drag) MUST add the dragged block as a new area. The edges of the sheet scroll as they do for a normal drag.
- **FR-003**: Ctrl+click on a column letter, or on a row number of a blank sheet, MUST add that whole column or row as a new area.
- **FR-004**: Shift+click and Shift+arrow (including Ctrl+Shift+arrow) MUST change only the newest area.
- **FR-005**: A click, arrow key, Home/End, Page Up/Down or Tab without the modifiers MUST go back to one area, as today.
- **FR-006**: Ctrl+click on a selected cell MUST remove that cell from the selection. Ctrl+drag that starts on a selected cell MUST remove the dragged block. The active cell moves to the nearest cell still selected. If none is left, the clicked cell becomes the only selection.
- **FR-007**: Every area MUST be highlighted the same way a block is today. The column letters and row numbers of every area MUST be highlighted. The active cell keeps its outline.
- **FR-008**: The status line MUST show the areas (up to 3 named, then "+N more") and the cell count, e.g. "B2, E5, B8:D9 · 3 areas, 8 cells". Overlapping cells count once.
- **FR-009**: Cell formatting, border presets (applied per area), Format Painter, Clear (contents, formats, all, comments), Delete/Backspace, and Clear rules in selection MUST apply to every selected cell as one undo step, on blank and linked sheets.
- **FR-010**: Typing in the active cell and pressing Ctrl+Enter MUST write the value into every selected cell as one undo step. This also applies to one block.
- **FR-011**: Copy MUST work when all areas cover the same rows (placed side by side) or the same columns (stacked), and MUST otherwise show the message in US3 and copy nothing. Cut with several areas MUST show the message in US3 and cut nothing.
- **FR-012**: A paste of one cell onto several areas MUST fill every selected cell. A paste of a larger block onto several areas MUST change nothing and show a message.
- **FR-013**: Hide, Unhide, Resize and Delete for rows (columns) MUST apply to every selected row (column) when every area is a set of whole rows (whole columns).
- **FR-014**: Merge, Sort, Filter, Format as Table, Fill Down/Right, Paste Special, a new conditional formatting rule, Insert rows/columns, and Create tasks for rows MUST be disabled with the reason "Works on one area. Click a cell without Ctrl to start again." Their keyboard shortcuts MUST show that reason and change nothing.
- **FR-015**: Shift+F8 MUST turn Add to selection on and off, as described in US5. Escape MUST also turn it off. The status line MUST show when it is on.
- **FR-016**: The grid MUST tell screen readers the selected areas and cell count when the selection changes.
- **FR-017**: The selection MUST hold at most 100 areas.
- **FR-018**: All new messages and labels MUST exist in English and Arabic, and areas MUST work in right-to-left sheets.

### Key Entities

- **Selection**: An ordered list of areas, each a block of cells (top-left and bottom-right). The newest area is last and holds the active cell. The selection is not saved; it lasts while the sheet is open, as today.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A member can select three separate areas and make them bold in under 10 seconds, with one undo step to revert.
- **SC-002**: Every shortcut and tool listed in FR-009 to FR-014 behaves as listed in automated checks on a blank sheet and on the Content sheet.
- **SC-003**: With 100 areas on a 2,000-row sheet, highlighting the selection after a Ctrl+click takes under 50 ms.
- **SC-004**: Everything that worked with one block (spec 013, 015 and 016 checks) still passes unchanged.
- **SC-005**: Keyboard-only users can build and use a multi-area selection (US5) with no mouse.

## Assumptions

- The behaviour follows Microsoft Excel for the desktop, including Ctrl+click to deselect cells (Excel 365).
- Formulas are out of scope, as for the rest of the sheets.
- Adding areas by touch is out of scope.
- The selection isn't shared with other people and isn't kept after a reload.
