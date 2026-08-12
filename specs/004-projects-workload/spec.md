# Feature Specification: Projects Workload — per team member and per brand

**Feature Branch**: `004-projects-workload`

**Created**: 2026-08-12

**Status**: Draft

**Input**: User description: "In Projects board. I need you to work on adding this projects workload per team member, and brand." — accompanied by two reference screenshots (a *Portfolio at a glance* panel with brand and capacity rollups, and a per-person workload card).

---

## Context

The Projects board already holds a full plan: 40 projects, 327 steps, 960 planned step-days, each step carrying a duration, a due date and (sometimes) an assignee. Today that data can only be read one project at a time. Nobody can answer "is Yosra overloaded in October?" or "how much of the plan belongs to The Strategy Community?" without opening every project and adding it up by hand.

This feature adds two rollups over data the board already has: **by brand**, and **by person**.

### What the reference screenshots do and do not tell us

The screenshots are a mock. Its *structure* is the requirement; its *numbers* are from an older snapshot of the plan and MUST NOT be treated as expected output.

Checked against the live plan:

| Mock says | Live plan says | Verdict |
|---|---|---|
| Projects: 14 | 14 projects flagged Focus | matches — the panel is scoped to **Focus**, not all 40 |
| Forefront 3 proj · Islam Personal Branding 2 · The Strategy Community 8 · Omnisight 1 | identical counts | matches exactly |
| Forefront 444h (= 74 step-days at 6h) | Forefront 94 step-days | differs — durations were edited since the mock |
| Samaa "Days of work 164" | Samaa 164.0 step-days | matches exactly |
| Samaa Sep 29d, Dec 14d | 29.0 and 14.0 | matches |
| Samaa Aug 38d, Oct 28d | 26.0 and 36.0 | differs — dates were revisited in the tool |

So the calculation model in the mock is right and reproducible; the figures have simply moved on. Acceptance MUST be written against the model, never against `444h`.

### Two facts that change the design

1. **41% of the plan has no assignee.** 391 of 960 step-days are unassigned. Only three people carry any load at all (Samaa 164d, Yosra 276d, Salma 129d). A capacity view that silently omits unassigned work will tell the team they are half as busy as they are. Unassigned load MUST be visible, not dropped.
2. **Not every step-day has a due date.** Samaa's months add to 134 of her 164 days; the other 30 sit on steps with no date and therefore no month. A month-by-month view MUST account for undated work rather than quietly losing it.

### What the mock asks for that the system cannot supply

Five elements of the mock have no source anywhere in the product today:

| Mock element | Status |
|---|---|
| **Consumed hours** ("102 · 5% of expected") | No time tracking exists. Nothing records hours worked. |
| **Milestones** ("10 ahead · 0 passed", "1 ms" per brand) | No milestone concept exists on projects or steps. |
| **Deliverables** ("105 steps · 10 posts") | Steps exist; "posts" presumably means pipeline tasks, but the link between a brand's tasks and its projects is not defined. |
| **Seniority** ("Video editor · Junior") | Members have a role, not a seniority level. |
| **Supervision overhead** ("incl. 16d supervision") | No rule exists that adds review time to a manager's load. |

Each is a separate feature, not a formatting detail. Scope is addressed in Q1 below.

---

## User Scenarios & Testing *(mandatory)*

### User Story 1 — See where the plan's work actually sits (Priority: P1)

As the marketing manager, when I open the Projects board I want a single panel that tells me how the Focus plan divides up: how many projects and planned days each brand carries, and how many planned days each person carries against the working days available to them, so I can see imbalance without opening 14 projects.

**Why this priority**: This is the whole request, and it needs no new data — every figure comes from step durations, due dates, assignees and brands that are already populated. It is the smallest slice that answers "who is overloaded and which brand is eating the plan".

**Independent Test**: Open the Projects board with the current plan. The panel reports 14 Focus projects, four brand rows with project counts of 3 / 2 / 8 / 1, and person rows totalling the same step-days as the plan itself. Change one step's duration and the affected brand row and person row both move by that amount.

**Acceptance Scenarios**:

1. **Given** the Focus plan of 14 projects, **When** an admin opens the Projects board, **Then** a workload panel shows total projects, total planned step-days, and the same total converted to hours.
2. **Given** projects grouped under four brands, **When** the panel renders, **Then** each brand shows its project count, its planned days and hours, and its share of the portfolio.
3. **Given** three people hold assigned steps, **When** the capacity section renders, **Then** each person shows planned days, the equivalent hours, the hours available to them in the period, and a utilisation percentage.
4. **Given** a person's planned hours exceed their available hours, **When** the row renders, **Then** the percentage is shown in the danger colour and the bar reads as over-full.
5. **Given** 391 step-days carry no assignee, **When** the capacity section renders, **Then** those days appear in their own clearly-labelled row rather than being omitted from the totals.

---

### User Story 2 — See one person's load month by month (Priority: P2)

As a team member (or as the manager looking at one person), I want to open a single person and see their total work, how much is still open, how much is overdue, and how their planned days fall across the coming months against the working days each month actually has.

