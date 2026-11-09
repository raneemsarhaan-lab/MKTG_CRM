# Server Contract: Daily Working Hours

The actions live in `src/actions/hours.ts`. Each one checks the session member. Errors come back as `{ success: false, error }`, and the client shows them through the `hours.err.*` strings.

| Action | Who | Input | Output |
|---|---|---|---|
| `hoursStatus(localDate)` | any member | `'YYYY-MM-DD'`, the device's today | `HoursStatus` (data-model §4): the reminder's day (if missing), other missing working days in the last 30, `prompted`, the last 7 days, this week's total, and capacity |
| `myHours(from, to)` | any member | dates, at most 31 days apart | `{ entries: WorkDayEntry[] }` for the session member |
| `saveDays(entries, opts?)` | any member; `opts.memberId` admin only | `{ date, hours: number \| null, off: boolean }[]`, at most 31 | `{ success: true, saved: WorkDayEntry[] }`, or `{ success: false, error: 'invalid', lines: { date, error }[] }`. All or nothing |
| `dismissReminder(localDate)` | any member | `'YYYY-MM-DD'` | `{ success: true }`. Sets `hours_prompted_on`. Also called when the window opens |
| `teamHours(weekStart)` | admin | a Sunday `'YYYY-MM-DD'` | `HoursWeekReport` |

## The rules in `saveDays`

- **Each line** has a valid date and either `off = true` with `hours = null`, or `hours` from 0 to 24 on a quarter hour. `hours = null` with `off = false` clears the day (deletes the row).
- **Dates:**
  - none after the server's today + 1 day (`future`);
  - for members, none before today − 30 days (`too_old`);
  - admins can save any past date for anyone.
- **The same date twice** in one call is `duplicate`.
- **Saving:** every line is checked first. Any failure saves nothing. A success upserts every line in one transaction, with `updated_by` set to the session member.

**Error codes:** `not_authenticated`, `not_authorized`, `invalid`, and per line: `bad_hours`, `bad_step`, `future`, `too_old`, `duplicate`, `bad_date`.

## Routes

| Route | Who | What |
|---|---|---|
| `/hours` | admin, otherwise redirected to `/overview` | The weekly report. `?week=YYYY-MM-DD` (a Sunday); defaults to this week |
| `/hours/export?week=…` | admin, otherwise 403 | The report as `text/csv; charset=utf-8`, with a BOM. File name `hours-<week>.csv` |
| `/overview` | any member | My Board, with the `TodayHours` card (not in the admin team view) |
