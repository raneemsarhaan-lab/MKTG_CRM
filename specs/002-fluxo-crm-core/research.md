# Research: Fluxo CRM Core

**Feature**: `specs/002-fluxo-crm-core`
**Date**: 2026-07-15

---

## Decision 1 — AlertStatus algorithm

**Question**: How is a task's alert badge computed — what thresholds, what inputs, what output?

**Inputs**:
- `task.stage_date`: ISO date when the task entered its current stage
- `task.due_date`: ISO date
- `task.status`: current stage ID
- `task.content_type_label`: used to look up SLA limit
- `slaConfig[stageId][contentTypeLabel]`: max business days before flagging
- `today`: `new Date()` at render time (never stored)

**Algorithm**:

```
stageDays         = businessDaysBetween(stage_date, today)
slaLimit          = slaConfig[status][content_type_label] ?? 1
calDaysToDeadline = calDaysBetween(today, due_date)

Overdue   → calDaysToDeadline < 0
Stuck     → stageDays > slaLimit + 2
Will Miss → stageDays > slaLimit
At Risk   → stageDays === slaLimit
Idle      → calDaysBetween(stage_date, today) > 2 AND stageDays === 0
On Track  → default (none of the above)
```

**Priority order**: Overdue beats all others. The checks run in the order listed.

**`businessDaysBetween(from, to)`**: counts Mon–Fri calendar days between two dates (signed). Excludes `from`, includes `to`. Returns a positive number if `to > from`, negative if inverted.

**`calDaysBetween(from, to)`**: `Math.round((startOfDay(to) - startOfDay(from)) / 86400000)`. Negative when `to < from`.

**Idle condition**: Idle fires when a task has not moved stages for more than 2 calendar days AND the SLA timer (in business days) is still at 0 — i.e., the task hasn't officially "started" in this stage from the SLA clock's perspective. Intended to surface tasks that have been silently parked.

**Output**: `'On Track' | 'At Risk' | 'Will Miss' | 'Stuck' | 'Idle' | 'Overdue'`

Every task in every panel shows exactly one badge. The badge is never stored on the task record.

---

## Decision 2 — BigStat metrics

The four stat cards on the Personal Board:

| Position | Metric | Theme | Calculation |
|---|---|---|---|
| 1 | Overdue tasks | danger (red) | tasks assigned to currentUser where `calDaysBetween(today, due_date) < 0` |
| 2 | In-progress tasks | accent (purple) | tasks assigned to currentUser where `status !== 'publish'` |
| 3 | Published this week | lime (green) | tasks assigned to currentUser where `status === 'publish'` AND stageDate is in the current ISO week |
| 4 | Capacity % | default (amber) | `Math.round((hoursThisWeek / member.capacity_hrs_wk) * 100)`; hoursThisWeek = sum of `hours_estimate` for in-progress tasks assigned to currentUser |

---

## Decision 3 — Greeting copy

| Time range | Greeting |
|---|---|
| 05:00 – 11:59 | Good morning |
| 12:00 – 17:59 | Good afternoon |
| 18:00 – 04:59 | Good evening |

Hour from `new Date().getHours()`.

---

## Decision 4 — Next.js migration strategy

The current codebase is React + Vite. The migration to Next.js App Router is a rewrite, not an upgrade. Strategy:

1. **Keep component logic**: Existing `.tsx` components in `src/components/` can be lifted mostly as-is. They need to be classified as Server or Client Components (`'use client'` directive).
2. **Replace Zustand store with Server Actions + DB**: Data state (`tasks`, `members`, `slaConfig`) moves to Postgres. The Zustand store is retained only for UI ephemera.
3. **Replace localStorage persistence**: `zustand/middleware persist` with `fluxo-storage` key is replaced by Postgres. No localStorage for data.
4. **Replace client-side Supabase auth**: Current `supabase.ts` uses email/password auth. Replace with Google OAuth + `@supabase/ssr` cookie-based sessions.
5. **Keep `lib/utils.ts`**: Date helpers are pure functions, copy as-is.
6. **Keep `lib/sounds.ts` → `lib/celebration-audio.ts`**: Web Audio synthesis; rename and expand to 4 reactions.

---

## Decision 5 — Drag-and-drop library

**Chosen**: `@dnd-kit/core` + `@dnd-kit/sortable`

**Why**: Works with React 19; no DOM manipulation (uses transform, not position); accessible keyboard drag; small bundle (~12 KB gzipped). The alternative (react-beautiful-dnd) is unmaintained.

**Scope**: Drag-and-drop repositions cards within a column (visual ordering only — no stage change via drag per spec FR-009). Stage advance always goes through the Advance button in TaskModal. This avoids permission bypass via drag.

