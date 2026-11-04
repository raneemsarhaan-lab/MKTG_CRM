---
description: "Task list for the Brief Editor UX Overhaul"
---

# Tasks: Brief Editor UX Overhaul

**Input**: Design documents from `specs/005-brief-editor-ux/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/](./contracts/), [quickstart.md](./quickstart.md)

**Tests**: The spec does not ask for TDD, so there are no test-first tasks. Each story ends with a **validation task** that adds its scenarios to the editor lab (research R24, quickstart §2), because the repo has no other test runner and the plan names the lab as the acceptance check.

**Organization**: Grouped by user story (US1–US9 from spec.md) so each can be built, checked and shipped on its own.

**Regenerated 2026-11-04** after the preview review ([interactive preview](https://claude.ai/artifact/Kmwf5sJKJunFtvGMfwdSNR)): click to edit / click away to finish with no Edit or Done buttons (T033–T035, US4), and resizable tables, both columns and the table's left and right edges (T050–T053, US6). IDs are sequential in execution order.

**Conventions used throughout**

| Term | Meaning |
|---|---|
| Editor | `src/components/kanban/BriefEditor.tsx` (public component; import path must not change) |
| Module dir | `src/components/kanban/brief-editor/` |
| Lab | `scripts/brief-editor-lab/`, run with `npm run lab:brief` |
| Strings | Every new user-facing string goes through `useTranslations('briefEditor')`, with keys added to both `messages/en.json` and `messages/ar.json` in the same task (Arabic may be a first draft until T057) |
| Colours | Come only from `BRIEF_UI` / `COLORS` in `src/lib/tokens.ts` (Constitution §I) |
| Before every commit | `npm run typecheck` |

## Format: `[ID] [P?] [Story] Description`

- **[P]**: can run in parallel (different files, no dependency on an unfinished task)
- **[Story]**: US1–US9 from spec.md

---

## Phase 1: Setup (shared infrastructure)

**Purpose**: The design file the constitution requires, the two new packages, and the lab every story is checked with.

- [X] T001 Create the §IV design file `design/brief-editor-ux.html` from the approved [interactive preview](https://claude.ai/artifact/Kmwf5sJKJunFtvGMfwdSNR) (read it with the Artifact tool and commit its HTML, keeping its tour). It is committed as plain, readable HTML rather than the compressed bundle the `design/ui/*.html` files use; see plan.md Constitution Check §IV. Update its minimum column width to 64 px to match T050. It must be a standalone HTML prototype using the `BRIEF_UI` colours (research R17) and Inter/Montserrat, and shows: (a) the desktop toolbar in Saved, Saving… and "Couldn't save · Retry" states, with Undo/Redo, Style, B I S code, lists, quote, link, + Insert, ⋯ (R7, R19); (b) the phone toolbar at 390 px as one sideways-scrolling row with the status dot (R14); (c) the link card with host, short path, Open ↗, Edit and Remove (R3); (d) the "/" menu filtered to "tab" with Markdown hints on the right (R6, R21); (e) the table menu (R10); (f) the "Uploading hero.png…" placeholder (R5); (g) the unsaved-changes confirm bar; (h) the same toolbar and "/" menu in Arabic, RTL; (i) read mode vs editing mode with no Edit/Done buttons; (j) table resizing between columns and from both outer edges, with the size badge. Every UI task below depends on this file.
- [X] T002 Add dependencies in `package.json` / `package-lock.json`: `npm install @tiptap/suggestion@3.31.3` (exact version, matching the installed `@tiptap/core`) and `npm install -D axe-core`. Run `npm run typecheck`.
- [X] T003 [P] Create the lab in `scripts/brief-editor-lab/`:
  - `entry.tsx`: mounts `BriefEditor` inside `NextIntlClientProvider` with messages from `messages/<locale>.json`. A stub host reads its modes from `location.hash`: `save=ok|fail|throw|hang`, `upload=ok|fail|absent`, `locale=en|ar`, `initial=<fixture name>`. It records every `onSave` argument on `window.__saves` and `window.__md`, and has a "closed / reopen" toggle.
  - `index.html`: loads the `.fx-brief` rules copied at build time from `src/app/globals.css`.
  - `build.sh`: `node_modules/.bin/esbuild entry.tsx --bundle --jsx=automatic --alias:@=./src --define:process.env.NODE_ENV='"development"'`.
  - `scenarios.mjs`: Playwright runner. Each scenario is `{ id, hash, run(page) }` and prints `PASS id` / `FAIL id: reason`; exits non-zero on any failure; saves screenshots to `out/`.
  - Add `"lab:brief": "bash scripts/brief-editor-lab/build.sh && node scripts/brief-editor-lab/scenarios.mjs"` to `package.json` and `scripts/brief-editor-lab/out/` to `.gitignore`.
- [X] T004 [P] Add round-trip fixtures in `scripts/brief-editor-lab/fixtures/`: `clickup-import.md` (headings, nested lists, images, a GFM table), `toggle.md` (a `<details>` titled "Toggle title"), `toc.md` (`[[toc]]` plus headings), `youtube.md` (one bare and one linked YouTube URL on their own lines), `links.md` (an absolute, a relative and a `<autolink>` link), `tasks.md` (checked and unchecked items). Add scenario `roundtrip-fixtures` to `scenarios.mjs`: load each fixture, type one character then delete it, and assert the saved Markdown equals the fixture after whitespace normalisation. Run it against today's editor and record the baseline in `fixtures/README.md` (FR-100, R23).

---

## Phase 2: Foundational (blocks every story)

**Purpose**: Tokens, translations, the module split, the overlay stack and shared URL helpers. No behaviour visible to users changes in this phase.

- [X] T005 [P] Add `BRIEF_UI` to `src/lib/tokens.ts` with the exact values in research R17 (`ink #18233F, label #68738D, faint #929CB0, line #E9EDF4, surface #F8FAFD, blue #3563E9, blueLight #EEF3FF, blueActive #E5EDFF`) plus `error: COLORS.coral`, exported `as const`. In `src/app/globals.css`, declare the same values once as CSS variables `--brief-ink`, `--brief-label`, `--brief-faint`, `--brief-line`, `--brief-surface`, `--brief-blue`, `--brief-blue-light`, `--brief-blue-active` in `:root`, with a comment naming `BRIEF_UI` as their source. CSS added later in this feature uses only these variables (C2).
- [X] T006 [P] Add a `briefEditor` namespace to `messages/en.json` and `messages/ar.json` containing every string the editor shows today: toolbar titles, Text style labels, Insert items and hints, ⋯ items, prompt labels, placeholders and CTAs, Saved/Saving…, "Click anywhere in the brief to edit", notes such as "Markdown copied" and "Could not create that subtask", and the editor placeholder. Give each one an Arabic translation.
- [X] T007 Split the editor without changing behaviour:
  - Move the `Toggle` node and `getMarkdown` to `src/components/kanban/brief-editor/extensions.ts`.
  - Move `ToolIcon`, `ToolButton` and `Sep` to `brief-editor/Toolbar.tsx`; `Menu` and `MenuItem` to `brief-editor/Menu.tsx`; the value prompt UI to `brief-editor/ValuePrompt.tsx`.
  - Replace the local `BR` constant with `BRIEF_UI` imports, and every literal string with `t('…')` from T006.
  - `BriefEditor.tsx` keeps the same props and import path. Run `npm run typecheck` and `npm run lab:brief`; `roundtrip-fixtures` must still pass.
- [X] T008 Create `brief-editor/useOverlayStack.ts` per data-model §5: `push({ id, close, returnFocusTo }) → pop fn`, `closeTop(): boolean`, `isEmpty()`. Provide it to child components through a React context exported from the same file (`OverlayStackProvider`, `useOverlay(id, open, close, returnFocusTo)`).
- [X] T009 [P] In `src/lib/links.ts` add:
  - `normaliseUrl(input: string): { ok: true; href: string } | { ok: false; reason: 'empty' | 'spaces' | 'not-an-address' }`. It accepts `http(s)://`, `mailto:`, `www.` and bare `host.tld[/path]` (adding `https://`), and rejects anything with whitespace or no dot in the host (R3).
  - `youtubeId` moved from `src/components/shared/Brief.tsx`; `Brief.tsx` re-imports it from `@/lib/links`.

**Checkpoint**: the lab passes, the editor looks and behaves exactly as before, and no colour literal or English literal remains in the moved code.

---

## Phase 3: User Story 1 — Saving I can trust (P1) 🎯 MVP

**Goal**: A failed save is visible and retried, never reported as "Saved", and never leaves the editor stuck (FR-001–005, research R1, R19).

**Independent test**: Lab modes `save=fail`, `save=throw` and `save=hang`: the status shows "Couldn't save · Retry"; after switching to `save=ok` and pressing Retry, the last saved text equals everything typed.

- [X] T010 [US1] Create `brief-editor/useSaveQueue.ts` implementing data-model §3:
  - State `{ status, latest, confirmed, inFlight, failures, nextRetryAt }`; `confirmed` advances only when `onSave` resolves `true`.
  - At most one request in flight; each send carries the newest `latest`.
  - A 20 s watchdog treats an unsettled call as failed.
  - Backoff 2 s / 5 s / 15 s / 30 s while in `error`, reset on success.
  - Exposes `update(text)`, `retry()`, `status`, and `flushOnUnmount()` (send once if `latest !== confirmed` and nothing is in flight).
  - Calls `onSaveStateChange` on every status change.
- [X] T011 [US1] Wire `useSaveQueue` into `src/components/kanban/BriefEditor.tsx`. Replace `pump`, `textRef`, `savedRef`, `inFlightRef` and `busySaving`; `onUpdate` calls `update(getMarkdown(editor))`. Change the props per `contracts/brief-editor-props.md`: `onSave: (md) => Promise<boolean>`, remove `saving`, add an optional `onSaveStateChange`.
- [X] T012 [P] [US1] In `src/components/kanban/TaskModal.tsx`, make `applyPatch` return `Promise<boolean>`. Wrap `await updateTask(...)` in `try/catch` so the promise resolves in every path: `true` on `res.success`, `false` on failure or throw, keeping the existing `setError` messages. Pass `onSave={next => applyPatch({ description: next })}`, remove `saving={isPending}`, and store the editor's `(state, pendingUploads)` from `onSaveStateChange` in a ref.
- [X] T013 [P] [US1] In `src/components/shared/TaskForm.tsx`, change the `BriefEditor` usage to `onSave={next => { setForm(f => ({ ...f, description: next })); return Promise.resolve(true) }}` and remove the `saving` prop.
- [X] T014 [US1] Add the save status to the toolbar in `brief-editor/Toolbar.tsx`:
  - `role="status"` with text from `t('saved' | 'saving' | 'couldntSave')`.
  - In error it shows a **Retry** button calling `retry()`, coloured `BRIEF_UI.error`.
  - Remove the duplicate status and the "Esc closes · select text for formatting" hint from the footer in `BriefEditor.tsx`; the footer keeps one-off notes only; the Done button is removed in T034 (FR-005, FR-014, R19).
- [X] T015 [US1] Add the unsaved-changes confirm bar (`brief-editor/ConfirmLeave.tsx`, registered on the overlay stack). Text: "Your last changes aren't saved." when `status === 'error'`, or "An image is still uploading." when `pendingUploads > 0` (the count comes from T023; it is 0 until US3 lands), with **Stay** (focus back to the editor) and **Leave anyway** (calls `onDone`). Click-away, Esc (empty stack) and Mod+Enter all route through it when either condition holds (FR-004). `BriefEditor.tsx` calls `onSaveStateChange(status, pendingUploads)` whenever either changes. In `TaskModal.tsx`, the panel's close control shows the same choice when the stored state is `'error'` or `pendingUploads > 0`, using the panel's existing inline styles, no `window.confirm`.
- [X] T016 [US1] Add lab scenarios `save-fail-shows-error`, `save-retry-sends-latest`, `save-hang-watchdog`, `leave-guard` and `single-status` to `scripts/brief-editor-lab/scenarios.mjs`, as described in quickstart.md §2.

**Checkpoint**: US1 is shippable alone. Saving is trustworthy in both hosts.

---

## Phase 4: User Story 2 — Links that behave (P1)

**Goal**: Click to edit a link, Open/Edit/Remove from a card, Mod+K, and addresses saved with `https://` (FR-020–025, R3).

**Independent test**: Lab scenarios `link-*` pass. Clicking a link opens no page.

- [X] T017 [US2] In `brief-editor/extensions.ts`, configure StarterKit's link: `StarterKit.configure({ link: { openOnClick: false, autolink: true, linkOnPaste: true, defaultProtocol: 'https', isAllowedUri: (url) => normaliseUrl(url).ok } })`. Use it in `BriefEditor.tsx` instead of the bare `StarterKit`.
- [X] T018 [US2] Create `brief-editor/LinkCard.tsx`: a `BubbleMenu` with `shouldShow={({ editor }) => editor.isActive('link')}`, `role="dialog"` and `aria-label` set to the host. It shows `hostOf(href)` plus `prettyPath(href)` shortened to 32 characters, with the full URL in `title`. Buttons:
  - **Open ↗**: a real `<a href target="_blank" rel="noopener noreferrer">`.
  - **Edit**: opens ValuePrompt `link`, pre-filled.
  - **Remove**: `chain().focus().extendMarkRange('link').unsetLink().run()`.
  Delete the formatting `BubbleMenu` from `BriefEditor.tsx` (FR-021, FR-025).
- [X] T019 [US2] Add a `LinkShortcut` extension in `brief-editor/extensions.ts` (`addKeyboardShortcuts: { 'Mod-k': () => { openLinkPrompt(); return true } }`, with the callback passed through extension options), so Mod+K opens the link prompt (FR-024).
- [X] T020 [US2] In `brief-editor/ValuePrompt.tsx`, validate the `link` kind with `normaliseUrl`:
  - Show the localized reason under the input; disable the CTA while invalid.
  - On confirm, use `ok.href`: with no selection, insert the text as a link; with a selection, `extendMarkRange('link').setLink({ href })`.
  - Pre-fill from `editor.getAttributes('link').href` (FR-022, FR-023).
- [X] T021 [US2] Add lab scenarios `link-click-no-open`, `link-open-edit-remove`, `link-mod-k` and `link-normalise` to `scripts/brief-editor-lab/scenarios.mjs`.

---

## Phase 5: User Story 3 — Screenshots straight into the brief (P1)

**Goal**: Paste or drop images and they upload as task attachments and appear in place; image addresses are checked first (FR-030–036, R4, R5, R22).

**Independent test**: Lab `upload=ok`: a synthetic paste and a drop of 3 PNGs insert 3 images in order; `upload=fail` leaves no placeholder and shows a note naming the file.

- [X] T022 [US3] In `brief-editor/ValuePrompt.tsx`, for the `image` kind:
  - Run `normaliseUrl`, then preload with `new Image()` and an 8 s timeout, showing a 120 px preview once loaded.
  - Enable **Insert** only after `onload`; show `t('imageWontLoad')` on error or timeout.
  - Insert as a block after the current block, followed by an empty paragraph, via `insertContentAt`. Attachment chips insert the same way (FR-030, FR-031).
- [X] T023 [US3] Create `brief-editor/imageUpload.ts`: a Tiptap `Extension` named `ImageUpload` with options `{ upload?: (f: File) => Promise<UploadResult>, onNote: (msg: string) => void, unavailableReason }` and a ProseMirror plugin that:
  1. In `handlePaste` and `handleDrop`, collects `image/*` files. It refuses non-images with `t('notAnImage')` and leaves non-file pastes to default handling.
  2. If `upload` is absent, shows the note for `unavailableReason` (`not-created` / `no-permission` / `no-storage`) and returns `true`.
  3. Enforces `MAX_UPLOAD_BYTES` and `MAX_ATTACHMENTS_PER_GO` from `@/lib/attachments`, reporting skipped files.
  4. Adds a widget decoration per file ("Uploading {filename}…", `aria-live="polite"`) keyed by job id, at the cursor or drop position, mapped through every transaction (data-model §4).
  5. Uploads sequentially. On `{ ok: true, url }` it inserts `image { src: url, alt: filename }` at the mapped position, or at the cursor if that position was deleted, and removes the decoration. On failure it removes the decoration and calls `onNote` with the file name and error.
  6. Returns `true` from handled drops so ProseMirror prevents the default.
  7. Exposes the number of `queued` + `uploading` jobs to `BriefEditor.tsx` through an `onPendingChange(n)` option, which feeds the leave guard (T015) and `onSaveStateChange` (U1).
- [X] T024 [US3] In `BriefEditor.tsx`, add the props `onUploadImages?: (file: File) => Promise<UploadResult>` and `uploadUnavailableReason?`, and export the `UploadResult` type, per `contracts/brief-editor-props.md`. Register `ImageUpload` with them, and show notes in the footer note slot for 4 s.
- [X] T025 [US3] In `src/components/kanban/TaskModal.tsx`:
  - Extract the per-file body of `uploadToBucket` into `async function uploadOne(file: File): Promise<UploadResult>`, keeping the size check, unique `ref`, `res.redirected` and `json.ref !== ref` checks and messages. It returns `{ ok: true, url: json.attachment.url, filename }` or `{ ok: false, error }`.
  - Make `uploadToBucket` loop over `uploadOne`, keeping the thumbnail, `setUploadError`, `setReloadFiles` and `router.refresh()` behaviour.
  - Pass `onUploadImages={canEdit && hasStorage ? async f => { const r = await uploadOne(f); setReloadFiles(n => n + 1); router.refresh(); return r } : undefined}` and `uploadUnavailableReason={!canEdit ? 'no-permission' : 'no-storage'}`.
- [X] T026 [US3] In `src/components/kanban/TaskModal.tsx`, the window-level `onDrop` in the drag `useEffect` returns early `if (e.defaultPrevented)`, so a drop handled by the editor is not uploaded a second time (R5).
- [X] T027 [P] [US3] In `src/components/shared/TaskForm.tsx`, pass `uploadUnavailableReason="not-created"` to `BriefEditor` (R22).
- [X] T028 [US3] Add lab scenarios `paste-image`, `drop-images-order`, `upload-fail`, `image-url-validate`, `image-roundtrip` and `leave-during-upload` to `scripts/brief-editor-lab/scenarios.mjs`. `leave-during-upload` uses an `upload=slow` stub (3 s): click away or press Esc mid-upload; the confirm bar reads "An image is still uploading", and Stay keeps editing until the image is inserted. Paste and drop use a synthetic `ClipboardEvent` / `DragEvent` with a `DataTransfer` holding PNG `File`s; the `upload=ok` stub returns a data-URL `url`.

---

## Phase 6: User Story 4 — No accidental damage (P1)

**Goal**: Click the brief to edit at that spot and click away to finish, with no Edit or Done buttons; Esc closes only the top overlay; Clear format touches only the selection; Undo/Redo buttons (FR-010–017, R2, R7, R25).

**Independent test**: Click a word in the read brief: the cursor lands on it and the text doesn't move; click outside: editing ends. For each of Style, Insert and ⋯, open it and press Esc: the menu closes and the editor stays. Clear format is disabled with no selection.

- [X] T029 [US4] Route Esc through the overlay stack:
  - Wrap the editor tree in `OverlayStackProvider` in `BriefEditor.tsx`.
  - `brief-editor/Menu.tsx`, `ValuePrompt.tsx` and `LinkCard.tsx` (edit mode) register with `useOverlay` while open, and close on Esc keydown with focus returned to their opener.
  - `editorProps.handleKeyDown` handles Esc as `closeTop()` → else the confirm bar if `status === 'error'` → else `onDone` (contracts/keyboard-and-a11y.md "Esc layering").
  - Keep the click-away layer for pointer users.
- [X] T030 [P] [US4] In `brief-editor/Toolbar.tsx` / `BriefEditor.tsx`, make Clear format in the ⋯ menu disabled when `editor.state.selection.empty`, and otherwise run `chain().focus().unsetAllMarks().clearNodes().run()` with no `selectAll` fallback. Update its hint to `t('clearFormatHint')`, "selected text" (FR-012).
- [X] T031 [P] [US4] Add Undo and Redo buttons as the first toolbar group in `brief-editor/Toolbar.tsx`: `editor.chain().focus().undo().run()` / `redo()`, disabled via `!editor.can().undo()` / `redo()`, with tooltips showing the platform shortcut (FR-013). Add the icons to `ToolIcon`.
- [X] T032 [US4] Add lab scenarios `esc-closes-menu-only`, `clear-format-selection-only` and `undo-redo-buttons` to `scripts/brief-editor-lab/scenarios.mjs`.
- [X] T033 [US4] In `BriefEditor.tsx` (with `brief-editor/useOverlayStack.ts`):
  - Add the optional prop `initialCursor?: { block: number; offset: number }`. On create, resolve it by walking the doc's top-level nodes to `block`, then text offset `offset` (clamped to the block's end), and `setTextSelection` there. Fall back to `'end'`.
  - While mounted with `onDone`, listen for `pointerdown` on `document`. A press outside the editor root and outside any registered overlay runs the Esc chain from T029: close the top overlay, else the confirm bar if `error` or an upload is pending, else `onDone`. Ignore it when a drag-selection started inside the editor. Never `preventDefault`, so the clicked control still receives its click.
  - Delete the Done button from the footer (FR-014, FR-016, research R25).
- [X] T034 [US4] In `src/components/kanban/TaskModal.tsx`, change the read-brief `onClick` (the `div` wrapping `<Brief>`, ~line 1996). Before `setEditingBrief(true)`:
  - Compute `initialCursor` from `document.caretRangeFromPoint(e.clientX, e.clientY)` (or `caretPositionFromPoint`): the index of the clicked top-level child of the `Brief` root and the character offset of the caret within that child's `textContent`.
  - Record that child's `getBoundingClientRect().top`.
  After the editor mounts (`useLayoutEffect` keyed on `editingBrief`), scroll the panel's scroll container by `newTop − oldTop`, so the text stays put (FR-015, SC-011). Pass `initialCursor` and keep `onDone={() => setEditingBrief(false)}`. Keyboard: Enter/Space on the focused brief still starts editing at the end. Links and checkboxes keep their current read-view behaviour (FR-017).
- [X] T035 [US4] Add lab scenarios to `scripts/brief-editor-lab/scenarios.mjs`. The lab entry gets a `#host=modal` mode that renders `Brief` and swaps to `BriefEditor` on click, the way `TaskModal` does.
  - `click-to-edit-cursor`: click a word in a paragraph, list item, heading and table cell; the caret is inside that word and the word moved ≤ 4 px.
  - `click-away-exits`: a click outside ends editing; with `save=fail`, the confirm bar shows instead.
  - `menu-then-click-away`: the first outside click closes an open menu only.
  - `drag-select-outside`: a selection dragged past the editor's edge keeps editing.
  - `read-link-opens`: in read mode a link click opens a new page.

**Checkpoint**: All P1 stories are done. This is the recommended first release.

---

## Phase 7: User Story 5 — Keyboard-first and findable (P2)

**Goal**: The "/" menu, fully keyboard-operable menus and toolbar, screen-reader roles, and a correct Text style menu (FR-040–047, R6, R16, R21).

**Independent test**: Keyboard only: `/tab` + Enter inserts a table; every menu works with arrows/Enter/Esc; the axe scan reports no critical issues.

- [X] T036 [US5] Rewrite `brief-editor/Menu.tsx` as an accessible menu:
  - `role="menu"`; items `menuitem`, or `menuitemradio` with `aria-checked` when given a `checked` prop.
  - On open, focus the checked item or the first item. Arrow Up/Down wrap; Home/End; first-letter typeahead; Enter/Space choose; Esc closes and returns focus to the trigger; Tab closes.
  - Triggers get `aria-haspopup="menu"` and `aria-expanded`.
  - Menu position uses `insetInlineStart`.
- [X] T037 [US5] Make `brief-editor/Toolbar.tsx` a `role="toolbar"` with `aria-label={t('toolbar')}` and roving `tabIndex`: one stop in the Tab order; Arrow Left/Right move, reversed when `getComputedStyle(el).direction === 'rtl'`; Home/End. Toggle buttons get `aria-pressed={active}`. In `BriefEditor.tsx` set `editorProps.attributes` to `{ class: 'fx-brief fx-brief-edit', 'aria-label': t('label'), 'aria-multiline': 'true', role: 'textbox' }` (FR-045, FR-046).
- [X] T038 [US5] In the Text style menu, use `setParagraph()` / `setHeading({ level })` instead of `toggleHeading`, and pass `checked` for the current style so it shows ✓ (FR-047).
- [X] T039 [US5] Create `brief-editor/blocks.ts`, exporting `BLOCK_ITEMS: { id, labelKey, keywords: string[] /* EN + AR */, icon, mdHint?, run(editor, ctx) }[]`. It covers Normal text, Heading 1–3, Bulleted list, Numbered list, Task, Quote, Divider, Image, Table, Toggle list, YouTube, Table of contents and (when `onCreateSubtask` exists) New subtask. The Insert menu and Text style menu render from it, with `mdHint` shown as a muted right-aligned hint (FR-043, R21).
- [X] T040 [US5] Add a `SlashCommand` extension in `brief-editor/extensions.ts` using `@tiptap/suggestion`:
  - Settings: `char: '/'`, `allowSpaces: false`, and `allow: ({ state, range }) =>` true only when `range.from` is the start of the textblock or the previous character is whitespace (FR-042).
  - `items: ({ query })` filters `BLOCK_ITEMS` by label and keywords, case-insensitive.
  - `command` deletes the range and runs the item.
  - Render with a new `brief-editor/SlashMenu.tsx`: a `role="listbox"` floating list positioned from `clientRect`, with arrow, Enter and Esc handling via the suggestion `onKeyDown`. Esc leaves the typed "/" (FR-040, FR-041). Register it on the overlay stack while open.
- [X] T041 [US5] Change the editor placeholder to `t('placeholder')`, "Write the brief… type / for blocks", in `BriefEditor.tsx`. Add Markdown and keyboard hints to toolbar tooltips via `brief-editor/Toolbar.tsx` (FR-043).
- [X] T042 [US5] Add lab scenarios `slash-menu`, `menu-keyboard`, `style-checkmark` and `a11y-roles` to `scripts/brief-editor-lab/scenarios.mjs`. `a11y-roles` injects `node_modules/axe-core/axe.min.js` and runs `axe.run` with each menu open in turn, failing on any `critical` violation (SC-007).

---

## Phase 8: User Story 6 — Blocks that do what they say (P2)

**Goal**: Task inserts below; YouTube as a real block; table menu; resizable tables (columns and both outer edges); toggle placeholders; TOC block (FR-060–069, R8–R12, R26).

**Independent test**: Insert each block below an existing paragraph; the paragraph is unchanged and every block survives close and reopen (`roundtrip-fixtures` still passes). Resize a table's columns and outer edges, reopen: sizes are kept within ±1%.

- [X] T043 [US6] Implement the Task item's `run` in `brief-editor/blocks.ts`. If `editor.isActive('taskItem')`, run `splitListItem('taskItem')`. Otherwise `insertContentAt($from.after(depth 1), { type: 'taskList', content: [{ type: 'taskItem', attrs: { checked: false }, content: [{ type: 'paragraph' }] }] })` and place the cursor inside (FR-062, R9).
- [X] T044 [US6] Add a `Youtube` node in `brief-editor/extensions.ts`: atom block, attrs `{ src }`.
  - `parseHTML`: priority 60, tag `p`, with `getAttrs` accepting a paragraph whose only meaningful child is an `<a>` with a YouTube href, or whose trimmed text is a YouTube URL (use `youtubeId`).
  - Markdown serializer: `state.write('<' + src + '>'); state.closeBlock(node)`.
  - Node view: thumbnail `https://i.ytimg.com/vi/${id}/hqdefault.jpg`, a play badge and the URL text, selectable and deletable as one unit.
  - In `ValuePrompt.tsx`, the `youtube` kind validates with `youtubeId` (FR-061) and inserts the node as a block. Add `youtube.md` cases to the fixtures check (FR-060).
