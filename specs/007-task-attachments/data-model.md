# Data Model: Task Attachments, Tidy and Seamless

No new table or column. One stored entity is used as is. Everything else is client state that lives only while a page is open.

## Stored

### TaskAttachment (existing, `prisma/schema.prisma`)

| Field | Used for | Notes |
|---|---|---|
| `id` | Keys, previews, comment tokens | UUID |
| `task_id` | Ownership | Cascade delete with the task |
| `filename` | Tile name, rename, duplicate check, extension | Rename keeps the extension (server already enforces) |
| `url` / `data` / `storage_key` | Where the bytes are | Bucket: `url` + `storage_key`; inline: `data` (data URL); imported: `url` only |
| `content_type` | Image vs other, preview mode | From the original upload |
| `size_bytes` | Size in preview and too-large message | Null for imports and older inline uploads |
| `uploaded_by` | Avatar and first name on the tile | Null for imports (attribution fix S12 out of scope) |
| `uploaded_at` | Newest-first order, "2h ago", Latest | |

**Invariant (FR-059)**: The bytes behind `url`/`storage_key`/`data` are exactly the bytes the member chose. Nothing on any path resizes, re-encodes or converts them. `Task.cover_thumb` remains a separate, small display copy.

### Comment body (existing `TaskComment.body`, text)

Gains one token kind, appended by the comment box (R10):

```
[📎 <filename>](attachment:<attachment uuid>)
```

The full grammar and rendering rules are in contracts/server.md §4. Existing mentions (`mentions` array) and `#task` references are unchanged.

## Client state (not persisted)

### UploadJob: one per file being added (`useUploadQueue`)

| Field | Type | Notes |
|---|---|---|
| `key` | string | Local id for the tile |
| `file` | File | Kept for Retry, so the file isn't picked again |
| `name` | string | After duplicate resolution (`nextFreeName`) or screenshot naming |
| `progress` | 0–100 \| `null` | `null` = indeterminate (inline path) |
| `status` | `'queued' \| 'uploading' \| 'stored' \| 'failed' \| 'too-large'` | |
| `error` | string? | Plain-words reason |
| `forComment` | boolean | Add a chip to the comment draft when stored |
| `replaces` | attachment id? | Set by "Replace it" |

```text
queued ──► uploading ──► stored ──► (tile becomes a normal attachment; job removed)
   │            │
   │            └──► failed ──Retry──► uploading
   │                    └──Remove──► (removed)
   └──(size > limit)──► too-large ──Remove──► (removed)
```

Rules:
- The size check happens before `queued`. It reads nothing and uploads nothing (FR-054).
- At most 12 jobs are accepted per intake; the rest are reported as skipped (FR-057).
- One job uploads at a time, in intake order.

### DuplicatePrompt: queue of incoming files whose names clash (`useUploadQueue`)

| Field | Type | Notes |
|---|---|---|
| `file` | File | |
| `existingId` | string | The stored attachment it clashes with |

The section shows the first prompt only. **Replace it** creates a job with `replaces = existingId`. **Keep both** creates a job named `nextFreeName(...)`. **Cancel** drops the file. Then the next prompt shows.

### PendingDelete: owned by `PendingDeleteProvider` (app level)

| Field | Type | Notes |
|---|---|---|
| `attachment` | TaskAttachment | Kept whole so Undo can restore it on screen |
| `taskId` | string | |
| `startedAt` | number | |
| `deadline` | number | `startedAt + 5000`; extended to `closedAt + 6000` if the panel closes first |
| `phase` | `'in-panel' \| 'after-close'` | Decides ghost tile vs bottom message |
| `pairedNewId` | string? | For Replace: the new file to delete on Undo |
| `label` | `'deleted' \| 'replaced'` | Message wording |

```text
requested ──(5 s, panel open)──► committed (removeAttachment sent)
   │  └─Undo──► cancelled (file shown again; pairedNewId deleted if set)
   └─(panel closes)──► after-close ──(≥6 s)──► committed
                          └─Undo──► cancelled
   any phase ──(pagehide)──► committed via keepalive DELETE
   any phase ──(another delete requested)──► earlier one committed first (FR-035)
```

### SectionView: component state in `AttachmentsSection`

`open` (collapsed or not, as today), `loading` (until `loadAttachments` resolves), `showAll`, `renamingId`, `menuOpenId` (touch ⋯), and `preview` (`{ index, zoom }` or null).

### CommentDraft: `TaskModal`

The existing `cmtText` plus `draftFiles: string[]` (attachment ids, or upload-job keys until stored). On post, a token per stored file is appended to the text (R10).

## Derived values (pure, `order.ts` / `names.ts` / `limits.ts`)

| Function | Returns | Rule |
|---|---|---|
| `newestFirst(list)` | sorted copy | `uploaded_at` desc, then `id` |
| `latestImageId(list)` | id \| null | First image in `newestFirst` that is stored |
| `splitName(name)` | `{ head, tail } \| { whole }` | ≤24 chars → whole; else tail ≈ last 17 chars starting at a word |
| `nextFreeName(name, taken)` | string | "*base* (2).*ext*", (3)… ignoring capitals |
| `sameName(a, b)` | boolean | Case-insensitive, trimmed |
| `screenshotName(date)` | string | `Screenshot HH.MM.png` |
| `limitFor(hasStorage)` | bytes | 200 MB or `MAX_INLINE_BYTES` |
| `formatBytes(n)` | string | "12.4 MB", "220 KB" |
