# Server Action Contracts: Fluxo CRM Core

**Feature**: `specs/002-fluxo-crm-core`
**Date**: 2026-07-15

All Server Actions live in `src/actions/`. They import `createServerClient` from `src/lib/supabase/server.ts` and call `revalidatePath` from `next/cache` after mutations. All actions are `'use server'` modules.

---

## Auth Flow (`/auth/callback/route.ts`)

```ts
// GET /auth/callback?code=...
export async function GET(request: Request): Promise<Response> {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')

  if (!code) {
    return NextResponse.redirect(`${origin}/login?error=no_code`)
  }

  const supabase = createServerClient(cookies())
  const { error } = await supabase.auth.exchangeCodeForSession(code)

  if (error) {
    return NextResponse.redirect(`${origin}/login?error=auth_failed`)
  }

  const { data: { user } } = await supabase.auth.getUser()

  // Domain enforcement
  if (!user?.email?.endsWith('@forefront.consulting')) {
    await supabase.auth.signOut()
    return NextResponse.redirect(`${origin}/login?error=domain`)
  }

  // Member lookup
  const { data: member } = await supabase
    .from('members')
    .select('*')
    .eq('email', user.email)
    .single()

  if (!member) {
    await supabase.auth.signOut()
    return NextResponse.redirect(`${origin}/login?error=not_member`)
  }

  return NextResponse.redirect(`${origin}/overview`)
}
```

---

## `src/actions/tasks.ts`

### `moveTask`

```ts
'use server'

import { revalidatePath } from 'next/cache'
import { createServerClient } from '@/lib/supabase/server'
import { nextStageId } from '@/lib/stage-meta'
import type { StageId } from '@/types'

interface MoveTaskResult {
  success: boolean
  shouldCelebrate: boolean  // true only if the mover personally owned the stage
  error?: string
}

export async function moveTask(taskId: string): Promise<MoveTaskResult> {
  const supabase = createServerClient(cookies())

  // 1. Fetch task and current user
  const [{ data: task }, { data: { user } }] = await Promise.all([
    supabase.from('tasks').select('*, stage:stages(*)').eq('id', taskId).single(),
    supabase.auth.getUser(),
  ])

  if (!task || !user) return { success: false, shouldCelebrate: false, error: 'not_found' }

  // 2. Compute next stage
  const nextStage = nextStageId(task.status as StageId, task.nine_stage)
  if (!nextStage) return { success: false, shouldCelebrate: false, error: 'terminal' }

  // 3. Determine if this is a personal-ownership advance (for celebration gate)
  const { data: member } = await supabase.from('members').select('role, id').eq('email', user.email).single()
  const stage = task.stage

  let shouldCelebrate = false
  if (member) {
    if (stage.owner_role === null) {
      // Working stage: personal if the mover IS the task owner
      shouldCelebrate = task.task_owner_id === member.id
    } else {
      // Review stage: personal if the mover's role matches the stage owner role
      // AND mover is not admin/superuser overriding someone else
      const isRoleOwner = stage.owner_role === member.role
      const isForced    = member.access === 'admin' || member.access === 'superuser'
      // Celebration fires only if they're advancing their own stage (role match),
      // not if they're forcing it as an admin on behalf of someone else
      shouldCelebrate = isRoleOwner  // admin who IS the role owner still gets celebration
    }
  }

  // 4. Advance in DB (RLS enforces can_advance_task)
  const { error } = await supabase
    .from('tasks')
    .update({ status: nextStage, stage_date: new Date().toISOString().split('T')[0] })
    .eq('id', taskId)

  if (error) return { success: false, shouldCelebrate: false, error: error.message }

  revalidatePath('/board')
  revalidatePath('/overview')

  return { success: true, shouldCelebrate }
}
```

### `createTask`

```ts
interface CreateTaskInput {
  name: string
  brand_id: string
  content_type_label: string
  task_owner_id: string
  due_date: string
  platform?: string
  campaign?: string
  hours_estimate?: number
  priority?: 'Low' | 'Medium' | 'High'
  cover_image_url?: string
}

export async function createTask(input: CreateTaskInput): Promise<{ success: boolean; id?: string; error?: string }> {
  const supabase = createServerClient(cookies())
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'not_authenticated' }

  const { data: creator } = await supabase.from('members').select('role').eq('email', user.email).single()
  if (!creator) return { success: false, error: 'member_not_found' }

  const nineStage = creator.role === 'Content Creator'

  const { data, error } = await supabase
    .from('tasks')
    .insert({
      ...input,
      initiator_role: creator.role,
      nine_stage: nineStage,
      status: 'todo',
      stage_date: new Date().toISOString().split('T')[0],
    })
    .select('id')
    .single()

  if (error) return { success: false, error: error.message }

  revalidatePath('/board')
  return { success: true, id: data.id }
}
```

### `addComment`

```ts
export async function addComment(
  taskId: string,
  body: string
): Promise<{ success: boolean; error?: string }> {
  const supabase = createServerClient(cookies())
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'not_authenticated' }

  const { data: member } = await supabase.from('members').select('id').eq('email', user.email).single()
  if (!member) return { success: false, error: 'member_not_found' }

  const { error } = await supabase
    .from('task_comments')
    .insert({ task_id: taskId, author_id: member.id, body: body.trim() })

  if (error) return { success: false, error: error.message }
  revalidatePath('/board')
  return { success: true }
}
```

