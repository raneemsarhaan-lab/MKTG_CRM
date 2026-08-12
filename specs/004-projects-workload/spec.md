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

### What the mock asks for beyond the plain rollups

| Mock element | Status |
|---|---|
| **Consumed hours** ("102 · 5% of expected") and the per-brand **% column** | **Derivable — no new data.** Proven against live data: see below. |
| **Milestones** ("10 ahead · 0 passed", "1 ms" per brand) | **In scope, needs one new flag.** Marker steps already exist by convention; the flag makes them explicit — see below. |
| **Deliverables** ("105 steps · 10 posts") | **Dropped by decision** (2026-08-12 clarification). Derivable, but not built — see Out of Scope. |
| **Seniority** ("Video editor · Junior") | **In scope, changes the maths.** Needs a level on a member and a configurable multiplier — see below. |
| **Supervision overhead** ("incl. 16d supervision") | **In scope, changes the maths.** Needs a rule that gives a supervisor hours for work they review — see below. |

#### Consumed hours is not tracked time

The mock was initially read as requiring time tracking, which does not exist in this product. It does not. Computing **done step-days** against the live plan reproduces the mock exactly:

| Brand | done-days / total-days | Mock's % |
|---|---|---|
| Forefront | 0.0 / 94.0 = **0%** | 0% |
| Islam Personal Branding | 0.0 / 84.0 = **0%** | 0% |
| The Strategy Community | 0.0 / 224.0 = **0%** | 0% |
| Omnisight | 17.0 / 24.0 = **71%** | 71% |

All four match. And `17.0 done-days × 6h = 102h` — the mock's CONSUMED HOURS to the unit — with `17 / 366 ≈ 5%`, its exact caption. Four independent exact matches; this is the definition, not a coincidence.

"Consumed" therefore means *plan progress valued in hours*, and it moves when someone ticks a step. It is in scope.

#### Milestones exist, but only as a naming convention

The plan already contains milestone steps — `GO LIVE (15 Aug is a Saturday)`, `LAUNCH`, `ENROLMENT OPENS`, `CAMPAIGN CLOSES (30 Oct is a Friday)`, `SERIES RUNS 1–30 NOV`, `DELIVERED — fuels September marketing`. Nothing distinguishes them but capital letters: detecting them by name finds 7 where the mock counts 10, and duration is no help since they are all 1 day rather than 0.

So milestones are real, and inference is not good enough to build on. One boolean makes them explicit, seeded from the existing marker names so the plan arrives already flagged.

#### Plan days and effort days are now two different things

Seniority and supervision are the first figures on this panel that are **not** a direct sum of the plan:

- A junior takes longer over the same step, so their *effort* exceeds the step's planned duration.
- A supervisor spends time on work that was never assigned to them, so their *effort* exists with no step behind it at all.

Until this decision, every number reconciled to the plan: the capacity rows added up to the portfolio total, and that property was the panel's main defence against being quietly wrong. Multipliers and overhead break it — and a panel where the rows no longer sum to the total, with no explanation, is exactly the kind of dashboard people stop trusting.

The resolution is to carry both figures rather than replace one with the other:

| Figure | Meaning | Reconciles to the plan? |
|---|---|---|
| **Plan days** | The step durations as planned | **Yes** — always. Rows + unassigned = portfolio total. |
| **Effort days** | Plan days × seniority multiplier, plus supervision overhead | No, and is not meant to. This is the load estimate. |

Utilisation is measured on **effort** days, because that is the honest answer to "can this person absorb this". Reconciliation is checked on **plan** days, because that is what the plan actually says. Every adjusted figure must be able to show its unadjusted origin, so an admin can always see how much of a person's load is the plan and how much is an assumption the workspace configured.

---

## Clarifications

### Session 2026-08-12

