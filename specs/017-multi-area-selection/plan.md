# Implementation Plan: Select Separate Cells with Ctrl+Click

**Branch**: `claude/nice-noether-x4rgei` (Spec Kit feature `017-multi-area-selection`) | **Date**: 2026-11-16 | **Spec**: [spec.md](./spec.md) | **Design**: [design/multi-area-selection.html](../../design/multi-area-selection.html), approved 2026-11-16

## Summary

The shared grid (`GridCore`) learns a selection made of several areas. The newest area is still the one the grid already tracks: the active cell plus the far corner. The earlier areas sit beside it in a list. Each host (blank sheet, Content, Video) gets every area with the selection callback and applies its tools to each one. Tools that need one block are switched off while there are several. **No schema change, no server change.** The selection is never saved (spec Key Entities).

## Technical Context

**Language/Version**: TypeScript 5 (strict), React 19, Next.js 16 App Router.
**Primary Dependencies**: none new.
**Storage**: none. Client-only.
**Testing**: a new real-app lab, `scripts/spreadsheet-lab/realapp/areas.cjs`, which drives `next start`. The pure helpers are checked in it with Node. Every earlier sheet lab is re-run unchanged (SC-004).
**Target Platform**: desktop browsers. Touch is unchanged (spec Assumptions).
**Performance Goals**: highlighting after a Ctrl+click in under 50 ms with 100 areas on 2,000 rows (SC-003). Each rendered cell checks at most 100 rectangles, and windowing keeps the rendered cells under ~1,500.
**Constraints**:
- English and Arabic.
- RTL works.
- Tokens only, no raw colours.
- Undo stays one step per command.

## Constitution Check

- **Spec first, design approved**: yes, both done 2026-11-16.
- **No new dependency, no schema change**: yes.
- **Permissions unchanged**: every write still goes through `writeCells` / `applyR` / `writeTaskCells`. The member's rights and the sheet's protection apply as before.
- **Accessibility**: the selection is announced, Shift+F8 gives a keyboard path, and the existing axe checks are re-run.

## Design decisions (research)

- **R1, the model.**
  - `GridCore` keeps `extra: { a: ActiveCell; b: ActiveCell }[]` for the earlier areas, by row key and column key, so they survive a re-render. The newest area is still `active` + `focusEnd`.
  - Areas are turned into index rectangles each render. An area whose keys are gone is dropped.
- **R2, the host contract.** `onSelect(rect, areas)`. `rect` stays the newest area, so every current caller keeps working unchanged. `areas` lists all of them, the newest last. Hosts keep `areas` in a ref beside `rect`.
- **R3, the pure helpers** live in `src/lib/sheet-selection.ts`:
  - `subtract(areas, cut)` splits each area into at most 4 pieces;
  - `unionCells(areas)` gives the unique cells, so overlaps count once;
  - `copyLayout(areas)` returns `rows` (side by side), `cols` (stacked) or `null`;
  - `areaLabel` and `selectionLabel` give "B2, E5, B8:D9 +2 more";
  - `wholeRows` and `wholeCols` test the areas.
- **R4, the gestures in the grid.**
  - Ctrl/Cmd on pointer down pushes the current area into `extra` and starts a new one.
  - A pointer down on a selected cell with Ctrl starts a remove-drag. Pointer up runs `subtract`.
  - Shift keeps today's code: it moves only the newest area.
  - A plain click or arrow clears `extra`.
  - Shift+F8 sets `adding`. Arrows then move without clearing `extra`. The first Shift+arrow after a move pushes the current area and starts a new one.
- **R5, clipboard and clear in the grid.**
  - Clear walks `unionCells` and writes in one `writeCells` call, so it is one undo step.
  - Copy uses `copyLayout` to build one grid. With no layout, it refuses through the new optional `onNotice(key)`.
  - Cut with several areas refuses.
  - Paste with several areas: one cell is written into every selected cell (one `writeCells`). A larger block refuses.
- **R6, Ctrl+Enter.** The editor's Ctrl/Cmd+Enter commits the draft to every selected cell through `writeCells(..., 'paste')`, one undo step. Without `writeCells`, the edit commits to the active cell only.
- **R7, formats in the hosts.**
  - The blank sheet runs `planRect` / `planBorders` once per area. It merges the items by cell key and keeps the first `before`, so overlaps produce one undo item per cell.
  - The linked sheets' `useLinkedFormats` works the same way.
  - Clear (contents, formats, all, comments) and Clear rules in selection walk every area.
- **R8, one-area tools.**
  - `FormatState` gains `areas: number`.
  - The toolbar (Merge, Fill, Paste Special, Sort & Filter, Format as Table, New rule) and the cell, row and column menus disable those items with `format.areas.oneArea`.
  - Host commands that get here anyway (keyboard shortcuts) show the same notice and change nothing.
  - Hide, Resize and Delete rows (columns) take every row (column) when `wholeRows` (`wholeCols`) holds; otherwise they are disabled with the reason.
  - Board ▾ Create tasks for rows needs one area.
- **R9, the status.** The blank sheet's `onSelect({ cell, count, label, areas })` drives the Workbook's status line: "B2, E5 · 2 areas, 2 cells". The grid's live region says the same.
- **R10, drawing.** A cell is `is-sel` when it is in any area. Column letters and row numbers light up for every area. The active cell keeps its outline. The remove-drag shows a dashed `is-unsel` box.

## Project Structure

```text
src/lib/sheet-selection.ts                 # + subtract, unionCells, copyLayout, labels, wholeRows/Cols
src/components/sheet/GridCore.tsx          # areas, gestures, Shift+F8, Ctrl+Enter, clipboard rules, drawing, onNotice
src/components/sheets/BlankSheet.tsx       # areas ref, formats per area, menus, one-area guards, status
src/components/sheet/useLinkedFormats.ts   # areas ref, formats per area, one-area guards
src/components/sheet/useLinkedMenu.tsx     # menus with several areas
src/components/sheets/format/bus.ts        # FormatState.areas
src/components/sheets/format/FormatToolbar.tsx, StyleTools.tsx  # disabled with the reason
src/components/sheets/Workbook.tsx         # status text
src/components/sheets/links/useTaskLinks.tsx # Create tasks for rows: one area
src/app/globals.css                        # .is-unsel
messages/en.json, ar.json                  # sheets.areas.*
scripts/spreadsheet-lab/realapp/areas.cjs  # new lab
```

## Complexity Tracking

None. No new dependency, table or route.
