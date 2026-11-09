# Feature Specification: Daily Working Hours

**Feature Branch**: `claude/nice-noether-x4rgei`

**Created**: 2026-11-09

**Status**: Draft

**Input**: User description: "build a daily working hours reporting — user just enters the working hours he worked today, and when user forgets yesterday's input it opens in the new day as pop up window, and make it easy and accessible to the user"

## Context

Momentum knows how much work is **planned**: each member has a weekly capacity (40 hours by default), each task has an hours estimate, and admins see the result on the Capacity page. It doesn't know how much anyone actually **worked**.

This feature adds one number a day: the hours a member worked. It has to stay small enough that people really do it:
- one field;
- reachable from where they already start their day (My Day);
- a reminder that comes to them when they forget, instead of a page they have to remember to visit.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Log today's hours in a few seconds (Priority: P1)

At the end of the day, a member opens My Day and sees "Today's hours". They type 7.5 (or tap a quick choice such as 8), and it is saved. They can change it any time that day.

**Why this priority**: It is the feature. Without it there is nothing to report or remind about.

**Independent Test**: Sign in, open My Day, enter 7.5 and reload. 7.5 is still there and marked as saved.

**Acceptance Scenarios**:

1. **Given** a member who hasn't logged today, **When** they open My Day, **Then** they see "Today's hours" with an empty field, quick choices and a short prompt.
2. **Given** the field, **When** they enter 7.5 and press Enter or Save, **Then** it is saved, shows "Saved", and stays after a reload.
3. **Given** today is logged, **When** they change 7.5 to 8, **Then** the new value replaces the old one. There is still one entry for the day.
4. **Given** a value that isn't a number of hours between 0 and 24 (e.g. "abc" or 30), **When** they save, **Then** it is refused with a plain reason, and nothing is saved.
5. **Given** a keyboard or screen-reader user, **When** they reach the field, **Then** it has a visible label, can be filled and saved with the keyboard alone, and the result is announced.

---

### User Story 2 - A pop-up for the day I forgot (Priority: P1)

A member forgot to log yesterday. The first time they open Momentum today, a small window asks: "How many hours did you work on Monday, 9 Nov?" They answer in one step, and the window closes. If they were off that day, they say so with one tap. If they're busy, they choose "Later".

**Why this priority**: The user asked for it directly. Missed days are what make reports unreliable.

**Independent Test**: Leave yesterday empty, sign in today, and check that the window appears once, before anything else needs attention. Answer it, reload, and check it doesn't come back.

**Acceptance Scenarios**:

1. **Given** the previous working day has no entry, **When** the member opens any page of the app for the first time that day, **Then** the reminder window opens and names that day.
2. **Given** the window, **When** they enter hours and save, **Then** the day is logged and the window closes for good.
3. **Given** the window, **When** they choose "I was off that day", **Then** the day is recorded as a day off and they aren't asked about it again.
4. **Given** the window, **When** they choose "Later" or press Esc, **Then** it closes. My Day keeps showing the missing day, and the window opens again the next time they open the app on a later day.
5. **Given** more than one working day is missing (e.g. back from three days away), **When** the window opens, **Then** it lists each missing day, up to [NEEDS CLARIFICATION: how far back should the pop-up ask? only the last working day, or every missing day in the last week?], in one window, each with its own field and "Off".
6. **Given** yesterday wasn't a working day ([NEEDS CLARIFICATION: which days are working days: Sunday–Thursday, Monday–Friday, or chosen per member?]), **When** the member opens the app, **Then** they're asked about the last working day, not about the weekend.
7. **Given** a phone, **When** the window opens, **Then** it fills the bottom of the screen, its targets are at least 44 px, and the number keyboard opens.

---

### User Story 3 - See and fix my recent days (Priority: P2)

Under "Today's hours", a member sees their last 7 days at a glance: each day's hours, "Off", or "Missing". They can tap any of those days to fill or correct it, and they see this week's total against their weekly capacity.

**Why this priority**: It makes corrections easy and makes the habit visible. The core logging works without it.

**Independent Test**: Log three different days, then open My Day. The strip shows them, the total is their sum, and correcting one day updates the total.

**Acceptance Scenarios**:

1. **Given** a week with some days logged, **When** the member opens My Day, **Then** they see 7 days, each showing its hours, Off or Missing, with today highlighted.
2. **Given** a past day in the strip, **When** they choose it, **Then** they can enter, change or clear its hours, or mark it off.
3. **Given** logged days this week, **When** they look at the total, **Then** it shows "31.5 of 40 h this week", using their own weekly capacity.

---

### User Story 4 - Team hours report (Priority: P2)

A manager opens a report of worked hours: one row per member, one column per day of the chosen week, plus totals against each member's capacity. Missing days stand out. The report can be copied or downloaded as a spreadsheet file.

**Why this priority**: The user asked for "reporting". The data has to be collected first (stories 1–3) before a report is useful.

**Independent Test**: Have two members log a few days, open the report as a manager, and check the numbers, the totals and the download against what was entered.

**Acceptance Scenarios**:

