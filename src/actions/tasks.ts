'use server'

import { revalidatePath } from 'next/cache'
import { prisma } from '@/lib/prisma'
import { getSessionMember, requireTaskCreator } from '@/lib/authz'
import { nextStageId, NINE_STAGE, EIGHT_STAGE } from '@/lib/stage-meta'
import { STAGE_META } from '@/lib/stage-meta'
import { MAX_PASTED } from '@/lib/paste-list'
import { MAX_ATTACHMENT_CHARS, MAX_ATTACHMENTS_PER_GO } from '@/lib/attachments'
import type { StageId, MoveTaskResult } from '@/types/index'

/**
 * Who may act on a task.
 *
 * Owner and assignee are different facts — one is accountable, the other is
 * doing it — but either may edit, because both are working on the thing. An
 * admin or superuser overrides both.
 */
function canAct(
  task: { task_owner_id: string; assignee_id: string | null },
  member: { id: string; access: string },
): boolean {
  return task.task_owner_id === member.id
    || task.assignee_id === member.id
    || member.access === 'admin'
    || member.access === 'superuser'
}

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
  // A working stage belongs to whoever is doing the task — or its owner, who
  // is accountable for it. A review stage belongs to a role.
  const isOwnStage = !stageMeta.owner_role
    ? task.assignee_id === member.id || task.task_owner_id === member.id
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

// ─── setTaskStage ───────────────────────────────────────────────────────────

/**
 * Move a task to a specific stage — what a board drag means.
 *
 * `moveTask` only knows "forward one"; a drag can land anywhere, including
 * backwards, which is how a rejected review is expressed. Same authorisation
 * as moveTask: whoever owns the stage the task is leaving, or an admin /
 * superuser override. The check is on the *current* stage, not the target —
 * the right to hand work on belongs to the person holding it.
 *
 * The target must exist in this task's own path. An 8-stage task cannot be
 * dragged into c-check; that column simply rejects the drop.
 */
export async function setTaskStage(
  taskId: string,
  stageId: StageId,
): Promise<MoveTaskResult> {
  const member = await getSessionMember()
  if (!member) return { success: false, shouldCelebrate: false, error: 'not_authenticated' }

  const task = await prisma.task.findUnique({ where: { id: taskId } })
  if (!task) return { success: false, shouldCelebrate: false, error: 'not_found' }

  const path = task.nine_stage ? NINE_STAGE : EIGHT_STAGE
  const fromIdx = path.indexOf(task.status as StageId)
  const toIdx   = path.indexOf(stageId)
  if (toIdx === -1) return { success: false, shouldCelebrate: false, error: 'stage_not_in_pipeline' }
  if (toIdx === fromIdx) return { success: true, shouldCelebrate: false }

  const stageMeta = STAGE_META[task.status as StageId]
  const isOwnStage = !stageMeta.owner_role
    ? task.assignee_id === member.id || task.task_owner_id === member.id
    : stageMeta.owner_role === member.role

  const allowed = isOwnStage || member.access === 'admin' || member.access === 'superuser'
  if (!allowed) return { success: false, shouldCelebrate: false, error: 'not_authorized' }

  await prisma.task.update({
    where: { id: taskId },
    data:  { status: stageId, stage_date: new Date(), updated_at: new Date() },
  })

  revalidatePath('/board')
  revalidatePath('/overview')

  // Only progress is a win, and only for the person whose stage it was —
  // pulling a task back or overriding someone else's stage celebrates nothing.
  return { success: true, shouldCelebrate: isOwnStage && toIdx > fromIdx }
}

// ─── addComment ─────────────────────────────────────────────────────────────

/**
 * Post a comment, optionally naming people and linking tasks in it.
 *
 * `mentions` and `taskRefs` carry ids the composer collected while the comment
 * was being written. Both are checked against their own table here rather than
 * trusted: a server action is a URL like any other, and an id that does not
 * belong to a member — or to a task — has no business being stored as one.
 */