**Why this priority**: Story 1 says *who* is overloaded; this says *when*, which is what makes it actionable. A person at 110% overall may be fine in November and impossible in August. It depends on nothing from Story 1 and can ship separately.

**Independent Test**: Open Samaa. Her card reports 164 planned days in total, the count still open, the count overdue with the oldest date, and a month list. Move one step from August to November and both months change accordingly.

**Acceptance Scenarios**:

1. **Given** a person with assigned steps, **When** their card is opened, **Then** it shows total steps, total planned days, days still open, and the equivalent hours.
2. **Given** a person has steps whose due date has passed and are not done, **When** the card renders, **Then** an overdue count and the oldest overdue date are shown in the danger colour.
3. **Given** a person's steps span several months, **When** the month list renders, **Then** each month shows planned days, the working days that month contains, and the resulting percentage, with over-capacity months visually distinct from under-capacity ones.
4. **Given** 30 of a person's planned days sit on steps with no due date, **When** the month list renders, **Then** those days are reported separately as undated rather than being silently excluded.
5. **Given** a person has no assigned steps, **When** their card is opened, **Then** an empty state explains that nothing in the plan is assigned to them.

---

### User Story 3 — Change the assumptions behind the numbers (Priority: P3)

As an admin, I want to control how a planned day converts into hours, and over what period capacity is measured, because "a step-day" is not the same as eight hours of one person's time and the honest number changes with that assumption.

**Why this priority**: The rollups are useful with a fixed default. Making the conversion adjustable turns the panel from a report into a planning instrument — but it is a refinement of Stories 1 and 2, not a prerequisite.

**Independent Test**: Change effort-per-step-day from 8h to 6h. Every hours figure and every utilisation percentage in the panel updates in proportion, and the header states the assumption in force.

**Acceptance Scenarios**:

1. **Given** the panel is showing hours, **When** an admin changes the hours-per-step-day setting, **Then** all hours and percentages recalculate and the header states the assumption being used.
2. **Given** a capacity period is in force, **When** the panel renders, **Then** the header names the period, the number of working days in it, and the hours per person per day used.
3. **Given** a non-admin views the panel, **When** it renders, **Then** the assumptions are shown but cannot be changed.

---

### Edge Cases

- **Unassigned work** (391 of 960 step-days today): must appear as its own row, never folded into a person or dropped.
- **Undated work**: steps with no due date have no month; they must be reported as undated in both the person card and any period total.
- **Projects with no brand** (7 today): must appear under an explicit "no brand" group, consistent with how the Projects board already handles them.
- **A person with no assignments**: shows an empty state, not a zero-filled card.
- **Completed steps**: done steps still count toward "planned" but must not count toward "still open" or "overdue".
- **A step due in the past that is done**: not overdue.
- **Aspiring vs Focus**: the mock counts 14, which is the Focus subset. The panel must state which subset it is measuring, and must not silently mix the two.
- **A month with zero working days available** (holiday period): percentage is undefined; show the days assigned without a misleading percentage.
- **More planned days than any calendar can hold** (Yosra at 276 days): the bar must clamp its width while the percentage still reports the true figure.
- **A brand with projects but no steps**: shows the project count with zero days, not a blank row.

---

## Requirements *(mandatory)*

### Functional Requirements

**Panel placement and scope**

- **FR-001**: The workload panel MUST be reachable from the Projects board.
- **FR-002**: The panel MUST state which subset of the plan it is measuring (Focus or Aspiring) and MUST follow the board's existing Focus/Aspiring selection rather than introducing a second, conflicting one.
- **FR-003**: The panel MUST be visible to admins. Visibility for non-admins is defined by FR-021.

**Portfolio totals**

- **FR-004**: The panel MUST show the number of projects in scope, split into active and completed.
- **FR-005**: The panel MUST show total planned step-days in scope and the equivalent hours, stating the conversion used (e.g. "426 step-days × 8h").
- **FR-006**: The panel MUST show the count of planned steps in scope.

**Brand rollup**

- **FR-007**: The panel MUST list every brand that has at least one project in scope, plus a group for projects with no brand.
- **FR-008**: Each brand row MUST show project count, planned days, planned hours, and the brand's share of the portfolio's planned days.
- **FR-009**: Each brand row MUST carry the brand's own colour, consistent with how brands are identified elsewhere in the product.
- **FR-010**: Brand rows MUST be ordered by planned days, heaviest first.

**Capacity rollup**

- **FR-011**: The panel MUST show a capacity section headed with the period being measured, the number of working days it contains, and the hours per person per day assumed.
- **FR-012**: Each capacity row MUST show planned days, planned hours, the hours available in the period, a proportional bar, and a utilisation percentage.
- **FR-013**: Rows at or above 100% utilisation MUST be visually distinguished from rows below it, using the established danger colour.
- **FR-014**: Planned step-days with no assignee MUST be shown as a distinct row labelled as unassigned, and MUST be included in portfolio totals.
- **FR-015**: A bar MUST clamp its rendered width at 100% while the percentage continues to report the true value.

**Per-person card**

