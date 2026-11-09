# Research: Daily Working Hours

## R1. One row per member per day, keyed by the member's own date

**Decision.**
- **Storage:** a `work_days` row per member and calendar day, holding a `date` value (no time) plus either `hours` (numeric 4,2) or `off = true`.
- **The date:** the client sends its own local date as `YYYY-MM-DD`.
- **Server checks:**
  - the date is no later than the server's today plus one day (time zones ahead);
  - for members, it is no earlier than 30 days before that.
- **Clearing** a day deletes its row, so the day is Missing again.

**Why.**
- The spec says "today" is the member's calendar day.
- A date column avoids every time-zone shift a timestamp would cause.
- One row per day is the natural unique key (`member_id`, `date`).

**Alternatives.**
- Timestamps with a stored time zone: more moving parts for no gain.
- A per-week JSON blob: harder to report and validate.

## R2. The reminder: decided on the server, shown once a day

**Decision.**
- **Mounting:** `HoursReminder` is mounted once in `AppShell`. After the page is idle, it calls `hoursStatus(localDate)`.
- **The server returns:**
  - the last working day before `localDate` (Sunday–Thursday, not before the member's account was created);
  - whether that day has an entry;
  - the other missing working days in the last 30 days, for "Add another day";
  - whether the member was already prompted on `localDate`.
- **When it opens:** only if that day is missing and `members.hours_prompted_on` isn't `localDate`.
- **Remembering:** opening it, or choosing "Later", sets `hours_prompted_on = localDate`, so it doesn't reopen that day on any device.
- **Other dialogs:** before opening, it checks that no `[role="dialog"]` is open and that no task form is showing. If one is, it watches with a MutationObserver until it closes.

**Why.**
- Server state makes "once a day" true across tabs and devices (SC-004).
- Idle-time loading keeps the first paint fast.
- Waiting for other dialogs is FR-013.

**Alternatives.**
- localStorage: per device, so a member would be asked twice.
- Showing it only on My Day: members who start elsewhere (the Board) would miss it.

## R3. Several days, all or nothing

**Decision.** One action, `saveDays(entries: { date, hours | null, off })`, handles both the window and "Log several days":
- it validates every line first (range, step, date rules);
- if any line fails, it returns per-line errors and saves nothing;
- otherwise it upserts every line in one transaction.

On the client:
- **"Same for all"** copies a value to the empty lines;
- **"Add another day"** takes the next item from the server's missing list, or a date picker limited to the last 30 days;
- **"Later"** calls `dismissReminder(localDate)`.

**Why.** FR-017 needs atomic saves, and one code path serves both entry points.

## R4. The report and its download

**Decision.**
- **The page:** an admin page at `/hours`, with `?week=YYYY-MM-DD` set to the Sunday. It shows:
  - rows: active members, by name;
  - columns: Sun–Thu plus Fri/Sat, the weekend columns muted and shown only when someone logged them;
  - a total per member against `capacity_hrs_wk`, and a per-day total;
  - Missing in amber, and "N of M logged every day".
- **The download:** `GET /hours/export?week=…` returns CSV, admin-only, as UTF-8 with a BOM and CRLF line endings, quoted the way Excel expects. It has the same rows, columns and totals as the page.
- **Navigation:** "Hours" appears for admins after Capacity.

**Why.**
- CSV opens in Excel and Google Sheets with no new dependency (Tech Stack gate).
- The BOM makes Arabic names show correctly in Excel.

**Alternatives.**
- An `.xlsx` library: a new dependency for no gain the user asked for.
- Putting the report inside Capacity: that page is about planned load. A separate page keeps it clear.

## R5. Working days

**Decision.**
- Working days are Sunday to Thursday, the same as My Board's week (`weekStart` in `src/lib/myboard.ts`).
- `lib/hours.ts` adds `isWorkingDay(date)`, `lastWorkingDayBefore(date)` and `workingDaysBetween(a, b)`.
- Friday and Saturday can still be logged from the 7-day strip, but are never Missing.

**Why.** It is the clarified answer and matches what the app already does.

## R6. Where it lives on screen

**Decision.**
- **On My Day:** a `TodayHours` card under the greeting, above the stat cards. It holds:
  - the field, with `inputmode="decimal"`;
  - quick choices 4, 6, 8 and "Off";
  - Save;
  - the 7-day strip;
  - "31.5 of 40 h this week";
  - "Log several days".
- **The reminder window:**
  - desktop: a centred modal;
  - phones: a bottom sheet;
  - focus starts in the first field, stays inside, and returns on close;
  - Esc means Later;
  - rows are added with "Add another day", and "Same for all" fills the empty ones.
- **The team view** of My Day (admins) doesn't show the card. Admins use `/hours`.

**Why.** My Day is where members start (spec assumption). The card is the shortest path for SC-001.

## R7. Access

**Decision.**
- **Members:** `myHours`, `saveDays`, `hoursStatus` and `dismissReminder` act only on the session member.
- **Admins only:**
  - `teamHours(week)`, the `/hours` page and the CSV route;
  - correcting other members' days or days older than 30 days, through `saveDays(entries, { memberId })`.
- **Superusers** are treated as members (clarified).

**Why.** §III and FR-034: the server enforces it, the screen only mirrors it.
