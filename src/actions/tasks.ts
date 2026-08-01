'use server'

import { revalidatePath } from 'next/cache'
import { prisma } from '@/lib/prisma'
import { getSessionMember, requireTaskCreator } from '@/lib/authz'
import { nextStageId } from '@/lib/stage-meta'
import { STAGE_META } from '@/lib/stage-meta'
import type { StageId, MoveTaskResult } from '@/types/index'

// ─── moveTask ───────────────────────────────────────────────────────────────

export async function moveTask(taskId: string): Promise<MoveTaskResult> {
  const member = await getSessionMember()
  if (!member) return { success: false, shouldCelebrate: false, error: 'not_authenticated' }

  const task = await prisma.task.findUnique({ where: { id: taskId } })
  if (!task) return { success: false, shouldCelebrate: false, error: 'not_found' }

  const nextStage = nextStageId(task.status as StageId, task.nine_stage)
  if (!nextStage) return { success: false, shouldCelebrate: false, error: 'terminal' }

  // Own-stage check: working stage → task owner; review stage → role match.
  // Mirrors `canAdvance` in TaskModal — the client hides the button, this
  // enforces it. Admin and superuser may advance any stage as an override.
  const stageMeta = STAGE_META[task.status as StageId]
  const isOwnStage = !stageMeta.owner_role
    ? task.task_owner_id === member.id
    : stageMeta.owner_role === member.role

  const canAdvance = isOwnStage || member.access === 'admin' || member.access === 'superuser'
  if (!canAdvance) return { success: false, shouldCelebrate: false, error: 'not_authorized' }

  // An override advance is not the overrider's win — no celebration.
  const shouldCelebrate = isOwnStage

  await prisma.task.update({
    where: { id: taskId },
    data:  { status: nextStage, stage_date: new Date(), updated_at: new Date() },
  })

  revalidatePath('/board')
  revalidatePath('/overview')
  return { success: true, shouldCelebrate }
}

// ─── addComment ─────────────────────────────────────────────────────────────

export async function addComment(
  taskId: string,
  body: string,
): Promise<{ success: boolean; error?: string }> {
  const member = await getSessionMember()
  if (!member) return { success: false, error: 'not_authenticated' }

  await prisma.taskComment.create({
    data: { task_id: taskId, author_id: member.id, body: body.trim() },
  })

  revalidatePath('/board')
  return { success: true }
}

// ─── updateTaskDescription ──────────────────────────────────────────────────

/**
 * Edit a task's brief in place (wireframe 1d: attribute rows are inline
 * editors, no separate edit mode).
 *
 * Anyone who could advance the task can also brief it: its owner, or an
 * admin/superuser. A plain user editing someone else's brief is refused.
 */
export async function updateTaskDescription(
  taskId: string,
  description: string,
): Promise<{ success: boolean; error?: string }> {
  const member = await getSessionMember()
  if (!member) return { success: false, error: 'not_authenticated' }

  const task = await prisma.task.findUnique({ where: { id: taskId } })
  if (!task) return { success: false, error: 'not_found' }

  const allowed =
    task.task_owner_id === member.id ||
    member.access === 'admin' ||
    member.access === 'superuser'
  if (!allowed) return { success: false, error: 'not_authorized' }

  await prisma.task.update({
    where: { id: taskId },
    data:  { description: description.trim() || null, updated_at: new Date() },
  })

  revalidatePath('/board')
  revalidatePath('/overview')
  return { success: true }
}

// ─── createTask ─────────────────────────────────────────────────────────────

interface CreateTaskInput {
  name:               string
  description?:       string
  brand_id:           string
  content_type_label: string
  task_owner_id:      string
  due_date:           string
  platform?:          string
  campaign?:          string
  hours_estimate?:    number
  priority?:          'Low' | 'Medium' | 'High'
  cover_image_url?:   string
}

export async function createTask(
  input: CreateTaskInput,
): Promise<{ success: boolean; id?: string; error?: string }> {
  const auth = await requireTaskCreator()
  if (auth.error) return { success: false, error: auth.error }
  const member = auth.member

  // Fetch workspace default for nine_stage
  const ws = await prisma.workspaceSettings.findUnique({ where: { id: 1 } })
  const nineStage = ws?.nine_stage_default ?? false

  const task = await prisma.task.create({
    data: {
      name:               input.name,
      description:        input.description?.trim() || null,
      brand_id:           input.brand_id || null,
      content_type_label: input.content_type_label || null,
      platform:           input.platform   ?? null,
      campaign:           input.campaign   ?? null,
      task_owner_id:      input.task_owner_id,
      initiator_role:     member.role,
      nine_stage:         nineStage,
      status:             'todo',
      stage_date:         new Date(),
      due_date:           new Date(input.due_date),
      hours_estimate:     input.hours_estimate ?? 0,
      priority:           input.priority ?? 'Medium',
      cover_image_url:    input.cover_image_url ?? null,
      created_by:         member.id,
    },
  })

  revalidatePath('/board')
  return { success: true, id: task.id }
}
