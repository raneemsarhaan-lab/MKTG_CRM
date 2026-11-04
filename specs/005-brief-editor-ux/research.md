# Research: Brief Editor UX Overhaul

**Feature**: [spec.md](./spec.md) · **Plan**: [plan.md](./plan.md) · **Date**: 2026-11-04

Every decision below was checked against the installed code: Tiptap 3.31.3, `tiptap-markdown` 0.9.0, `src/components/kanban/BriefEditor.tsx`, `TaskModal.tsx`, `TaskForm.tsx`, `Brief.tsx`, `src/app/api/attachments/[ref]/route.ts`, `src/actions/tasks.ts`. Where a finding came from running the editor (the 2026-11-04 audit harness), it says so.

---

## R1. Save contract and failure handling (FR-001–005, E7)

**Finding (worse than the audit said).** Two defects compound:

1. `BriefEditor.pump()` sets `savedRef = next` *before* calling `onSave`, so a failed save is never retried and the status returns to "Saved".
2. `TaskModal.applyPatch()` never rejects. On `{ success: false }` it writes the error to the panel's error line and resolves. And if `updateTask` *throws* (network drop, stale server-action id after a deploy), the `await` inside `startTransition` throws before `resolve()` runs. The promise **never settles**, so `inFlightRef` stays `true` forever and every later keystroke is silently queued and never sent. The status shows "Saving…" indefinitely.

**Decision.**
- `onSave` returns `Promise<boolean>`: `true` means stored, `false` means not stored. Hosts MUST settle it in every path. `applyPatch` wraps the action in `try/catch` and resolves `false` on throw or `{ success: false }`.
- The editor marks text as saved only on `true`. On `false` the state becomes `error`; the newest text stays queued.
- Automatic retry with backoff (2 s, 5 s, 15 s, then every 30 s) while in `error`, plus a manual **Retry**. Any keystroke also triggers a send. A send always carries the newest text (the existing one-request-at-a-time rule is kept).
- A watchdog: if a save has not settled after 20 s, treat it as failed (covers hosts that break the contract).
- Leaving (Done, Esc, or the host closing the panel) while `error` shows an in-editor confirm bar: "Your last changes aren't saved. **Stay** · Leave anyway". The editor exposes its state via `onSaveStateChange` so `TaskModal`'s own close button can ask the same question.
- On unmount the existing "send whatever is unsent" behaviour stays.

**Rationale.** It fixes both the false "Saved" and the hang, keeps the race-free single-flight queue that already works, and needs no server change.

**Alternatives considered.** Throwing from `onSave` on failure: rejected, because callers already use `void` in places and an escaped rejection is invisible. `beforeunload` prompt: kept only as a secondary guard for tab close, because browser prompts can't carry custom copy.

## R2. Esc layering (FR-010, FR-011, E1)

**Finding.** `editorProps.handleKeyDown` maps Esc to `onDone` unconditionally. Menus close only through a click-away layer, so Esc with a menu open closes the editor (reproduced in the harness).

**Decision.** A small overlay stack (`useOverlayStack`): every menu, card, prompt and confirm bar registers on open. Esc pops the top overlay and restores focus to its opener; only an empty stack lets Esc reach `onDone`. Menus listen for Esc themselves (they hold focus); the editor's `handleKeyDown` checks `stack.isEmpty()` first.

**Alternatives.** Swallowing Esc while any menu is open, without focus restore: rejected, because it fails FR-011.

## R3. Links (FR-020–025, E2, E3, E8, E9, E21)

**Findings.** StarterKit 3 registers Link with `openOnClick: true` (a click opens a tab, reproduced). `defaultProtocol` is unset, and the prompt stores whatever is typed (`forefront.consulting` became a relative link, reproduced). There is no Ctrl+K binding. The `BubbleMenu` repeats B/I/S/code/link already in the toolbar.

**Decisions.**
- Configure `StarterKit.configure({ link: { openOnClick: false, autolink: true, linkOnPaste: true, defaultProtocol: 'https', isAllowedUri } })`.
- Add `normaliseUrl(input)` to `src/lib/links.ts`. It accepts `http(s)://…`, `mailto:`, a bare domain or `www.` (adding `https://`), and rejects input with spaces or without a dot in the host. It sits next to the existing `hrefFor` and `hostOf` helpers so client and server agree.
- Replace the formatting `BubbleMenu` with a **LinkCard** bubble shown when `editor.isActive('link')`. The card shows host and short path (using the existing `hostOf`/`prettyPath`), with **Open ↗** (`<a target="_blank" rel="noopener">`), **Edit** (opens the prompt pre-filled) and **Remove** (`extendMarkRange('link').unsetLink()`).
- Ctrl/⌘+K via a tiny `addKeyboardShortcuts` extension that opens the link prompt.