- Q: Where do "consumed hours" and the per-brand % column come from, given no time tracking exists? → A: **Option A** — consumed hours = done step-days × hours-per-step-day; the brand % column = done-days ÷ total-days. Purely derived from the `done` flag already on every step. No schema change, no time tracking, and the figure moves when someone ticks a step.
- Q: What counts as a "deliverable", and what is a "post" in "105 steps · 10 posts"? → A: **Option D — drop it.** The deliverables tile is not built. A workable derivation existed (every step in scope, split by whether it has reached the pipeline board via `ProjectStep.task_id`), but the count answers no question the manager asked: the steps figure is already shown, and the split adds a number without a decision attached to it.
- Q: Should seniority and supervision overhead change the capacity maths, or are they labels? → A: **Option C** — both change the maths. A member carries a seniority level that scales the effort their assigned work costs, and a supervisor's row carries overhead hours for work they review but were never assigned. This introduces the first figures on the panel that are not a direct sum of the plan, which is why the panel must now separate **plan days** from **effort days** — see below.
- Q: What makes a step a milestone, given the plan only marks them by naming convention? → A: **Option A** — an explicit `milestone` flag on the step, toggled in the Projects tab. The plan import seeds it from the marker names already present (`GO LIVE`, `LAUNCH`, `ENROLMENT OPENS`, `CAMPAIGN CLOSES`, `DELIVERED …`) so nothing is lost on day one, but from then on it is explicit rather than inferred from capitalisation.

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
- **FR-006a**: The panel MUST show **consumed hours**, computed as `done step-days × hours-per-step-day`, together with that figure as a percentage of expected hours and a proportional bar. "Consumed" means plan progress valued in hours; it MUST NOT be described or labelled as time worked, because no hours-worked data exists.
- **FR-006b**: Consumed hours and every completion percentage MUST move as soon as a step's `done` flag changes, with no separate entry step.
- **FR-006c**: The panel MUST show a **milestones** total for the scope, split into those still ahead (due date today or later, or undated) and those already passed (due date before today).

**Milestones**

- **FR-028**: A step MUST carry an explicit milestone flag, defaulting to off.
- **FR-029**: An admin MUST be able to turn a step's milestone flag on or off from the Projects tab, alongside the step's other fields.
- **FR-030**: The plan import MUST seed the flag for steps whose names follow the existing marker convention, and MUST NOT overwrite the flag on any step that already exists — the plan is edited in the app, and an import that reverted that would be worse than no import.
- **FR-031**: Each brand row MUST show that brand's milestone count.
- **FR-032**: A milestone step MUST still count as ordinary planned work in every days, hours and capacity figure. Flagging a step marks its significance; it does not remove it from the plan.

**Brand rollup**

- **FR-007**: The panel MUST list every brand that has at least one project in scope, plus a group for projects with no brand.
- **FR-008**: Each brand row MUST show project count, planned days, planned hours, and a completion percentage computed as **done step-days ÷ total step-days** for that brand, with a proportional bar.
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

**Seniority**

- **FR-033**: A member MUST carry a seniority level — junior, mid or senior — defaulting to mid, editable by an admin in Team settings.
- **FR-034**: Each level MUST carry an effort multiplier configurable by an admin. Mid is fixed at 1.0 and is the reference; junior and senior default to 1.25 and 0.85 respectively. Multipliers MUST be shown wherever they are applied, never buried in a settings page.
- **FR-035**: A member's effort days MUST equal their plan days × their level's multiplier. Their plan days MUST remain visible alongside.
- **FR-036**: Seniority MUST NOT alter brand rollups, portfolio totals or milestone counts. It describes how long a person takes, not how much work the plan contains.
- **FR-037**: A member's seniority MUST appear on their capacity row and on their person card, so an adjusted number is never shown without its cause.

**Supervision overhead**

- **FR-038**: A supervisor's row MUST include overhead days for work they review but were not assigned, added on top of their own plan days.
- **FR-039**: The overhead MUST be shown as a distinct component of that row — "112d incl. 16d supervision" — and never silently folded into the total.
- **FR-040**: Supervision overhead MUST be derived from a stated, configurable rule rather than a hardcoded constant, and the rule in force MUST be visible from the panel.
- **FR-041**: Supervision overhead MUST NOT be counted twice: the reviewed work stays with the person it is assigned to, and the supervisor's overhead is additional effort, not a transfer.
- **FR-042**: A workspace with no supervision configured MUST show no overhead anywhere, rather than a zero component on every row.

**Reconciliation of adjusted figures**

- **FR-043**: The panel MUST carry plan days and effort days as separate figures. Utilisation MUST be computed on effort days; reconciliation to the portfolio total MUST hold on plan days.
- **FR-044**: Where a row's effort differs from its plan days, the panel MUST make the difference inspectable — a viewer must be able to see how much of the number is the plan and how much is a configured assumption.