export async function addComment(
  taskId: string,
  body: string,
  mentions: string[] = [],
  taskRefs: string[] = [],
): Promise<{ success: boolean; error?: string }> {
  const member = await getSessionMember()
  if (!member) return { success: false, error: 'not_authenticated' }

  const text = body.trim()
  if (!text) return { success: false, error: 'A comment cannot be empty' }

  let named: string[] = []
  if (mentions.length) {
    const rows = await prisma.member.findMany({
      where: { id: { in: [...new Set(mentions)] } },
      select: { id: true },
    })
    named = rows.map(r => r.id)
  }

  let linked: string[] = []
  if (taskRefs.length) {
    const rows = await prisma.task.findMany({
      where: { id: { in: [...new Set(taskRefs)] } },
      select: { id: true },
    })
    linked = rows.map(r => r.id)
  }

  await prisma.taskComment.create({
    data: {
      task_id: taskId, author_id: member.id, body: text,
      mentions: named, task_refs: linked,
    },
  })

  revalidatePath('/board')
  revalidatePath('/overview')
  return { success: true }
}

// ─── updateTask ─────────────────────────────────────────────────────────────

/**
 * Edit a task's attributes in place (wireframe 1d: attribute rows are inline
 * editors, no separate edit mode).
 *
 * Every field a user sets at intake can be corrected afterwards. Three things
 * are deliberately absent from the patch type and cannot be changed here:
 *
 *  - `status` — stage changes go through moveTask, which is where the
 *    permission check and the Published-is-terminal rule live (ground rule 7).
 *  - `nine_stage` — immutable after creation by design; flipping it would
 *    silently move work backwards or skip a required approval (HANDOVER §8).
 *  - `stage_date` — the SLA clock. It is set when a task enters a stage.
 *
 * SLA itself is not a task field at all; it is the stage × content-type matrix
 * in Settings, so it is out of reach here by construction. Note that changing
 * `content_type_label` does change which SLA row applies to this task.
 *
 * Authorised like moveTask: the task's owner, or an admin/superuser.
 */
export interface TaskPatch {
  name?:               string
  description?:        string
  brand_id?:           string
  content_type_label?: string
  platform?:           string
  campaign?:           string
  task_owner_id?:      string
  /** Null hands the task back to nobody. */
  assignee_id?:        string | null
  due_date?:           string   // ISO yyyy-mm-dd
  hours_estimate?:     number
  priority?:           'Low' | 'Medium' | 'High'
  cover_image_url?:    string
}

export async function updateTask(
  taskId: string,
  patch: TaskPatch,
): Promise<{ success: boolean; error?: string }> {
  const member = await getSessionMember()
  if (!member) return { success: false, error: 'not_authenticated' }

  const task = await prisma.task.findUnique({ where: { id: taskId } })
  if (!task) return { success: false, error: 'not_found' }

  if (!canAct(task, member)) return { success: false, error: 'not_authorized' }

  // Build the update explicitly — never spread the caller's object into
  // Prisma, or an extra key like `status` would ride along.
  const data: Record<string, unknown> = { updated_at: new Date() }

  if (patch.name !== undefined) {
    const name = patch.name.trim()
    if (!name) return { success: false, error: 'Task name cannot be empty' }
    data.name = name
  }
  if (patch.description !== undefined)        data.description        = patch.description.trim() || null
  if (patch.brand_id !== undefined)           data.brand_id           = patch.brand_id || null
  if (patch.content_type_label !== undefined) data.content_type_label = patch.content_type_label || null
  if (patch.platform !== undefined)           data.platform           = patch.platform || null
  if (patch.campaign !== undefined)           data.campaign           = patch.campaign.trim() || null
  if (patch.task_owner_id !== undefined)      data.task_owner_id      = patch.task_owner_id
  if (patch.assignee_id !== undefined)        data.assignee_id        = patch.assignee_id || null
  if (patch.cover_image_url !== undefined)    data.cover_image_url    = patch.cover_image_url.trim() || null
  if (patch.priority !== undefined)           data.priority           = patch.priority

  if (patch.due_date !== undefined) {
    const d = new Date(patch.due_date)
    if (Number.isNaN(d.getTime())) return { success: false, error: 'Invalid due date' }
    data.due_date = d
  }
  if (patch.hours_estimate !== undefined) {
    const h = Number(patch.hours_estimate)
    if (!Number.isFinite(h) || h < 0 || h > 999) return { success: false, error: 'Invalid estimate' }
    data.hours_estimate = h
  }

  await prisma.task.update({ where: { id: taskId }, data })

  revalidatePath('/board')
  revalidatePath('/overview')
  revalidatePath('/capacity')
  return { success: true }
}

// ─── createSubtask ──────────────────────────────────────────────────────────

/**
 * Create a child of an existing task — the Insert ▸ New subtask action.
 *
 * A subtask is an ordinary task. It gets its own stage, SLA clock and owner,
 * and appears on the board like anything else; the only difference is that it
 * knows its parent, which the card and the panel show. Nothing in the pipeline
 * treats it specially, so no stage logic had to learn about it.
 *
 * It inherits the parent's brand, content type and owner, because a subtask
 * raised from a brief is almost always the same work broken down.
 */
