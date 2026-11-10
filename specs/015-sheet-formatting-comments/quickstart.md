# Quickstart: validating Sheet Formatting, Editing Tools and Comments

## Setup

```bash
bash scripts/migrate.sh
```

```bash
npx next build && npx next start
```

Lab members (password `lab-pass-1`):
- raneem.sarhaan@forefront.consulting (admin);
- content@forefront.consulting.

## Labs

```bash
npm run lab:spreadsheet
```

Its pure checks cover:
- style merge and the layers;
- number and date display (EN and AR);
- `toCss`;
- the clipboard style parser, against a real Excel HTML clip;
- rule evaluation (stage 3).

It also runs the UI scenarios.

```bash
npm run lab:sheet
```

This checks the Content and Video sheets for regressions.

## Running-app checks, stage 1

| # | Steps | Expected |
|---|---|---|
| 1 | Bold, fill, white text, centre, thick bottom border on a header row; reload | Same look; another member sees it too |
| 2 | Format column B as Currency EGP, 2 decimals; type 12500 | Shows EGP 12,500.00. Editing shows 12500 |
| 3 | Ctrl+A, Arial 12 | One step, under 1 s on 5,000 rows. Undo restores it |
| 4 | Merge & Centre A1:D1 with two values | Asks first, then keeps A1. Undo restores both values |
| 5 | Copy a formatted table from Excel; paste | Bold, colours, fills and alignment kept |
| 6 | Copy formatted cells to Google Sheets | Styles arrive |
| 7 | New comment with @content; content opens the bell | Notification → the sheet at the cell, thread open |
| 8 | Reply, edit own, delete own; resolve; reopen | Marker hides on resolve; the panel lists Resolved |
| 9 | Delete the commented row, then undo | Thread and formatting come back |
| 10 | Content sheet: fill a task row amber, comment on its title; drop the task, then restore it | Formatting and comment leave and come back with it |
| 11 | Content sheet: Merge | Disabled, says why |
| 12 | Protected sheet as another member | Formatting refused; commenting allowed |
| 13 | Arabic and 390 px phone | Mirrored; bottom-sheet formatting; full-screen thread |
| 14 | axe on the toolbar, dialogs and thread | No serious or critical issues |
