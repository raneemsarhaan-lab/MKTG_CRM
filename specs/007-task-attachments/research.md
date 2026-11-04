# Research: Task Attachments, Tidy and Seamless

Each decision gives what was chosen, why, and what else was considered. All of them start from the code as it is on `main` after spec 005.

## R1. Where the section lives

**Decision**: Extract the Attachments section, its preview and its upload logic from `src/components/kanban/TaskModal.tsx` into `src/components/kanban/attachments/`. `TaskModal` keeps the panel and passes in what the section needs (see contracts/attachments-section.md).

**Rationale**:
- `TaskModal.tsx` is about 2,700 lines, and the section adds state (upload jobs, duplicate prompts, rename, preview list) that would push it further.
- Spec 005 did the same for the brief editor (`brief-editor/`), and the result was testable in a standalone lab.
- Pure helpers (`names.ts`, `order.ts`, `limits.ts`) can then be checked in Node without a browser.

**Alternatives**:
- Editing in place: rejected, because it would mean no lab and an even longer file.
- Reusing the unused `AttachmentGallery.tsx`: rejected, because it is a read-only gallery with a different shape. It is left alone.

## R2. Order and the Latest pill

**Decision**: Sort on the client with `newestFirst` (by `uploaded_at` descending, then `id`), and change `loadAttachments` to order descending as well, so the first paint and the sorted list agree. `latestImageId` is the first item in that order that is an image and fully stored (not uploading or failed).

**Rationale**:
- One rule in one pure function.
- "Latest" applies to images only, per the spec's assumption, so a newer PDF never takes it.
- The board's cover logic (`coverImageFor`) already picks the newest image and stays untouched.

**Alternatives**:
- Server order only: rejected, because tiles appear and change locally while uploading.

## R3. Names that keep their ending

**Decision**: Add a pure `splitName(name)` helper.
- A name of up to 24 characters is shown whole and wraps naturally.
- A longer name is split into a **head** (line 1, cut with a CSS ellipsis) and a **tail** of about the last 17 characters, moved forward to start at a word (line 2, never cut).

The full name is in `title` and in the accessible name.

**Rationale**:
- Cutting by character count can't adapt to tile width: the preview showed "Forefront Consulting…p Post…" losing "FINAL".
- A fixed tail plus a CSS-cut head works at every width checked (1360, 1000 and 390 px).

**Alternatives**:
- Middle truncation by count: breaks at narrow widths.
- A right-to-left ellipsis trick (`direction: rtl`): it reorders punctuation such as ".png" and misbehaves in Arabic.

## R4. Undo that survives closing the panel

**Decision**:
- A `PendingDeleteProvider`, mounted once in `src/app/(app)/layout.tsx`, owns every pending delete: the attachment, its timer and its Undo.
- The panel asks the provider to delete and shows the ghost tile while the provider holds it.
- The server delete (`removeAttachment`) is sent only when the timer ends.
- If the panel closes first, the provider keeps the timer, shows the bottom message "Deleted *name* · Undo", and sends the delete when that message ends. The message lasts at least 6 seconds from closing.
- On `pagehide`, the provider flushes all pending deletes with `fetch(DELETE /api/attachments/<id>, { keepalive: true })`.

**Rationale**:
- Once the stored copy is removed, Undo is impossible without the bytes. Keeping the delete *unsent* until the window ends needs no soft delete and no schema change.
- The user's experience matches FR-034: the file is gone from view, and Undo restores it.
- Task panels open from the board and the personal board, so the owner must sit above both.

**Alternatives**:
- A soft-delete column with a clean-up job: rejected, because it adds a schema change and a background job.
- Deleting at once and re-uploading on Undo: impossible after close, because the bytes are gone.
- A Zustand store: possible, but a provider keeps timers and the message together, and nothing needs persisting.

**Edge**: if the keepalive request can't be sent (offline), the file stays. The spec prefers keeping a file to losing one.

## R5. Real per-file upload progress

**Decision**:
- In `uploadOne` (bucket path), replace `fetch` with `XMLHttpRequest` and use `upload.onprogress` for 0–100 %.
- Keep every existing check unchanged: per-file `ref` path segment, `cache: no-store` intent (as the `Cache-Control` request header), the redirected-to-login detection (`xhr.responseURL` differs from the request URL), the JSON-must-carry-`attachment` check, and the `ref` echo check.
- Uploads run one file at a time, as today, so the order stays predictable and one failure names only itself.

