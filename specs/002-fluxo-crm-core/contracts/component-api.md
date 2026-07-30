# Component API Contract: Fluxo CRM Core

**Feature**: `specs/002-fluxo-crm-core`
**Date**: 2026-07-15

This contract documents the public surface of the four primary views and their sub-components.

---

## AppShell (`components/shared/AppShell.tsx`)

```tsx
interface AppShellProps {
  member: Member          // resolved server-side, passed as prop
  children: React.ReactNode
}
export function AppShell({ member, children }: AppShellProps): JSX.Element
```

**Renders**:
- Left sidebar with nav icons: Overview, Board, Capacity (admin only), Settings (admin only)
- Brand filter strip (All + per-brand chips); active brand stored in URL search params or Zustand
- User avatar (bottom of sidebar); click → ProfileMenu popover
- `{children}` in the main content area

**Admin gate for sidebar items**: `member.access === 'admin'` → show Capacity and Settings nav icons.

---

## PersonalBoard (`components/overview/PersonalBoard.tsx`)

```tsx
export function PersonalBoard(): JSX.Element
```

**Props**: None. Receives data via Zustand or parent server component props injected into context.

**Preferred pattern**: Parent server component fetches tasks + member via Supabase, serializes to client via a provider or passes as RSC props; PersonalBoard reads from a typed context.

**Sub-components** (not exported):

| Component | Responsibility |
|---|---|
| `ProfileStrip` | Current user name, role, access badge |
| `BigStat` | Gradient stat card: value, label, themed bg |
| `CapacityBar` | Dark card with lime→violet fill bar |
| `TaskPanel` | "My Day" / "Up Next" panel with header + list |
| `TaskRow` | Single task row: emoji, name, AlertStatus badge, due date |
| `MemberCard` | Team digest: avatar, name, role, status dot, task count, capacity field |

**Layout contract**:

```
┌─────────────────────────────────────────────────────┐
│  Greeting + date                                    │
│  ProfileStrip                                       │
├─────────┬─────────┬─────────┬─────────┐            │
│BigStat  │BigStat  │BigStat  │BigStat  │            │
│(danger) │(accent) │(lime)   │(default)│            │
└─────────┴─────────┴─────────┴─────────┘            │
│  CapacityBar (dark card, full-width)                │
├─────────────────────┬───────────────────────────────┤
│  TaskPanel (My Day) │  TaskPanel (Up Next)          │
└─────────────────────┴───────────────────────────────┘
│  Team Digest (MemberCard × N)                       │
└─────────────────────────────────────────────────────┘
```

**Admin gate for capacity field in MemberCard**:

```
IF member.access === 'admin'
  THEN render <input type="number"> → calls updateMember Server Action
ELSE
  render <span>{member.capacity_hrs_wk} hrs/wk</span>
```

**TaskRow click**: calls `useUIStore.getState().selectTask(task.id)` → opens TaskModal.

---

## KanbanBoard (`components/kanban/KanbanBoard.tsx`)

```tsx
'use client'
export function KanbanBoard(): JSX.Element
```

**Props**: None (data injected from parent server component context).

**Responsibilities**:
- Renders 9 `KanbanColumn` components (one per stage)
- Wraps in `DndContext` from `@dnd-kit/core` for within-column card reordering
- Subscribes to Supabase Realtime for task changes
- Subscribes to `celebration-{memberId}` channel; on `celebrate` event → sets `useUIStore.celebration`
- Renders `StatStrip` above columns

**Sub-components**:

| Component | Responsibility |
|---|---|
| `StatStrip` | Total tasks / in-progress / due today summary bar |
| `KanbanColumn` | Column header (stage color gradient) + SortableContext for cards |
| `TaskCard` | Draggable card (see below) |
| `TaskModal` | Detail sheet (see below) |

**Column header style**: `background: linear-gradient(135deg, {stageColor}33, {stageColor}11)`, border-left 3px solid `{stageColor}`.

---

## TaskCard (`components/kanban/TaskCard.tsx`)

```tsx
interface TaskCardProps {
  task: Task & { brand: Brand; task_owner: Member }
  currentStageOwner: Member | null  // derived from stage.owner_role → member lookup
}
```

**Renders**:
- Cover image OR brand gradient fallback
- Brand monogram badge (top-left, colored dot + 2-letter initials)
- Content type chip + channel/platform icon
- Task name
- Task owner avatar + current stage owner avatar
- Due-date countdown (`${n} days left` or `Overdue`)
- AlertStatus badge

**Drag behavior**: Reorders within column only (see research.md Decision 5). Stage change only via TaskModal advance button.