1. **Given** logged days, **When** someone allowed to see the report opens it ([NEEDS CLARIFICATION: who can see other people's hours: admins only, admins and team leads, or everyone?]), **Then** they see each member's hours by day for this week, and the totals.
2. **Given** the report, **When** they go to the previous or next week, **Then** the figures change to that week.
3. **Given** the report, **When** they download it, **Then** they get a spreadsheet file with the same rows, columns and totals.
4. **Given** a member who isn't allowed to see the report, **When** they look for it, **Then** they can't reach it, and they only ever see their own hours.

---

### Edge Cases

- **Midnight and time zones:** "today" and "yesterday" are the member's own calendar days. An entry made at 00:30 for the evening before is made through the reminder or the 7-day strip, not as today.
- **Several devices or tabs:** the last saved value wins. The window doesn't reopen for a day that was answered in another tab.
- **A brand-new member:** they aren't asked about days before their account existed.
- **A removed member:** their past entries stay in the report for the weeks they worked.
- **The future:** hours can't be entered for future days.
- **Very old days:** entries more than 30 days back can't be changed by the member (an admin can).
- **Zero hours:** 0 is allowed and means "worked no hours". It isn't the same as Off, and it isn't the same as Missing.
- **Other windows:** the reminder never opens on top of an unsaved task form or another dialog. It waits until that one closes.
- **Offline:** an entry made while offline is kept and saved when the connection returns, and the status says so.

## Requirements *(mandatory)*

### Functional Requirements

**Logging**

- **FR-001**: Each member MUST be able to record, for any calendar day, either a number of hours worked, or that they were off. The value can be cleared, making the day Missing again.
- **FR-002**: Hours MUST be between 0 and 24, in steps of 0.25 (15 minutes). Values outside that, or that aren't numbers, MUST be refused with a reason.
- **FR-003**: There MUST be at most one entry per member per day. Saving again replaces it.
- **FR-004**: My Day MUST show "Today's hours" near the top, with the field, a few quick choices (e.g. 4, 6, 8) and a Save action. Enter MUST save.
- **FR-005**: Saving MUST be confirmed on screen ("Saved") and announced to screen readers. A failure MUST say so and keep what the member typed.
- **FR-006**: Members MUST NOT be able to log future days, or change days older than 30 days. Admins MAY correct any day.

**Reminder pop-up**

- **FR-010**: The first time a member opens the app on a day, if their most recent working day before today has no entry, the app MUST open the reminder window.
- **FR-011**: The window MUST name each day it asks about by weekday and date, in the member's language. It MUST offer a hours field and "I was off" for each day, plus "Later".
- **FR-012**: Answering every listed day MUST close the window. "Later", Esc or closing it MUST dismiss it until the next day the member opens the app. The missing days MUST stay visible on My Day.
- **FR-013**: The window MUST NOT open over another open dialog or an unsaved form. It MUST wait until that closes.
- **FR-014**: The window MUST put focus in its first field when it opens, keep focus inside while it is open, and return focus to where it was when it closes.
- **FR-015**: Days before the member's account was created, and non-working days, MUST NOT be asked about.

**My recent days**

- **FR-020**: My Day MUST show the member's last 7 days, each as hours, Off or Missing, with today marked.
- **FR-021**: Any of those days MUST be editable in place, with the same rules as today.
- **FR-022**: My Day MUST show the current week's total against the member's weekly capacity.

**Report**

- **FR-030**: People allowed to see the report MUST see, for a chosen week, one row per active member and one column per day, with each cell showing hours, Off or Missing, plus a total per member and per day.
- **FR-031**: Each member's total MUST be shown against their weekly capacity.
- **FR-032**: Missing days MUST stand out, and the report MUST show how many members logged every working day of the week.
- **FR-033**: The report MUST move by week, and MUST be downloadable as a spreadsheet file with the same content.
- **FR-034**: Members MUST only ever see their own hours, unless they are allowed to see the report.

**Access and language**

- **FR-040**: Every surface MUST work with the keyboard alone, with visible labels and focus, and MUST meet WCAG 2.1 AA contrast.
- **FR-041**: On phones, the window MUST open as a bottom sheet, the targets MUST be at least 44 px, and the hours field MUST open a number keyboard.
- **FR-042**: Every text MUST be available in English and Arabic, and every surface MUST mirror in Arabic. Hours MUST show with the member's number format.

### Key Entities

- **Day entry**: one member's record for one calendar day. It holds the member, the date, and either the hours worked or "off". It also records who last changed it and when.
- **Working week**: which days of the week count as working days. Used to decide which missing days to ask about, and which days the report expects.
- **Reminder state**: per member, the last day the reminder window was shown or dismissed, so that "Later" waits for the next day.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A member can log today's hours in under 10 seconds, in three actions or fewer, from opening My Day.
- **SC-002**: A member can answer the reminder window for one missed day in under 10 seconds, with the keyboard alone or by touch.
- **SC-003**: After four weeks, at least 90% of members' working days have an entry (hours or Off).
- **SC-004**: The reminder window appears at most once per member per day, and never for a day that already has an entry.
- **SC-005**: The weekly report's totals match the sum of the entries exactly, and the downloaded file matches the screen.
- **SC-006**: An automated accessibility check finds no serious or critical issues on the hours field, the reminder window or the report, in English and Arabic, on desktop and phone.

## Assumptions

- "Working hours" is one total per day, not split by task or project. Splitting by task can come later.
- Members enter their own hours. There's no approval step.
- My Day (the overview page) is where members start their day, so "Today's hours" lives there.
- The reminder is shown inside the app only. Email or phone alerts for missed days are out of scope here (spec 012's notifications could add them later).
- "Today" uses the member's device calendar.
- Weekly capacity is the existing per-member figure (40 hours by default).
- Overtime rules, pay, leave balances and approvals are out of scope.
