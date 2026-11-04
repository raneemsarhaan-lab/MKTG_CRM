# Contract: `BriefEditor` host interface

The editor is mounted by two hosts: `TaskModal` (an existing task) and `TaskForm` (a task being created). This is the full interface between them. Import path is unchanged: `@/components/kanban/BriefEditor`.

## Props

```ts
interface BriefEditorProps {
  /** Initial Markdown. Read once on mount (hosts remount with `key` to reset). Unchanged. */
  value: string

  /**
   * Store the brief. CHANGED: must resolve to whether it was stored.
   *  - resolve(true)  → stored; the editor may show "Saved"
   *  - resolve(false) → not stored; the editor shows "Couldn't save · Retry" and retries
   * MUST settle in every path, including when the underlying action throws.
   * The editor never calls it again while a previous call is unsettled, and
   * treats a call unsettled after 20 s as failed.
   */
  onSave: (markdown: string) => Promise<boolean>

  /** REMOVED: `saving: boolean`. The editor owns its save state now (see onSaveStateChange). */

  /** Optional. Called whenever save state changes, so the host can guard its own close button. NEW. */
  onSaveStateChange?: (state: 'saved' | 'saving' | 'error', pendingUploads: number) => void

  /** Leave editing. Called on a click outside the editor or Esc (through the overlay stack
   *  and the unsaved-changes bar). There is no Done button. Omitted where there is no read
   *  view (TaskForm); then click-away does nothing. CHANGED trigger (F1, R25). */
  onDone?: () => void

  /** Where to put the cursor on mount: the clicked top-level block and character offset,
   *  measured in the read view (R25). Falls back to the end of the brief. NEW, optional. */
  initialCursor?: { block: number; offset: number }

  /** Offered as one-click choices in Insert ▸ Image. Unchanged. */
  attachments?: TaskAttachment[]

  /** Creates a real child task and returns a link to it, or null. Unchanged. */
  onCreateSubtask?: (name: string) => Promise<{ name: string; href: string } | null>

  /**
   * Upload pasted or dropped image files as attachments of the task. NEW, optional.
   * Called with one file at a time, in order. Absent → paste/drop of images shows
   * `uploadUnavailableReason` and inserts nothing.
   */
  onUploadImages?: (file: File) => Promise<UploadResult>

  /** Why images can't be pasted here, shown when onUploadImages is absent. NEW, optional.
   *  Defaults to the "after the task is created" message. */
  uploadUnavailableReason?: 'not-created' | 'no-permission' | 'no-storage'
}

type UploadResult =
  | { ok: true;  url: string; filename: string }
  | { ok: false; error: string }        // human-readable, already names the problem
```

## Host obligations

### `TaskModal`

- `onSave = next => applyPatch({ description: next })`. `applyPatch` is changed to return `Promise<boolean>`:
  - `try { const r = await updateTask(...) } catch { resolve(false) }`
  - `r.success` → `true`, otherwise `false`
  - The panel's error line behaviour stays as it is.
- `onUploadImages` is passed **only** when `canEdit && hasStorage`. It is implemented by `uploadOne(file)`, extracted from `uploadToBucket`'s per-file body. It keeps every existing check (own-reply `ref`, redirect detection, size) and returns `UploadResult` instead of pushing to `failed[]`. After each success it refreshes the attachment list (`setReloadFiles`) and the card thumbnail as today.
- `uploadUnavailableReason` = `!canEdit ? 'no-permission' : 'no-storage'` when `onUploadImages` is not passed.
- The window-level `drop` listener returns early when `e.defaultPrevented`, so drops handled by the editor are not uploaded twice.
- The read view's `onClick` records `initialCursor` and the clicked block's on-screen `top` before setting `editingBrief`. After the editor mounts, it scrolls the panel by the difference so the text stays still (R25).
- The panel close control consults the last `onSaveStateChange` values. If the state is `'error'` or `pendingUploads > 0`, it shows the same "Stay · Leave anyway" choice before closing.

### `TaskForm`

- `onSave = next => { setForm(f => ({ ...f, description: next })); return Promise.resolve(true) }`.
- No `onUploadImages`; `uploadUnavailableReason = 'not-created'`.
- No `onDone` (unchanged).

## Editor guarantees

- Never sends two `onSave` calls at once; always sends the newest text; never reports "Saved" for text the host hasn't confirmed.
- Never inserts an image, link or video that failed validation.
- Never serializes an in-progress upload placeholder.
- On unmount, sends any unsent text once (existing behaviour).