---

## TaskModal (`components/kanban/TaskModal.tsx`)

```tsx
'use client'
interface TaskModalProps {
  task: Task & { brand: Brand; task_owner: Member; comments: (TaskComment & { author: Member })[]; attachments: TaskAttachment[] }
  currentUser: Member
  stages: Stage[]
  onClose: () => void
}
```

**Renders**:
- Cover image (or gradient) header
- All task attributes: name, brand, content type, platform, campaign, owner, due date, hours, priority
- Current stage chip with EN+AR label
- "Advance to [next stage]" button — shown only if `canAdvance` is true
  - `canAdvance` = `nextStageId(task.status, task.nine_stage) !== null AND (user is stage owner OR user is admin/superuser)`
  - Visual distinction: celebration-eligible advance (own stage) → lime button; admin override → ink button
- Comment list (chronological) + comment input
- Attachment list

**Advance button click**: calls `moveTask(task.id)` Server Action → if `shouldCelebrate` → sets `useUIStore.celebration`.

**Cannot-advance state**: When `task.status === 'publish'` or user doesn't own the stage, the advance section is hidden entirely (no disabled button).

---

## CelebrationOverlay (`components/shared/CelebrationOverlay.tsx`)

```tsx
'use client'
export function CelebrationOverlay(): JSX.Element | null
```

**Renders when**: `useUIStore(s => s.celebration) !== null`

**Renders**: Full-screen overlay (z-index: 9999), dark translucent backdrop, centered panel with:
- Task name + stage label (EN)
- Subheader in Arabic (e.g., `رائع! انتقل إلى المرحلة التالية 🎉`)
- Four reaction buttons:

| Button | Arabic | Triggered effect |
|---|---|---|
| زغروطة | zaghrota | Rapid oscillation audio + spiral confetti |
| تسقيف | tasqeef | Rhythmic pulse audio + clapping confetti |
| انا مبهور بيا | mabhour | Ascending chord + star confetti |
| طبلة | tabla | Percussion burst + drop confetti |

- Dismiss button (×) — closes overlay, no reaction fires

**Dismiss**: `useUIStore.getState().setCelebration(null)`

---

## CapacityDashboard (`components/capacity/CapacityDashboard.tsx`)

```tsx
interface CapacityDashboardProps {
  members: Member[]
  tasks: Task[]
}
export function CapacityDashboard({ members, tasks }: CapacityDashboardProps): JSX.Element
```

**Admin gate**: enforced in `app/(app)/capacity/page.tsx` (server). Component assumes caller is admin.

**Per-member card**:
- Avatar + name + role + status dot
- Active task count (tasks where `status !== 'publish'`)
- Hours assigned this week (sum of `hours_estimate` for active tasks)
- Capacity limit (`member.capacity_hrs_wk`)
- Fill bar: `(hoursThisWeek / capacity_hrs_wk) * 100%`
  - ≤ 100%: lime fill (`#C8F24E`)
  - > 100%: coral fill (`#F5334F`)

---

## SettingsView (`components/settings/SettingsView.tsx`)

```tsx
'use client'
export function SettingsView(): JSX.Element
```

**Tabs**: Team | Workflow

### TeamSettings sub-panel

- Member table: avatar, name, role (editable), access (editable dropdown), capacity (editable), remove button
- Stage ownership chips per member: 4 review stages; click to assign/unassign role
- "Add Member" form: name, email, role, access dropdown
- Remove member: calls `removeMember(id)` → if `activeTasks > 0`, shows warning modal before proceeding

### WorkflowSettings sub-panel

- Brand list with color swatch + remove button + "Add Brand" button → `AddBrandModal`
- Content type list with remove button + "Add Content Type" button → `AddTypeModal`
- SLA matrix: rows = working stages (c-prog, d-prog) + review stages (c-final, c-check, d-check, final-check); columns = content types; cells = `<input type="number">` → calls `updateSLA`

---

## Rendering Guarantees

1. **No loading spinners inside components**: Data is fetched server-side and passed as props or via context. Client components start with data already hydrated.
2. **AlertStatus is computed at render time**: `getAlertStatus(task, slaConfig, today)` is a pure function called in `TaskRow` and `TaskCard`. Never stored.
3. **nextStageId is client-computable**: The stage transition arrays are in `lib/stage-meta.ts`, shared between server and client. No extra DB call needed to show the advance button label.
4. **Celebration overlay has no server round-trip**: It fires from the `useUIStore` state set by `moveTask`'s return value (or Realtime broadcast). The overlay is purely client-side after the action.