- [X] T045 [US6] Create `brief-editor/TableMenu.tsx`: a `BubbleMenu` shown when `editor.isActive('table')`, with buttons for `addRowBefore`, `addRowAfter`, `addColumnBefore`, `addColumnAfter`, `deleteRow`, `deleteColumn` and `deleteTable`. It uses localized labels and icons and registers on the overlay stack. Change the Table item in `blocks.ts` to `insertTable({ rows: 3, cols: 3, withHeaderRow: true })` (FR-063, FR-064).
- [X] T046 [P] [US6] In `src/app/globals.css`, add editor-only table rules (colours, if any, only via the `--brief-*` variables from T005): `.fx-brief-edit .tableWrapper { overflow-x: auto; margin: 0 0 .7em }` and `.fx-brief-edit table { display: table; width: 100%; table-layout: fixed }`. Leave the read-view `.fx-brief table` rules unchanged (R10).
- [X] T047 [US6] In `brief-editor/extensions.ts`, change Toggle:
  - Insert with `summary: ''` and an empty paragraph body (no filler text).
  - The node view's `<summary>` gets `data-placeholder={t('toggleTitle')}`, with CSS `summary:empty::before { content: attr(data-placeholder); color: var(--muted) }` in `globals.css`.
  - Configure `Placeholder` with `includeChildren: true` and a function returning `t('toggleBody')` for empty paragraphs inside a toggle and the default placeholder elsewhere.
  - The serializer writes `t('toggleDefaultTitle')` ("Details") when the summary is empty.
  - Existing toggles stay unchanged (FR-065, R11).