export async function createSubtask(
  parentId: string,
  name: string,
): Promise<{ success: boolean; id?: string; name?: string; error?: string }> {
  const member = await getSessionMember()
  if (!member) return { success: false, error: 'not_authenticated' }

  const trimmed = name.trim()
  if (!trimmed) return { success: false, error: 'Subtask name cannot be empty' }

  const parent = await prisma.task.findUnique({ where: { id: parentId } })
  if (!parent) return { success: false, error: 'not_found' }

  // Same rule as editing the parent: its owner, or an admin/superuser.
  const allowed =
    parent.task_owner_id === member.id ||
    parent.assignee_id === member.id ||
    member.access === 'admin' ||
    member.access === 'superuser'
  if (!allowed) return { success: false, error: 'not_authorized' }

  const task = await prisma.task.create({
    data: {
      name:               trimmed,
      parent_task_id:     parent.id,
      brand_id:           parent.brand_id,
      content_type_label: parent.content_type_label,
      platform:           parent.platform,
      campaign:           parent.campaign,
      task_owner_id:      parent.task_owner_id,
      assignee_id:        parent.assignee_id,
      initiator_role:     member.role,
      nine_stage:         parent.nine_stage,
      status:             'todo',
      stage_date:         new Date(),
      due_date:           parent.due_date,
      hours_estimate:     0,
      priority:           parent.priority,
      created_by:         member.id,
    },
  })

  revalidatePath('/board')
  revalidatePath('/overview')
  return { success: true, id: task.id, name: task.name }
}

// ─── bulk operations ────────────────────────────────────────────────────────

export interface BulkResult {
  success: boolean
  changed:  number
  refused:  number
  error?:   string
}

/**
 * Apply one patch to many tasks — the bulk action bar.
 *
 * Every task is authorised individually against the same rule as updateTask,
 * and the result reports how many were refused rather than failing the whole
 * batch. Selecting forty tasks and finding one belongs to someone else should
 * change thirty-nine, not zero.
 *
 * `status` moves are handled here too, unlike updateTask, because a bulk
 * "move to stage" is a real need. It carries setTaskStage's rule — the stage
 * being left decides — and resets the SLA clock exactly as a drag does.
 */
export async function bulkUpdateTasks(
  taskIds: string[],
  patch: TaskPatch & { status?: StageId },
): Promise<BulkResult> {
  const member = await getSessionMember()
  if (!member) return { success: false, changed: 0, refused: 0, error: 'not_authenticated' }
  if (taskIds.length === 0) return { success: true, changed: 0, refused: 0 }

  const tasks = await prisma.task.findMany({ where: { id: { in: taskIds } } })
  const isAdmin = member.access === 'admin' || member.access === 'superuser'

  let changed = 0, refused = 0

  for (const task of tasks) {
    const data: Record<string, unknown> = { updated_at: new Date() }

    if (patch.status !== undefined) {
      const path = task.nine_stage ? NINE_STAGE : EIGHT_STAGE
      if (!path.includes(patch.status)) { refused++; continue }

      const stageMeta = STAGE_META[task.status as StageId]
      const ownsStage = !stageMeta.owner_role
        ? task.assignee_id === member.id || task.task_owner_id === member.id
        : stageMeta.owner_role === member.role
      if (!ownsStage && !isAdmin) { refused++; continue }

      if (patch.status !== task.status) {
        data.status = patch.status
        data.stage_date = new Date()
      }
    }

    if (patch.status === undefined || Object.keys(patch).length > 1) {
      if (task.task_owner_id !== member.id && task.assignee_id !== member.id && !isAdmin) { refused++; continue }
    }

    if (patch.task_owner_id !== undefined)      data.task_owner_id      = patch.task_owner_id
    if (patch.assignee_id !== undefined)        data.assignee_id        = patch.assignee_id || null
    if (patch.brand_id !== undefined)           data.brand_id           = patch.brand_id || null
    if (patch.content_type_label !== undefined) data.content_type_label = patch.content_type_label || null
    if (patch.platform !== undefined)           data.platform           = patch.platform || null
    if (patch.campaign !== undefined)           data.campaign           = patch.campaign.trim() || null
    if (patch.priority !== undefined)           data.priority           = patch.priority
    if (patch.due_date !== undefined) {
      const d = new Date(patch.due_date)
      if (Number.isNaN(d.getTime())) { refused++; continue }
      data.due_date = d
    }

    if (Object.keys(data).length === 1) continue   // nothing but updated_at
    await prisma.task.update({ where: { id: task.id }, data })
    changed++
  }

  revalidatePath('/board')
  revalidatePath('/overview')
  revalidatePath('/capacity')
  return { success: true, changed, refused }
}

