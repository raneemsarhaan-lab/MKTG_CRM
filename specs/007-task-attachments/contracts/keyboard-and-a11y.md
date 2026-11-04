# Contract: Keyboard, focus, announcements, touch

## Grid

| Focus on | Key | Result |
|---|---|---|
| Picture (button, name "Preview *full name*") | Enter / Space | Open the preview on this file |
| Picture | Delete / Backspace | Start a delete (if may edit); focus moves to Undo on the ghost tile |
| Picture | F2 | Start renaming (if may edit) |
| Name (button "Rename *full name*", if may edit) | Enter / F2 | Start renaming |
| Rename box | Enter | Save; focus returns to the name |
| Rename box | Esc | Cancel; focus returns to the name |
| Rename box | Tab / click away | Save |
| Ghost tile Undo | Enter / Space | Restore; focus returns to the restored picture |
| ⋯ button (touch) | Enter / Space | Open the menu; focus on its first item; Esc closes and returns focus |
| Duplicate bar | Tab | Replace it → Keep both → Cancel; the bar has `role="alert"` |

Tab order inside a tile: picture → name → (hover actions: Download → Delete, visible on focus).

## Preview

| Key / gesture | Result |
|---|---|
| ← / → | Previous / next file. In right-to-left, ← is next. |
| Home / End | First / last file |
| Esc | Close; focus returns to the tile that was showing |
| Click the image | Zoom in ↔ fit |
| Click the dark area (outside file and controls) | Close |
| Swipe more than 50 px horizontally (touch) | Previous / next |
| Tab | Moves through the top bar (Open in new tab*, Download, Close), arrows, strip; focus stays inside the dialog |

The dialog has `role="dialog"`, `aria-modal="true"` and `aria-label="Preview of *name*"`. The counter is in a polite live region ("2 of 4").

## Announcements (polite live region in the section)

| Event | Text (English; Arabic in `attachments` namespace) |
|---|---|
| Loading | "Loading *N* files…" |
| Upload started / finished | "Uploading *name*" / "Uploaded *name*" |
| Upload failed | "*name* wasn't uploaded: *reason*" |
| Too large | "*name* is *size*, over the *limit* limit" |
| Delete started | "Deleted *name*. Undo available for 5 seconds" |
| Undo | "Restored *name*" |
| Renamed | "Renamed to *name*" |
| Skipped (more than 12) | "*N* files skipped. Add them in a second go" |

## Touch and pointer

- `@media (hover: hover)`: Download and Delete appear on the picture's corner on hover or focus. No ⋯.
- `@media (hover: none)`: one ⋯ button per tile, with a menu of Download, Rename and Delete. Hover buttons are hidden.
- At widths of 640 px and under: two tiles per row, and no horizontal page scroll.
- Hit targets of at least 30 × 30 px for tile actions, and 44 px for preview arrows.

## Motion

The countdown bar, highlight ring, slide and placeholder shimmer are all disabled under `prefers-reduced-motion: reduce`. The countdown is then shown as text ("5 s").
