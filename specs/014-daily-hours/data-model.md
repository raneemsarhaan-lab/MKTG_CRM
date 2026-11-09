# Data Model: Daily Working Hours

**Feature**: [spec.md](./spec.md) · **Research**: [research.md](./research.md)

Additive only, applied with `db push` (`scripts/migrate.sh`). No backfill is needed: with no rows, every day is Missing.

## 1. New table

### `work_days` (Prisma `WorkDay`)

| Field | Type | Rules |
|---|---|---|
| `member_id` | uuid → members, cascade | The person whose day it is |
| `date` | date | The member's calendar day (R1). Not in the future. Members can change only the last 30 days |
| `hours` | numeric(4,2), null | 0–24, in steps of 0.25. Null when `off` |
| `off` | boolean, default false | "I was off". When true, `hours` is null |
| `updated_by` | uuid → members, null on delete | Who saved it: the member, or an admin correcting it |
| `updated_at` | timestamptz | |
| `created_at` | timestamptz | |

- **Primary key:** `(member_id, date)`.
- **Index:** `(date)`, for the weekly report.
- **Check:** exactly one of `hours IS NOT NULL` or `off`. The app enforces it, and the database does too where `db push` allows.

A day has three states:
- **Missing:** no row.
- **Hours:** `hours` is set.
- **Off:** `off` is true.

Clearing a day deletes its row.

## 2. Changed table

| Table | Change | Why |
|---|---|---|
| `members` | `hours_prompted_on date, null` | The last local date the reminder opened or was put off ("Later"), so it shows at most once a day on any device (R2) |

The existing `members.capacity_hrs_wk` (default 40) is the weekly target shown beside totals.

## 3. Derived values (in `src/lib/hours.ts`, pure)

- `isWorkingDay(date)`: Sunday to Thursday.
- `lastWorkingDayBefore(date, notBefore)`: the reminder's day. Null if the member's account is newer.
- `missingDays(entries, from, to, notBefore)`: working days in the range with no row.
- `weekOf(date)`: the Sunday that starts the week, as My Board does.
- `parseHours(text)`: accepts `7.5`, `7,5`, `7:30` and Arabic digits. Rejects anything outside 0–24 or not on a quarter hour.
- `weekTotals(entries)`: per member and per day. Off and Missing count as 0.
- `toCsv(report, labels)`: UTF-8 with a BOM, CRLF line endings, Excel quoting.

## 4. Types (`src/types/index.ts`)

```text
WorkDayEntry   { date: 'YYYY-MM-DD', hours: number | null, off: boolean }
HoursStatus    { localDate, remindDay: string | null, missing: string[], prompted: boolean,
                 recent: WorkDayEntry[] /* last 7 days */, weekTotal: number, capacity: number }
HoursWeekRow   { memberId, name, capacity, days: Record<date, WorkDayEntry | null>, total: number, complete: boolean }
HoursWeekReport{ weekStart, days: string[], rows: HoursWeekRow[], dayTotals: Record<date, number>, completeCount: number }
```
