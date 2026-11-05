# Validation record: Task Attachments, Tidy and Seamless

**Date**: 2026-11-04 · **Branch**: `claude/nice-noether-x4rgei`

How spec 007 was checked, and what wasn't. Use this in the PR description.

## 1. Static checks and build

| Check | Result |
|---|---|
| `npm run typecheck` | Pass |
| `npm run lint` | **Not run.** `next lint` no longer exists in Next.js 16 and the repo has no ESLint config (unchanged since spec 005). |
| `bash scripts/preflight.sh` | Pass |
| `next build` (production) | Pass: every route compiles, including `/api/attachments/[ref]` with its new `DELETE` handler |
| `npm run lab:brief` (regression) | 55/55 pass: the brief editor is unaffected |

## 2. Attachments lab: `npm run lab:attachments`

**60/60 pass** (7 checks in Node, then 53 browser scenarios), on four of five full runs. One early run had a single failure that didn't recur in three later runs; it was not identified, so treat the lab as very slightly flaky.

| Group | Covered |
|---|---|
| Node checks | `splitName`, names (Keep both, rename, screenshot), order and Latest, limits, the comment-token round trip (names with `]`, emoji, Arabic), **tokens-only** (no colour literals in the new UI code), **messages-parity** (English and Arabic keys match, nothing left untranslated) |
| US1–US8 | Every acceptance scenario in spec.md, as `usN-M` |
| Edge cases and guards | `latest-is-image`, `names-at-widths` (1360, 1000, 390 px), `preview-includes-hidden`, `edge-deleted-while-previewed`, `panel-close-flush`, `no-store-before-window`, `edge-undo-gone`, `no-image-shrink`, `limit-before-read`, `twelve-at-a-time`, axe (section, duplicate bar, preview, ⋯ menu: no critical issues) |
| Arabic | `us1-1-arabic`, `us2-2-arabic` (← moves to the next file), `us4-2-arabic` |
| Timing | `us4-1`: a pasted file shows as a tile within 1 s (SC-003). `us7-1`: tiles land exactly where the placeholders were and nothing below moves (SC-010) |

The runner fails any scenario that triggers React's "Maximum update depth" warning.

## 3. The running app (quickstart §3)

Local PostgreSQL with the seeded team, `next dev`, **no bucket** (the inline path), signed in as the admin on the seeded task. A script drove the browser and checked the database after each step: **33/33 pass, no console errors.**

| # | Check | Result |
|---|---|---|
| 1 | Three PNGs with long names | Newest first; neon-green Latest on v3; "Raneem · just now"; line two reads "Post v3 FINAL.png"; three rows stored |
| 2 | Preview | → → reaches "3 of 3"; click zooms and fits; a click on the dark area closes it and focus is back on the tile |
| 3 | Delete, Undo | Ghost with Undo; after Undo, still three rows |
| 4 | Delete, close the panel at once | Bottom message "Deleted …"; 2 s later still three rows; Undo, reopen: the file is back. Without Undo: deleted about 7 s after closing |
| 5 | Paste a screenshot outside the brief | Tile within 1 s; stored as "Screenshot HH.MM.png" |
| 6 | 7 MB PNG | Refused at once: "Too large · 7.0 MB, over the about 5 MB limit…"; nothing stored |
| 7 | **No compression (SC-011)** | A 2,171,964-byte PNG is stored and read back byte for byte (same SHA-256), with its real size recorded |
| 8 | Same name | Keep both stores "…v3 FINAL (2).png"; Replace then Undo leaves the task exactly as it was |
| – | Rename by clicking the name | "Post v1 approved" saves as "Post v1 approved.png" |
| 9 | Comment paperclip | Chip on the comment being written; posted body ends `[📎 Cover - square crop.png](attachment:<uuid>)`; the chip opens the preview |
| 10 | 📎 count with the section collapsed | Opens and scrolls it into view |
| 11 | Content Creator (may not edit) | No add, rename or delete; a paste explains why |
| 12 | Arabic (`fluxo-locale=ar`) | Section right to left; ← moves to the next file ("2 من …") |
| 13 | Phone (iPhone 13) | Two tiles per row, one ⋯ button each |

**Bugs found here and fixed in this branch:**

- **The section stayed on its placeholders.** React runs effects twice in development. The second call to the `loadAttachments` server action, made while the first was in flight, never answered, and the first answer was thrown away. Both runs now share one request.
- **Replace then Undo showed the replaced file twice.** The refresh after Undo read the list before the new file's delete had landed. Files removed that way are now remembered and kept out of later refreshes, and the removal is announced before the restore.
- **Console errors from an uploading tile's preview.** Its local link was revoked by React's development-mode effect re-run while the picture still used it. The link is now created and revoked in the same effect.

Not a code issue: the dev server served a stylesheet from before this work until `.next/dev` was deleted (Turbopack's disk cache). This is noted in HANDOVER.md.

## 4. Not verified here

| Item | Why |
|---|---|
| **Bucket uploads**: real progress, a 150 MB file byte for byte, a 210 MB refusal, delete during another upload (T045) | No object storage in this environment. The bucket path keeps the earlier `uploadOne` checks, moved to `XMLHttpRequest`. Check on Cranl. |
| **`pagehide` flush** | `keepalive` DELETE on closing the tab is covered by the route and by code review, not by an automated test |
| **SC-001** ("4 of 5 people find the latest file in 3 s") | A people test; measure after launch |
| **Phones and screen readers** | Phone layout checked by device emulation only; screen readers by axe only, not with a real reader |
