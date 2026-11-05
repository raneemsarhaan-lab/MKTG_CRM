# Quickstart: validating Task Attachments

Three layers: pure checks, the lab (the real section with a stub host), and the running app.

## 1. Static checks

```bash
npm run typecheck
```

```bash
bash scripts/preflight.sh
```

```bash
npx next build
```

All three must pass. `next lint` no longer exists in Next.js 16 (see spec 005's validation record).

## 2. The lab: `npm run lab:attachments`

It builds `scripts/attachments-lab/` (esbuild) and runs Playwright with Chromium at `/opt/pw-browsers/chromium`.

1. **Pure checks first**: `splitName`, `nextFreeName`, `newestFirst`/`latestImageId`, `limitFor`/`formatBytes`, and the comment-token round trip ([contracts/server.md §4](./contracts/server.md)).
2. **Scenarios**: one per acceptance scenario in [spec.md](./spec.md), named `usN-M`, plus the guards below.

| Group | Scenarios | Stub host setup |
|---|---|---|
| US1 Newest and who | us1-1 … us1-5 | Three images (v1, v2, v3 FINAL) an hour apart, one PDF, long names |
| US2 Preview | us2-1 … us2-7 | Same, plus a .docx; touch context for us2-5 |
| US3 Delete with Undo | us3-1 … us3-5 | Fake store records `removeAttachment` calls and timing |
| US4 Add files | us4-1 … us4-7 | Fake `upload` with scripted progress, failure at 55 %, and size; `hasStorage` both ways |
| US5 Rename | us5-1 … us5-5 | Fake `rename`; a read-only host for us5-5 |
| US6 Header and comments | us6-1 … us6-3 | Host with comment box wired to `handle` |
| US7 Lists and loading | us7-1, us7-2 | 15 files; `load` resolves after 700 ms |
| US8 Phones and keyboard | us8-1 … us8-4 | 390 px touch context; keyboard-only run |

Guards that run with every scenario, or once:

| Guard | What it proves |
|---|---|
| `no-store-before-window` | No server delete is sent before the window ends (fake store timestamps) |
| `panel-close-flush` | Host unmount during Undo → bottom message ≥ 6 s → Undo restores → otherwise one delete sent |
| `no-image-shrink` | The `File` passed to `upload` is the same object, with the same size, as the one added |
| `limit-before-read` | A too-large file never reaches `upload` or `FileReader` |
| `latest-is-image` | A newer PDF never takes the Latest pill |
| `names-at-widths` | At 1360, 1000 and 390 px, every tile's second line ends with the full extension and is not cut |
| `tokens-only` | No hex or `rgba(` literal in `src/components/kanban/attachments/` |
| `messages-parity` | The `attachments` keys match in English and Arabic; no English left in Arabic |
| `render-loop` | No React "Maximum update depth" warning in any scenario |
| `axe` | No critical accessibility issues in the section or the preview |

**Expected**: every scenario passes, and the runner prints a summary like spec 005's ("N/N scenarios pass").

## 3. The running app

**Prerequisites**:
- Local PostgreSQL with the seeded team.
- `next dev`, signed in as the admin.
- A task in Final check.
- **No bucket configured**, so this checks the inline path. The bucket path is checked on Cranl (§4).

| # | Do | Expect |
|---|---|---|
| 1 | Add three PNGs with long names ending v1, v2, v3 FINAL | Newest first; Latest (neon green) on v3; "yosra · just now"; each name ends "…v3 FINAL.png" whole |
| 2 | Click v3's picture; press → twice; click the picture; click the dark area | Counter 1→3 of N; zooms; closes; focus back on v3's tile |
| 3 | Delete v1; press Undo | Ghost with countdown, then v1 back; nothing deleted in the database |
| 4 | Delete v2; close the panel immediately | Bottom message "Deleted …v2 · Undo"; Undo → reopen the task: v2 is there. Repeat without Undo → v2 gone after reload |
| 5 | Copy a screenshot; press Ctrl+V on the panel (not in the brief) | Tile "Screenshot HH.MM.png" appears in under 1 s and finishes |
| 6 | Add a 7 MB PNG | Refused at once: "Too large", "7.0 MB, over the about 5 MB limit…"; nothing sent |
| 7 | **No compression (SC-011)**: add a 3 MB PNG; download it from the preview; compare `sha256sum` and size with the original | Identical |
| 8 | Add "…v2.png" again → Keep both; again → Replace it → Undo | "(2)" copy kept; Replace swaps it, and Undo brings the old one back and removes the new one |
| 9 | In the comment box, use 📎, write text, post; click the chip | The file is attached to the task; the comment shows the chip; the chip opens the preview |
| 10 | Click 📎 N under the task title with the section collapsed | Section opens, scrolls into view, briefly highlighted |
| 11 | Sign in as a member who doesn't own the task; open it | Tiles and previews only; no Add files, rename or delete; paste shows the refusal note |
| 12 | Switch to Arabic (`fluxo-locale=ar`) | Section and preview right to left; ← moves to the next file |
| 13 | Phone width (390 px, touch emulation) | Two tiles per row, a ⋯ menu on each, no sideways scroll, swipe in the preview |

## 4. Cranl deployment (bucket configured)

- Paste a 5 MB screenshot: progress moves smoothly from 0 to 100 % and the file is stored.
- Add a 150 MB video: it's accepted, with progress, and the download matches the original byte for byte.
- Add a 210 MB file: refused at once with "over the 200 MB limit".
- Delete during upload of another file: both outcomes are correct, and the attachment count changes by exactly the right amount.
