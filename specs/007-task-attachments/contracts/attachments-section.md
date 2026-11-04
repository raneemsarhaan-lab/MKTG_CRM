# Contract: `AttachmentsSection` and its host

`TaskModal` (the host) renders `<AttachmentsSection>` where the Attachments block is today. The section owns everything inside the block and the preview overlay. Data and side effects come in through the props below, so the lab can drive it with a stub host.

## Props

```ts
interface AttachmentsSectionProps {
  taskId: string
  /** Rows without bytes, from the board's task data. Gives the count for placeholders (R13). */
  initialRows: TaskAttachment[]
  /** Loads the rows with bytes or URLs. Today's loadAttachments(taskId). */
  load: () => Promise<TaskAttachment[]>
  members: Pick<Member, 'id' | 'name'>[]
  /** Fallback uploader name for rows with no uploaded_by (unchanged behaviour, S12 out of scope). */
  ownerName: string
  canEdit: boolean
  hasStorage: boolean
  /** Uploads ONE file and reports progress. Bucket: XHR to /api/attachments/<ref>. Inline: addAttachments. Never throws. */
  upload: (file: File, name: string, onProgress: (pct: number | null) => void) => Promise<UploadResult>
  rename: (id: string, name: string) => Promise<{ success: boolean; filename?: string; error?: string }>
  /** Called after any change the board should reflect (cover thumbnail, counts). */
  onChanged: () => void
  /** The section reports files it stored on behalf of the comment box (R10). */
  onStoredForComment?: (attachment: TaskAttachment) => void
  /** Ref the host uses for the 📎 header button and for paste/drop intake. */
  handle?: React.Ref<AttachmentsHandle>
}

interface AttachmentsHandle {
  /** Open the section, scroll it into view and highlight it (FR-072). */
  reveal(): void
  /** Intake from paste, drop or the comment paperclip. `forComment` → chip on the draft. */
  addFiles(files: File[], opts?: { forComment?: boolean; source?: 'paste' | 'drop' | 'pick' }): void
  /** Opens the preview on a file (comment chips). Returns false if the file no longer exists. */
  openPreview(attachmentId: string): boolean
}

type UploadResult =
  | { ok: true; attachment: TaskAttachment }
  | { ok: false; error: string; retryable: boolean }
```

`delete` is not a prop. The section calls the app-level `usePendingDelete()` (below), which calls `removeAttachment` when a delete commits.

## `usePendingDelete()` (from `PendingDeleteProvider`)

```ts
interface PendingDeleteApi {
  /** Start a 5-second Undo window. Commits any earlier pending delete first (FR-035). */
  request(a: TaskAttachment, opts?: { label?: 'deleted' | 'replaced'; pairedNewId?: string }): void
  /** Undo from the ghost tile or the bottom message. */
  undo(attachmentId: string): void
  /** Is this attachment waiting out its window? (The section renders a ghost tile.) */
  isPending(attachmentId: string): boolean
  /** The host calls this when the panel closes: pending deletes move to the bottom message (≥ 6 s). */
  panelClosed(taskId: string): void
  /** Restored files reappear in the open section through this subscription. */
  subscribe(taskId: string, fn: (restored: TaskAttachment) => void): () => void
}
```

The provider sends the server delete through `removeAttachment(id)`. On `pagehide` it uses `fetch('/api/attachments/<id>', { method: 'DELETE', keepalive: true })` (contracts/server.md §2).

## Host responsibilities (TaskModal)

| Host does | Why |
|---|---|
| Render `<AttachmentsSection>` with the props above | Extraction (R1) |
| Make the 📎 count chip a button that calls `handle.reveal()` | FR-072 |
| Add a window `paste` listener while open: skip `defaultPrevented` and clipboard without files; otherwise `handle.addFiles(files, { source: 'paste', forComment: target is the comment box })` | FR-051, FR-073 |
| Route the window `drop` catch-all through `handle.addFiles` (keeps the existing "skip what the brief editor handled" rule) | FR-050 |
| The comment paperclip calls `handle.addFiles(picked, { forComment: true })`; `onStoredForComment` adds a chip to the draft | FR-073 |
| On post, append one `[📎 name](attachment:id)` token per draft chip to the body | FR-073, R10 |
| Render comment bodies with the extended `withRefs`, which draws file tokens as chips that call `handle.openPreview(id)` | FR-074 |
| Call `pendingDelete.panelClosed(task.id)` from `requestClose()` and on unmount | FR-034 |
| Provide `upload` with the bucket path (XHR, R5) or the inline path with no image shrinking (R6) | FR-053, FR-059 |
| Keep making the board's cover thumbnail after an image is stored (display copy only) | FR-059 |

## Rendering guarantees (tested in the lab)

- Order is `newestFirst`. Only `latestImageId` carries the Latest pill (`COLORS.lime` / `BRIEF_UI.ink`).
- Names use `splitName`. The full name is in `title` and in the accessible name.
- Without `canEdit`: no Add files button or tile, names are plain text, no hover or ⋯ actions, and intake shows the refusal note.
- Placeholders match the tile size exactly. Switching from placeholders to tiles moves nothing above or below the grid.
- More than 7 stored files → 7 shown + "Show all N files". Uploading and failed tiles are always shown first.