- [X] T048 [US6] Add a `Toc` node in `brief-editor/extensions.ts`: atom block.
  - `parseHTML`: tag `p` with exact text `[[toc]]`, priority 60.
  - Serializer: `state.write('[[toc]]'); state.closeBlock(node)`.
  - Node view: a labelled box `t('tocLabel')` listing the document's current headings, refreshed on `update`.
  - Remove the `\[\[toc\]\]` un-escape in `getMarkdown` (FR-066, R12).
- [X] T049 [US6] Add lab scenarios `task-insert-below`, `youtube-block`, `table-menu`, `toggle-placeholders` and `toc-block` to `scripts/brief-editor-lab/scenarios.mjs`. Re-run `roundtrip-fixtures`.
- [X] T050 [US6] Enable column resizing in `brief-editor/extensions.ts`:
  - `TableKit.configure({ table: { resizable: true, handleWidth: 6, cellMinWidth: 64, lastColumnResizable: true } })` for the borders between columns.
  - Add a `TableEdges` ProseMirror plugin in `brief-editor/tableEdges.ts`. It adds widget decorations on the table's start and end edges (mirrored in RTL) and adds `width` (default 100) and `offset` (default 0) attrs to the table node, rendered as `style="width:W%;margin-inline-start:O%"`. Dragging the end edge changes `width`; dragging the start edge changes `offset` and `width` together. The edge column's `colwidth` absorbs the change, clamped to `offset + width ≤ 100` and columns ≥ 64 px.
  - In `src/app/globals.css`, style `.fx-brief-edit .column-resize-handle` as a 3 px bar coloured `var(--brief-blue)` and set `.fx-brief-edit.resize-cursor { cursor: col-resize }`. Widen the hit area to 14 px under `@media (pointer: coarse)`.
  - In `brief-editor/TableMenu.tsx`, show a small badge while dragging (two column percentages for an inner border, or the table's width percentage for an outer edge). Add **Equal widths** (clears every `colwidth`) and **Full width** (resets `width`/`offset`) buttons (FR-067, FR-069, research R26).
- [X] T051 [US6] Persist widths in `brief-editor/extensions.ts` by extending the table node's Markdown `serialize` and its `parseHTML` attributes:
  - When any cell in the first row has a `colwidth`, or `width`/`offset` differ from 100/0, write the table as HTML `<table data-widths="a,b,c" data-width="W" data-offset="O">` (omit `data-width`/`data-offset` at their defaults) with `<thead>`/`<tbody>`. Serialize each cell's content as HTML with ProseMirror's `DOMSerializer.fromSchema(schema)` (this keeps lists, several paragraphs, images, links and marks in full; U2), and strip editor-only attributes such as `class` and `data-*` other than the three size attributes. Widths are integer percentages summing to 100, from the first row's `colwidth`s.
  - Otherwise keep the existing GFM serializer untouched.
  - `parseHTML` reads `data-widths` and sets each column's `colwidth` to `percent × table width`, and reads `data-width`/`data-offset` into the attrs.
  - Add `fixtures/table-widths.md` (including one cell with a bulleted list and one with two paragraphs) and extend `roundtrip-fixtures` (FR-068, SC-012).
- [X] T052 [P] [US6] In `src/components/shared/Brief.tsx`, allow the `data-widths`, `data-width` and `data-offset` attributes on `table` in the sanitize schema (next to the `details`/`summary` additions, ~line 32). In the `table` component renderer, emit `<colgroup>` with one `<col style={{ width: n + '%' }}>` per value, with `tableLayout: 'fixed'`, `width: (data-width ?? 100) + '%'` and `marginInlineStart: (data-offset ?? 0) + '%'` (FR-068).
- [X] T053 [US6] Add lab scenarios to `scripts/brief-editor-lab/scenarios.mjs`:
  - `table-resize`: drag a column border; both columns change, neither goes below 64 px.
  - `table-edges`: drag the end edge inwards, so the table narrows and the last column absorbs it; drag the start edge inwards, so the table's start moves; dragging outwards stops at the brief's edges. Repeat with `locale=ar`.
  - `table-widths-roundtrip`: resize, close, reopen, and render through `Brief`; widths are equal within ±1% (SC-012).
  - `table-equal-widths`: Equal widths plus Full width restores a GFM pipe table in the saved Markdown.

---

## Phase 9: User Story 7 — Long briefs and phones (P2)

**Goal**: The toolbar stays visible while scrolling and is one row on phones (FR-070, FR-071, R13, R14).

**Independent test**: Lab `sticky-toolbar` (toolbar top ≥ 0 after scrolling a 60-line brief) and `phone-toolbar` (390 px: toolbar height ≤ one row; `scrollWidth === innerWidth`).

- [ ] T054 [US7] In `BriefEditor.tsx` / `brief-editor/Toolbar.tsx`:
  - Remove `overflow: hidden` from the editor's outer wrapper.
  - Give the toolbar `position: sticky; top: 0; zIndex: 5` and its own `borderRadius: '18px 18px 0 0'`; the content area keeps `'0 0 18px 18px'`.
  - Make sure no ancestor inside `BriefEditor` sets overflow.
  - Check inside the task panel's scroll container in `TaskModal.tsx` that the toolbar sticks (FR-070).
- [ ] T055 [US7] In `brief-editor/Toolbar.tsx`, below 480 px (use `useIsPhone` from `@/hooks/useMediaQuery`):
  - `flexWrap: 'nowrap'`, `overflowX: 'auto'`, hidden scrollbar.
  - Order: Undo, Redo, Style, B, I, bullet list, numbered list, link, + Insert, ⋯ (strike, code, quote move into ⋯).
  - Separators become `borderInlineStart` on groups 2+.
  - The status becomes an 8 px dot (grey `BRIEF_UI.faint` / pulsing `BRIEF_UI.blue` / `BRIEF_UI.error`) with visually hidden text, expanding to "Couldn't save · Retry" in error (FR-071, R14).
- [ ] T056 [US7] Add lab scenarios `sticky-toolbar` and `phone-toolbar` to `scripts/brief-editor-lab/scenarios.mjs`.

---

## Phase 10: User Story 8 — Arabic (P2)

**Goal**: Every editor string in Arabic and every floating element mirrored in RTL (FR-090, FR-091, R18).

**Independent test**: Lab `locale=ar`: there is no Latin-letter text in the editor UI other than URLs and filenames, and the toolbar's first group is at the right edge.

- [ ] T057 [US8] Review and complete the Arabic translations for every `briefEditor` key in `messages/ar.json`, so the key set matches `messages/en.json` exactly (add a lab check that compares the two). Add Arabic `/` keywords to `BLOCK_ITEMS` in `brief-editor/blocks.ts` (e.g. جدول, عنوان, قائمة, مهمة, صورة, فيديو). Build shortcut labels per platform (⌘ vs Ctrl) in one helper, `brief-editor/shortcut.ts`.
- [ ] T058 [US8] RTL pass over `src/components/kanban/brief-editor/*` and `BriefEditor.tsx`:
  - Replace any `left`/`right`/`marginLeft`/`paddingRight` with logical properties.
  - `LinkCard`, `TableMenu` and `SlashMenu` read `dir` from `editor.view.dom` and pass `placement: dir === 'rtl' ? 'bottom-end' : 'bottom-start'` to their floating options.
  - Confirm the toolbar arrow-key reversal from T037 (FR-091).
- [ ] T059 [US8] Add lab scenario `arabic` to `scripts/brief-editor-lab/scenarios.mjs`: with `locale=ar`, open each menu, the link card, the table menu and the "/" menu, and assert no `[A-Za-z]{3,}` text outside URLs and filenames (SC-009). Take an RTL screenshot.

---

## Phase 11: User Story 9 — What you see is what's saved (P3)

**Goal**: Underline survives clicking away; list spacing matches; editor colours are tokens only (FR-080–082, R15, R17, R20).

**Independent test**: Render saved Markdown through `Brief` in the lab: `<u>` is present and `li > p` margin is 0 in both views. A grep finds no hex literal in the editor modules.

- [ ] T060 [P] [US9] In `src/components/shared/Brief.tsx`, add `'u'` to the sanitize schema's `tagNames` (line ~32) (FR-080).
- [ ] T061 [P] [US9] In `src/app/globals.css`, add `.fx-brief li > p { margin: 0 }` and `.fx-brief li > p + p { margin-top: .35em }` (FR-081).
- [ ] T062 [US9] Make sure `src/components/kanban/BriefEditor.tsx` and `src/components/kanban/brief-editor/*` contain no colour literals: `grep -nE "#[0-9A-Fa-f]{3,8}\b|rgba?\(" src/components/kanban/BriefEditor.tsx src/components/kanban/brief-editor/` returns nothing. Replace shadows' `rgba(24,35,63,…)` with values derived from `BRIEF_UI.ink`, using a small `alpha(hex, a)` helper added to `src/lib/tokens.ts` (FR-082).
- [ ] T063 [US9] Add lab scenarios `underline-readview` and `list-spacing` to `scripts/brief-editor-lab/scenarios.mjs`. The lab entry also mounts `Brief` from `@/components/shared/Brief` with `#view=read` to render saved Markdown.

---

## Phase 12: Polish and cross-cutting

- [ ] T064 Run `npm run typecheck`, `npm run lint` and `npm run lab:brief`; fix every failure. `roundtrip-fixtures` must match the T004 baseline (FR-100, FR-101, SC-010).
- [ ] T065 Do the manual checks in the running app from `specs/005-brief-editor-ux/quickstart.md` §3 (bucket upload, single attachment per drop, offline save failure and Retry, click-away during an upload, Arabic, Create Task form note, phone scroll), and record the results in the PR description. Include the SC-003 timing: paste a 5 MB PNG on the live bucket over an office connection, measure from paste to the image appearing (DevTools Performance or a stopwatch), and record the time; it must be under 5 s (G1).
- [ ] T066 [P] Update `HANDOVER.md` with a short "Brief editor" section: the save contract (`onSave → Promise<boolean>`), paste/drop upload path, the new nodes (YouTube, TOC), the lab command, and the `BRIEF_UI` tokens.
- [ ] T067 [P] Write the PR's "Constitution Check" note as Governance requires, covering §I (BRIEF_UI tokens and the mirrored `--brief-*` CSS variables), §III (upload offered only when `canEdit && hasStorage`, server guard unchanged), §IV (`design/brief-editor-ux.html`, committed as plain HTML rather than the compressed bundle format, with the reasoning from plan.md), §V (Arabic strings as message data) and the `@tiptap/suggestion` addition. Note the follow-up: switch `TaskModal`'s and `TaskForm`'s `CU` constants to `BRIEF_UI`.

---

## Dependencies and execution order

### Phase dependencies

| Phase | Depends on | Notes |
|---|---|---|
| Setup (T001–T004) | none | T001 must be done before any UI task in Phases 3–11. |
| Foundational (T005–T009) | Setup | Blocks every story. T007 depends on T005 and T006. |
| US1 (Phase 3) | Foundational | Needs T008 for the confirm bar. |
| US2 (Phase 4) | Foundational | Needs T009 for `normaliseUrl`. |
| US3 (Phase 5) | Foundational | T022 needs T009; T025–T027 are host-side and independent of T023. |
| US4 (Phase 6) | Foundational | T029 uses T008; the confirm-bar branch of T029 uses T015 from US1. Without US1, Esc on an empty stack goes straight to `onDone`. T033 needs T029; T034 needs T033. |
| US5 (Phase 7) | US4 T029 | Menus must be on the overlay stack. |
| US6 (Phase 8) | Foundational and US5 T039 | Block items live in `blocks.ts`. |
| US7 (Phase 9) | Foundational | Independent of the other stories. |
| US8 (Phase 10) | US5 and US6 | Translates their new UI. Strings are already keyed from T006 onward, so this is completion and RTL. |
| US9 (Phase 11) | none for T060 and T061 | T062 after T007. Can run any time. |
| Polish (T064–T067) | all stories intended for the release | none |

### Story graph

```text
Setup → Foundational ─┬─ US1 (P1) ─┐
                      ├─ US2 (P1)  │
                      ├─ US3 (P1)  ├─ release 1 (MVP: P1)
                      ├─ US4 (P1) ─┘
                      │     └─ US5 (P2) ─ US6 (P2) ─ US8 (P2)
                      ├─ US7 (P2)
                      └─ US9 (P3)  (T060, T061 any time)
```

### Within each story

1. Module or extension.
2. Wiring into `BriefEditor.tsx`.
3. Host changes (`TaskModal`, `TaskForm`).
4. Lab scenarios.

Commit after each task; run `npm run typecheck` before each commit.

## Parallel opportunities

| When | Tasks that can run at the same time |
|---|---|
| Setup | T003 and T004 |
| Foundational | T005, T006 and T009 |
| US1 | T012 and T013 (different host files), once T011 has changed the props |
| US3 | T027 alongside T022–T025; T025 and T026 touch the same file, so in sequence |
| US4 | T030 and T031; T034 (`TaskModal.tsx`) alongside T033 once the `initialCursor` prop shape is fixed |
| US6 | T046 (CSS) alongside T043–T045; T052 (`Brief.tsx`) alongside T050–T051 |
| US9 | T060 and T061 at any point |
| Across stories | US2, US3 and US7 can be built by different people at once after Foundational, because they touch different modules; `BriefEditor.tsx` wiring edits must be merged one at a time |

**Example, US1**

```text
After T011:
  Task: "T012 TaskModal applyPatch → Promise<boolean>"   (src/components/kanban/TaskModal.tsx)
  Task: "T013 TaskForm onSave returns true"               (src/components/shared/TaskForm.tsx)
```

**Example, US3**

```text
Agent A: T022 → T023 → T024   (brief-editor/ValuePrompt.tsx, imageUpload.ts, BriefEditor.tsx)
Agent B: T025 → T026          (TaskModal.tsx)
Agent C: T027                 (TaskForm.tsx)
then T028
```

## Implementation strategy

### MVP: US1 only

Setup, Foundational, then US1 (T001–T016). That alone ends the silent data-loss risk, the most serious finding. Ship it once `save-*` lab scenarios and the manual offline check pass.

### Release 1: all P1 stories

Add US2, US3 and US4 (T017–T035). These cover every HIGH item in the audit (E1–E7).

### Release 2: P2 stories

US5, US6, US7, US8 (T036–T059).

### Any time: P3

US9 (T060–T063). T060 and T061 are one-line changes that can go in the first PR.

### Requirement coverage

| Requirements | Tasks |
|---|---|
| FR-001–005 | T010–T016 |
| FR-010–013 | T029–T032, T015 |
| FR-014–017 | T033–T035 |
| FR-020–025 | T017–T021 |
| FR-030–036 | T022–T028 |
| FR-040–047 | T036–T042 |
| FR-060–066 | T043–T049 |
| FR-067–069 | T050–T053 |
| FR-070–071 | T054–T056 |
| FR-080–082 | T060–T063, T005, T007 |
| FR-090–091 | T006, T057–T059 |
| FR-100–101 | T004, T064 |