/**
 * Delete tasks outright.
 *
 * Same authorisation as editing — owner, admin or superuser — because a task
 * you may rewrite entirely you may also remove. Comments and attachments go
 * with it by cascade; subtasks are kept and simply lose their parent, which is
 * why the relation is onDelete: SetNull rather than Cascade.
 */
export async function bulkDeleteTasks(taskIds: string[]): Promise<BulkResult> {
  const member = await getSessionMember()
  if (!member) return { success: false, changed: 0, refused: 0, error: 'not_authenticated' }
  if (taskIds.length === 0) return { success: true, changed: 0, refused: 0 }

  const isAdmin = member.access === 'admin' || member.access === 'superuser'
  const tasks   = await prisma.task.findMany({ where: { id: { in: taskIds } } })

  const allowed = tasks.filter(t => isAdmin || t.task_owner_id === member.id || t.assignee_id === member.id).map(t => t.id)
  const refused = tasks.length - allowed.length

  if (allowed.length) await prisma.task.deleteMany({ where: { id: { in: allowed } } })

  revalidatePath('/board')
  revalidatePath('/overview')
  revalidatePath('/capacity')
  return { success: true, changed: allowed.length, refused }
}

// ─── createTask ─────────────────────────────────────────────────────────────

interface CreateTaskInput {
  name:               string
  description?:       string
  brand_id:           string
  content_type_label: string
  task_owner_id:      string
  /** Who will do it. Defaults to the owner when not given. */
  assignee_id?:       string | null
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
      assignee_id:        input.assignee_id ?? input.task_owner_id,
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

/**
 * Create many tasks at once, from a pasted list.
 *
 * Everything except the name is shared: one brand, one owner, one due date.
 * That is the whole point — a list arrives as names and nothing else, and
 * filling the context once beats typing it twenty times.
 *
 * `createMany` rather than a loop of `createTask`: one permission check, one
 * round trip, one revalidate. Two hundred sequential inserts through the
 * single-task path would also fire two hundred `revalidatePath` calls.
 */
export async function createTasks(
  names: string[],
  shared: Omit<CreateTaskInput, 'name'>,
): Promise<{ success: boolean; created?: number; error?: string }> {
  const auth = await requireTaskCreator()
  if (auth.error) return { success: false, error: auth.error }
  const member = auth.member

  const clean = names.map(n => n.trim()).filter(Boolean)
  if (!clean.length) return { success: false, error: 'Nothing to create' }
  if (clean.length > MAX_PASTED) {
    return { success: false, error: `That is more than ${MAX_PASTED} tasks in one go` }
  }
  if (!shared.brand_id) return { success: false, error: 'Select a brand' }

  const ws = await prisma.workspaceSettings.findUnique({ where: { id: 1 } })
  const nineStage = ws?.nine_stage_default ?? false
  const now = new Date()
  const due = new Date(shared.due_date)

  try {
    const result = await prisma.task.createMany({
      data: clean.map(name => ({
        name,
        description:        shared.description?.trim() || null,
        brand_id:           shared.brand_id,
        content_type_label: shared.content_type_label || null,
        platform:           shared.platform ?? null,
        campaign:           shared.campaign ?? null,
        task_owner_id:      shared.task_owner_id,
        assignee_id:        shared.assignee_id ?? shared.task_owner_id,
        initiator_role:     member.role,
        nine_stage:         nineStage,
        status:             'todo',
        stage_date:         now,
        due_date:           due,
        hours_estimate:     shared.hours_estimate ?? 0,
        priority:           shared.priority ?? 'Medium',
        cover_image_url:    shared.cover_image_url ?? null,
        created_by:         member.id,
      })),
    })

    revalidatePath('/board')
    revalidatePath('/overview')
    revalidatePath('/capacity')
    return { success: true, created: result.count }
  } catch (e: unknown) {
    return { success: false, error: String(e).slice(0, 200) }
  }
}

/* ── attachments ───────────────────────────────────────────────────────── */

type NewAttachment = { filename: string; data: string }

/** How big the card thumbnail may be. A dozen kilobytes, not a picture. */
const MAX_THUMB_CHARS = 60_000

/** Same rule as updateTask: the owner, or an admin or superuser. */
async function mayAttachTo(taskId: string, memberId: string, access: string) {
  const task = await prisma.task.findUnique({
    where: { id: taskId }, select: { task_owner_id: true, assignee_id: true },
  })
  if (!task) return { ok: false as const, error: 'not_found' }
  return canAct(task, { id: memberId, access })
    ? { ok: true as const }
    : { ok: false as const, error: 'not_authorized' }
}

/**
 * Attach files to a task.
 *
 * Files arrive already encoded as data URLs — the browser does the reading and
 * the shrinking, because a server action's payload is the same round trip
 * either way and the resize has to happen on a canvas regardless.
 */
export async function addAttachments(
  taskId: string,
  files: NewAttachment[],
  /**
   * A small preview of the newest image in this batch, for the task card.
   *
   * It is stored on the task rather than the attachment because the board
   * reads every task and never selects an attachment's bytes — see the model
   * comments. One small thumbnail per task is affordable; three hundred rows
   * of full-size uploads is not.
   */
  thumb?: string | null,
): Promise<{ success: boolean; created?: number; error?: string }> {
  const member = await getSessionMember()
  if (!member) return { success: false, error: 'not_authenticated' }

  const guard = await mayAttachTo(taskId, member.id, member.access)
  if (!guard.ok) return { success: false, error: guard.error }

  const clean = files
    .filter(f => f.filename.trim() && f.data.startsWith('data:'))
    .slice(0, MAX_ATTACHMENTS_PER_GO)
  if (!clean.length) return { success: false, error: 'Nothing to attach' }

  const tooBig = clean.find(f => f.data.length > MAX_ATTACHMENT_CHARS)
  if (tooBig) {
    return { success: false, error: `${tooBig.filename} is too large to store — keep files under about 1 MB.` }
  }

  try {
    const result = await prisma.taskAttachment.createMany({
      data: clean.map(f => ({
        task_id:     taskId,
        filename:    f.filename.trim().slice(0, 200),
        data:        f.data,
        uploaded_by: member.id,
      })),
    })
    if (thumb && thumb.startsWith('data:') && thumb.length <= MAX_THUMB_CHARS) {
      await prisma.task.update({ where: { id: taskId }, data: { cover_thumb: thumb } })
    }

    revalidatePath('/board')
    revalidatePath('/overview')
    return { success: true, created: result.count }
  } catch (e: unknown) {
    return { success: false, error: String(e).slice(0, 200) }
  }
}

export async function removeAttachment(
  attachmentId: string,
): Promise<{ success: boolean; error?: string }> {
  const member = await getSessionMember()
  if (!member) return { success: false, error: 'not_authenticated' }

  const a = await prisma.taskAttachment.findUnique({
    where: { id: attachmentId }, select: { task_id: true },
  })
  if (!a) return { success: false, error: 'That file is already gone' }

  const guard = await mayAttachTo(a.task_id, member.id, member.access)
  if (!guard.ok) return { success: false, error: guard.error }

  await prisma.taskAttachment.delete({ where: { id: attachmentId } })

  // The card's preview came from an upload. If none is left, clear it rather
  // than keep showing a picture the task no longer has.
  const stillHasUpload = await prisma.taskAttachment.count({
    where: { task_id: a.task_id, data: { not: null } },
  })
  if (stillHasUpload === 0) {
    await prisma.task.update({ where: { id: a.task_id }, data: { cover_thumb: null } })
  }

  revalidatePath('/board')
  revalidatePath('/overview')
  return { success: true }
}

/**
 * The full attachment rows for one task, `data` included.
 *
 * The board query deliberately leaves `data` out — it reads every task, and
 * inlined files across 300 of them would be megabytes on every page load. So
 * the panel asks for its own task's files when it needs to show them.
 */
export async function loadAttachments(taskId: string): Promise<{
  id: string; filename: string; url: string | null; data: string | null
  uploaded_by: string | null; uploaded_at: string
}[]> {
  const member = await getSessionMember()
  if (!member) return []

  const rows = await prisma.taskAttachment.findMany({
    where: { task_id: taskId },
    orderBy: { uploaded_at: 'asc' },
  })
  return rows.map(r => ({
    id: r.id, filename: r.filename, url: r.url, data: r.data,
    uploaded_by: r.uploaded_by, uploaded_at: r.uploaded_at.toISOString(),
  }))
}
