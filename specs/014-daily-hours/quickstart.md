# Quickstart: validating Daily Working Hours

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
npm run lab:hours
```

It runs:
- **pure checks:** dates, working days, `parseHours`, totals, CSV;
- **UI scenarios:** the card, the strip, the reminder with several days, the report, phone, Arabic, axe.

## Running-app checks (two members)

| # | Steps | Expected |
|---|---|---|
| 1 | Content creator opens My Day, types 7.5, presses Enter | "Saved". After a reload, 7.5 |
| 2 | Changes it to 8 | One entry, value 8 |
| 3 | Types 30, then "abc" | Refused with a reason, nothing saved |
| 4 | Delete yesterday's entry (or use a day with none), sign in again | The reminder opens once, naming the last working day (Thursday if today is Sunday) |
| 5 | In the window: "Add another day" twice, type 8, "Same for all", Save | Three days saved together. The window closes and the strip shows them |
| 6 | One line set to 30, then Save | Nothing saved. That line says why, and the others keep their values |
| 7 | "Later", then reload; open a second browser on the same day | The window doesn't come back that day, on either browser |
| 8 | A Friday is empty | Never asked about, never shown as Missing |
| 9 | Admin opens `/hours` | Both members' days and totals against capacity. Missing days marked |
| 10 | Admin downloads | The CSV opens in Excel with the same numbers and correct Arabic names |
| 11 | Content creator opens `/hours` or `/hours/export` | Redirected / 403 |
| 12 | Arabic and a 390 px phone | Mirrored, a bottom sheet, 44 px targets, the number keyboard |