**Rationale**: `fetch` has no upload progress, and FR-053 needs per-file progress.

**Alternatives**: A streaming `fetch` body has no reliable upload progress either, and isn't supported everywhere.

**No-storage path**: the server action gives no progress events. The tile shows an indeterminate moving bar while that one file is being sent, then done or failed. This still meets "its own progress" per file.

## R6. No compression, on every path

**Decision**:
- Remove the `shrinkImage(file, 1600)` call from the no-storage path in `TaskModal`. Pictures are read with `readAsDataUrl` like every other file.
- Refuse a file before reading it when `file.size > MAX_INLINE_BYTES`, where `MAX_INLINE_BYTES = floor((MAX_ATTACHMENT_CHARS − 256) × 3/4)` (about 5.25 MB, shown as "about 5 MB").
- The bucket path already stores the original untouched.
- The board cover thumbnail (`shrinkImage(file, 360, 0.62)` → `setCoverThumb`) stays: it is a separate display copy in `cover_thumb` and never replaces the attachment (FR-059).

**Rationale**: This is the user's instruction: "image quality must be preserved, no compressing is allowed".
- Base64 grows data by 4/3, so the existing character cap defines the byte cap.
- The 8 MB server-action body limit covers a 7 M-character data URL plus form overhead.

**Verification**: SC-011, checked by uploading a known file on both paths and comparing size and SHA-256 of the download (quickstart §3).

**Alternatives**:
- Raising the inline limit: rejected, because rows are read into memory and the board would slow down.
- Storing pictures lossless-compressed: still a re-encode, which the user ruled out.

## R7. Which limit to show

**Decision**: `limitFor(hasStorage)` returns `MAX_UPLOAD_BYTES` (200 MB) or `MAX_INLINE_BYTES` (about 5 MB). The "Add files" tile shows "Paste, drop or browse · Up to *N* each". A too-large tile names the file's size, the limit, and the suggestion "shrink it, or share a link in a comment". The check runs before any reading or uploading.

**Rationale**: FR-052 and FR-054 require showing the limit that applies on this deployment, and `hasStorage` is already a `TaskModal` prop.

## R8. The same name again

**Decision**:
- Duplicate check on the client, ignoring capitals, against stored files (uploading and failed tiles excluded). Clashing files queue, and one bar shows the first: **Replace it · Keep both · Cancel**.
- **Keep both** uploads as `nextFreeName` ("*name* (2).ext", then (3) …).
- **Replace** uploads the new file and, once it is stored, starts a pending delete of the old one through the provider. That shows "Replaced *name* · Undo". Undo cancels the old file's delete and deletes the new one, so the task is back as it was.

**Rationale**:
- The duplicate check is about the user's intent, so the client is the right place.
- The server accepts duplicates today and keeps doing so, which is harmless: it never overwrites.

**Alternatives**: A server-side unique name: rejected, because it would block "Keep both" races and break existing duplicate rows.

## R9. Paste anywhere in the panel

**Decision**: `TaskModal` adds a `paste` listener on `window` while it is open.
- It ignores the event if `defaultPrevented` (the brief editor handles its own image pastes, spec 005 R5) or if the clipboard holds no files.
- A paste with files goes into the upload queue.
- If the target is the comment box, the new attachments also become chips on the comment being written (R10).
- A generic clipboard name ("image.png", empty) becomes `Screenshot HH.MM.png` from local time. The name stays in ASCII in both languages, because it is a file name.
- Without `canEdit`, the paste is refused with a short note.

**Rationale**: This mirrors the existing window `drop` catch-all and its "skip what the editor already handled" rule, so a file is never added twice.

## R10. File chips on comments

