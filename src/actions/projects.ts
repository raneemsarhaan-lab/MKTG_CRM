'use server'

import { revalidatePath } from 'next/cache'
import { prisma } from '@/lib/prisma'
import { getSessionMember, requireAdmin } from '@/lib/authz'

/**
 * Plan actions.
 *
 * Two different rules live here, and the difference matters:
 *
 *  - Shaping the plan — creating projects, moving them in and out of Focus,
 *    changing dates, assigning people — is admin work.
 *  - Ticking a step off is done by whoever it is assigned to. Requiring an
 *    admin for that would make the team board read-only for the team.
 *
 * Since the Prisma migration removed row-level security these checks are the
 * only thing enforcing either rule.
 */

type Result = { success: boolean; error?: string }

function revalidateAll() {
  revalidatePath('/projects')
  revalidatePath('/team')
  revalidatePath('/board')
  revalidatePath('/overview')
}

/* ── shaping the plan: admin ─────────────────────────────────────────────── */

export async function toggleProjectFocus(projectId: string): Promise<Result> {
  const guard = await requireAdmin()
  if (guard.error) return { success: false, error: guard.error }

  const p = await prisma.project.findUnique({ where: { id: projectId }, select: { focus: true } })
  if (!p) return { success: false, error: 'not_found' }

  await prisma.project.update({ where: { id: projectId }, data: { focus: !p.focus } })
  revalidateAll()
  return { success: true }
}

export async function updateProject(
  projectId: string,
  patch: { name?: string; brand_id?: string | null; due_date?: string | null; standing?: boolean },
): Promise<Result> {
  const guard = await requireAdmin()
  if (guard.error) return { success: false, error: guard.error }

  const data: Record<string, unknown> = {}
  if (patch.name !== undefined) {
    const name = patch.name.trim()
    if (!name) return { success: false, error: 'Name cannot be empty' }
    data.name = name
  }
  if (patch.brand_id !== undefined) data.brand_id = patch.brand_id || null
  if (patch.standing !== undefined) data.standing = patch.standing
  if (patch.due_date !== undefined) data.due_date = patch.due_date ? new Date(patch.due_date) : null

  if (!Object.keys(data).length) return { success: true }

  try {
    await prisma.project.update({ where: { id: projectId }, data })
    revalidateAll()
    return { success: true }
  } catch (e: unknown) {
    return { success: false, error: String(e).slice(0, 200) }
  }
}

export async function createProject(name: string, brandId?: string | null): Promise<Result> {
  const guard = await requireAdmin()
  if (guard.error) return { success: false, error: guard.error }
  if (!name.trim()) return { success: false, error: 'Name cannot be empty' }

  await prisma.project.create({ data: { name: name.trim(), brand_id: brandId || null } })
  revalidateAll()
  return { success: true }
}

/**
 * Delete a project and everything under it.
 *
 * Steps cascade. A step that was pushed to the board leaves its task behind on
 * purpose — the plan is being deleted, not the work already in flight.
 *
 * A project that came from data/projects-plan.json is also tombstoned. The
 * plan importer runs on every container start and creates any key it cannot
 * find, so without this the project — and all of its steps — would be back
 * after the next deploy.
 */
export async function removeProject(projectId: string): Promise<Result> {
  const guard = await requireAdmin()
  if (guard.error) return { success: false, error: guard.error }

  const p = await prisma.project.findUnique({
    where: { id: projectId }, select: { key: true, name: true },
  })
  if (!p) return { success: false, error: 'That project no longer exists' }

  await prisma.$transaction(async tx => {
    await tx.project.delete({ where: { id: projectId } })
    if (p.key) {
      await tx.tombstone.createMany({
        data: [{ kind: 'project', key: p.key, label: p.name }],
        skipDuplicates: true,
      })
    }
  })
  revalidateAll()
  return { success: true }
}

/**
 * Edit a step.
 *
 * An admin can change any step. Everyone else can change the ones assigned to
 * them — the team board is where people manage their own work, and making it
 * read-only for the team would defeat the point of giving them one. Reassigning
 * is included: handing a task to someone else is a normal thing to need, and
 * the person losing it is the one giving it away.
 *
 * What nobody but an admin can do is touch a step that was never theirs.
 */
export async function updateStep(
  stepId: string,
  patch: { name?: string; duration_days?: number; due_date?: string | null; assignee_id?: string | null },
): Promise<Result> {
  const member = await getSessionMember()
  if (!member) return { success: false, error: 'not_authenticated' }

  if (member.access !== 'admin') {
    const step = await prisma.projectStep.findUnique({
      where: { id: stepId }, select: { assignee_id: true },
    })
    if (!step) return { success: false, error: 'not_found' }
    if (step.assignee_id !== member.id) return { success: false, error: 'not_authorized' }
  }

  const data: Record<string, unknown> = {}
  if (patch.name !== undefined) {
    const name = patch.name.trim()
    if (!name) return { success: false, error: 'Name cannot be empty' }
    data.name = name
  }
  if (patch.duration_days !== undefined) {
    if (!Number.isFinite(patch.duration_days) || patch.duration_days < 0) {
      return { success: false, error: 'Duration must be a positive number of days' }
    }
    data.duration_days = patch.duration_days
  }
  if (patch.due_date !== undefined) data.due_date = patch.due_date ? new Date(patch.due_date) : null
  if (patch.assignee_id !== undefined) data.assignee_id = patch.assignee_id || null

  if (!Object.keys(data).length) return { success: true }

  try {
    await prisma.projectStep.update({ where: { id: stepId }, data })
    revalidateAll()
    return { success: true }
  } catch (e: unknown) {
    return { success: false, error: String(e).slice(0, 200) }
  }
}

