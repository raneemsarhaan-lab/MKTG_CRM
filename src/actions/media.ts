'use server'

/**
 * Media links (spec 022 US3, contracts/server-actions.md, R4, R10, R11, R14, R19).
 *
 *   - linkToMedia: Link task on the content side — link a content task to an
 *     unlinked Design/Video task, or create new linked media tasks.
 *   - createMediaTask: Create task on a media board — an unlinked media task
 *     that starts at Ready For Design.
 *   - unlinkMedia: anyone may unlink; both tasks stay and move separately.
 *   - linkFromCalendar: Link task on a calendar day — makes the content task
 *     (that day is its publishing date) and links it.
 */
import { mayLink } from '@/lib/space-settings'
import { homeSpaceOf } from '@/lib/space-settings-server'
import { revalidatePath } from 'next/cache'
import { prisma } from '@/lib/prisma'
import { getSessionMember } from '@/lib/authz'
import type { MediaBoard } from '@/types/index'
import { MEDIA_BOARDS, isMediaBoard, spaceForBoard } from '@/lib/media'
import { addAssignee } from '@/lib/needs-linked-task'
import { addSpaces, loadSpaceContext } from '@/lib/spaces-server'
import { defaultAssigneeFor, type SpaceLike } from '@/lib/spaces'
import { newTaskDates } from '@/lib/due-dates-server'
import { follow, notify, notifyAfter } from '@/lib/notify/notify'

type Fail = { success: false; error: string }
const AFTER_D_CHECK = ['final-check', 'ready-publish', 'scheduled', 'publish']

function revalidate() {
  revalidatePath('/', 'layout')
}

async function boardSpaces() {
  const ctx = await loadSpaceContext()
  const holders = await prisma.member.findMany({ select: { id: true, name: true, role: true } })
  const spaceOf = (b: MediaBoard) => spaceForBoard(b, ctx.spaces as (SpaceLike & { key: string; media_board?: string | null; default_assignee_role?: string | null })[])
  const personFor = (b: MediaBoard) => {
    const s = spaceOf(b)
    return s ? defaultAssigneeFor(s, holders, ctx.members[s.id] ?? []) : null
  }
  return { ctx, spaceOf, personFor }
}

/** Spec 024 (§6): who may link and unlink — the roles its Space names (admins and superusers always). */
async function canLink(me: { access: string; role: string | null }, contentTaskId: string): Promise<boolean> {
  const home = await homeSpaceOf(contentTaskId)
  return !home || mayLink(home.settings, me)
}

/**
 * Link task: link `contentTaskId` to an unlinked media task, or create one
 * linked media task per board. Refuses a content task at F-Check or later (R11).
 */
export async function linkToMedia(
  contentTaskId: string,
  target: { mediaTaskId: string } | { create: { boards: MediaBoard[]; name?: string } },
): Promise<{ success: true; linked: string[] } | Fail> {
  const me = await getSessionMember()
  if (!me) return { success: false, error: 'not_authenticated' }
  const content = await prisma.task.findUnique({ where: { id: contentTaskId } })
  if (!content || content.dropped_at) return { success: false, error: 'not_found' }
  if (content.media_board) return { success: false, error: 'not_content_task' }
  if (AFTER_D_CHECK.includes(content.status)) return { success: false, error: 'past_d_check' }
  if (!await canLink(me, content.id)) return { success: false, error: 'not_authorized' }

  // QA 26 Nov 2026 (F21, owner): there are no linked copies — the same task shows on the other boards.
  // Linking a separate Design or Video task is refused; links made before stay as they are.
  if ('mediaTaskId' in target) return { success: false, error: 'one_task' }

  const boards = [...new Set((target.create.boards ?? []).filter(isMediaBoard))]
  if (!boards.length) return { success: false, error: 'invalid' }
  const { spaceOf, personFor } = await boardSpaces()
  const links = boards.map(board => ({ board, spaceId: spaceOf(board)?.id ?? '', assigneeId: personFor(board) })).filter(l => l.spaceId)
  if (!links.length) return { success: false, error: 'no_board' }
  // Owner's decision, 25 Nov 2026: nothing is copied. The task itself goes on the chosen boards and
  // stays in Content; each board's person joins its assignees.
  const added = await prisma.$transaction(async tx => {
    await addSpaces(tx, content.id, links.map(l => l.spaceId), 'handoff', me.id)
    await tx.task.update({ where: { id: content.id }, data: { auto_linked_at: content.auto_linked_at ?? new Date(), updated_at: new Date() } })
    const people: string[] = []
    for (const l of links) if (l.assigneeId && await addAssignee(tx, content.id, l.assigneeId)) people.push(l.assigneeId)
    return [...new Set(people)]
  })
  await notifyAfter(async tx => {
    const out: string[] = []
    for (const who of added) {
      if (who === me.id) continue
      await follow(tx, content.id, who, { clearMute: true })
      out.push(...await notify(tx, { kind: 'assigned', actorId: me.id, taskId: content.id, assigneeId: who }))
    }
    return out
  })
  revalidate()
  return { success: true, linked: [content.id] }
}

