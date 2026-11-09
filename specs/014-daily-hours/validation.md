# Validation: spec 014

Run on a production build (`next build` + `next start`) against local PostgreSQL, 2026-11-09.

## Running app (`node scripts/hours-lab/realapp/run.cjs`): 39/39

Two members: the content creator logs hours, and the admin reads the report.

| Quickstart row | Checks |
|---|---|
| 1–3: Today's hours | "7,5" + Enter saves 7.5 and survives a reload. A quick choice replaces it (still one entry). 30, "abc" and 7.1 are refused with a reason, and nothing changes |
| 4: Reminder | Opens on the first page of the day, even on the Board, and names the last working day. Opening counts as asked today. Focus starts in the first field |
| 5: Several days | "Add another day" twice, then "Same for all" and one Save: three days saved |
| 6: A refused line | One line at 30: nothing saved, the line says why, every value stays |
| 7: Later | Esc closes it. A second browser on the same day isn't asked again. A reload doesn't reopen it after saving |
| 8: Weekend | Friday and Saturday are never Missing |
| — Recent days | A Missing day in the strip can be filled. The week total reads "8 of 40 h this week" |
| 9–10: Report | The member's row shows today's 8. "Hours" is in the admin nav. The download is a CSV with a BOM, rows and day totals. Previous week works |
| 11: Access | A member is sent away from `/hours` and gets 403 on the download |
| 12: Arabic and phone | The Arabic report mirrors. On a 390 px phone the reminder is a bottom sheet with 44 px targets and the number keyboard |
| Accessibility | axe finds no serious or critical issues on the reminder, Today's hours, the report, the report in Arabic, or the reminder on a phone |
| Console | No errors for either member |

## Labs

| Lab | Result |
|---|---|
| `lab:hours` (pure: dates, working days, parsing, validation, totals, CSV, strings) | 8/8 |
| Smoke (`scripts/hours-lab/smoke/run.ts`, the actions on PostgreSQL) | 20/20 |
| `lab:sheet` | 149/150 on the full run. The one failure, `cus5-2`, passed 3/3 twice when run alone (timing); this PR doesn't touch the sheets |
| `lab:spreadsheet` 11/11 · `lab:header` 24/24 · `lab:inbox` 9 + 30 · `lab:notify` 46/46 · `lab:brief` 55/55 | pass |
| `lab:attachments` | 58/60. The two focus checks fail the same way on `main` before this work |
| Typecheck, `scripts/preflight.sh`, `next build` | pass |

## As built

- **No browser UI lab (T014, T019, T022, T027).** The UI scenarios are covered by the running-app script above, on a production build, with axe.
- **Editing a day from the strip** opens the days form for that day (with Clear), instead of a separate popover.
- **The reminder** says how many other working days in the last 30 are missing. For someone who has never logged, that's up to about 20 when the feature first appears.
