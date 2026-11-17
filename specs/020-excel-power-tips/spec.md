# Feature Specification: Excel Power Tips in the Sheets

**Feature Branch**: `claude/nice-noether-x4rgei`

**Created**: 2026-11-17

**Status**: Draft (clarified)

**Input**: User description: "all these hacks". Implement the tips in the attached reference *100 Excel Tips and Tricks*: 120 tips in eleven areas (navigation, data entry, formatting, formulas, lookups, text and dates, cleanup, tables, pivots and charts, productivity, mouse hacks).

## Context

The sheets already behave much like a spreadsheet (specs 013–019). About a third of the reference's tips already work and are listed in **Already available** below.

This feature adds the rest of the everyday power moves people expect from Excel, in two kinds of sheet:

- **Team sheets**: every tip that makes sense for a sheet.
- **Content and Video sheets**: the tips that apply to cells you can type in. These are navigation, selection, fill, status-bar math and drop-down picks. Structure tips do not apply there: moving cells with the mouse, removing duplicates and grouping rows would rearrange the board's tasks. In these sheets, a value a member types still goes through the board's rules.

Spec 013 decided that the sheets have no formulas.

- **Formulas:** tips 31–60 and 72 are formula functions, and 79 and the formula rule in 27 need formulas too. They are left to a later formulas spec. Where a formula-free tool does the same job, it is in this spec.
- **Pivots and charts:** tips 81–90 and 115–116 are out of scope.

### Already available (no new work)

| Tip | Where |
|---|---|
| 1–3 Ctrl+Arrow, Ctrl+Shift+Arrow, Ctrl+Home/End | grid keys |
| 4 Ctrl+A | grid keys |
| 5 Ctrl+PageUp/PageDown between sheets | workbook keys |
| 6 Name Box | spec 018 |
| 9 Freeze panes | spec 015 |
| 10 List all sheets | ≡ button by the tabs |
| 11 Ctrl+Enter | spec 017 |
| 12 Ctrl+D / Ctrl+R | spec 015 |
| 16 Alt+Enter | grid editor |
| 18 Drop-downs, partly | Choice columns on the Content and Video sheets; team sheets have none |
| 21 Ctrl+1 | spec 015 |
| 22 Format Painter, repeated | spec 015 |
| 23 Currency and percent | Ctrl+Shift+4/5 only |
| 28 Data bars and color scales | spec 015 stage 3 (icon sets are new) |
| 29 Cell styles | spec 015 stage 3 |
| 30 Autofit by double-clicking the border | grid |
| 63 Find and Replace | spec 015 (wildcards are new) |
| 64–65 Paste values, transpose | spec 015 |
| 71 Tables | spec 015 stage 3, from the menu |
| 75 Ctrl+Shift+L | spec 015 stage 3 |
| 76–77 Multi-level sort, sort by color | spec 015 stage 3 |
| 109 Reorder columns by dragging | spec 019 |
| 118 Ctrl+click and Shift+F8 | spec 017 |

## Clarifications

### Session 2026-11-17

