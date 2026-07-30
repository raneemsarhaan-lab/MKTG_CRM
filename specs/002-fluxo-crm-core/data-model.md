# Data Model: Fluxo CRM Core

**Feature**: `specs/002-fluxo-crm-core`
**Date**: 2026-07-15

---

## TypeScript Types (`src/types/index.ts`)

```ts
// ─── Primitive aliases ─────────────────────────────────────────────────────

export type StageId =
  | 'todo'        // To Do
  | 'c-prog'      // Writing
  | 'c-final'     // Content Review
  | 'c-check'     // Islam Check (9-stage only)
  | 'r-design'    // Ready to Design
  | 'd-prog'      // Designing
  | 'd-check'     // Design Review
  | 'final-check' // Final Check
  | 'publish'     // Published (terminal)

export type AccessLevel = 'admin' | 'superuser' | 'user'
export type AlertStatus = 'On Track' | 'At Risk' | 'Will Miss' | 'Stuck' | 'Idle' | 'Overdue'
export type Priority = 'Low' | 'Medium' | 'High'

// ─── Core entities ─────────────────────────────────────────────────────────

export interface Member {
  id: string                        // UUID
  name: string
  email: string                     // must end in @forefront.consulting
  role: string                      // e.g. 'Marketing Manager', 'Content Creator'
  access: AccessLevel
  capacity_hrs_wk: number           // weekly hour limit
  status: 'Available' | 'Busy'
  color?: string                    // hex; used for avatar bg override
  avatar_url?: string               // Supabase Storage URL
}

export interface Brand {
  id: string                        // UUID
  name: string
  color: string                     // hex
  logo_url?: string
  description?: string
}

export interface ContentType {
  id: string
  label: string                     // 'Post', 'Video', 'Reel', etc.
}

export interface Stage {
  id: StageId
  label_en: string                  // spec English label
  label_ar: string                  // Arabic label
  phase: 'Intake' | 'Content' | 'Design' | 'Ship'
  owner_role: string | null         // null = working stage (owned by task owner)
  terminal_flag: boolean            // true only for 'publish'
  sort_order: number
}

export interface SLAConfig {
  [stageId: string]: {
    [contentTypeLabel: string]: number  // max business days
  }
}

export interface Task {
  id: string                        // UUID
  name: string
  brand_id: string                  // FK → brands.id
  brand?: Brand                     // joined
  content_type_label: string        // FK → content_types.label
  platform?: string                 // 'LinkedIn', 'Instagram', etc.
  campaign?: string                 // optional grouping (see plan FLAG 3)
  task_owner_id: string             // UUID FK → members.id (fixed at creation)
  task_owner?: Member               // joined
  initiator_role: string            // role of the creator at creation time
  nine_stage: boolean               // immutable after INSERT
  status: StageId                   // current pipeline stage
  stage_date: string                // ISO date entered current stage (YYYY-MM-DD)
  due_date: string                  // ISO date (YYYY-MM-DD)
  hours_estimate: number
  cover_image_url?: string          // Supabase Storage URL; null → gradient fallback
  priority: Priority
  created_by?: string               // UUID FK → members.id
  created_at: string                // ISO timestamp
  updated_at: string
  comments?: TaskComment[]
  attachments?: TaskAttachment[]
}

export interface TaskComment {
  id: string
  task_id: string
  author_id: string
  author?: Member
  body: string
  created_at: string
}

export interface TaskAttachment {
  id: string
  task_id: string
  filename: string
  url?: string
  uploaded_at: string
}
```

---

## Derived Types

```ts
// Panel task with computed alert status
export interface PanelTask {
  task: Task
  alertStatus: AlertStatus
}

// BigStat card on Personal Board
export interface BigStatMetric {
  label: string
  value: number | string
  sub?: string
  theme: 'danger' | 'accent' | 'lime' | 'default'
}

// Stage metadata including color (from lib/stage-meta.ts — not DB)
export interface StageMeta {
  id: StageId
  label_en: string
  label_ar: string
  phase: string
  color: string     // hex from design token
  owner_role: string | null
  terminal_flag: boolean
}

// Celebration event payload
export interface CelebrationPayload {
  taskName: string
  stageLabel: string  // English stage label
}
```

---

## Seed Data

### Stages (seeded via migration, not user-configurable)

| id | label_en (spec) | label_ar | phase | owner_role | terminal | sort |
|---|---|---|---|---|---|---|
| todo | To Do | افكار للتنفيذ | Intake | null | false | 0 |
| c-prog | Writing | كتابة المحتوى | Content | null | false | 1 |
| c-final | Content Review | مراجعة المحتوى | Content | Marketing Manager | false | 2 |
| c-check | Islam Check | موافقة نهائية على المحتوى | Content | Managing Director | false | 3 |
| r-design | Ready to Design | جاهز للتصميم | Design | null | false | 4 |
| d-prog | Designing | تصميم | Design | null | false | 5 |
| d-check | Design Review | مراجعة التصميم | Design | Brand Director | false | 6 |
| final-check | Final Check | المراجعة النهائية | Ship | Marketing Manager | false | 7 |
| publish | Published | تم النشر | Ship | null | true | 8 |

