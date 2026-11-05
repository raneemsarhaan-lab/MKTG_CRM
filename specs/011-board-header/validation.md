# Validation record: A Calmer Board Header

**Date**: 2026-11-05 · **Branch**: `claude/nice-noether-x4rgei`

How spec 011 was checked, and what wasn't.

## 1. Static checks and build

| Check | Result |
|---|---|
| `npm run typecheck` | Pass |
| `bash scripts/preflight.sh` | Pass |
| `next build` (production) | Pass |
| Schema | No change |

## 2. Labs

| Lab | Result |
|---|---|
| `npm run lab:header` (new) | **24/24** pass |
| `npm run lab:sheet` | **150/150** pass (145 before, plus 5 `pipe-*` scenarios) |
| `npm run lab:inbox` | 11 Node checks and 38 scenarios, all pass |
| `npm run lab:attachments` | 60/60 pass |
| `npm run lab:brief` | 55/55 pass |

**`lab:header`** mounts the real `BoardHeader`, `BoardToolbar`, `BrandMenu`, `FiltersButton`, `ViewMenu` and the compact `InboxButton`.

- **US1:**
  - the row order and the order inside each row;
  - the first column at 280 px or less;
  - no greeting, no PIPELINE heading, no three-way switch;
  - New task hidden for a `user`, with the title row's height kept;
  - every control wired (search, scope, Filters with its count, Display options, Inbox, New task).
- **US2:**
  - one brand: its name shows, plus the no-project note;
  - two brands: "2 brands";
  - All brands clears;
  - every brand ticked is the same as All brands;
  - keyboard: ↓ opens, Enter picks, Esc returns focus;
  - 12 brands on one line at 1280, with the list scrolling.
- **US3:**
  - the urgent orange badge, with the summary in the tooltip and the accessible text;
  - no fill;
  - the purple badge;
  - "All clear" with no badge.
- **US4:**
  - Board → Sheet keeps Pipeline selected;
  - the Content tab: the title, its own bar, no pipeline controls;
  - Pipeline returns to the last pipeline view.
- **US5 (390 × 700):**
  - search behind an icon;
  - the first column at 320 px or less;
  - no sideways page scroll;
  - Esc keeps the search text and returns focus;
  - the toolbar scrolls sideways;
  - every control at least 44 × 44;
  - icons only at the far end at 1100 px, with their names kept.
- **US6:**
  - Arabic mirrored, with no English left;
  - Tab order;
  - ←/→ on the tabs;
  - menus by keyboard;
  - axe in English and Arabic (no critical or serious issues);
  - `header.*` parity.

**`lab:sheet`, new `pipe-*` scenarios:**
- the video sheet's `ViewPair` asks to switch to Board, and offers no Content;
- the Content bar has no view switch;
- search narrows the video sheet to a matching clip under its video;
- a matching video keeps its clips;
- search narrows the Content sheet to a matching piece under its theme.

## 3. Running app

Local PostgreSQL and `next dev`. Signed in as the admin, and as the Content Creator (a `user`). **21/21 pass, no page or console errors.**

| # | Check | Result |
|---|---|---|
| 1 | Board at 1440 × 900 | Three rows. The first column starts at **254 px** (≤ 280, SC-001; about 355 before) |
| 2 | Board at 390 × 700 | The first column starts at **227 px** (≤ 320, SC-002; about 540 before). Search opens from its icon with focus. No sideways scroll |
| 3 | FR-003 functions | Search narrows the board (48 → 1). The Inbox opens its panel. New task opens the form. My tasks / Team tasks is saved. Filters shows "Filters · 1". Columns before design toggles |
| 4 | Brands | "Forefront Consulting" with the no-project note, then "2 brands", then "All brands" |
| 5 | Inbox | The badge, and "1 late · 1 due today" in the tooltip |
| 6 | Sheet and Content | Both under the header. Pipeline stays selected on Sheet. Search narrows the sheet (1 clip) and Content (1 piece). The Inbox and New task work on Content. Pipeline returns to Sheet |
| 7 | Saved links | `?view=content` and `?view=sheet&video=…` open as before |
| 8 | Content Creator | No New task. The title row stays 92 px. The avatar opens the account menu |
| 9 | Arabic | Mirrored: tabs on the right, avatar on the left, Arabic labels |
| 10 | 12 brands at 1280 | The toolbar stays on one line (SC-005). The 8 test brands were removed afterwards |

## 4. Found and fixed during validation

- **Phone tap targets.** On a phone, the avatar, the Board | Sheet buttons and Display options were 36–42 px. They are now 44 px.
- **The avatar's accessible name.** Its visible initials weren't part of its name, which axe's label-in-name rule flags. The initials are now drawn with CSS, and the name is "Raneem Sarhaan, Admin".
- **The new-items ring.** Spec 006's pulse was sized for the old pill. It now fits the compact button.
- **Dev server cache.** The dev server kept serving a stylesheet from before the edits. Clearing `.next` fixed it. This affects local development only, not the build.

## 5. Not checked

- The Arabic `header.*` strings need a native speaker's review.
- Not yet run on Cranl.
- The reference image is matched by layout and order (SC-004). Pixel sizes were read from the image, and the user should confirm the look on the real app.