**Alternatives.** Keep `openOnClick` with Ctrl-click to edit: rejected, because it's undiscoverable and the inverse of every editor people know.

## R4. Image by address (FR-030, FR-031, E4)

**Finding.** `setImage({ src })` accepts any text. In the harness `![](not a url)` was saved, and on reopening the Markdown parser dropped it (spaces in the destination), so the image vanished. The image was also inserted inline, gluing the next insert onto the same line.

**Decision.** In the prompt: `normaliseUrl` first; then preload with `new Image()` (8 s timeout) and show a 120px preview; enable **Insert** only after `onload`. Insert as its own block (`insertContentAt` after the current block, followed by an empty paragraph). The attachment chips keep working.

**Alternatives.** A server-side HEAD check: rejected. It needs a new route, and `getLinkPreview`'s SSRF rules would block many CDNs.

## R5. Paste and drop screenshots (FR-032–036, E6)

**Findings.**
- Nothing in the editor handles image data or files.
- In the real app `TaskModal` installs a **window-level** `drop` listener that uploads any dropped file as an attachment. A file dropped on the editor today is attached to the task but not inserted, and once the editor handles drops the file would be **uploaded twice**.
- The bucket upload path (`POST /api/attachments/[ref]`) returns `{ attachment: { url } }`. The no-bucket path (`addAttachments`) returns only a count, and its data URLs would bloat the brief by ~200 KB per image.
- Production uses the Cranl bucket (`HANDOVER.md` §storage; `board/page.tsx` passes `hasStorage`).

**Decisions.**
- New optional editor prop `onUploadImages(files) → Promise<UploadResult[]>`, defined in the [props contract](./contracts/brief-editor-props.md). `TaskModal` implements it by extracting the per-file body of `uploadToBucket` into `uploadOne(file)`, which returns `{ ok, url, filename } | { ok: false, error }`. The panel's attachment list and card thumbnail refresh exactly as today.
- `TaskModal` passes it only when `canEdit && hasStorage`. Without it, pasting or dropping an image shows an inline note: "Images can be added after the task is created" in `TaskForm`, or "You can't add attachments to this task" in `TaskModal` without rights. Without storage, the note is "Image upload isn't set up here — attach it below".
- Editor side: `editorProps.handlePaste` and `handleDrop` take `image/*` files only (non-images get the attachment hint). They respect `MAX_ATTACHMENTS_PER_GO` and `MAX_UPLOAD_BYTES`, insert a **ProseMirror widget decoration** placeholder ("Uploading hero.png…") at the paste or drop position, and upload sequentially. On success the image node goes in at the placeholder's mapped position; on failure the placeholder goes and a note names the file. Decorations are never serialized, so a half-finished upload can never be saved into the brief.
- `TaskModal`'s window `drop` listener returns early when `e.defaultPrevented` (ProseMirror prevents the default for drops it handles), so a drop onto the editor uploads once.
- Undo removes the inserted image; the attachment stays on the task (spec edge case).

**Alternatives.** `@tiptap/extension-file-handler`: rejected; not installed, and it adds little over two `editorProps` hooks. Data URLs in the brief: rejected, too large. Uploading in `TaskForm` before the task exists: rejected; it would need orphan-attachment cleanup.

## R6. "/" menu (FR-040–043, E14)

**Decision.** Add `@tiptap/suggestion@3.31.3` (verified on npm; peer-pins `@tiptap/core`/`@tiptap/pm` 3.31.3, which are installed). Configure `char: '/'`, `startOfLine: false`, `allowSpaces: false`, and `allow` true only when the character before the slash is the start of a block or whitespace. That keeps "and/or" and "4/11" from triggering. Items come from one shared `BLOCK_ITEMS` list used by the Insert menu, the Text-style menu and the "/" menu, each with label, keywords (English and Arabic), icon, Markdown hint (e.g. `#`, `-`, `[ ]`) and run command. Rendered by `SlashMenu.tsx` with the same roving-focus `Menu` primitive. Esc leaves the typed "/" in place.

**Alternatives.** Hand-rolled input-rule plus manual positioning: rejected; it reimplements suggestion's range tracking and dismissal.

## R7. Undo, Redo and Clear format (FR-012, FR-013, E5)

**Decision.**
- Undo/Redo buttons using the StarterKit `UndoRedo` commands, disabled via `editor.can().undo()` and `editor.can().redo()`. They sit in the toolbar's first group on desktop and stay on the phone row.
- Clear format is disabled when `selection.empty`. Otherwise `unsetAllMarks().clearNodes()` runs on the selection only; the `selectAll` fallback is removed.

## R8. YouTube block (FR-060, FR-061, E10)