### Stage Traversal

```ts
// src/lib/stage-meta.ts
export const NINE_STAGE: StageId[] = [
  'todo', 'c-prog', 'c-final', 'c-check', 'r-design', 'd-prog', 'd-check', 'final-check', 'publish'
]

export const EIGHT_STAGE: StageId[] = [
  'todo', 'c-prog', 'c-final', 'r-design', 'd-prog', 'd-check', 'final-check', 'publish'
]

export function nextStageId(current: StageId, nineStage: boolean): StageId | null {
  const path = nineStage ? NINE_STAGE : EIGHT_STAGE
  const idx = path.indexOf(current)
  if (idx === -1 || idx === path.length - 1) return null
  return path[idx + 1]
}

export function isWorkingStage(stageId: StageId): boolean {
  return !STAGE_META[stageId].owner_role && !STAGE_META[stageId].terminal_flag
}
```

### Members (seed)

| name | role | access | email | capacity_hrs_wk |
|---|---|---|---|---|
| Raneem | Marketing Manager | admin | raneem@forefront.consulting | 40 |
| Islam | Managing Director | superuser | islam@forefront.consulting | 20 |
| Brand Director | Brand Director | superuser | brand@forefront.consulting | 35 |
| Digital Marketing Specialist | Digital Marketing | superuser | dms@forefront.consulting | 40 |
| Content Creator | Content Creator | user | content@forefront.consulting | 40 |
| Graphic Designer | Graphic Designer | user | design@forefront.consulting | 40 |
| Video Editor | Video Editor | user | video@forefront.consulting | 40 |

### Brands (seed)

| name | color |
|---|---|
| Forefront Consulting | #B4322F |
| Omnisight | #0E7C7B |
| The Strategy Community | #7A5A2E |
| Islam Personal Branding | #1E293B |

### Content Types (seed)

Post, Video, Reel, Design, Email, Story, Deck, Other

### SLA Matrix (seed defaults, business days)

| Stage | Post | Video | Reel | Design | Email | Story | Deck | Other |
|---|---|---|---|---|---|---|---|---|
| todo | 1 | 2 | 2 | 1 | 1 | 1 | 3 | 2 |
| c-prog | 2 | 4 | 3 | 2 | 2 | 1 | 5 | 3 |
| c-final | 1 | 1 | 1 | 1 | 1 | 1 | 2 | 1 |
| c-check | 1 | 2 | 1 | 1 | 1 | 1 | 2 | 1 |
| r-design | 1 | 2 | 2 | 1 | 1 | 1 | 2 | 2 |
| d-prog | 2 | 5 | 4 | 3 | 2 | 1 | 4 | 3 |
| d-check | 1 | 2 | 2 | 1 | 1 | 1 | 2 | 1 |
| final-check | 1 | 1 | 1 | 1 | 1 | 1 | 1 | 1 |
| publish | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |

---

## AlertStatus Badge Styles

```ts
// src/lib/tokens.ts
export const ALERT_BADGE_STYLES: Record<AlertStatus, { bg: string; text: string }> = {
  'On Track':  { bg: '#EDF6C6', text: '#4B7A12' },
  'At Risk':   { bg: '#F7EFD3', text: '#A9791F' },
  'Will Miss': { bg: '#F7E6D8', text: '#BF5A2A' },
  'Stuck':     { bg: '#F8E7E5', text: '#C0453E' },
  'Idle':      { bg: '#F1ECDD', text: '#7E6A3D' },
  'Overdue':   { bg: '#F8E7E5', text: '#C0453E' },
}
```

---

## UI Store Shape (`src/store/useUIStore.ts`)

Only UI ephemera — no task or member data.

```ts
interface UIStore {
  celebration: CelebrationPayload | null
  selectedTaskId: string | null
  showTaskForm: boolean
  profileOpen: boolean

  setCelebration: (payload: CelebrationPayload | null) => void
  selectTask: (id: string | null) => void
  setShowTaskForm: (show: boolean) => void
  setProfileOpen: (open: boolean) => void
}
```

No `persist` middleware. State resets on page load. Tasks and members always come from the server.

---

## Avatar Color Function

```ts
// Deterministic from member name — same name always same color
export function avatarColor(name: string): string {
  const palette = ['#1B1D1F', '#6E5BE6', '#3FA34D', '#5B93F5', '#E0736A', '#5B6066', '#B4863F']
  let h = 0
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) | 0
  return palette[Math.abs(h) % palette.length]
}

export function initials(name: string): string {
  return name.split(' ').map(p => p[0]).join('').slice(0, 2).toUpperCase()
}
```

---

## Cover Image Fallback

When `task.cover_image_url` is null or empty, the task card renders a gradient background derived from the brand color:

```ts
// Lighten the brand color for a soft gradient
export function brandGradient(hex: string): string {
  return `linear-gradient(135deg, ${hex}22, ${hex}55)`
}
```

The brand monogram (2-letter initials of brand name) is centered over the gradient.