**Decision**:
- Store the reference inside the comment text as the token `[📎 <name>](attachment:<uuid>)`.
- The existing `withRefs` renderer (which already draws @names and #tasks as chips) learns this token and draws a file chip with a thumbnail or extension badge. Clicking it opens the preview on that file.
- If the attachment no longer exists, the chip reads "*name* · deleted" and does nothing.
- While writing, chips show above the text box and can be removed. On post, their tokens are appended to the text.

**Rationale**:
- No schema change (spec assumption).
- The token is readable as plain text anywhere the body appears raw.
- The parser is a small, testable grammar (contracts/server.md).

**Alternatives**:
- A join table: rejected, because it needs a schema change.
- A file name only: rejected, because it's ambiguous with duplicates.

## R11. The preview

**Decision**: Move `AttachmentPreview` into the module and give it:
- the ordered list and an index, with a counter ("2 of 4");
- previous and next buttons, ←/→ keys (mirrored in right-to-left), and a strip of every file;
- click the image to zoom (scrollable) and click again to fit, with the zoom reset when changing file;
- a horizontal swipe of more than 50 px on touch;
- a close when clicking the dark area outside the file and controls, or with Esc or ✕, with focus returning to the tile;
- "Open in new tab" for PDFs, and the existing "no preview" fallback with Download for other types.

Uploading and failed files are left out of the list.

**Rationale**: FR-020 to FR-025. The existing overlay already handles images, PDFs, audio and video. This adds navigation around it.

## R12. Hover, touch and keys

**Decision**:
- With a mouse, Download and Delete appear on hover or focus at the picture's corner.
- Under `@media (hover: none)` they are hidden, and a single ⋯ button opens a menu with Download, Rename and Delete.
- Pictures are `<button>`s: Enter previews, Delete/Backspace deletes with Undo, and F2 renames.
- Names are buttons when the member may edit: Enter or F2 renames.
- Details are in contracts/keyboard-and-a11y.md.

**Rationale**: FR-030, FR-042 and FR-060 to FR-063. Media queries avoid detecting the device in JavaScript.

## R13. Loading without a jump

**Decision**: The board's task data already lists attachment rows without their bytes, so the section knows the count before `loadAttachments` resolves. It renders that many placeholder tiles (up to 7) at the real tile size, with a "Loading *N* files…" status, and swaps them for tiles when the rows arrive.

**Rationale**: FR-070 and SC-010. Same size means no shift.

## R14. Long lists

**Decision**: Show the 7 newest tiles, then a "Show all *N* files" button that becomes "Show fewer". Uploading and failed tiles always show, ahead of the cap. The choice resets when the panel closes.

**Rationale**: FR-071. Seven tiles plus the "Add files" tile fill two rows at the panel's usual width.

## R15. The 📎 count in the panel header

**Decision**: Turn the existing count chip into a button that opens the section if collapsed, scrolls it into view, and adds a 1.3 s highlight ring, with no animation under `prefers-reduced-motion`. It counts stored files only.

## R16. Strings and right-to-left

**Decision**: A new `attachments` namespace in `messages/en.json` and `messages/ar.json` for every string this feature adds or touches. Logical CSS properties throughout. ←/→ in the preview follow reading direction. A lab check confirms the two key sets match and that no English is left in the Arabic file, as `messages-parity` did in spec 005.

**Rationale**: FR-080 and constitution §V. The rest of `TaskModal` stays partly English, which is out of scope.

## R17. Tokens

**Decision**:
- The section uses `BRIEF_UI` (the task panel's blue palette) and `COLORS` from `src/lib/tokens.ts`.
- The Latest pill is `COLORS.lime` with `BRIEF_UI.ink`.
- Add `FILE_KIND_COLORS` (pdf, video, document, spreadsheet, archive, subtitles, other), lifted from `TaskModal`'s `fileBadgeColor`/`EXT_COLORS`, plus any missing roles.
- The lab fails on hex or `rgba(` literals in `attachments/`.

**Rationale**: Constitution §I, following the precedent of `STAGE_COLORS` and `BRIEF_UI`.

## R18. How it is tested

**Decision**:
- **`npm run lab:attachments`**:
  - esbuild bundles `AttachmentsSection` and `AttachmentPreview` with a stub host. The fake upload has controllable progress, failure and size; the fake store records deletes and renames.
  - Playwright scenarios map one to one to the spec's acceptance scenarios.
  - Pure checks run first: `splitName`, `nextFreeName`, `newestFirst`, `limitFor`, and the comment-token parse and format round trip.
  - The runner fails on React "Maximum update depth" warnings, as in spec 005.
- **The real app** (quickstart §3): local Postgres, seeded team, `next dev`. Covers the no-storage path, the byte-for-byte check, closing the panel during Undo, paste, and Arabic.
- **Not verifiable here**: the bucket upload's real progress and the 200 MB path (no object storage in this environment). These are checked on Cranl, as T065 was for spec 005.