- **Q: Formulas (tips 27 formula rule, 31–60, 72, 79)?**
  A: **Later, in their own spec.**
  - This spec adds no formula engine.
  - Its formula-free tools stay in it:
    - status-bar math (38);
    - table total rows (73, 79);
    - one-click cleanup and case tools (54, 55);
    - date series by fill (in place of 57, 60);
    - split to columns (52, 62).
  - The formula tips (27's formula rule, 31–37, 39–51, 53, 56–60, 72) wait for the formulas spec.
- **Q: Pivots and charts (tips 81–90, 115–116)?**
  A: **Not now.** These tips are out of scope.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Keyboard and view moves (Priority: P1)

A member works without the mouse:

- **Shift+Space** selects the row and **Ctrl+Space** the column (tip 8).
- **F5 → Special** (also Edit › Go to special) selects blanks, filled cells, or visible cells only (tips 7, 68, 70).
- **F4** repeats the last action, such as insert row, apply format or fill (tip 93).
- **Double-clicking a cell's edge** jumps to the last filled cell that way, like Ctrl+Arrow (tip 113).
- **Ctrl+mouse wheel** zooms the sheet, and **Shift+wheel** scrolls sideways (tips 119–120).
- **Ctrl+F1** collapses the toolbar strip (tip 98).
- **Alt** shows a key letter on each menu so the menu bar can be driven by keys (tip 92).

**Independent Test**:

1. In a 200-row sheet with gaps, press F5 → Special → Blanks. Only the empty cells in the used area are selected.
2. Type "TBD" and press Ctrl+Enter. All of them fill, as one undo step.
3. Insert a row, move, and press F4. Another row is inserted.

**Acceptance Scenarios**:

1. **Given** a selection, **When** Go to special → Blanks runs, **Then** the empty cells inside the sheet's used area become the selection, as several areas (spec 017), and the count shows in the status bar.
2. **Given** filtered or hidden rows, **When** Go to special → Visible cells only runs and the cells are copied, **Then** only the visible rows are copied.
3. **Given** the last action was a structure or format change, **When** F4 is pressed, **Then** the same action applies to the current selection. **When** nothing repeatable happened, **Then** F4 does nothing.
4. **Given** zoom changes with Ctrl+wheel, **Then** it runs from 50% to 200% in steps, is kept for that member and sheet, and Ctrl+0 resets it.

---

### User Story 2 - The fill handle and quick entry (Priority: P1)

The selected block has a **fill handle** in its corner (tips 13, 101–106).

- **Dragging the handle** copies values, or continues a series: numbers, a step from two values, dates, months, weekdays, and the team's own lists (tip 17).
- **The Auto Fill Options button** that appears afterwards switches between Copy cells, Fill series, Fill formatting only, Fill without formatting, and Fill weekdays.
- **Double-clicking the handle** fills down to the end of the data in the next column.
- **Right-dragging the handle** opens the same choices as a menu.
- **Dragging back into the selection** clears those cells.
- **Shift+drag** inserts cells instead of overwriting.

Quick entry:

- **Ctrl+;** inserts today's date and **Ctrl+Shift+;** the current time (tip 15).
- **Ctrl+E** (Flash Fill) completes a column from one or two examples, such as first names from full names (tip 14).
- **A leading apostrophe** or the Text format keeps leading zeros (tip 20).

**Independent Test**:

1. Type 5 and 10, select both, and drag the handle down four rows. The cells read 15, 20, 25, 30.
2. Drag a date and choose Fill weekdays. Saturdays and Fridays are skipped, following the workspace's weekend.
3. Type "Hisham" next to "Hisham El Badawy" and press Ctrl+E. The column fills with first names.
4. Undo removes each of these in one step.

**Acceptance Scenarios**:

1. **Given** a single number, **When** it's dragged, **Then** it is copied. **Given** two numbers, **Then** their step continues. **Given** Ctrl held while dragging, **Then** copy and series swap.
2. **Given** "Jan" or "Monday" or a date, **When** dragged, **Then** the month, day or date continues, in the cell's language, including Arabic month and day names.
3. **Given** a custom list (Settings → Sheet lists, e.g. the team's names), **When** one of its items is dragged, **Then** the list continues.
4. **Given** a formatted range, **When** Fill without formatting is chosen, **Then** borders and fills in the target stay as they were.
5. **Given** Flash Fill can't find one pattern for every row, **Then** it fills nothing and says so.

---

### User Story 3 - Drop-down lists and picking from the column (Priority: P1)

**Data › Data validation** on a team sheet makes a range a drop-down list (tip 18):

- the list's values, optionally colored;
- and a rule: reject other text, or warn about it.

**Alt+Down** on any text cell lists the values already used in that column; pick one to enter it (tip 19).

**Independent Test**:

1. Make C2:C50 a list of To do, Doing, Done with colors. Each cell shows a chip and a ▾, and typing "Maybe" is refused with a note.
2. On a free-text column, Alt+Down lists the column's distinct values.

**Acceptance Scenarios**:

1. **Given** a validation list, **When** a value is pasted or filled into it, **Then** values outside the list are refused or warned about per the rule, and counted in the skipped note.
2. **Given** a validation range, **When** rows are inserted inside it, **Then** the new rows join it.

---

### User Story 4 - Formatting gaps (Priority: P2)

- **Ctrl+Shift+1** gives Number (tip 23).
- **Format Cells → Number → Custom** accepts thousands and millions (`#,##0,"K"`, `#,##0.0,,"M"`) and `;;;` to hide a value (tips 24–25).
- **Horizontal alignment** has **Center across selection** (tip 26).
- **Conditional formatting** gains:
  - **Format the whole row** when a column's rule matches, e.g. Amount > 1000 (tip 27, formula-free);
  - **Icon sets**: arrows, flags and traffic lights (tip 28).
- **Format › Autofit column width** sits beside the double-click (tip 30).

**Independent Test**: Format 1,250,000 as millions, center a title across A1:F1 without merging, then highlight the rows where D > 1000. Sorting still works, and the shown values change while the stored values don't.

---

### User Story 5 - Data cleanup tools (Priority: P2)

**Data › Clean up** offers:

- **Remove duplicates**: choose the columns that define a duplicate, see the count, one undo (tip 61).
- **Split text to columns**: by a delimiter or a fixed width, with a preview (tips 62, 52).
- **Trim spaces and clean** (tip 54).
- **Change case**: UPPER, lower, Proper (tip 55).
- **Convert text to numbers** (tip 67).
- **Fill blanks from the cell above** (tip 68).

Also:

- **Find and Replace** supports `*`, `?` and `~*` (tip 63).
- **Paste Special** gains Add, Subtract, Multiply and Divide (tip 66).

**Independent Test**:

1. Paste 300 imported rows with stray spaces, duplicates, "1,200" as text, and "first last" names.
2. Clean each with one command.
3. Each command shows how many cells changed, and undoes in one step.

---

### User Story 6 - Tables, totals, filters and outlines (Priority: P2)

- **Ctrl+T** makes a table of the current block (tip 71).
- **A table's Total row** shows Sum, Average, Count, Min or Max per column, counting only visible rows (tips 73, 79). These totals are formula-free.
- **Slicers**: chip buttons above a table filter one column with a click (tip 74).
- **Advanced filter**: AND/OR conditions across columns, with "unique rows only" and "copy the result to a new sheet" (tip 78).
- **Group rows or columns** with Shift+Alt+→ into collapsible outlines with +/− (tip 80).
- **Status bar math**: Sum, Average and Count of the selection, plus Min and Max, which the member can switch on (tip 38).

**Independent Test**:

1. Make a table of 50 rows, turn on a Total row, filter it with a slicer, and group a block of rows.
2. The totals follow the filter, and the groups collapse and expand, and are kept after a reload.

---

### User Story 7 - Moving and copying with the mouse (Priority: P3)

- **Dragging a selection's border** moves it (tip 13). **Ctrl** copies, **Shift** inserts between rows or columns, and **Ctrl+Shift** inserts a copy (tips 107–109).
- **Right-dragging the border** offers Move, Copy, Copy values only, Copy formats only (tip 110).
- **Alt+dragging** over a sheet tab drops the block on that sheet (tip 111).
- **Ctrl+dragging a sheet tab** duplicates the sheet (tip 112).

**Independent Test**: Move B2:C5 to E2 with the mouse, then Ctrl-drag the sheet tab. The cells, formats and comments move with the block; the copy has its own name; each is one undo step.

---

### User Story 8 - Protecting inputs and printing (Priority: P3)

- **Protect inputs only**: Format Cells → Protection → Locked/Unlocked, then Protect sheet locks everything but the unlocked cells (tip 95). Owners and admins can still unprotect.
- **Print**: File › Print or PDF, with header rows repeated on each page, fit to one page wide, and the page orientation (tip 99).

**Independent Test**: Unlock B2:B20, protect the sheet, and try typing in A2 and B2. Only B2 takes the value. Print a 120-row sheet; the header row repeats on each page.

---

### Edge Cases

- **Several areas (spec 017):** fill, move, Remove duplicates and Split work on one area. They say so when there are several, as other one-area tools do.
- **Merged cells, tables, filters and frozen panes** keep working with fill, move and insert. A move that would split a merge or a table is refused with a note.
- **Arabic:** right-to-left drag directions, Arabic months and days in series, and mirrored handles and menus.
- **Phones:** the fill handle and border drag are mouse-only. Fill down/right, Go to special and the cleanup tools are reachable from menus.
- **Limits:** a fill or move that would grow past 5,000 rows or 200 columns stops at the limit and says so (spec 013).
- **Protected sheets:** every tool respects protection and the locked/unlocked cells.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001 (keyboard):**
  - Shift+Space, Ctrl+Space and F4 (repeat) are available.
  - F5 / Edit › Go to special offers blanks, filled, and visible only.
  - Ctrl+; and Ctrl+Shift+; insert the date and time.
  - Ctrl+E is Flash Fill, and Ctrl+T makes a table.
  - Shift+Alt+→ and ← group and ungroup.
  - Ctrl+Shift+1 is Number.
  - Alt+Down picks from the column.
  - Ctrl+F1 collapses the toolbar.
  - Alt shows menu key letters.
  - All of these are listed in the Shortcuts dialog (spec 018) in English and Arabic.
- **FR-002 (fill handle):** a fill handle on the selection, with:
  - copy and series (number step, date, month, weekday, custom lists);
  - Auto Fill Options and the right-drag menu;
  - double-click to the data's end;
  - drag-back to clear;
  - Shift+drag to insert.

  Each fill is one undo step.
- **FR-003 (custom lists):** admins keep the workspace's custom fill lists in Settings.
- **FR-004 (Flash Fill):** fills a column from examples only when one consistent pattern covers every row. Otherwise it fills nothing and explains why.
- **FR-005 (validation):** team sheets support list validation on a range:
  - values, with optional colors;
  - a reject or warn rule.

  It covers typed, pasted, filled and moved values.
- **FR-006 (formats):**
  - custom number formats with thousands (`,`) and millions (`,,`) scaling, and `;;;`;
  - Center across selection;
  - whole-row conditional formats;
  - icon sets;
  - a menu Autofit.
- **FR-007 (cleanup):**
  - Remove duplicates, Split to columns, Trim/Clean, Change case, Convert to numbers, and Fill blanks from above;
  - Find/Replace wildcards;
  - Paste Special Add, Subtract, Multiply and Divide.

  Each reports how many cells changed and is one undo step.
- **FR-008 (tables and outline):**
  - a Total row whose aggregates count visible rows only;
  - slicers;
  - an advanced filter with unique rows and copy to a new sheet;
  - row and column outline groups, kept with the sheet.
- **FR-009 (status bar):** Sum, Average and Count of numeric cells in the selection (all areas). Min and Max can be switched on and are remembered per member.
- **FR-010 (mouse):**
  - border drag to move, copy, insert and insert a copy;
  - the right-drag paste menu;
  - Alt+drag to another sheet;
  - Ctrl+drag a tab to duplicate;
  - double-click a cell edge to jump;
  - Ctrl+wheel zoom (kept per member and sheet);
  - Shift+wheel horizontal scroll.
- **FR-011 (protection):** locked/unlocked cells, honored by every edit path while the sheet is protected.
- **FR-012 (print):** Print / PDF of the sheet, with repeated header rows, fit to width, orientation, and gridlines on or off.
- **FR-013 (Content and Video sheets):** FR-001, FR-002 (copy and series into typable cells, going through each cell's own rules), FR-009, the Alt+Down pick, and zoom apply. Structure tools stay team-sheet only.
- **FR-014:** English and Arabic, keyboard reachable, axe-clean, and every change undoable.
- **FR-015 (formulas):** none in this spec. Typed text that starts with "=" stays text, as today. The formula tips are kept for a later formulas spec.
- **FR-016 (pivots and charts):** out of scope.

### Key Entities

- **Validation rule:** a range, a list of values (with colors), and an on-invalid rule (reject or warn).
- **Custom fill list:** a name and an ordered list of items; workspace-wide; admins edit.
- **Outline group:** a range of rows or columns, a level, and collapsed or open.
- **Cell lock:** a per-cell flag inside the sheet's formats.
- **Zoom preference:** per member and sheet.

## Success Criteria *(mandatory)*

- **SC-001:** Every one of the 120 tips is either available, mapped to a named equivalent, or listed as out of scope with a reason. The coverage table in the plan accounts for all 120.
- **SC-002:** A member cleans a pasted 300-row list (spaces, duplicates, text numbers, case) in under 1 minute with the cleanup tools.
- **SC-003:** Filling a series of 1,000 cells with the handle shows the result in under 1 second, and undoes in one step.
- **SC-004:** All spec 013–019 lab checks still pass.
- **SC-005:** The new tools are reachable by keyboard alone, and are axe-clean in English and Arabic.

## Assumptions

- **Platform:** shortcuts follow Excel on Windows. On a Mac, Ctrl is Cmd, as in the rest of the sheets.
- **Out of scope** (desktop-only Excel features with no counterpart in a web sheet):
  - Power Query (69);
  - macros (100);
  - the Quick Access Toolbar (91);
  - the Watch Window (94);
  - OneDrive version history (96);
  - side-by-side windows (97);
  - shape snapping (117);
  - the formula tips (left to a later formulas spec);
  - pivots and charts (81–90, 115–116), out of scope by decision.
- **Weekends:** "weekdays" follow the workspace's weekend (Friday–Saturday by default, as in tip 58).
- **Build order:**
  1. US1–US3;
  2. US4–US6;
  3. US7–US8.
- **Design:** each stage gets an HTML design for approval before it's built.