- **FR-016**: Selecting a person MUST show a card giving their name, their role, their total assigned steps, their total planned days, the days still open, and the equivalent hours.
- **FR-017**: The card MUST show the count of overdue steps — not done, due date in the past — and the oldest such date, in the danger colour. Zero overdue MUST read as a calm state, not a red zero.
- **FR-018**: The card MUST show a month-by-month list covering the months in which that person has dated steps, each with planned days, the working days that month contains, and the percentage.
- **FR-019**: Planned days on steps with no due date MUST be reported separately as undated and MUST NOT be assigned to an arbitrary month.
- **FR-020**: A person with no assigned steps MUST show an explanatory empty state.

**Permissions**

- **FR-021**: A non-admin MUST be able to see their own workload card. Whether they can see other people's cards, the brand rollup, or the whole-team capacity section is [NEEDS CLARIFICATION: see Q3 — this determines whether the panel is an admin-only planning view or a team-wide transparency view].
- **FR-022**: Changing the calculation assumptions (FR-023) MUST be restricted to admins; every other viewer sees the assumptions as read-only text.

**Assumptions and settings**

- **FR-023**: The hours-per-step-day conversion MUST be adjustable by an admin and MUST persist for all viewers.
- **FR-024**: The capacity period MUST be derived from a stated start and end, and the panel MUST show how many working days that period contains.
- **FR-025**: Working days MUST exclude weekends. Public holidays are out of scope for this feature.

**Honesty of the numbers**

- **FR-026**: Where a figure is derived from an assumption rather than recorded fact, the panel MUST state the assumption alongside the figure.
- **FR-027**: The panel MUST NOT display any metric it cannot derive from real data. Milestones, consumed hours, deliverable/post counts, seniority and supervision overhead are excluded from this feature per Q1.

### Key Entities

- **Project**: a planned piece of work belonging to a brand, flagged Focus or not, with a due date. Already exists.
- **Project step**: a unit of a project carrying a duration in days, an optional due date, an optional assignee and a done flag. Already exists. This is the atom of every figure in this feature.
- **Member**: a person, with a role and a weekly capacity in hours. Already exists.
- **Brand**: already exists, with a name and colour.
- **Workload assumption**: the hours-per-step-day conversion and the capacity period. New, and the only new persisted data this feature requires.

---

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A manager can identify the most overloaded person and the heaviest brand within 10 seconds of opening the Projects board, without opening a single project.
- **SC-002**: Every planned step-day in scope is accounted for in the capacity section — assigned to a person or shown as unassigned — with no discrepancy between the portfolio total and the sum of the rows.
- **SC-003**: Every planned day of a person's work appears in the month list or in the undated total, with no discrepancy between the two views of the same person.
- **SC-004**: Editing a step's duration, due date or assignee is reflected in the rollups on the next view, with no manual refresh of any cached figure.
- **SC-005**: Utilisation above 100% is distinguishable from utilisation below it at a glance, without reading the number.
- **SC-006**: The panel reports correct totals when 40% or more of the plan is unassigned — the condition of the plan today.
- **SC-007**: Every displayed metric traces to real stored data; a reviewer can point at any number and name the records it came from.

---

## Assumptions

- **Focus is the default scope.** The mock's "14 projects" is exactly the count of Focus projects, so the panel follows the board's Focus/Aspiring toggle and defaults to Focus.
- **A step-day is a person-day.** One step of `duration_days: 2` means two days of one person's time. Nothing in the data supports splitting a step across people.
- **Default conversion is 8 hours per step-day**, matching the capacity header in the reference ("8h per person per day"). The mock's separate 6h "effort per step-day" control is the adjustable version of the same number, per FR-023.
- **Capacity is measured per person**, using each member's own recorded weekly capacity rather than a flat 40 hours, since the data already varies per member. Role-level grouping as shown in the mock is addressed in Q2.
- **Working days exclude weekends only.** No holiday calendar exists in the product.
- **The reference screenshots' figures are historical.** They are a design reference for layout and calculation model, not an expected-output fixture.
- **Existing design tokens govern the visuals.** The panel reuses the Projects board's established palette and card conventions rather than introducing the mock's raw colours.
- **No time tracking is introduced.** "Hours" throughout means planned hours derived from step-days, never hours worked.

---

## Out of Scope

- Time tracking and any "consumed hours" figure.
- Milestones as a first-class concept.
- Deliverable and "post" counts that join projects to pipeline tasks.
- Seniority levels and any seniority-based effort multiplier.
- Supervision overhead automatically added to a manager's load.
- Public-holiday calendars.
- Reassigning work from inside the workload panel — the panel reports; editing stays where it already lives.
- Export to spreadsheet or PDF.

---

## Open Questions

Three decisions materially change what gets built. Each is presented with options in the accompanying request to the user.

- **Q1 — Scope**: build only what current data supports, or introduce the missing concepts (milestones, time tracking, deliverables, seniority)?
- **Q2 — Capacity grouping**: group capacity rows by person, or by role as the mock shows?
- **Q3 — Placement and permissions**: where the panel sits on the Projects board, and who may see whose numbers.