**Permissions**

- **FR-021**: The workload panel — portfolio totals, brand rollup and whole-team capacity — MUST be admin-only, consistent with the existing Capacity view. A non-admin MUST NOT see other people's utilisation. Their own workload card remains available to them on the team board.
- **FR-022**: Changing the calculation assumptions (FR-023) MUST be restricted to admins; every other viewer sees the assumptions as read-only text.

**Assumptions and settings**

- **FR-023**: The hours-per-step-day conversion MUST be adjustable by an admin and MUST persist for all viewers.
- **FR-024**: The capacity period MUST be derived from a stated start and end, and the panel MUST show how many working days that period contains.
- **FR-025**: Working days MUST exclude weekends. Public holidays are out of scope for this feature.

**Honesty of the numbers**

- **FR-026**: Where a figure is derived from an assumption rather than recorded fact, the panel MUST state the assumption alongside the figure.
- **FR-027**: Every figure on the panel MUST be either derived from stored data or the visible result of a configured assumption — never a hardcoded guess presented as a measurement. Consumed hours and completion percentages are derived (FR-006a, FR-008); milestones are explicit (FR-028); seniority and supervision are configured assumptions and MUST be labelled as such wherever they change a number (FR-034, FR-040, FR-044). Deliverable/post counts are dropped by decision.

### Key Entities

- **Project**: a planned piece of work belonging to a brand, flagged Focus or not, with a due date. Already exists.
- **Project step**: a unit of a project carrying a duration in days, an optional due date, an optional assignee and a done flag. Already exists. This is the atom of every figure in this feature. **Gains one field**: a milestone flag, defaulting to off (FR-028).
- **Member**: a person, with a role and a weekly capacity in hours. Already exists. **Gains one field**: a seniority level, defaulting to mid (FR-033).
- **Brand**: already exists, with a name and colour.
- **Workload assumption**: the hours-per-step-day conversion, the capacity period, the seniority multipliers and the supervision rule. New. Together with the step milestone flag and the member seniority level, this is the whole of the new persisted data this feature requires.

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

- **Time tracking** — capturing hours actually worked. The "consumed hours" tile is in scope (FR-006a) but is derived from completed step-days, not from tracked time.
- **Milestone dependencies, ordering or gating** — a milestone is a marked step, not a phase boundary that blocks anything.
- **The deliverables tile and its "steps · posts" split.** Dropped deliberately, not for want of a data source: the step count is already on the panel, and splitting it by whether a step has reached the board adds a figure with no decision attached to it. `ProjectStep.task_id` remains available if it is ever wanted.
- Public-holiday calendars.
- Reassigning work from inside the workload panel — the panel reports; editing stays where it already lives.
- Export to spreadsheet or PDF.

---

## Decisions Taken

Three decisions materially change what gets built. Each was put to the user with options; none is irreversible, and each is recorded here so it can be overturned deliberately rather than drifted away from.

- **D1 — Scope: build only what the data supports.** Projects, planned days, hours, brand rollup, per-person capacity, **and — revised by the 2026-08-12 clarifications — consumed hours, completion percentages and milestones**. The first two turned out to be derivable from the `done` flag rather than requiring time tracking; milestones already exist in the plan as a naming convention and need only one boolean to become explicit. Deliverables were dropped by choice rather than for lack of data. **Seniority and supervision overhead were later brought in** by the same clarification session and are the panel's only configured assumptions, which is why they must always show their workings (FR-043, FR-044). *Rationale*: shipping what is traceable gives the manager the answer they asked for — who is overloaded, which brand is heaviest, how far along each one is — with every figure pointing at a record.
- **D2 — Capacity rows: one per person, plus an Unassigned row.** *Rationale*: the plan assigns to three named people, and each member already carries their own recorded weekly capacity. Grouping by role would produce the same rows with different labels today, while hiding which person inside a role is drowning. The Unassigned row is not optional — it carries 41% of the plan.
- **D3 — Placement: a new "Workload" tab on the Projects board, admin-only.** *Rationale*: existing tabs stay untouched, and utilisation figures sit with management exactly as the Capacity view already does. A person's own card stays available to them on the team board.

**To overturn any of these**, say so and the spec is revised before planning proceeds — the three alternatives are preserved in the conversation that produced this spec.
