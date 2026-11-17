# Feature Specification: Content-Sheet Controls in Linked Sheets

**Feature Branch**: `claude/nice-noether-x4rgei`

**Created**: 2026-11-17

**Status**: Draft (design awaiting approval)

**Input**: User description: "why when I connect any sheet manually, it doesn't show like the one we connect hard code?" Follow-up: "yes, design it".

**Design**: [design/linked-cells.html](../../design/linked-cells.html)

## Context

Spec 016 lets a blank sheet link its rows to board tasks and map columns to task fields. Mapped cells show the task's value:

- **Stage** shows as a plain pill.
- **Every other field** shows as text: assignee, type, pillar, due date, and links as the bare address.
- **Editing** works by typing a value, which the app then matches.

The Content sheet shows the same fields with real controls:

- a status pill with a menu;
- an avatar chip with a people picker;
- a coloured type pill;
- link labels such as "Google Docs".

So a sheet the team links themselves looks and feels poorer than the Content sheet, even though the data is the same.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Mapped cells look like the Content sheet (Priority: P1)

On a linked row, each mapped cell shows the Content sheet's look:

- **Stage**: the status pill with its colour dot, in the Content sheet's words (Ready for Design, Content Review…).
- **Assignee**: an avatar and name, or "Unassigned".
- **Content type**: the coloured type pill.
- **Pillar / theme**: a chip.
- **Due date**: a short date, red when late (as on the board).
- **Links**: the site's name, or "+ link" when empty.

**Independent Test**: Link TSC Calendar's Stage, Owner, Content Type, Link and Pillar columns. Each linked row shows the controls above. The unlinked row shows plain text.

**Acceptance Scenarios**:

1. **Given** a linked row, **When** the sheet opens, **Then** each mapped cell shows its control.
2. **Given** a row that isn't linked, **When** the sheet opens, **Then** its cells are ordinary text, with the "Not linked" note in its Task cell.
3. **Given** a value changes on the board, **When** the sheet refreshes (focus, or every 60 s), **Then** the control shows the new value.

### User Story 2 - Edit with the controls (Priority: P1)

The member clicks a mapped cell, or presses Enter or Space on it. The matching control opens:

- **Stage**: a menu of the stages the member may move to. The others are disabled with their owner named.
- **Assignee**: a people picker with search, plus Unassigned.
- **Content type**: a menu of the workspace's types.
- **Pillar**: a menu of the task's theme's pillars.
- **Due date**: a date picker, plus Clear.
- **Links**: a link field, plus Open link ↗.

**Independent Test**: Set a task's stage, assignee, type, pillar, date and design link from the sheet, using only the controls. The board shows each change. Each one undoes in one step.

**Acceptance Scenarios**:

1. **Given** a mapped cell, **When** the member picks a value, **Then** it saves to the task through the same rules as the Content sheet (permissions, stage-move rules, link checks), and undo reverts it.
2. **Given** a stage the member doesn't hold, **When** the stage menu opens, **Then** that stage is disabled, with its owner named.
3. **Given** a cell the member may not change, **When** it is clicked, **Then** the control doesn't open and the cell explains why (🔒).
4. **Given** a mapped cell, **When** the member types a value instead, **Then** it is matched and saved as today. Paste, Fill, Delete and Find & Replace are also unchanged.

### Edge Cases

- **Merged or wrapped cells**: the control sits at the top start, like any cell text.
- **Arabic**: the controls mirror; the stage words and types use their Arabic labels where they exist.
- **Phones**: the controls open as bottom sheets, as on the Content sheet.
- **Several areas selected (spec 017)**: a click opens the control for the clicked cell only.

## Requirements *(mandatory)*

- **FR-001**: Mapped cells on linked rows MUST render with the Content sheet's components for stage, assignee, content type, pillar, due date and links.
- **FR-002**: Clicking, or pressing Enter or Space on, a mapped cell MUST open that field's control. The control's choices and their disabled reasons MUST match the Content sheet's.
- **FR-003**: Saves MUST go through the existing linked-field write path (`writeTaskFields`): one undo step each, same permissions, same celebrations setting.
- **FR-004**: Typing, paste, fill, clear and replace into mapped cells MUST keep working as today.
- **FR-005**: Unlinked rows and unmapped columns MUST NOT change.
- **FR-006**: English and Arabic, keyboard reachable, and axe-clean.

## Success Criteria *(mandatory)*

- **SC-001**: Side by side, a mapped Stage, Assignee, Type and Link cell in a linked sheet looks the same as on the Content sheet.
- **SC-002**: Every spec 016 lab check still passes.
- **SC-003**: A linked sheet with 500 linked rows still opens and scrolls as before (under 1 s to first paint, as in the spec 016 checks).

## Assumptions

- The Content sheet's theme grouping, summary bar and its own buttons (Columns, Mine, Show archived, Paste plan) stay on the Content sheet.
- Video-only fields (clips, files) aren't mappable today and aren't added here.
