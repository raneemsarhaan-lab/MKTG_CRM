# Quickstart: Validating the Board Header

## 1. Lab (no database)

```bash
npm run lab:header
```

**What it covers.** The lab builds `scripts/header-lab/out/` and runs its scenarios in Chromium. One or more scenarios per acceptance scenario of US1–US6, plus:
- messages parity for `header.*`;
- axe, in English and Arabic.

**Expected.** Every scenario passes, and no `MISSING_MESSAGE` is logged.

**Regressions:**

```bash
npm run lab:sheet
```

```bash
npm run lab:inbox
```

```bash
npm run lab:attachments
```

```bash
npm run lab:brief
```

**Expected.** All pass. The sheet and inbox labs have updated selectors for `ViewPair` and the compact Inbox.

## 2. Static checks and build

```bash
npm run typecheck
```

```bash
bash scripts/preflight.sh
```

```bash
npx next build
```

## 3. Running app (local PostgreSQL)

**Setup.** Start `next dev`, then sign in as an admin, and in a second browser as the Content Creator (a `user`).

| # | Check | Expected |
|---|---|---|
| 1 | Board at 1440 × 900 | Three rows as in `reference.webp`. The first pipeline column's top is ≤ 280 px (SC-001) |
| 2 | Board at 390 × 700 | Phone layout. The first column's top is ≤ 320 px (SC-002). The toolbar scrolls sideways, and search opens from its icon |
| 3 | Every FR-003 function | Search, Inbox (open and pin), New task, My tasks / Team tasks, brands, the no-project note, Filters, Show your week, Columns before design, Board / Sheet / Content all work as before (SC-003) |
| 4 | Brands | One brand: its name on the button and the board narrows. Two: "2 brands". All brands: clears |
| 5 | Inbox | Badge and urgent colour. The tooltip shows the summary. With nothing waiting: no badge, "All clear" |
| 6 | Sheet and Content | Tabs, search, Inbox and New task are there. The sheet bar keeps its controls, and search narrows the rows by title |
| 7 | Saved links | `/board?view=sheet`, `/board?view=content` and `&video=…` open the same view as before |
| 8 | Content Creator | No New task. The title row keeps its height |
| 9 | Arabic | Mirrored, every label in Arabic |
| 10 | 12 brands (seeded) at 1280 px | The toolbar stays on one line (SC-005) |

Record the results in `validation.md`.
