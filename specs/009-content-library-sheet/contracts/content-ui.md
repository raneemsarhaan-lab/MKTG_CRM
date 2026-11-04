# Contract: Content sheet UI (spec 009)

## Components (`src/components/content/`)

| Component | Role |
|---|---|
| `ContentSheet` | Toolbar: Board · Sheet · Content, Mine, Show archived, Paste plan, + Theme (admins). Summary line. Grid. Popovers. |
| `ContentGrid` | A model over `GridCore` (shared with the video sheet). |
| `ThemeEditor` | Popover: owner, frequency, audience, pillars (add, rename, remove). |
| `PlanPreview` | Paste dialog: themes and pillars to create or match, then New, Matched by Task Link, Already in the sheet, Problems (fix in place or leave out), "Use the sheet's title and status", Add. |
| `parse-plan.ts`, `rows.ts`, `summary.ts`, `cadence.ts` | Pure, tested in Node. |

## Rows and cells

| Row | Cells |
|---|---|
| Theme | Row number, then one spanning cell: caret, name, "{n} pieces" when collapsed, owner, "{n} per week · this week {done} of {target} ✓", audience. Enter opens the theme menu: Edit theme (editors), Add pillar, + Piece, Collapse. |
| Pillar | Row number, then one spanning cell: name and count. Enter opens the pillar menu: Rename, Remove (theme editors). |
| Piece | Title · Type · Status · Owner · Assignee · Pillar · Working doc · Design · Post · Published · Date · Archive |
| Clip (under an expanded video piece) | Title · Type (Reel) · Status (video names) · Owner · Assignee; the other cells blank |
| + Piece | "+ Piece" in the title cell |

**Keyboard and screen readers**: as spec 008 contracts/sheet-ui.md §4–5.
- The row number cell opens the row menu: Archive / Restore, Open task, and on videos "Open in video sheet".
- The grid is a `treegrid`: themes are level 1, pillars level 2, pieces level 2 or 3, clips one level below their video.

## Host additions (`SheetApi`)

```ts
addPlan(rows, opts) · addPiece(themeId, input) · updatePiece(taskId, patch)
setPieceLink(taskId, role, url) · setPublished(taskId, url) · setPostUrl via updatePiece
addTheme(name) · saveTheme(id, patch) · savePillar(themeId, input) · removePillar(id)
```

Every call updates the host's shared state optimistically and refreshes. Themes are a separate prop, `themes: ContentTheme[]`.

## Look

Spec 008's `SHEET_UI` tokens and `.fx-sheet-*` CSS, plus a few `.fx-content-*` rules for the spanning theme and pillar rows. No new colours: the theme row uses `--sheet-video-row`, the pillar row `--sheet-header-bg`.
