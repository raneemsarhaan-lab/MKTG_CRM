# Data Model: Brief Editor UX Overhaul

**Feature**: [spec.md](./spec.md) · **Plan**: [plan.md](./plan.md)

No database change. `tasks.description` stays Markdown and `task_attachments` is reused as-is. What this feature defines is the editor's **document model** (which blocks exist and how each maps to stored Markdown) and two pieces of **client-side state**: save state and upload jobs. Neither is persisted.

---

## 1. Stored entities (unchanged)

| Entity | Table | Fields used | Change |
|---|---|---|---|
| Task brief | `tasks.description` | Markdown text | None. Written by `updateTask(id, { description })` from `TaskModal`, or by `createTask` from `TaskForm`. |
| Task attachment | `task_attachments` | `id`, `task_id`, `filename`, `url`, `storage_key`, `content_type`, `size_bytes`, `uploaded_by` | None. Pasted and dropped images arrive through the existing `POST /api/attachments/[ref]` route; the brief references them by `url`. |

**Relationship added by usage, not by schema**: an image in a brief whose `src` equals an attachment's `url` is "that attachment, shown inline". Deleting the attachment leaves a broken image in the brief, as it does today for images inserted from attachments. That is out of scope.

## 2. Document model: block and mark types

Every block below must round-trip: parse(serialize(doc)) = doc, and `Brief.tsx` renders the serialized text as described. The full table, with exact Markdown, is in [contracts/markdown-storage.md](./contracts/markdown-storage.md).

| Type | Kind | New? | Stored as | Validation |
|---|---|---|---|---|
| paragraph, heading 1–3, bullet/ordered list, blockquote, code block, horizontal rule, hard break | block | existing | CommonMark | none |
| taskList / taskItem | block | existing | `- [ ]` / `- [x]` | none |
| table `{ widths?, width = 100, offset = 0 }` | block | existing (sizes new) | GFM pipe table; HTML `<table data-widths data-width data-offset>` once resized (R26) | header row required (FR-064); each column ≥ the minimum; column widths sum to 100; `offset + width ≤ 100` |
| image | block | existing (now block-level on insert) | `![alt](src)` on its own line | `src` must pass `normaliseUrl` and load (FR-030) or come from an upload |
| toggle `{ summary }` | block | existing | `<details><summary>…</summary>…</details>` | empty summary serializes as the localized "Details" |
| **youtube `{ src }`** | atom block | **new** | `<https://youtube.com/watch?v=ID>` alone on a line | `youtubeId(src) !== null` (FR-061) |
| **toc** | atom block | **new** | `[[toc]]` alone on a line | none |
| bold, italic, strike, code | mark | existing | `**`, `*`, `~~`, `` ` `` | none |
| underline | mark | existing | `<u>…</u>` | read view must allow `u` (FR-080) |
| link `{ href }` | mark | existing | `[text](href)` or `<href>` | `href` passes `normaliseUrl`: http(s) or mailto only, no spaces (FR-022/023) |

**Parsing legacy content** (FR-100):

| Legacy form | Becomes |
|---|---|
| A paragraph that is only a YouTube URL, bare or linked | youtube |
| A paragraph whose text is exactly `[[toc]]` | toc |
| A relative or scheme-less link already in a brief | left as it is: parsed and saved unchanged; only new or edited links are normalized |
| A toggle titled "Toggle title" | left as it is |

## 3. Save state (client only)

One per open editor. Owned by `useSaveQueue`; exposed to the host through `onSaveStateChange`.

| Field | Type | Meaning |
|---|---|---|
| `status` | `'saved' \| 'saving' \| 'error'` | what the toolbar shows |
| `latest` | string | newest serialized Markdown |
| `confirmed` | string | last text the host confirmed stored (`onSave` resolved `true`) |
| `inFlight` | boolean | a save request is outstanding (at most one) |
| `failures` | number | consecutive failures, which drive the backoff |
| `nextRetryAt` | number \| null | timestamp of the scheduled automatic retry |

**Invariant**: `status === 'saved'` ⇔ `!inFlight && latest === confirmed`.

**State transitions**

```text
             edit (latest ≠ confirmed)
  saved ───────────────────────────────► saving
    ▲                                      │
    │ onSave → true and latest = confirmed  │ onSave → false, throws, or 20 s watchdog
    └──────────────────────────────────────┤
                                           ▼
  saving ◄── Retry / edit / backoff timer ── error
    │
    └─ onSave → true but latest ≠ confirmed (typed meanwhile) → saving (send newest)
```

- Leaving while `status === 'error'` **or** while any upload job (§4) is `queued`/`uploading` raises the confirm bar (FR-004). Leaving while only a text save is `saving` does not; the unmount flush sends the rest (existing behaviour).
- The editor reports `(status, pendingUploads)` to the host on every change of either value.
- Backoff schedule while in `error`: 2 s, 5 s, 15 s, then every 30 s. It is reset by any success.

## 4. Upload job (client only)

One per pasted or dropped image file. Owned by `imageUpload.ts`. Never serialized.

| Field | Type | Meaning |
|---|---|---|
| `id` | string | random id; also the placeholder decoration's key |
| `file` | `File` | the image |
| `pos` | number | document position, remapped through every transaction |
| `status` | `'queued' \| 'uploading' \| 'done' \| 'failed'` | progress |
| `error` | string? | reason shown to the person on failure |

**Validation before queueing**:
- `file.type` starts with `image/`. Anything else is refused with the attachment hint.
- `file.size ≤ MAX_UPLOAD_BYTES`.
- At most `MAX_ATTACHMENTS_PER_GO` files per paste or drop; the excess is reported as skipped.
- `onUploadImages` must exist. Without it, the host-specific note is shown (research R5/R22).

**Transitions**:

| From | Event | To |
|---|---|---|
| `queued` | its turn comes (uploads run one at a time) | `uploading` |
| `uploading` | the host returns `{ ok: true, url }` | `done`: an image node is inserted at the remapped `pos` and the placeholder removed |
| `uploading` | the host returns `{ ok: false }`, or the call throws | `failed`: the placeholder is removed and a note names the file and reason |

If the placeholder's position was deleted meanwhile (the person removed that text), the image is inserted at the current cursor instead.

## 5. Overlay stack (client only)

Ordered list of open overlays: menus, the "/" menu, the link card in edit mode, the value prompt, the table menu, the confirm bar. Each entry is `{ id, close(), returnFocusTo }`.

**Rules**:
- Esc closes only the top entry.
- With an empty stack, Esc reaches the editor's `onDone`, through the confirm bar if the save state is `error`.
- Opening a menu from inside another, such as the table menu while a prompt is open, pushes on top.
