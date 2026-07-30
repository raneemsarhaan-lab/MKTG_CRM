# Data Model: Personal Board — GenZ Redesign

**Feature**: `specs/001-personal-board-genz`
**Date**: 2026-07-15

All entities are **read-only** from the component's perspective. No new
persisted fields are introduced. All derived values are computed in `useMemo`.

---

## Source Entities (from Zustand store)

### Task *(src/types.ts)*

| Field       | Type        | Used by component for                   |
|-------------|-------------|------------------------------------------|
| `id`        | `number`    | Key prop; passed to `selectTask()`       |
| `name`      | `string`    | Display in task row                      |
| `assignee`  | `string`    | Filter: current user's tasks             |
| `status`    | `StageId`   | Stage colour dot; panel filter           |
| `due`       | `string`    | Panel assignment (My Day / Up Next)      |
| `stageDate` | `string`    | AlertStatus computation                  |
| `ctype`     | `ContentType` | Emoji icon in task row                 |
| `hours`     | `number`    | Weekly capacity bar calculation          |

### Member *(src/types.ts)*

| Field      | Type           | Used by component for              |
|------------|----------------|------------------------------------|
| `name`     | `string`       | Display; task-count filter         |
| `role`     | `string`       | Profile strip & team digest        |
| `access`   | `AccessLevel`  | Admin gate for capacity edit       |
| `color`    | `string`       | Accent colour in member card       |
| `bg`       | `string`       | Avatar background colour           |
| `capacity` | `number`       | Capacity bar denominator (hrs/wk)  |
| `status`   | `'Available' \| 'Busy'` | Status dot in team digest |

### SLAConfig *(src/types.ts)*

```ts
{ [stageId: string]: number }   // max business days in stage
```

Used only in `getAlertStatus()` to compute breach thresholds.

---

## Derived Types (component-local, never stored)

### AlertStatus

```ts
type AlertStatus =
  | 'On Track'
  | 'At Risk'
  | 'Will Miss'
  | 'Stuck'
  | 'Idle'
  | 'Overdue'
```

**Computation rule** (see research.md Decision 1):

```
stageDays         = businessDaysBetween(task.stageDate, today)
slaLimit          = slaConfig[task.status] ?? 3
calDaysRemaining  = calDaysBetween(today, task.due)

"Overdue"   → calDaysRemaining < 0
"Stuck"     → stageDays > slaLimit + 2
"Will Miss" → stageDays > slaLimit
"At Risk"   → stageDays === slaLimit
"Idle"      → calDaysBetween(stageDate, today) > 2 && stageDays === 0
"On Track"  → (default)
```

**Badge styles** (Constitution Article I token-mapped):

| Value      | bg          | text       | Icon          |
|------------|-------------|------------|---------------|
| On Track   | `#EDF6C6`   | `#4B7A12`  | CheckCircle2  |
| At Risk    | `#F7EFD3`   | `#A9791F`  | AlertTriangle |
| Will Miss  | `#F7E6D8`   | `#BF5A2A`  | AlertTriangle |
| Stuck      | `#F8E7E5`   | `#C0453E`  | Ban           |
| Idle       | `#F1ECDD`   | `#7E6A3D`  | Timer         |
| Overdue    | `#F8E7E5`   | `#C0453E`  | AlertTriangle |

### BigStatMetric

```ts
interface BigStatMetric {
  label:      string
  value:      number | string
  sub:        string
  theme:      'danger' | 'accent' | 'lime' | 'default'
  icon:       string   // emoji
}
```

Four instances computed in `useMemo` from store data (see research.md
Decision 2).

### PanelTask

```ts
interface PanelTask {
  task:        Task
  alertStatus: AlertStatus
}
```

Assembled in `useMemo`; sorted ascending by `task.due`.

---

## State Transitions

The component reads task `status` (a `StageId`) for display only. It does not
write `status`. The only write action is `selectTask(id)` which opens the
existing `TaskModal`.

```
User clicks task row
  → store.selectTask(task.id)
  → TaskModal opens (managed by App.tsx)
  → user may advance stage inside TaskModal
  → store updates task.status + stageDate
  → PersonalBoard re-renders via Zustand subscription
```

---

## No new Zustand keys, no schema migrations, no API calls.