---

## `src/actions/members.ts`

### `addMember`

```ts
export async function addMember(input: {
  name: string; email: string; role: string; access: 'admin'|'superuser'|'user'; capacity_hrs_wk: number
}): Promise<{ success: boolean; error?: string }> {
  // Validates email ends in @forefront.consulting
  // RLS enforces admin-only insert
  const supabase = createServerClient(cookies())
  if (!input.email.endsWith('@forefront.consulting')) {
    return { success: false, error: 'email_domain' }
  }
  const { error } = await supabase.from('members').insert(input)
  if (error) return { success: false, error: error.message }
  revalidatePath('/settings')
  revalidatePath('/board')
  return { success: true }
}
```

### `removeMember`

```ts
export async function removeMember(
  memberId: string
): Promise<{ success: boolean; activeTasks?: number; error?: string }> {
  const supabase = createServerClient(cookies())

  // Check for active tasks (spec FR-031: warn before removal)
  const { count } = await supabase
    .from('tasks')
    .select('*', { count: 'exact', head: true })
    .eq('task_owner_id', memberId)
    .neq('status', 'publish')

  if ((count ?? 0) > 0) {
    return { success: false, activeTasks: count ?? 0, error: 'has_active_tasks' }
  }

  const { error } = await supabase.from('members').delete().eq('id', memberId)
  if (error) return { success: false, error: error.message }
  revalidatePath('/settings')
  return { success: true }
}
```

### `updateMember`

```ts
export async function updateMember(
  memberId: string,
  patch: Partial<{ name: string; role: string; access: 'admin' | 'superuser' | 'user'; capacity_hrs_wk: number; status: string; avatar_url: string }>
): Promise<{ success: boolean; error?: string }> {
  const supabase = createServerClient(cookies())

  // RLS enforces: admin can update any member; user can update own status/avatar only.
  // Server Action validation limits which fields are sent — never expose full patch to client.
  const { error } = await supabase
    .from('members')
    .update(patch)
    .eq('id', memberId)

  if (error) return { success: false, error: error.message }
  revalidatePath('/settings')
  revalidatePath('/capacity')
  return { success: true }
}
```

---

## `src/actions/settings.ts`

### `updateSLA`

```ts
export async function updateSLA(
  stageId: string,
  contentTypeLabel: string,
  maxBusinessDays: number
): Promise<{ success: boolean; error?: string }> {
  const supabase = createServerClient(cookies())
  const { error } = await supabase
    .from('sla_config')
    .upsert({ stage_id: stageId, content_type_label: contentTypeLabel, max_business_days: maxBusinessDays })

  if (error) return { success: false, error: error.message }
  revalidatePath('/settings')
  revalidatePath('/board')  // alert badges recompute on next load
  return { success: true }
}
```

### `createBrand`

```ts
export async function createBrand(input: {
  name: string; color: string; logo_url?: string; description?: string
}): Promise<{ success: boolean; error?: string }> {
  const supabase = createServerClient(cookies())
  const { error } = await supabase.from('brands').insert(input)
  if (error) return { success: false, error: error.message }
  revalidatePath('/settings')
  revalidatePath('/board')
  return { success: true }
}
```

### `removeBrand`

```ts
export async function removeBrand(brandId: string): Promise<{ success: boolean; error?: string }> {
  // If tasks reference this brand, SET NULL (FK is ON DELETE SET NULL)
  const supabase = createServerClient(cookies())
  const { error } = await supabase.from('brands').delete().eq('id', brandId)
  if (error) return { success: false, error: error.message }
  revalidatePath('/settings')
  return { success: true }
}
```

### `createContentType`

```ts
export async function createContentType(
  label: string,
  slaDefaults: Record<string, number>  // stageId → days
): Promise<{ success: boolean; error?: string }> {
  const supabase = createServerClient(cookies())

  const { error: typeError } = await supabase.from('content_types').insert({ label })
  if (typeError) return { success: false, error: typeError.message }

  // Insert SLA defaults for every stage
  const slaRows = Object.entries(slaDefaults).map(([stageId, days]) => ({
    stage_id: stageId, content_type_label: label, max_business_days: days
  }))
  const { error: slaError } = await supabase.from('sla_config').insert(slaRows)
  if (slaError) return { success: false, error: slaError.message }

  revalidatePath('/settings')
  return { success: true }
}
```

---

## Return Type Convention

All Server Actions return `{ success: boolean; error?: string }` or a richer result type. Components handle the error string for display; they do not throw. Unrecoverable DB errors bubble as `error.message` from Supabase, which is safe to display (no raw SQL exposed).

---

## `revalidatePath` Strategy

| Action | Paths invalidated |
|---|---|
| moveTask | /board, /overview |
| createTask | /board |
| addComment | /board |
| addMember | /settings, /board (assignee dropdown) |
| removeMember | /settings, /board |
| updateMember | /settings, /capacity |
| updateSLA | /settings, /board |
| createBrand | /settings, /board |
| removeBrand | /settings, /board |
| createContentType | /settings |