**Finding.** `Brief.tsx` already turns *a paragraph containing only a YouTube link* into an embed (`youtubeId()` covers watch, youtu.be, shorts, live, embed). The editor inserts the URL as plain text in the current paragraph.

**Decision.** An atom block node `youtube { src }`:
- **Parse**: a `<p>` whose only content is a YouTube link, or plain text that is just a YouTube URL. This covers existing briefs. The rule has higher priority than paragraph.
- **Serialize**: `<url>` alone on its line, exactly what the read view already embeds.
- **Node view**: the video's thumbnail (`https://i.ytimg.com/vi/<id>/hqdefault.jpg`) with a play badge and the URL. A thumbnail rather than an iframe, so the editor never loses focus to an embedded player.
- The prompt validates with `youtubeId()` (moved from `Brief.tsx` to `src/lib/links.ts`, re-exported) and rejects anything else (FR-061).

## R9. Task insert (FR-062, E11)

**Decision.** If the cursor is already in a task list, add an item after the current one (`splitListItem`). Otherwise insert a new `taskList` with one empty item *after* the current block (`insertContentAt(endOfBlock)`) and put the cursor in it. Never `toggleTaskList` on the current line.

## R10. Tables (FR-063, FR-064, E12)

**Decision.**
- A `TableMenu` bubble shown when `editor.isActive('table')`, anchored to the table. It offers: row above, row below, column left, column right, delete row, delete column, delete table (all existing TableKit commands).
- New tables are 3 × 3 with a header row.
- CSS in `globals.css`: `.fx-brief-edit table { display: table; width: 100%; table-layout: fixed }` inside a `div` wrapper that scrolls horizontally. This keeps the read view's existing `display:block; overflow-x:auto` rule for wide imported tables.

## R11. Toggle placeholders (FR-065, E20)

**Decision.**
- Insert with an empty summary and an empty paragraph body. The summary node view gets a `data-placeholder` with CSS `:empty::before`; the body uses `Placeholder.configure({ includeChildren: true, placeholder: ({ node, pos }) => … })` returning "Hidden content" inside toggles.
- Serializing an empty summary writes the localized "Details", so the read view never shows a blank row.
- Existing toggles with "Toggle title" text are left as they are (FR-100).

## R12. Table of contents block (FR-066, E20)

**Decision.**
- An atom block node `toc`. It parses from a paragraph whose text is exactly `[[toc]]` and serializes to `[[toc]]` on its own line. This also lets `getMarkdown()` drop its `\[\[toc\]\]` un-escaping workaround.
- Node view: a labelled box "Table of contents · built from this brief's headings", listing the current headings live (read from the document on each transaction).

## R13. Pinned toolbar (FR-070, E13)

**Finding.** The editor's outer wrapper sets `overflow: hidden` (for rounded corners), which disables `position: sticky` for children. The task panel is the scroll container.

**Decision.** Toolbar `position: sticky; top: 0; z-index: 5`. Corner clipping moves from the wrapper to the toolbar's and content's own `border-radius`, removing `overflow: hidden`. Verified approach: the harness reproduces the 807 px scroll-away and the fix is measured the same way.

## R14. Phone toolbar (FR-071, E17)

**Decision.**
- At ≤ 480 px the toolbar is `flex-wrap: nowrap; overflow-x: auto; scrollbar-width: none`. Order: Undo, Redo, Style, B, I, lists, link, + Insert, ⋯.
- Group separators become a `border-inline-start` on each group, so none can start a row.
- Status becomes an 8 px dot: grey for saved, blue pulsing for saving, coral for error. It has visually hidden text and `aria-live="polite"`; in error state it expands to "Couldn't save · Retry" because it needs an action.

## R15. Underline in the read view (FR-080, E15)

**Finding.** Verified `defaultSchema.tagNames.includes('u') === false` in the installed `rehype-sanitize`. `Brief.tsx` adds only `details`, `summary` and `span`.

**Decision.** Add `'u'` to the sanitize allow-list in `Brief.tsx`. Keep underline in the editor (spec assumption E15).

## R16. Accessible toolbar and menus (FR-044–047, E16, E19)

**Decision.**
- `Toolbar.tsx`: `role="toolbar"`, `aria-label` "Formatting", roving `tabIndex` (Arrow Left/Right move between buttons, reversed in RTL), and `aria-pressed` on toggles.
- `Menu.tsx`: `role="menu"` with `menuitem`, or `menuitemradio` plus `aria-checked` for Text style. Focus moves to the first (or checked) item on open; arrows, Home/End, typeahead, Enter/Space to choose, Esc and Tab to close and return focus to the trigger (`aria-haspopup`, `aria-expanded`).
- Text style uses `setHeading`/`setParagraph`, not `toggleHeading`, so choosing the current style leaves it unchanged. A ✓ marks the current style.
- The editable gets `aria-label` "Brief" and `aria-multiline="true"` via `editorProps.attributes`.
- The click-away layer stays for pointer users.