---

## Decision 6 — Celebration audio synthesis

Web Audio API, no external library. Each reaction is a synthesized sound:

| Reaction | Technique |
|---|---|
| زغروطة (zaghrota) | Rapid freq modulation on OscillatorNode (LFO → freq), high pitch, ~500ms |
| تسقيف (tasqeef) | Rhythmic burst: 4 short gain envelope pulses on a sawtooth wave, ~800ms |
| انا مبهور بيا (mabhour) | Ascending arpeggio: 3 notes (C5→E5→G5) on triangle wave, ~600ms |
| طبلة (tabla) | Low-frequency noise burst through BiquadFilter (bandpass), ~700ms |

All sounds synthesized at runtime from `AudioContext`. No `.mp3` or `.ogg` files needed. Gated by `audioCtx.state === 'running'` (user gesture required for iOS Safari).

---

## Decision 7 — Confetti engine

Canvas-based, no external library. `CelebrationOverlay.tsx` renders a full-screen `<canvas>` with ~60 particles per reaction. Each reaction has a distinct particle shape and color palette:

| Reaction | Particle | Colors |
|---|---|---|
| zaghrota | Spiraling streamers | Lime + Coral |
| tasqeef | Clapping hand emojis + dots | Violet + Cyan |
| mabhour | Stars | Amber + Lime |
| tabla | Drum-shaped drops | Coral + Ink |

Animation runs via `requestAnimationFrame` for ~2 seconds, then cleans up.

---

## Decision 8 — Stage ownership model in DB

**Question**: Should stage ownership be stored per member or per role?

**Spec FR-006**: "Stage ownership MUST be stored as roles, not person names."

**Implementation**: The `stages` table has an `owner_role` column (nullable TEXT). For review stages, this is the role string (e.g. `'Marketing Manager'`). For working stages, it is NULL — ownership derives from the task's `task_owner_id`.

The `can_advance_task()` DB function implements this:
```sql
IF s.owner_role IS NULL THEN
  -- Working stage: task owner advances
  RETURN t.task_owner_id = auth.member_id()
ELSE
  -- Review stage: role owner advances
  RETURN s.owner_role = auth.user_role()
END IF
```

**Why role strings, not foreign keys to members**: A role like `'Marketing Manager'` can map to multiple people over time. If Raneem is replaced, the new Marketing Manager inherits review ownership without any migration.

---

## Decision 9 — nineStage flag and Islam Check

**FR-005**: `nine_stage` boolean is set at creation based on initiator's role. Content Creators → `true` (includes `c-check`). All others → `false`.

**DB**: Stored as `nine_stage BOOLEAN NOT NULL DEFAULT false` on `tasks`. Set once at INSERT; RLS policy should block UPDATE of `nine_stage` after creation (implement as generated column or trigger if needed).

**Stage transition**: Server Action `nextStageId(currentStageId, nineStage)` implements the branching:

```ts
function nextStageId(current: StageId, nineStage: boolean): StageId | null {
  const path = nineStage ? NINE_STAGE : EIGHT_STAGE
  const idx = path.indexOf(current)
  if (idx === -1 || idx === path.length - 1) return null  // terminal
  return path[idx + 1]
}
```

`null` return means the stage is terminal (Published) and the advance button is hidden.

---

## Decision 10 — @forefront.consulting domain check

Enforced in `/auth/callback/route.ts`. After Supabase exchanges the OAuth code:

```ts
const { data: { user } } = await supabase.auth.getUser()
if (!user?.email?.endsWith('@forefront.consulting')) {
  await supabase.auth.signOut()
  return NextResponse.redirect('/login?error=domain')
}
```

No Supabase-side email restriction is used (it would block the first redirect). Domain check runs in server code only — not in middleware, which runs on every request.

---

## Decision 11 — Realtime board sync strategy

Supabase Realtime broadcasts Postgres change events. `KanbanBoard.tsx` subscribes to `postgres_changes` on the `tasks` table. On receiving an event, it calls a Server Action to re-fetch the full task list (not optimistically merging partial payloads — simpler, avoids state drift).

The celebration broadcast uses a separate named channel `celebration-{userId}` to ensure only the advancing user receives the celebration event (not broadcast to all viewers of the board).

```ts
// Sent after Server Action confirms own-stage advance:
supabase.channel(`celebration-${memberId}`)
  .send({ type: 'broadcast', event: 'celebrate', payload: { taskName, stageLabel } })
```

The same component listens to this channel and triggers `useUIStore.setState({ celebration })`.
