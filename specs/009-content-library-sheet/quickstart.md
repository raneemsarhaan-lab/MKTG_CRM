# Quickstart: validating the Content sheet

**Prerequisites**: spec 008's (local PostgreSQL, `bash scripts/migrate.sh`, Chromium). The seed adds the new content types.

## 1. Lab

```bash
npm run lab:sheet
```

| Scenario ids | Proves |
|---|---|
| Node: `content-parse-*`, `content-cadence`, `content-summary`, `content-parity` | The reference rows read correctly (HTML with merged cells, TSV), status/type/audience/frequency, cadence, summary |
| `cus1-*` | Themes as groups with owner, frequency and audience; pillars; columns; frozen header and title; summary; collapse |
| `cus2-*` | Paste plan: counts, matched by Task Link, already in the sheet, problems fixed or left out, a second paste adds nothing |
| `cus3-*` | Content stage names; the menu equals the board's moves; prompts on Published |
| `cus4-*` | Four link cells: saved, refused when not a link, Missing link |
| `cus5-*` | Cadence "this week n of m"; editing theme details |
| `cus6-*` | Video pieces expand into clips; Open in video sheet |
| `cus7-*` | + Piece, inline edits, Archive and Restore; who may add |
| `content-kbd`, `content-rtl`, `content-axe` | Keyboard, Arabic, accessibility |

All of spec 008's scenarios must still pass, because the grid core is shared.

## 2. Running app

Run the reference paste: `scratchpad/realapp-content.cjs` pastes the 18 "Plan (Organized)" rows as the admin into a database where 7 of their Task Links exist.

| # | Expect |
|---|---|
| 1 | Preview: 2 themes, 2 pillars; 11 new, 7 matched by Task Link; "Link error" and the post-title LinkedIn cell listed as cells left empty |
| 2 | Add: 11 tasks created and 7 updated; no duplicate; a second paste adds 0 (SC-001) |
| 3 | Statuses mapped: Initial Design → D-In Progress, Final Design → D-Check; iPhone 18 archived and not on the board |
| 4 | A Content Creator owning a theme can + Piece in it, but not in the other theme (SC-009); no New task button |
| 5 | Moving a piece in the Content sheet moves its board card (SC-002) |
| 6 | Cadence and summary match the database (SC-004) |
| 7 | Arabic: right to left, Western digits |
