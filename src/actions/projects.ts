'use server'

import { revalidatePath } from 'next/cache'
import { prisma } from '@/lib/prisma'
import { getSessionMember, requireAdmin, requireTaskCreator } from '@/lib/authz'
import { MAX_PASTED } from '@/lib/paste-list'

/**
 * Plan actions.
 *
 * Three rules live here, and the differences matter:
 *
 *  - Portfolio shape — renaming, changing brand, creating a project — is
 *    management work: an admin or a superuser. It alters what every rollup
 *    says, for people with no part in the project, which is why it is not open
 *    to everyone; but a superuser already creates and edits any task, so
 *    withholding it from them was an inconsistency rather than a rule.
 *  - Deleting a project, and moving one in or out of Focus, stay admin-only.
 *    One destroys other people's steps; the other decides what the whole team
 *    is pointed at this quarter.
 *  - Maintaining a plan you work in — its delivery date, its steps' durations
 *    and dates, who holds what, which of them are milestones, and removing a
 *    step that turned out not to be needed — belongs to the people delivering
 *    it. The test is holdsAStepIn: a project you have a step in is one of
 *    yours.
 *  - Ticking a step off is done by whoever it is assigned to.
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


/** Admin or superuser — the tier that already creates and edits any task. */
function manages(access: string): boolean {
  return access === 'admin' || access === 'superuser'
}

/**
 * May this person shape this project?
 *
 * "Their projects" means the ones they are actually working in — a project
 * where they hold at least one step. That is the same principle already
 * governing steps (you can edit what is assigned to you), widened by one hop
 * so a plan can be maintained by the people delivering it rather than only by
 * an admin.
 *
 * It is deliberately not "any project": a plan you have no part in is somebody
 * else's, and reshaping it should take management.
 */
async function holdsAStepIn(projectId: string, memberId: string): Promise<boolean> {
  const n = await prisma.projectStep.count({
    where: { project_id: projectId, assignee_id: memberId },
  })
  return n > 0
}

/* ── shaping the plan ─────────────────────────────────────────────── */

export async function toggleProjectFocus(projectId: string): Promise<Result> {
  const guard = await requireAdmin()
  if (guard.error) return { success: false, error: guard.error }

  const p = await prisma.project.findUnique({ where: { id: projectId }, select: { focus: true } })
  if (!p) return { success: false, error: 'not_found' }

  await prisma.project.update({ where: { id: projectId }, data: { focus: !p.focus } })
  revalidateAll()
  return { success: true }
}

/**
 * Edit a project.
 *
 * An admin or a superuser can change anything. Someone holding a step in it can
 * change the delivery date — that is the field that moves when the work moves,
 * and making them queue behind a manager to record it is how a plan goes stale.
 *
 * Name, brand and standing stay with management. Those are portfolio shape: a
 * rename or a brand change alters what every rollup and every report says, for
 * people with no part in the project.
 */
