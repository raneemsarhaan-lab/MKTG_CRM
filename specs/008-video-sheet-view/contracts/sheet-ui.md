# Contract: Sheet UI, host, keyboard and accessibility

**Feature**: spec 008 · **Folder**: `src/components/sheet/`

## 1. Components

| Component | Role |
|---|---|
| `VideoSheet` | The view. Toolbar (scope, column set, Mine, Show dropped, Paste clips), summary line, grid. One video, or all videos with clips as groups (FR-001, FR-002). |
| `SheetGrid` | The `role="grid"` itself: header row, rows, roving focus, keyboard, paste capture. |
| `StatusCell` | The video stage name, the real name on hover/focus, and the allowed-moves menu (research R3). |
| `EditorCell` | The people menu: editing roles first, then **Unassigned** (FR-025). |
| `FilesCell` | Links and uploads, progress, refusal, Retry, and the open/preview/task menu (FR-040–FR-046). |
| `PublishedCell` | A link, or **Missing link**; the prompt after a move to Published (R13). |
| `PastePreview` | The new / existing / unmatched lists, fixing in place, and **Add N clips** (FR-033, FR-034). |
| `parse-clips.ts`, `rows.ts`, `columns.ts`, `time.ts`, `summary.ts` | Pure helpers, tested in Node. |

## 2. Host contract

`KanbanBoard` renders the sheet and supplies everything it does. The lab supplies stubs with the same shape.

```ts
interface SheetHost {
  tasks: Task[]                     // every task, including dropped (the sheet filters)
  me: Member
  members: Member[]
  hasStorage: boolean
  videoId: string | null            // null = all videos with clips
  highlightId: string | null        // ?row=
  onOpenVideo(id: string | null): void          // writes ?video=
  onOpenTask(id: string): void                  // opens TaskModal (selectedTaskId)
  api: {
    move(taskId: string, to: StageId): Promise<MoveTaskResult>      // the board's own move: optimistic, celebration, refresh
    update(taskId: string, patch: TaskPatch): Promise<Result>        // updateTask
    updateClip(taskId: string, patch: ClipPatch): Promise<Result & { clip?: ClipDetails }>
    addClips(videoId: string, rows: ClipRowInput[]): Promise<AddClipsResult>
    addLink(taskId: string, url: string): Promise<Result & { row?: TaskAttachment }>
    upload(taskId: string): UploadFn                                 // makeUploader({ taskId, hasStorage, … })
    drop(taskId: string): Promise<Result>
    restore(taskId: string): Promise<Result & { stage_date?: string }>
  }
}
```

- `api.move` is **the same function** the board's drag uses (extracted from the drop handler in `KanbanBoard`). So the optimistic update, rollback, `router.refresh()` and `setCelebration` are shared (FR-020, §V).
- Every `api` call updates the shared `tasks` state optimistically. The sheet keeps no copy of task data, only cell editing state.

## 3. Columns

| Key | Header (en) | Editing | Copy | Full | Editable by `canAct` |
|---|---|:-:|:-:|:-:|:-:|
| title | Title | ✓ | ✓ | ✓ | ✓ (frozen column) |
| clipNo | # | ✓ | ✓ | ✓ | ✓ |
| type | Type |  | ✓ | ✓ | ✓ |
| status | Status | ✓ | ✓ | ✓ | moves per `allowedStages` |
| editor | Editor | ✓ | ✓ | ✓ | ✓ |
| source | Source | ✓ |  | ✓ | ✓ |
| fileName | File name | ✓ |  | ✓ | ✓ |
| in / out | In / Out | ✓ |  | ✓ | ✓ |
| length | Length | ✓ |  | ✓ | derived |
| files | Files | ✓ |  | ✓ | link and upload (`mayAttachTo`) |
| published | Published |  | ✓ | ✓ | ✓ |
| drop | (Drop / Restore) |  |  | ✓ | ✓ |

- **Row numbers** form a frozen column to the left of Title (to the right in RTL).
- **Video row**: title, type, status, editor and files are live. Clip-only cells are blank. The video row shows a collapse control and "13 clips" when collapsed.
- **Fixed cells**: the video row and the summary line show in every set (FR-053).

## 4. Keyboard (FR-039, FR-082, SC-008)

Exactly one cell is in the tab order: the active one, which starts on the first clip's title.

| Key | Navigating | Editing a text cell | Menu open |
|---|---|---|---|
| ←/→ | Previous/next cell **as seen on screen** (mirrored in RTL) | Caret | — |
| ↑/↓ | Row above/below | — (commit happens on Enter) | Previous/next item |
| Home / End | First / last cell in the row | Caret | First / last item |
| Ctrl+Home / Ctrl+End | First / last cell of the grid | — | — |
| Enter or F2 | Edit text, or open the menu (status, editor, type, files) | Save, move down | Choose |
| Tab / Shift+Tab | Leave the grid to the next / previous control | Save, move to the next / previous editable cell | Choose, close |
| Esc | — | Cancel, restore the value | Close, focus the cell |
| Space | On a video row: collapse / expand | — | Choose |
| Ctrl/⌘+V | Paste rows → `PastePreview`; in a Files cell, a link → attach | Native paste | — |
| Delete | On a clip row with `canAct`: opens the Drop confirm | — | — |
| Typing a character | Starts editing a text cell with that character | — | Typeahead |

Toolbar controls (Board | Sheet, column set, Mine, Show dropped, Paste clips, + Clip) are ordinary buttons in the tab order before and after the grid.

## 5. Screen readers

- **Roles and counts**: the container has `role="grid"`, `aria-label="{video} clips"` (or "Videos and clips"), `aria-rowcount` and `aria-colcount`.
- **Rows**: each row has `role="row"` and `aria-rowindex`. Video rows have `aria-expanded` and `aria-level=1`; clip rows `aria-level=2`. Dropped rows have `aria-disabled` and an off-screen "dropped".
- **Headers**: `role="columnheader"` with `aria-sort="ascending"` on #. The title cell is `role="rowheader"`.
- **Status cell**: `aria-haspopup="menu"` when moves exist. Its accessible name is "{video name}, {real name}".
- **Live region** (`role="status"`, polite) announces saves, refusals with their reason, upload progress at 25 % steps, "Clip dropped · Undo" and "{n} clips added".
- **Refused edits** put the reason on the cell with `aria-describedby`.
- **axe**: no critical or serious issues on the grid, menus, paste preview or prompt (lab scenario `axe-*`).

## 6. Look (design tokens only, §I)

- **Colours and type**: from `src/lib/tokens.ts` (`COLORS`, `STAGE_COLORS`, `BRIEF_UI`, `ATTACH_UI`), plus a new `SHEET_UI` map (gridline, header fill, frozen-column shadow, dropped ink, missing-link amber, highlight row). They are mirrored as `--sheet-*` CSS variables in `globals.css`, inside a `/* ─── Video sheet (spec 008)` … `/* ─── end video sheet` block.
- **Sizes**: rows are 24 px, with 12 px text and tabular numbers for #, in, out and length.
- **Status**: a 6 px stage-colour dot plus the video name.
- **Dropped rows**: struck through, with `SHEET_UI.droppedInk`.
- **Highlight**: the `?row=` target gets a 2 s highlight fade, then keeps a left (inline-start) accent.
- **Phone width**: the grid scrolls sideways inside its own area with the title frozen, and the page doesn't scroll sideways. The toolbar wraps.
