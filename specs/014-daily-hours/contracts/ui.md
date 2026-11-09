# UI Contract: Daily Working Hours

The look follows `design/hours.html`, made and approved before any UI code (§IV). Strings go in a new `hours` namespace in English and Arabic. Colours use `--hr-*` and existing tokens only.

## 1. "Today's hours" on My Day (`TodayHours`, `data-today-hours`)

- **Heading:** "Today's hours", with today's weekday and date.
- **The field** (`data-hours-input`):
  - `inputmode="decimal"`, labelled;
  - accepts 7.5, 7,5, 7:30 and Arabic digits;
  - Enter saves.
- **Quick choices** (`data-hours-quick="4|6|8|off"`): one tap fills the field and saves.
- **Save** (`data-hours-save`). The status reads "Saved" or the reason, and is read aloud politely (`role="status"`).
- **The 7-day strip** (`data-hours-day="YYYY-MM-DD"`):
  - each day shows its hours, "Off" or "Missing" (amber); today is marked; Fri/Sat are muted;
  - a click opens a small popover with the same field, Off and Clear.
- **The week total** (`data-hours-week`): "31.5 of 40 h this week".
- **"Log several days"** (`data-hours-several`) opens the days form (§2) as a dialog.

## 2. The days form (`DaysForm`), shared by the window and "Log several days"

- **One line per day** (`data-day-line="YYYY-MM-DD"`), each with:
  - the weekday and date, as a label;
  - the hours field;
  - an "Off" toggle;
  - a remove button on lines that were added (not on the first line of the reminder).
- **"Add another day"** (`data-add-day`):
  - adds the next missing working day;
  - when none is left, a date field limited to the last 30 days (not the future);
  - shows "2 more days missing".
- **"Same for all"** (`data-same-all`) copies the focused or first filled value to every empty line.
- **One Save** (`data-days-save`). If it fails, each failing line shows its reason in place, and everything typed stays.

## 3. The reminder window (`HoursReminder`, `data-hours-reminder`, `role="dialog"`)

- **Title:** "How many hours did you work on Thursday, 5 Nov?"
- **Body:** the days form (§2), starting with that day.
- **Buttons:** "I was off" for the first line, Save, and "Later" (`data-hours-later`).
- **Opening:**
  - after the page is idle;
  - never over another dialog or the task form;
  - at most once a day per member (`hours_prompted_on`).
- **Focus:** starts in the first field, is trapped in the window, and goes back to where it was on close. Esc means Later.
- **Phones:** a bottom sheet, 44 px targets, the number keyboard.

## 4. The report (`/hours`, `HoursReport`, `data-hours-report`)

- **Head:** "Hours", the week ("8 – 14 Nov") with previous and next (`data-week-prev`, `data-week-next`), and Download (`data-hours-export`).
- **Table:**
  - a real `<table>` with a caption;
  - one row per member (`data-hours-row="<memberId>"`);
  - Sun–Thu columns, plus Fri/Sat when anyone logged them;
  - the total against capacity;
  - a last row of per-day totals.
- **Cells:** hours; "Off"; "Missing" in amber with an icon, so it isn't colour alone.
- **Summary:** "7 of 9 logged every working day".
- **Who sees it:** admins only. "Hours" appears in the nav after Capacity.

## 5. Phones and Arabic

- Every surface mirrors in Arabic.
- Weekday and month names, and numbers, use the member's locale.
- On phones:
  - the strip scrolls sideways;
  - the report scrolls with a sticky name column;
  - dialogs are bottom sheets.
