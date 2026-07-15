'use server'

import { revalidatePath } from 'next/cache'
import { createServerClient } from '@/lib/supabase/server'
import { nextStageId } from '@/lib/stage-meta'
import type { StageId, MoveTaskResult } from '@/types/index'

// ─── moveTask ───────────────────────────────────────────────────────────────

export async function moveTask(taskId: string): Promise<MoveTaskResult> {
  const supabase = await createServerClient()

  const [{ data: task }, { data: { user } }] = await Promise.all([
    supabase.from('tasks').select('*, stage:stages(*)').eq('id', taskId).single(),
    supabase.auth.getUser(),
  ])

  if (!task || !user) return { success: false, shouldCelebrate: false, error: 'not_found' }

  const nextStage = nextStageId(task.status as StageId, task.nine_stage)
  if (!nextStage) return { success: false, shouldCelebrate: false, error: 'terminal' }

  const { data: member } = await supabase
    .from('members').select('role, id').eq('email', user.email).single()

  let shouldCelebrate = false
  if (member) {
    const stage = task.stage as { owner_role: string | null } | null
    if (!stage || stage.owner_role === null) {
      // Working stage: celebration if mover IS the task owner
      shouldCelebrate = task.task_owner_id === member.id
    } else {
      // Review stage: celebration if mover's role matches the stage owner role
      shouldCelebrate = stage.owner_role === member.role
    }
  }

  const { error } = await supabase
    .from('tasks')
    .update({ status: nextStage, stage_date: new Date().toISOString().split('T')[0] })
    .eq('id', taskId)

  if (error) return { success: false, shouldCelebrate: false, error: error.message }

  revalidatePath('/board')
  revalidatePath('/overview')

  return { success: true, shouldCelebrate }
}

// ─── addComment ─────────────────────────────────────────────────────────────

export async function addComment(
  taskId: string,
  body: string,
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'not_authenticated' }

  const { data: member } = await supabase
    .from('members').select('id').eq('email', user.email).single()
  if (!member) return { success: false, error: 'member_not_found' }

  const { error } = await supabase
    .from('task_comments')
    .insert({ task_id: taskId, author_id: member.id, body: body.trim() })

  if (error) return { success: false, error: error.message }
  revalidatePath('/board')
  return { success: true }
}

// ─── createTask ─────────────────────────────────────────────────────────────

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

export async function createTask(
  input: CreateTaskInput,
): Promise<{ success: boolean; id?: string; error?: string }> {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'not_authenticated' }

  const { data: creator } = await supabase
    .from('members').select('role').eq('email', user.email).single()
  if (!creator) return { success: false, error: 'member_not_found' }

  // Islam Check config-flag: 9-stage for Content Creators, 8-stage otherwise
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
