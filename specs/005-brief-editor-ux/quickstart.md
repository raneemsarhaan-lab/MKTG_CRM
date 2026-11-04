# Quickstart: Validating the Brief Editor UX Overhaul

How to prove the feature works. Behaviour is defined in [spec.md](./spec.md), interfaces in [contracts/](./contracts/), state in [data-model.md](./data-model.md).

## 1. Static checks (every change)

```bash
npm run typecheck
```

```bash
npm run lint
```

Both must pass before any commit (HANDOVER §4).

## 2. Editor lab (no database, no login)

The lab mounts the real `BriefEditor` in a standalone page with a stub host, and drives it with Playwright. It's the harness used for the 2026-11-04 audit, committed under `scripts/brief-editor-lab/` (research R24).

```bash
npm ci
```

```bash
npm run lab:brief
```

The stub host can be switched per scenario:

| Host mode | Behaviour |
|---|---|
| `save=ok` | resolves `true` after 250 ms |
| `save=fail` | resolves `false` |
| `save=throw` | rejects |
| `save=hang` | never settles (checks the 20 s watchdog) |
| `upload=ok` | resolves `{ ok: true, url }` with a data-URL image after 400 ms |
| `upload=fail` | resolves `{ ok: false, error }` |
| `upload=absent` | prop omitted, checks each `uploadUnavailableReason` |
| `locale=ar` | Arabic messages and `dir="rtl"` |

**Expected output**: one `PASS`/`FAIL` line per scenario, and exit code 0 only if all pass. Screenshots go to `scripts/brief-editor-lab/out/` (git-ignored).

### Scenario map

Each scenario corresponds to a spec acceptance scenario.

| Scenario id | Story | Checks |
|---|---|---|
| `save-fail-shows-error` | US1 #1 | `save=fail`: type; status reads "Couldn't save"; text still in the editor |
| `save-retry-sends-latest` | US1 #2 | fail, type more, switch to ok, Retry: the last saved text equals the full latest text |
| `save-hang-watchdog` | US1 #1 | `save=hang`: error within 21 s |
| `leave-guard` | US1 #3 | error state, then Esc: confirm bar appears; editor still open |
| `single-status` | US1 #4 | exactly one status element |
| `link-click-no-open` | US2 #1 | clicking a link opens no page; link card visible |
| `link-open-edit-remove` | US2 #2–3 | each card action |
| `link-mod-k` | US2 #4 | Mod+K opens the prefilled box |
| `link-normalise` | US2 #5–6 | `forefront.consulting` saves as `https://forefront.consulting`; `see the deck` is rejected |
| `paste-image` | US3 #1 | synthetic paste of a PNG: placeholder, then image; the Markdown has the uploaded URL |
| `drop-images-order` | US3 #2 | drop 3 files: inserted in order |
| `upload-fail` | US3 #3 | `upload=fail`: placeholder removed; note names the file |
| `image-url-validate` | US3 #4–5 | invalid address rejected; valid address shows a preview |
| `image-roundtrip` | US3 #6 | close and reopen: image present |
| `esc-closes-menu-only` | US4 #1 | for each menu: Esc closes the menu only |
| `clear-format-selection-only` | US4 #3 | no selection: disabled; selection: only that text changes |
| `undo-redo-buttons` | US4 #7 | buttons match keyboard |
| `click-to-edit-cursor` | US4 #3 | the caret lands on the clicked word; text moves ≤ 4 px (SC-011) |
| `click-away-exits` | US4 #4 | an outside click ends editing; with `save=fail`, the confirm bar shows instead |
| `menu-then-click-away` | US4 #4 | the first outside click closes the menu only |
| `drag-select-outside` | FR-016 | a selection dragged past the edge keeps editing |
| `read-link-opens` | US4 #5 | in read mode, a link opens a new page |
| `slash-menu` | US5 #1–3 | `/tab` + Enter inserts a table; "and/or" opens nothing; Esc leaves "/" |
| `menu-keyboard` | US5 #4 | arrows and Enter in every menu; focus returns to the trigger |
| `style-checkmark` | US5 #5 | ✓ on the current style; re-pick keeps it |
| `a11y-roles` | US5 #6 | toolbar, aria-pressed, editor label; axe-core run reports no critical issues (SC-007) |
| `task-insert-below` | US6 #1 | the current paragraph is unchanged |
| `youtube-block` | US6 #2 | thumbnail block; non-YouTube URL rejected |
| `table-menu` | US6 #3–4 | every action; full width; header row |
| `toggle-placeholders` | US6 #5 | empty title and body with hints |
| `toc-block` | US6 #6 | labelled block, not raw text |
| `table-resize` | US6 #7 | dragging a border resizes both columns; minimum width respected |
| `table-edges` | US6 #8 | the outer left and right edges resize the table; stops at the brief's edges; mirrored in Arabic |
| `table-widths-roundtrip` | US6 #9 | widths identical (±1%) after reopening and in `Brief` (SC-012) |
| `table-equal-widths` | FR-069 | Equal widths plus Full width saves a plain GFM table |
| `sticky-toolbar` | US7 #1 | after scrolling a long brief, toolbar top ≥ 0 |
| `phone-toolbar` | US7 #2 | 390 px: one row; no row starts with a divider; no page overflow (SC-008) |
| `arabic` | US8 | `locale=ar`: no English strings in the editor (SC-009); toolbar mirrored |
| `underline-readview` | US9 #1 | render the saved Markdown through `Brief`: `<u>` present |
| `list-spacing` | US9 #2 | `li > p` margin is 0 in both views |
| `roundtrip-fixtures` | FR-100 | every fixture brief: open, save, compare. Also renders identically through `Brief` (SC-010) |

## 3. In the running app (manual, before merge)

Prerequisites: a deployment or local run with `DATABASE_URL` and the bucket variables set (HANDOVER §storage), signed in as a member who can edit a task.

1. Open a task and its brief. Paste a screenshot (⌘V). It appears in place and in the task's attachment list, and the board card's thumbnail updates.
2. Drop an image onto the brief. It is inserted once and attached once (check the attachment count goes up by exactly one).
3. Turn the network off in DevTools and type. The status turns to "Couldn't save · Retry". Press Esc and the bar asks before leaving. Turn the network on and press Retry. Close and reopen the task: the text is there.
4. Click a word in the read brief. Editing starts with the cursor on that word, the text doesn't jump, and there is no Edit or Done button. Click elsewhere in the panel and editing ends.
5. While editing, click a link inside the brief. The link card appears and no tab opens. While reading, the same link opens in a new tab.
6. Drag a table's column border and its right and left edges, click away, close and reopen the task. The widths and position are kept.
7. Switch to Arabic (language toggle). The editor is fully Arabic and mirrored.
8. Open **+ New Task** and paste an image into the description. The note says images can be added once the task is created.
9. On a phone (or DevTools at 390 px), open a long brief and scroll. The toolbar stays visible on a single row.
