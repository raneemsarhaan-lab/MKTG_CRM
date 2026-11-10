# Implementation Plan: Sheet Formatting, Editing Tools and Comments

**Branch**: `claude/nice-noether-x4rgei` (Spec Kit feature `015-sheet-formatting-comments`) | **Date**: 2026-11-10 | **Spec**: [spec.md](./spec.md)

**Input**: `specs/015-sheet-formatting-comments/spec.md`, clarified on 2026-11-10:
- **Every sheet:** blank sheets in full, and the Content and Video sheets with FR-070–FR-075.
- **Three stages:**
  1. formatting, number formats and comments;
  2. the editing tools;
  3. sort, filter, styles, tables and conditional formatting.
- **Comments are visible to everyone** who can open the sheet.

## Summary

Excel's Home tab and threaded comments come to every sheet in Momentum. The approach (details in [research.md](./research.md)):

- **One format store for every sheet (R1).** A `sheet_formats` table holds a style for a cell, a whole row, a whole column, or the whole sheet.
  - A cell's look is the sheet's style, then its column's, then its row's, then its own, layered as in Excel.
  - Formatting a whole column or the whole sheet is one record. That meets SC-002 (10,000 cells in under a second) without writing 10,000 rows.
  - A cell is addressed by row key and column key: a blank sheet's row and column ids, or, on the Content and Video sheets, the task id and column key. So formatting follows a task through regrouping, dropping and restoring (FR-071).
- **Values stay text; number formats only change what's shown (R2).** The grid shows a cell's text through its number format (Currency, Percentage, dates). Editing and copying use the text as typed (FR-023).
- **A style is a small JSON object (R3).** Font, fill, borders, alignment and number format, validated on the server. The client turns it into CSS once per distinct style.
- **Merges, hidden rows and columns, freeze, tables, filters and rules (R4, R7, R8)** are stored per sheet, keyed by stable row and column ids. Merges are offered on blank sheets only (FR-074).
- **Comments (R5).** A `sheet_comments` table holds threads keyed by sheet, row key and column key, with replies, mentions, edits, soft deletes and resolve. Spec 012's notifications gain two kinds, `sheet_mention` and `sheet_reply`, which open the sheet at the cell.
- **Undo, saving and paste (R6).**
  - New change kinds join spec 013's outbox and undo stack.
  - Formats and comments are keyed by row and column ids that undo reuses, so deleting a row and undoing it brings its formatting and comments back.
  - Paste reads Excel's and Google Sheets' HTML, including Excel's `<style>` classes.
- **Delivery in three stages (R10)**, each with its own lab checks and PR.

## Technical Context

**Language/Version**: TypeScript 5 (strict), React 19, Next.js 16 App Router.

**Primary Dependencies**: next-intl and Prisma v5. **No new dependency:**
- the colour picker is native `<input type="color">` plus a palette;
- number and date formatting use `Intl`;
- conditional rules are evaluated in our own code.

**Storage**: PostgreSQL via Prisma, applied with `db push`. New tables:
- `sheet_formats`
- `sheet_merges`
- `sheet_comments`
- `sheet_rules` (stage 3)
- `sheet_tables` (stage 3)

New columns:
- `sheet_rows.hidden`
- `sheet_cols.hidden`
- `sheets.frozen_rows`
- `sheets.frozen_cols`
- `sheets.view`, a JSON column for the filter, linked-sheet sorting, and hidden linked columns and rows

**Testing**:
- **`lab:spreadsheet`**, extended:
  - pure checks for style merge, number formats, rule evaluation and the clipboard style parser;
  - UI scenarios for the toolbar, comments and merges.
- **`lab:sheet`**, for no regressions on the Content and Video sheets.
- **A server smoke test.**
- **Running-app checks** on a production build, with axe.

**Target Platform**: The web app on desktop and phones (390 px), in English and Arabic (RTL).

**Project Type**: Web application (one Next.js app).

