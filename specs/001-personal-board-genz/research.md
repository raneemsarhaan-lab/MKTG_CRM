# Research: Personal Board — GenZ Redesign

**Feature**: `specs/001-personal-board-genz`
**Date**: 2026-07-15

## Decision 1: Alert Status Computation Strategy

**Decision**: Compute `AlertStatus` as a pure derived value in a `useMemo`
block inside the component; never store on the task record.

**Rationale**: The spec (FR-008) and Constitution Article II both require
real-time SLA breach detection without mutation. A `useMemo` keyed on `tasks`
and `slaConfig` recomputes only when data changes, keeping the logic fast
(< 1ms per task) and eliminating stale-state bugs.

**Alternatives considered**:
- Storing `alertStatus` on `Task` in Zustand — rejected: violates
  Constitution VI (only canonical fields persist) and creates stale data risk.
- Computing inside each `TaskRow` render — rejected: duplicates logic and
  makes memoisation harder.

**Algorithm**:
```
function getAlertStatus(task, slaConfig, today):
  stageDays = businessDaysBetween(task.stageDate, today)
  slaLimit  = slaConfig[task.status] ?? 3
  calDaysToDeadline = calDaysBetween(today, task.due)

  if calDaysToDeadline < 0            → "Overdue"
  if stageDays > slaLimit + 2         → "Stuck"
  if stageDays > slaLimit             → "Will Miss"
  if stageDays == slaLimit            → "At Risk"
  if calDaysBetween(task.stageDate, today) > 2 and stageDays == 0
                                      → "Idle"
  else                                → "On Track"
```

---

## Decision 2: BigStat Card Theme Mapping

**Decision**: Four stat cards with fixed theme assignments:

| Card | Metric | Theme | Gradient |
|------|--------|-------|----------|
| Overdue | Count of assigned overdue tasks | danger | `linear-gradient(145deg,#FFF0F2,#FFDDE3)` accent `#F5334F` |
| In Progress | Count of active (non-published) tasks | accent | `linear-gradient(145deg,#EFE9FF,#DCD0FF)` accent `#6D4FD0` |
| Published this week | Count published in last 7 days | lime | `linear-gradient(145deg,#F4FFD2,#E5FF91)` accent `#17181A` |
| Capacity used | `floor((hoursLogged / capacity) * 100)%` | default | `linear-gradient(145deg,#FFF8DF,#FFEAB0)` accent `#17181A` |

**Rationale**: Matches the design file exactly; the four themes are defined in
the design's `themes` object and align with Constitution Article I tokens
(`coral`, `violet`, `lime`).

**Alternatives considered**: Dynamic theme based on alert count — rejected,
overcomplicates and deviates from design.

---

## Decision 3: Hours-Logged Calculation

**Decision**: "Weekly capacity used" = sum of `task.hours` for all
non-published tasks assigned to `currentUser` whose `stageDate` falls within
the current ISO week (Monday–Sunday).

**Rationale**: `task.hours` is the only time estimate stored on each task
(see `src/types.ts`). There is no time-tracker yet (Constitution Tech Stack).
The spec assumption document records this explicitly.

**Alternatives considered**:
- Counting all active tasks regardless of week → inflates the number.
- Future integration with a real time tracker → out of scope for this spec.

---

## Decision 4: "My Day" vs "Up Next" Filtering

**Decision**:
- **My Day**: `task.assignee === currentUser.name && (isToday(due) || isPast(due)) && status !== 'publish'`
- **Up Next**: `task.assignee === currentUser.name && isFuture(due) && isWithinNextNDays(due, 7) && status !== 'publish'`

Both panels sort ascending by `task.due`.

**Rationale**: Matches spec FR-005 and FR-006 exactly. Uses existing
`date-fns` functions (`isToday`, `isPast`, `isFuture`, `differenceInDays`)
already imported in the current file.

---

## Decision 5: Team Digest Active Task Count

**Decision**: Active task count per member = tasks where `assignee === member.name && status !== 'publish'`.

**Rationale**: Simple, deterministic, uses existing store data. Matches what
the design shows (a small number badge next to each member).

---

## Decision 6: Greeting Time Logic

**Decision**: Use `new Date().getHours()` at render time:
- 05–11 → "Good morning"
- 12–17 → "Good afternoon"
- 18–04 → "Good evening"

Display first name only: `currentUser.name.split(' ')[0]`.

**Rationale**: Lightweight, no library needed, matches design's greeting
headline pattern.

---

## No NEEDS CLARIFICATION items remain.