/** Create task on a media board: an unlinked media task at Ready For Design (SLA from there). */
export async function createMediaTask(
  board: MediaBoard,
  input: { name: string; brand_id?: string | null; assignee_id?: string | null; publish_date?: string | null; due_date?: string | null },
): Promise<{ success: true; id: string } | Fail> {
  const me = await getSessionMember()
  if (!me) return { success: false, error: 'not_authenticated' }
  if (!isMediaBoard(board)) return { success: false, error: 'invalid' }
  const name = (input.name ?? '').replace(/\s+/g, ' ').trim().slice(0, 200)
  if (!name) return { success: false, error: 'no_name' }
  const { ctx, spaceOf, personFor } = await boardSpaces()
  const space = spaceOf(board)
  if (!space) return { success: false, error: 'no_board' }
  // Members of the board's Space, superusers and admins.
  if (me.access === 'user' && !(ctx.members[space.id] ?? []).includes(me.id)) return { success: false, error: 'not_authorized' }
  const assignee = me.access === 'user' ? me.id : input.assignee_id ?? personFor(board) ?? me.id
  const dates = await newTaskDates(input.publish_date ?? null, input.due_date ?? null)
  const t = await prisma.task.create({
    data: {
      name, brand_id: input.brand_id || null, task_owner_id: me.id, assignee_id: assignee, initiator_role: me.role, created_by: me.id,
      status: 'r-design', stage_date: new Date(), entry_stage: 'r-design', media_board: board, ...dates,
    },
    select: { id: true },
  })
  await addSpaces(prisma, t.id, [space.id], 'created', me.id)
  await notifyAfter(async tx => {
    await follow(tx, t.id, me.id)
    if (assignee !== me.id) return notify(tx, { kind: 'assigned', actorId: me.id, taskId: t.id, assigneeId: assignee })
    return []
  })
  revalidate()
  return { success: true, id: t.id }
}

/** Unlink (R14: anyone). The media task keeps its stage and moves on alone; the content task is released. */
export async function unlinkMedia(mediaTaskId: string): Promise<{ success: true; contentTaskId: string } | Fail> {
  const me = await getSessionMember()
  if (!me) return { success: false, error: 'not_authenticated' }
  const m = await prisma.task.findUnique({ where: { id: mediaTaskId }, select: { id: true, media_board: true, content_task_id: true, dropped_at: true } })
  if (!m || !m.media_board || !m.content_task_id) return { success: false, error: 'not_linked' }
  if (!await canLink(me, m.content_task_id)) return { success: false, error: 'not_authorized' }
  await prisma.task.update({ where: { id: m.id }, data: { content_task_id: null, updated_at: new Date() } })
  revalidate()
  return { success: true, contentTaskId: m.content_task_id }
}

/** Undo for Unlink: link the same media task back (same checks as Link task). */
export async function relinkMedia(mediaTaskId: string, contentTaskId: string) {
  return linkToMedia(contentTaskId, { mediaTaskId })
}

/**
 * Link task on a calendar day (R19): makes the content task (`name`, that day
 * as its publishing date, in that Space) and links it to an unlinked media
 * task, or creates linked media tasks.
 */
export async function linkFromCalendar(
  spaceId: string | null,
  day: string,
  name: string,
  target: { mediaTaskId: string } | { create: { boards: MediaBoard[] } },
): Promise<{ success: true; contentTaskId: string } | Fail> {
  const me = await getSessionMember()
  if (!me) return { success: false, error: 'not_authenticated' }
  const n = (name ?? '').replace(/\s+/g, ' ').trim().slice(0, 200)
  if (!n || !/^\d{4}-\d{2}-\d{2}$/.test(day)) return { success: false, error: 'invalid' }
  // QA 26 Nov 2026 (F21): refused before anything is made.
  if ('mediaTaskId' in target) return { success: false, error: 'one_task' }
  const { createTask } = await import('@/actions/tasks')
  let brand: string | null = null
  if (!brand) brand = (await prisma.brand.findFirst({ orderBy: { name: 'asc' }, select: { id: true } }))?.id ?? null
  if (!brand) return { success: false, error: 'no_brand' }
  const made = await createTask({ name: n, brand_id: brand, content_type_label: '', task_owner_id: me.id, assignee_id: me.access === 'user' ? me.id : undefined, publish_date: day, space_id: spaceId })
  if (!made.success || !made.id) return { success: false, error: made.error ?? 'generic' }
  const linked = await linkToMedia(made.id, { create: { boards: target.create.boards } })
  if (!linked.success) return linked
  return { success: true, contentTaskId: made.id }
}

/** The boards a member can create on, for the board header (members of that Space, superusers, admins). */
export async function mediaBoardsFor(): Promise<MediaBoard[]> {
  const me = await getSessionMember()
  if (!me) return []
  const { ctx, spaceOf } = await boardSpaces()
  return MEDIA_BOARDS.filter(b => { const s = spaceOf(b); return !!s && (me.access !== 'user' || (ctx.members[s.id] ?? []).includes(me.id)) })
}
