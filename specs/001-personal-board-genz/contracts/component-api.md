# Component API Contract: PersonalBoard

**Feature**: `specs/001-personal-board-genz`
**Date**: 2026-07-15

This is a UI component contract (React). It documents the public surface of
`PersonalBoard` — its props, store dependencies, side effects, and rendering
guarantees.

---

## Component Signature

```tsx
export function PersonalBoard(): JSX.Element
```

**Props**: None. All data sourced from Zustand store via `useStore()`.

---

## Store Dependencies (read)

| Store key      | Type            | Purpose                          |
|----------------|-----------------|----------------------------------|
| `currentUser`  | `Member \| null` | Greeting, filtering, RBAC gate   |
| `tasks`        | `Task[]`        | Panel population, BigStat counts |
| `members`      | `Member[]`      | Team digest                      |
| `slaConfig`    | `SLAConfig`     | AlertStatus computation          |

## Store Actions (write)

| Action       | Signature                  | Triggered by             |
|--------------|----------------------------|--------------------------|
| `selectTask` | `(id: number) => void`     | Click on any task row    |
| `updateMember` | `(name, patch) => void`  | Admin edits capacity     |

---

## Rendering Guarantees

1. **No loading spinner**: component renders synchronously from store data.
   If `currentUser` is null, it renders nothing (guarded by `AppShell`).
2. **Scroll container**: the component is wrapped in a vertically-scrollable
   container; it does NOT control the outer overflow.
3. **No side effects at mount**: no `useEffect` data fetching; no timers;
   no subscriptions beyond Zustand.
4. **Deterministic output**: given the same store state, the same JSX is
   produced. AlertStatus depends only on store data and the current date
   (passed in as `new Date()` — not mocked at this layer).

---

## Sub-component Inventory

These are internal helpers co-located in `PersonalBoard.tsx`. They are NOT
exported.

| Name             | Responsibility                                      |
|------------------|-----------------------------------------------------|
| `BigStat`        | Gradient stat card; value + label + themed bg       |
| `CapacityBar`    | Dark card with lime→violet fill bar                 |
| `TaskRow`        | Single task line in a panel (dot, emoji, name, badge, date) |
| `TaskPanel`      | "My Day" or "Up Next" panel with header + task list |
| `ProfileStrip`   | Name, role, access badge for current user           |
| `MemberCard`     | Team digest row (avatar, name, status, task count, capacity) |
| `getAlertStatus` | Pure function → AlertStatus (see data-model.md)     |
| `greeting`       | Pure function → "Good morning/afternoon/evening"    |

---

## Visual Layout Contract

```
┌─────────────────────────────────────────────────────┐
│  Greeting + date                                    │
│  ProfileStrip                                       │
├─────────┬─────────┬─────────┬─────────┐            │
│BigStat  │BigStat  │BigStat  │BigStat  │            │
│(danger) │(accent) │(lime)   │(default)│            │
└─────────┴─────────┴─────────┴─────────┘            │
│  CapacityBar (dark, full-width)                     │
├─────────────────────┬───────────────────────────────┤
│  TaskPanel          │  TaskPanel                    │
│  "My Day"           │  "Up Next"                    │
│  (due today/past)   │  (next 7 days)                │
└─────────────────────┴───────────────────────────────┘
│  Team Digest (MemberCard × N)                       │
└─────────────────────────────────────────────────────┘
```

The two task panels sit side-by-side on desktop; stack on narrow viewports
(below ~640 px or when parent container is narrow).

---

## AlertStatus Badge Contract

Each `TaskRow` renders exactly one badge derived from `getAlertStatus()`.

| Scenario                            | Badge shown    |
|-------------------------------------|----------------|
| `calDaysRemaining < 0`              | Overdue (red)  |
| `stageDays > slaLimit + 2`          | Stuck (red)    |
| `stageDays > slaLimit`              | Will Miss (orange) |
| `stageDays === slaLimit`            | At Risk (amber)|
| `stageAge > 2d` and `stageDays = 0` | Idle (tan)     |
| (default)                           | On Track (green) |

Badge is never absent; every task row shows exactly one badge.

---

## Admin Gate Contract

Capacity edit fields in `MemberCard` MUST satisfy:

```
IF currentUser.access === 'admin'
  THEN render <input type="number"> with onChange → updateMember(name, { capacity })
ELSE
  render <span>{member.capacity} hrs/wk</span>
```

This check is performed inline in `MemberCard`; no HOC or context is needed.