## R17. Palette tokens (FR-082, E23)

**Decision.** Add to `src/lib/tokens.ts`:

```ts
export const BRIEF_UI = { ink: '#18233F', label: '#68738D', faint: '#929CB0', line: '#E9EDF4',
  surface: '#F8FAFD', blue: '#3563E9', blueLight: '#EEF3FF', blueActive: '#E5EDFF' } as const
```

plus `error` mapped to the existing `COLORS.coral`. The editor's local `BR` constant is deleted and every use reads `BRIEF_UI`. This matches the spec assumption: extend the palette, don't amend §I. `TaskModal`'s and `TaskForm`'s `CU` constants hold the same values; switching them over is a one-line follow-up, out of scope here.

## R18. Arabic and RTL (FR-090, FR-091, E18)

**Findings.** `layout.tsx` already sets `<html dir>` from the locale. Components use `useTranslations`; there is no `briefEditor` namespace. The editor already uses some logical properties (`insetInlineStart`).

**Decision.**
- A `briefEditor` namespace in `messages/en.json` and `messages/ar.json` covering every string: toolbar titles, menu items, "/" keywords, prompts, notes, status, confirm bar, link card, table menu, upload messages.
- Shortcut labels are built per platform (⌘ on Mac).
- All positioning uses logical properties. Floating menus and cards read `dir` from the editor's DOM so their placement mirrors.
- Arabic keywords are added to "/" items so `/جدول` finds Table.
- `TaskForm` and `TaskModal` already run under the next-intl provider.

## R19. Single status location (FR-005, E21)

**Decision.** Status lives in the toolbar only. The footer under the editor keeps the **Done** button and shows only one-off notes (e.g. "Markdown copied", upload failures); its "Saved · Esc closes · select text for formatting" hint is removed. The shortcut hints move into the menus (FR-043).

## R20. List spacing (FR-081, E22)

**Decision.** In `globals.css`: `.fx-brief li > p { margin: 0 }` and `.fx-brief li > p + p { margin-top: .35em }`. Applies to both editing and read views, since both use `.fx-brief`.

## R21. Markdown shortcut discoverability (FR-043)

**Decision.** Every menu item that has a Markdown shortcut shows it as a muted hint on the right (`#`, `##`, `-`, `1.`, `>`, `[ ]`, `---`), and toolbar tooltips include keyboard shortcuts. The empty-brief placeholder becomes "Write the brief… type / for blocks".

## R22. Images in the Create Task form (spec planning question)

**Decision.** `TaskForm` does not pass `onUploadImages`. Pasting or dropping an image there shows "Images can be added once the task is created", and the image is not inserted. Upload by address (`Insert ▸ Image`) still works.

**Rationale.** The task doesn't exist yet, so there is nowhere to attach. Deferred upload would need orphan cleanup if the form is abandoned. The note is honest and costs nothing.

**Alternative.** Hold `File` objects and upload after `createTask` resolves: rejected for v1 (orphan and partial-failure handling); it can be revisited later.

## R23. Compatibility guard (FR-100, FR-101)

**Decision.**
- A round-trip fixture set in the lab harness: real-shaped briefs (ClickUp import with headings, lists, images and tables; toggles; `[[toc]]`; bare and linked YouTube URLs; relative links; task lists).
- Each fixture is loaded, saved without edits, and compared, so existing briefs open unchanged. The same fixtures are rendered through `Brief.tsx` before and after, comparing the HTML.
- Any difference other than whitespace fails the check.

## R24. Validation harness

**Finding.** The repo has no test runner. The audit used an esbuild-bundled standalone page that mounts the real `BriefEditor` with stub hosts and is driven by Playwright (already available in the environment).

**Decision.** Commit it as `scripts/brief-editor-lab/`:
- `entry.tsx`: a stub host with switchable failing, slow and hanging saves, and a fake uploader.
- `build.sh`: esbuild with the `@` alias.
- `scenarios.mjs`: one scenario per acceptance scenario in the spec, printing PASS or FAIL.
- `fixtures/`: briefs for R23.

Run with `npm run lab:brief` (a new script entry). esbuild is already installed through `tsx` and `vite`, and `playwright` is already a dev dependency. The only addition is the dev-only `axe-core`, injected into the lab page for the SC-007 accessibility scan; it never ships to users. It doesn't need a database or a login, so it runs in CI or a cloud session.

**Alternatives.** Vitest plus jsdom: rejected; ProseMirror needs real layout for selections, decorations and sticky positioning. Full-app Playwright: rejected for now; it needs Postgres, a seeded login and storage.