/**
 * Add a step to a project.
 *
 * Open to anyone signed in, because the team board needs it: work turns up that
 * was not in the plan, and the alternative is people keeping it somewhere the
 * plan cannot see. A non-admin may only assign it to themselves — adding work
 * to someone else's list is a management action.
 */
export async function addStep(
  projectId: string,
  name: string,
  extra?: { assignee_id?: string | null; due_date?: string | null; duration_days?: number },
): Promise<Result> {
  const member = await getSessionMember()
  if (!member) return { success: false, error: 'not_authenticated' }
  if (!name.trim()) return { success: false, error: 'Name cannot be empty' }

  let assignee = extra?.assignee_id ?? null
  if (member.access !== 'admin' && assignee && assignee !== member.id) {
    return { success: false, error: 'Only an admin can add work to someone else’s list.' }
  }
  if (member.access !== 'admin') assignee = assignee ?? member.id

  const last = await prisma.projectStep.findFirst({
    where: { project_id: projectId }, orderBy: { sort_order: 'desc' }, select: { sort_order: true },
  })
  await prisma.projectStep.create({
    data: {
      project_id: projectId,
      name: name.trim(),
      assignee_id: assignee,
      due_date: extra?.due_date ? new Date(extra.due_date) : null,
      duration_days: extra?.duration_days ?? 1,
      sort_order: (last?.sort_order ?? -1) + 1,
    },
  })
  revalidateAll()
  return { success: true }
}

/** Projects a step can be added to, for the team board's "add task" form. */
export async function listProjectsForPicker(): Promise<{ id: string; name: string; brandName: string | null }[]> {
  const member = await getSessionMember()
  if (!member) return []
  const rows = await prisma.project.findMany({
    orderBy: [{ focus: 'desc' }, { name: 'asc' }],
    select: { id: true, name: true, brand: { select: { name: true } } },
  })
  return rows.map(r => ({ id: r.id, name: r.name, brandName: r.brand?.name ?? null }))
}

/** Tombstoned for the same reason as a project — see removeProject. A step
 *  added in the app has no plan key and cannot be re-imported, so there is
 *  nothing to record for those. */
export async function removeStep(stepId: string): Promise<Result> {
  const guard = await requireAdmin()
  if (guard.error) return { success: false, error: guard.error }

  const s = await prisma.projectStep.findUnique({
    where: { id: stepId }, select: { key: true, name: true },
  })
  if (!s) return { success: false, error: 'That step no longer exists' }

  await prisma.$transaction(async tx => {
    await tx.projectStep.delete({ where: { id: stepId } })
    if (s.key) {
      await tx.tombstone.createMany({
        data: [{ kind: 'step', key: s.key, label: s.name }],
        skipDuplicates: true,
      })
    }
  })
  revalidateAll()
  return { success: true }
}

/* ── doing the work: the person it belongs to ────────────────────────────── */

/**
 * Tick a step off, or un-tick it.
 *
 * Allowed for an admin, or for the person the step is assigned to. Anyone else
 * is refused — the team board hides other people's steps, but hiding is not
 * enforcement and a server action is a URL like any other.
 */
export async function setStepDone(stepId: string, done: boolean): Promise<Result> {
  const member = await getSessionMember()
  if (!member) return { success: false, error: 'not_authenticated' }

  const step = await prisma.projectStep.findUnique({
    where: { id: stepId }, select: { assignee_id: true },
  })
  if (!step) return { success: false, error: 'not_found' }

  if (member.access !== 'admin' && step.assignee_id !== member.id) {
    return { success: false, error: 'not_authorized' }
  }

  await prisma.projectStep.update({ where: { id: stepId }, data: { done } })
  revalidateAll()
  return { success: true }
}

/* ── plan → board ────────────────────────────────────────────────────────── */

/**
 * Turn a step into a task on the pipeline board.
 *
 * The step keeps its place in the plan and gains a link to the task, so the
 * plan can show that the work has started without becoming a second, competing
 * copy of it. Pushing the same step twice is refused rather than silently
 * making a duplicate.
 *
 * The new task starts in `todo` with the step's owner, brand and date, and its
 * SLA clock begins now — it is entering the pipeline today regardless of when
 * it was planned.
 */
export async function convertStepToTask(stepId: string): Promise<{ success: boolean; taskId?: string; error?: string }> {
  const member = await getSessionMember()
  if (!member) return { success: false, error: 'not_authenticated' }
  if (member.access === 'user') return { success: false, error: 'not_authorized' }

  const step = await prisma.projectStep.findUnique({
    where: { id: stepId },
    include: { project: true, assignee: true },
  })
  if (!step) return { success: false, error: 'not_found' }
  if (step.task_id) return { success: false, error: 'This step is already on the board.' }

  const owner = step.assignee_id ?? member.id

  try {
    const task = await prisma.task.create({
      data: {
        name: step.name,
        description: `From the plan — **${step.project.name}**.`,
        brand_id: step.project.brand_id,
        task_owner_id: owner,
        initiator_role: member.role,
        status: 'todo',
        due_date: step.due_date,
        // A planned day is a working day; the board estimates in hours.
        hours_estimate: Number(step.duration_days) * 8,
        created_by: member.id,
      },
      select: { id: true },
    })

    await prisma.projectStep.update({ where: { id: stepId }, data: { task_id: task.id } })
    revalidateAll()
    return { success: true, taskId: task.id }
  } catch (e: unknown) {
    return { success: false, error: String(e).slice(0, 200) }
  }
}