export async function updateProject(
  projectId: string,
  patch: { name?: string; brand_id?: string | null; due_date?: string | null; standing?: boolean },
): Promise<Result> {
  const member = await getSessionMember()
  if (!member) return { success: false, error: 'not_authenticated' }

  if (!manages(member.access)) {
    if (!(await holdsAStepIn(projectId, member.id))) {
      return { success: false, error: 'You can only edit a project you hold a step in.' }
    }
    const structural = patch.name !== undefined || patch.brand_id !== undefined || patch.standing !== undefined
    if (structural) {
      return { success: false, error: 'Renaming a project or changing its brand takes an admin or a superuser.' }
    }
  }

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
  const guard = await requireTaskCreator()
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
 * An admin or superuser can change any step. Everyone else can change the ones
 * assigned to them, and the ones in a project they are working in — a plan is
 * kept honest by the team delivering it, not by a manager fielding every
 * corrected duration. Reassigning is included: handing work over is a normal
 * thing to need.
 *
 * What takes management is touching a step in a project you have no part in.
 */
export async function updateStep(
  stepId: string,
  patch: {
    name?: string; duration_days?: number; due_date?: string | null
    assignee_id?: string | null
    milestone?: boolean
    /** 'simple' | 'complex' to override, null to let the threshold decide. */
    complexity?: 'simple' | 'complex' | null
  },
): Promise<Result> {
  const member = await getSessionMember()
  if (!member) return { success: false, error: 'not_authenticated' }

  if (!manages(member.access)) {
    const step = await prisma.projectStep.findUnique({
      where: { id: stepId }, select: { assignee_id: true, project_id: true },
    })
    if (!step) return { success: false, error: 'not_found' }
    // Yours, or in a project you are working in. The second half is what lets
    // a team keep its own plan honest — durations corrected, dates moved, work
    // handed over — without an admin in the loop for every nudge.
    const mine = step.assignee_id === member.id
    if (!mine && !(await holdsAStepIn(step.project_id, member.id))) {
      return { success: false, error: 'not_authorized' }
    }
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
  if (patch.milestone !== undefined) data.milestone = patch.milestone
  if (patch.complexity !== undefined) {
    if (patch.complexity !== null && patch.complexity !== 'simple' && patch.complexity !== 'complex') {
      return { success: false, error: 'Complexity must be simple, complex, or cleared' }
    }
    // Null hands the step back to the workspace threshold. An explicit value
    // survives the threshold being changed later, which is the point of it.
    data.complexity = patch.complexity
  }

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
  if (!manages(member.access) && assignee && assignee !== member.id) {
    return { success: false, error: 'Only an admin can add work to someone else’s list.' }
  }
  if (!manages(member.access)) assignee = assignee ?? member.id

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

/**
 * Break a step into pieces.
 *
 * A sub-step is a piece of its parent, not a step of its own: no duration, no
 * date, no place in the plan's arithmetic. Splitting one day of work into five
 * named pieces must not turn it into five days, and every rollup counts
 * top-level steps only — see the schema.
 *
 * The permission is the parent's project, on the same rule as everything else
 * here: management, or somebody delivering the plan.
 */
export async function addSubstep(parentId: string, name: string): Promise<Result> {
  const member = await getSessionMember()
  if (!member) return { success: false, error: 'not_authenticated' }
  if (!name.trim()) return { success: false, error: 'Name cannot be empty' }

  const parent = await prisma.projectStep.findUnique({
    where: { id: parentId },
    select: { id: true, project_id: true, parent_id: true, assignee_id: true },
  })
  if (!parent) return { success: false, error: 'That step no longer exists' }
  if (parent.parent_id) {
    return { success: false, error: 'A sub-step cannot be broken down again.' }
  }
  if (!manages(member.access) && !(await holdsAStepIn(parent.project_id, member.id))) {
    return { success: false, error: 'You can only add to a project you hold a step in.' }
  }

  const last = await prisma.projectStep.findFirst({
    where: { parent_id: parentId }, orderBy: { sort_order: 'desc' }, select: { sort_order: true },
  })
  await prisma.projectStep.create({
    data: {
      project_id:  parent.project_id,
      parent_id:   parentId,
      name:        name.trim(),
      // Whoever holds the parent holds its pieces until somebody says
      // otherwise — a sub-step nobody owns is how a step gets forgotten.
      assignee_id: parent.assignee_id,
      duration_days: 0,
      sort_order:  (last?.sort_order ?? -1) + 1,
    },
  })
  revalidateAll()
  return { success: true }
}

/**
 * Add many steps at once, from a pasted list.
 *
 * The same permission rule as `addStep`, applied once rather than per name:
 * anyone may add to their own list, only an admin may add to someone else's.
 *
 * Order is preserved. A pasted plan is written in the order it should happen,
 * and shuffling it would make the paste worse than typing the steps out.
 */
export async function addSteps(
  projectId: string,
  names: string[],
  extra?: { assignee_id?: string | null; due_date?: string | null; duration_days?: number },
): Promise<Result & { created?: number }> {
  const member = await getSessionMember()
  if (!member) return { success: false, error: 'not_authenticated' }

  const clean = names.map(n => n.trim()).filter(Boolean)
  if (!clean.length) return { success: false, error: 'Nothing to add' }
  if (clean.length > MAX_PASTED) {
    return { success: false, error: `That is more than ${MAX_PASTED} steps in one go` }
  }

  let assignee = extra?.assignee_id ?? null
  if (!manages(member.access) && assignee && assignee !== member.id) {
    return { success: false, error: 'Only an admin can add work to someone else’s list.' }
  }
  if (!manages(member.access)) assignee = assignee ?? member.id

  const project = await prisma.project.findUnique({ where: { id: projectId }, select: { id: true } })
  if (!project) return { success: false, error: 'That project no longer exists' }

  const last = await prisma.projectStep.findFirst({
    where: { project_id: projectId }, orderBy: { sort_order: 'desc' }, select: { sort_order: true },
  })
  const base = (last?.sort_order ?? -1) + 1

  try {
    const result = await prisma.projectStep.createMany({
      data: clean.map((name, i) => ({
        project_id: projectId,
        name,
        assignee_id: assignee,
        due_date: extra?.due_date ? new Date(extra.due_date) : null,
        duration_days: extra?.duration_days ?? 1,
        sort_order: base + i,
      })),
    })
    revalidateAll()
    return { success: true, created: result.count }
  } catch (e: unknown) {
    return { success: false, error: String(e).slice(0, 200) }
  }
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

/**
 * Remove a step.
 *
 * Same rule as editing one: an admin, or someone holding a step in the same
 * project. A plan that can be corrected but not pruned still goes stale — a
 * step that turned out not to be needed has to be able to leave.
 *
 * Deleting the project itself stays admin-only. That is a different act: it
 * takes every step with it, including other people's.
 *
 * Tombstoned for the same reason as a project — see removeProject. A step
 * added in the app has no plan key and cannot be re-imported, so there is
 * nothing to record for those.
 */
export async function removeStep(stepId: string): Promise<Result> {
  const member = await getSessionMember()
  if (!member) return { success: false, error: 'not_authenticated' }

  const s = await prisma.projectStep.findUnique({
    where: { id: stepId }, select: { key: true, name: true, project_id: true },
  })
  if (!s) return { success: false, error: 'That step no longer exists' }

  if (!manages(member.access) && !(await holdsAStepIn(s.project_id, member.id))) {
    return { success: false, error: 'You can only remove a step from a project you hold a step in.' }
  }

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

  if (!manages(member.access) && step.assignee_id !== member.id) {
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
        // The step's holder is doing the work, not merely accountable for it.
        // Without this the task arrives unassigned and never reaches the one
        // person who is meant to do it — no My Day, no Only-me board, no bell.
        assignee_id: owner,
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

/* ── board ↔ plan ────────────────────────────────────────────────────────── */

/**
 * Attach a task that already exists on the board to a step in the plan.
 *
 * convertStepToTask goes one way — plan first, then board. Most work arrives
 * the other way round: somebody raises a task, and only later is it recognised
 * as the thing the plan has been calling a step. Without this the two stay
 * strangers, and the plan reports a step as untouched while the task beside it
 * is in review.
 *
 * The link is one-to-one in both directions — task_id is unique on the step —
 * so attaching a task that is already attached elsewhere is refused with the
 * name of where it went, rather than silently moving it.
 */
export async function linkStepToTask(stepId: string, taskId: string): Promise<Result> {
  const member = await getSessionMember()
  if (!member) return { success: false, error: 'not_authenticated' }

  const step = await prisma.projectStep.findUnique({
    where: { id: stepId }, select: { project_id: true, task_id: true },
  })
  if (!step) return { success: false, error: 'That step no longer exists' }

  // Same rule as maintaining the plan: management, or somebody delivering it.
  if (!manages(member.access) && !(await holdsAStepIn(step.project_id, member.id))) {
    return { success: false, error: 'You can only link work in a project you hold a step in.' }
  }

  const task = await prisma.task.findUnique({
    where: { id: taskId },
    select: { id: true, project_step: { select: { id: true, name: true } } },
  })
  if (!task) return { success: false, error: 'That task no longer exists' }
  if (task.project_step && task.project_step.id !== stepId) {
    return { success: false, error: `That task is already linked to “${task.project_step.name}”.` }
  }
  if (step.task_id && step.task_id !== taskId) {
    return { success: false, error: 'That step is already linked to a task. Unlink it first.' }
  }

  await prisma.projectStep.update({ where: { id: stepId }, data: { task_id: taskId } })
  revalidateAll()
  return { success: true }
}

/**
 * Detach a step from its task.
 *
 * Neither side is deleted. The step goes back to being planned work and the
 * task goes back to being unplanned work; unlinking is how a mistake is undone,
 * not how either is removed.
 */
export async function unlinkStepFromTask(stepId: string): Promise<Result> {
  const member = await getSessionMember()
  if (!member) return { success: false, error: 'not_authenticated' }

  const step = await prisma.projectStep.findUnique({
    where: { id: stepId }, select: { project_id: true },
  })
  if (!step) return { success: false, error: 'That step no longer exists' }

  if (!manages(member.access) && !(await holdsAStepIn(step.project_id, member.id))) {
    return { success: false, error: 'You can only unlink work in a project you hold a step in.' }
  }

  await prisma.projectStep.update({ where: { id: stepId }, data: { task_id: null } })
  revalidateAll()
  return { success: true }
}

/**
 * The steps a task could be attached to, for the picker on the task panel.
 *
 * Only steps with no task, since the link is one-to-one, and only top-level
 * ones — a sub-step is a piece of a step, not somewhere work lives. Read-only
 * and signed-in: it lists project and step names, which everyone can already
 * see on the plan.
 */
export async function listLinkableSteps(): Promise<
  { id: string; name: string; projectName: string }[]
> {
  const member = await getSessionMember()
  if (!member) return []

  const rows = await prisma.projectStep.findMany({
    where:   { task_id: null, parent_id: null },
    select:  { id: true, name: true, project: { select: { name: true } } },
    orderBy: [{ project: { name: 'asc' } }, { sort_order: 'asc' }],
    take:    500,
  })
  return rows.map(r => ({ id: r.id, name: r.name, projectName: r.project.name }))
}
