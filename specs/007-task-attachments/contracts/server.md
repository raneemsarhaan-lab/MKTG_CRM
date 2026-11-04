# Contract: Server touch points

The schema is unchanged. Every write keeps the existing `mayAttachTo(taskId, member)` guard (owner, assignee, admin, superuser).

## 1. Upload: bucket path (`POST /api/attachments/<ref>`, unchanged)

The request and response are as today: a multipart form with `taskId` and `file`, answered with `{ ref, attachment }`, or `{ error }` with status 400/401/403/413.

The client changes from `fetch` to `XMLHttpRequest`, for progress (R5). The client still rejects:
- a reply whose `ref` doesn't match (a cached replay);
- a reply without `attachment`;
- a response that ended on the login page (`responseURL` differs from the request URL) → "your session expired; sign in again and retry", `retryable: true`.

Network errors and 5xx are `retryable: true`. 4xx are `retryable: false`, except 401.

**Invariant**: the stored object is the uploaded file's bytes, unchanged.

## 2. Delete: new `DELETE /api/attachments/<id>`

Used only by `src/lib/pending-deletes.ts` on `pagehide` (keepalive). Normal commits call the existing `removeAttachment` server action.

| | |
|---|---|
| Path param | Attachment id (UUID) |
| Auth | Session cookie; 401 without |
| Guard | `mayAttachTo(attachment.task_id, member)`; 403 otherwise |
| Effect | Same as `removeAttachment`: delete the row, delete the stored object (`deleteObject(storage_key)`), clear `cover_thumb` if no stored image remains |
| Success | `204 No Content` |
| Already gone | `204` (idempotent) |
| Body | None; `keepalive` requests stay under 64 KB |

The existing `POST` handler in the same file is untouched apart from sharing the guard helper.

## 3. Upload: inline path (`addAttachments` server action)

The signature is unchanged: `addAttachments(taskId, [{ filename, data }], thumb)`.

Client-side changes (R6):
- No `shrinkImage(file, 1600)`: pictures are sent as their original data URL.
- Files over `MAX_INLINE_BYTES` are refused before reading.
- One call per file, as today. The `thumb` argument is the separate 360 px cover copy.

The server keeps its `MAX_ATTACHMENT_CHARS` check as the authority. Its message changes to name the limit ("over the about 5 MB limit for this workspace") instead of "keep files under about 5 MB".

## 4. Comment file token (inside `TaskComment.body`)

Grammar:

```
token     = "[📎 " name "](attachment:" uuid ")"
name      = 1*( any character except "]" or newline )   ; the file name at posting time, "]" replaced by ")"
uuid      = 8HEX "-" 4HEX "-" 4HEX "-" 4HEX "-" 12HEX
```

- **Writing**: the comment box appends one token per draft file, each on its own line, after the typed text. A comment may be tokens only, with no text.
- **Reading**: `withRefs` finds tokens, along with @mentions and #tasks, and renders each as a file chip:
  - an attachment that still exists → a chip showing its *current* name and a thumbnail or extension badge, which opens the preview;
  - an attachment that no longer exists → the chip "*name* · deleted", not clickable.
- **Plain-text fallback**: anywhere the body is shown raw, the token reads as `[📎 name](attachment:…)`.
- **Round trip**: `parse(format(name, id))` returns `{ name, id }` for every name, including ones with brackets, emoji or Arabic (lab check).

## 5. Rename (`renameAttachment`, unchanged)

The server already re-adds a missing extension. The client sends the base name plus the original extension (FR-041), so the server rule is a safety net, not the main path.