**Performance Goals**:
- Formatting 10,000 cells, or a whole column, takes under 1 s and is one undo step (SC-002).
- Rendering a 5,000-row sheet with formats keeps spec 013's under 100 ms per keystroke (styles are cached by key).
- A mention notification arrives within 1 minute (SC-004; spec 012's pulse is 8 s).

**Constraints**:
- No formulas.
- A protected sheet's formatting can be changed only by its protector and admins; comments stay open to everyone (FR-061).
- Linked-sheet formatting never changes task data (FR-072).
- WCAG 2.1 AA.

**Scale/Scope**:
- About 25 toolbar controls.
- 6 dialogs: Format Cells, Find & Replace, Sort, Conditional rule, Manage rules, and Paste Special.
- 1 comments panel.
- About 8 new server actions.
- A `sheets.format` / `sheets.comments` string namespace of about 180 keys in each language.

## Constitution Check

| Principle | Gate | Status |
|---|---|---|
| **§I Design System Fidelity** | The toolbar, menus and panels use `SHEETS_UI` and `--sh-*`. User-chosen cell colours are content, not UI tokens. Excel's theme palette is stored as data (`src/lib/sheet-format.ts`) | Pass (planned) |
| **§II Workflow Pipeline Integrity** | Formatting never changes tasks. Fill and Replace on linked sheets go through the same per-cell saves as typing (spec 013 R8) | Pass |
| **§III Role-Based Feature Access** | Blank sheets follow spec 013 (protection). Linked-sheet formatting is open to all members, like the team's own columns. Comments are visible to all; only the author edits a comment, and the author or an admin deletes it. All of it is enforced in the actions | Pass |
| **§IV Design-Driven Development** | `design/sheet-formatting.html` (toolbar, Format Cells, colour and border pickers, comments, merges, stage 2 and 3 dialogs, phone, Arabic) is approved **before** any UI | Gate: design first |
| **§V Cultural UX** | Number and date formats use the member's locale. Alignment mirrors in RTL. An Arabic font is in the font list. All strings are in English and Arabic | Pass (planned) |
| **§VI State Architecture** | Types first. All state is on the server (formats, merges, comments, rules, view settings). Format Painter and the open panel are UI-only state | Pass |
| **Tech Stack** | No new dependency | Pass |

No violations, so Complexity Tracking is empty.

## Project Structure

### Documentation (this feature)

```text
specs/015-sheet-formatting-comments/
├── spec.md · plan.md · research.md · data-model.md · quickstart.md
├── contracts/server.md · contracts/ui.md
├── checklists/requirements.md
└── tasks.md            # /speckit-tasks
```

### Source Code (repository root)

```text
prisma/schema.prisma                         # SheetFormat, SheetMerge, SheetComment, SheetRule, SheetTable; columns
src/types/index.ts                           # CellStyle, NumberFormat, Border, SheetComment, ConditionalRule…
src/lib/sheet-format.ts                      # pure: style merge/diff, palette, fonts, style → CSS, number/date display
src/lib/sheet-rules.ts                       # pure (stage 3): rule evaluation, sort and filter
src/lib/sheet-clipboard.ts                   # + read Excel <style> classes and inline styles; write styles out
src/lib/sheet-undo.ts / sheet-doc.ts         # + 'formats', 'merges', 'view' changes
src/actions/sheets.ts                        # applySheetChanges gains formats, merges, view; loadSheet returns them
src/actions/sheet-comments.ts                # list/create/reply/edit/delete/resolve/reopen
src/lib/notify/*                             # sheet_mention, sheet_reply
src/components/sheet/GridCore.tsx            # cell style hook, merges overlay, comment markers, frozen panes, hidden rows and columns
src/components/sheets/format/                # FormatToolbar, ColorPicker, BorderPicker, FormatCellsDialog, NumberFormatMenu…
src/components/sheets/comments/              # CommentThread, CommentsPanel, CommentMarker
src/components/sheets/BlankSheet.tsx         # wires formats, merges, comments
src/components/sheet/useLinkedFormats.ts     # Content and Video: formats and comments by task id
messages/en.json, messages/ar.json           # sheets.format.*, sheets.comments.*
design/sheet-formatting.html                 # §IV
```

**Structure Decision**: this extends spec 013's modules rather than adding parallel ones, so every sheet shares one engine (spec 013 R1).

## Phase 0 → Phase 1

- **Phase 0** ([research.md](./research.md)): R1–R10. Nothing is left as NEEDS CLARIFICATION.
- **Phase 1:**
  - [data-model.md](./data-model.md);
  - [contracts/server.md](./contracts/server.md);
  - [contracts/ui.md](./contracts/ui.md);
  - [quickstart.md](./quickstart.md).

## Constitution Check (post-design)

Rechecked after Phase 1. There's still no new dependency, every permission is in the actions, and all state is on the server. The design gate (§IV) still applies before UI tasks. **Pass.**

## Complexity Tracking

None.
