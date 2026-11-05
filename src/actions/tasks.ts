'use server'

import { revalidatePath } from 'next/cache'
import { prisma } from '@/lib/prisma'
import { getSessionMember, requireTaskCreator } from '@/lib/authz'
import { nextStageId, NINE_STAGE, EIGHT_STAGE } from '@/lib/stage-meta'
import { STAGE_META } from '@/lib/stage-meta'
import { MAX_PASTED } from '@/lib/paste-list'
import { MAX_ATTACHMENT_CHARS, MAX_ATTACHMENTS_PER_GO } from '@/lib/attachments'
import { deleteAttachmentFor } from '@/lib/attachment-delete'
import { parseClipFileName, fileNameKey } from '@/lib/clip-file-name'
import { LINK_CONTENT_TYPE, linkLabel } from '@/lib/attachments'
import { businessDaysBetween, subtractBusinessDays } from '@/lib/utils'
import { allowedStages, holdsStage } from '@/lib/stage-moves'
import { pasteColumns, writePastedValues } from '@/lib/sheet-values'
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
  if (task.dropped_at) return { success: false, shouldCelebrate: false, error: 'dropped' }

  // Own-stage check, shared with the board, the sheet and bulk moves
  // (src/lib/stage-moves.ts): a working stage belongs to the assignee or the
  // owner, a review stage to its role; admin and superuser may override.
  const isOwnStage = holdsStage(task, member)
  if (!allowedStages(task, member).includes(nextStage)) {
    return { success: false, shouldCelebrate: false, error: 'not_authorized' }
  }

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
  if (task.dropped_at) return { success: false, shouldCelebrate: false, error: 'dropped' }

  // The shared rule (src/lib/stage-moves.ts): the sheet's status menu offers
  // exactly this list, so the two can never disagree (spec 008 SC-003).
  const isOwnStage = holdsStage(task, member)
  if (!allowedStages(task, member).includes(stageId)) {
    return { success: false, shouldCelebrate: false, error: 'not_authorized' }
  }

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
  project_id?:         string | null
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
  if (patch.project_id !== undefined)         data.project_id         = patch.project_id || null
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
      project_id:         parent.project_id,
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

// ─── video sheet: clip details (spec 008) ──────────────────────────────────

export interface ClipPatch {
  clip_no?: number | null
  source?: string | null
  file_name?: string | null
  in_ms?: number | null
  out_ms?: number | null
  /** On the task itself, not the clip row. */
  published_url?: string | null
}

const DAY_MS = 24 * 60 * 60 * 1000

/** A web link we will store: http(s) only, at most 2,000 characters. */
function cleanLink(raw: string | null | undefined): string | null | false {
  const v = (raw ?? '').trim()
  if (!v) return null
  if (v.length > 2000) return false
  try {
    const u = new URL(v)
    return u.protocol === 'http:' || u.protocol === 'https:' ? u.toString() : false
  } catch { return false }
}

/** Whether a task is a clip: a child of a Video task (spec 008 data-model §1). */
async function videoOf(task: { parent_task_id: string | null }) {
  if (!task.parent_task_id) return null
  const parent = await prisma.task.findUnique({
    where: { id: task.parent_task_id },
    select: { id: true, content_type_label: true, parent_task_id: true },
  })
  return parent && parent.content_type_label === 'Video' && !parent.parent_task_id ? parent : null
}

function isUniqueViolation(e: unknown): boolean {
  return typeof e === 'object' && e !== null && (e as { code?: string }).code === 'P2002'
}

/**
 * Save a clip's details from the video sheet (spec 008 FR-037, FR-038).
 *
 * Title, editor and type go through updateTask; these are the fields only a
 * clip has, plus the published link. Same rule as editing any task. Creates
 * the details row when a clip has none yet (a subtask made before the sheet).
 */
export async function updateClip(
  taskId: string,
  patch: ClipPatch,
): Promise<{ success: boolean; error?: string; clip?: import('@/types/index').ClipDetails; published_url?: string | null }> {
  const member = await getSessionMember()
  if (!member) return { success: false, error: 'not_authenticated' }

  const task = await prisma.task.findUnique({ where: { id: taskId }, include: { clip: true } })
  if (!task) return { success: false, error: 'not_found' }
  if (!canAct(task, member)) return { success: false, error: 'not_authorized' }
  const video = await videoOf(task)
  if (!video) return { success: false, error: 'not_a_clip' }

  const data: Record<string, unknown> = {}
  if (patch.clip_no !== undefined) {
    if (patch.clip_no !== null && (!Number.isInteger(patch.clip_no) || patch.clip_no < 0 || patch.clip_no > 9999)) {
      return { success: false, error: 'bad_number' }
    }
    data.clip_no = patch.clip_no
  }
  if (patch.source !== undefined)    data.source    = (patch.source ?? '').trim().slice(0, 120) || null
  if (patch.file_name !== undefined) data.file_name = (patch.file_name ?? '').trim().slice(0, 200) || null
  for (const k of ['in_ms', 'out_ms'] as const) {
    const v = patch[k]
    if (v === undefined) continue
    if (v !== null && (!Number.isInteger(v) || v < 0 || v > DAY_MS)) return { success: false, error: 'bad_times' }
    data[k] = v
  }
  const inMs  = (data.in_ms  !== undefined ? data.in_ms  : task.clip?.in_ms)  as number | null | undefined
  const outMs = (data.out_ms !== undefined ? data.out_ms : task.clip?.out_ms) as number | null | undefined
  if (inMs != null && outMs != null && !(outMs > inMs)) return { success: false, error: 'bad_times' }

  let published: string | null | undefined
  if (patch.published_url !== undefined) {
    const link = cleanLink(patch.published_url)
    if (link === false) return { success: false, error: 'bad_link' }
    published = link
  }

  try {
    const clip = Object.keys(data).length || !task.clip
      ? await prisma.taskClip.upsert({
          where:  { task_id: taskId },
          create: { task_id: taskId, video_id: video.id, ...data },
          update: data,
        })
      : task.clip
    await prisma.task.update({
      where: { id: taskId },
      data:  { updated_at: new Date(), ...(published !== undefined ? { published_url: published } : {}) },
    })
    revalidatePath('/board')
    return {
      success: true,
      published_url: published !== undefined ? published : task.published_url,
      clip: {
        clip_no: clip.clip_no, source: clip.source, file_name: clip.file_name,
        in_ms: clip.in_ms, out_ms: clip.out_ms, video_id: clip.video_id, created_at: clip.created_at.toISOString(),
      },
    }
  } catch (e: unknown) {
    if (isUniqueViolation(e)) return { success: false, error: 'duplicate_file_name' }
    return { success: false, error: 'generic' }
  }
}

export interface ClipRowInput {
  title: string
  /** Re-read on the server; times sent by the browser are never trusted. */
  file_name?: string | null
  link?: string | null
  /** Custom column values by column id (spec 010); re-parsed here. */
  custom?: Record<string, string>
}
export interface AddedClip {
  id: string
  name: string
  clip: import('@/types/index').ClipDetails
  link_attachment: { id: string; filename: string; url: string; content_type: string; uploaded_at: string } | null
}

/** At most this many clips in one add (contracts/server.md). */
const MAX_CLIPS_PER_ADD = 200

/**
 * Add clips to a video: the sheet's Paste clips and + Clip (spec 008
 * FR-030–FR-036, research R2).
 *
 * Any signed-in member may add clips, whatever their access level: the one
 * creation path open to "user"-level members, and it can only make Reel
 * subtasks of a Video, owned by the member adding them. createTask and
 * createSubtask are unchanged (FR-036).
 *
 * Duplicates are skipped, not errors. The video row is locked first so adds to
 * one video run one at a time; the existing file names are read under that
 * lock and compared ignoring letter case. The unique index is only a last
 * guard: a unique violation inside a PostgreSQL transaction would abort every
 * later row, so it is never what detects a duplicate.
 */
export async function addClips(
  videoId: string,
  rows: ClipRowInput[],
): Promise<{ success: boolean; created?: AddedClip[]; skipped?: string[]; values?: number; error?: string }> {
  const member = await getSessionMember()
  if (!member) return { success: false, error: 'not_authenticated' }
  if (!Array.isArray(rows) || rows.length === 0) return { success: false, error: 'Nothing to add' }
  if (rows.length > MAX_CLIPS_PER_ADD) return { success: false, error: `At most ${MAX_CLIPS_PER_ADD} clips at a time` }

  const video = await prisma.task.findUnique({ where: { id: videoId } })
  if (!video) return { success: false, error: 'not_found' }
  if (video.content_type_label !== 'Video' || video.parent_task_id || video.dropped_at) {
    return { success: false, error: 'not_a_video' }
  }

  // Clean every row before touching the database.
  const clean = rows.map(r => {
    const file = (r.file_name ?? '').trim().slice(0, 200) || null
    const parsed = parseClipFileName(file)
    const link = cleanLink(r.link)
    const title = (r.title ?? '').replace(/\s+/g, ' ').trim().slice(0, 200)
      || file
      || ''
    return { title, file, parsed, link: link === false ? null : link, custom: r.custom }
  })
  if (clean.some(r => !r.title)) return { success: false, error: 'Task name cannot be empty' }

  try {
    const result = await prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM tasks WHERE id = ${videoId}::uuid FOR UPDATE`
      const existing = await tx.taskClip.findMany({
        where: { video_id: videoId },
        select: { file_name: true, task: { select: { id: true, task_owner_id: true, assignee_id: true, dropped_at: true } } },
      })
      const seen = new Set(existing.map(e => fileNameKey(e.file_name)).filter(Boolean))
      const created: AddedClip[] = []
      const skipped: string[] = []
      const now = new Date()
      const wantsValues = clean.some(r => r.custom && Object.keys(r.custom).length)
      const members = wantsValues ? await tx.member.findMany({ select: { id: true, name: true } }) : []
      const columns = wantsValues ? await pasteColumns(tx, 'video', members) : new Map()
      const admin = member.access === 'admin' || member.access === 'superuser'
      let values = 0
      for (const r of clean) {
        if (r.file) {
          const key = fileNameKey(r.file)
          if (seen.has(key)) {
            skipped.push(r.file)
            // A clip already in the sheet: its empty custom cells are filled, under the row rule (spec 010).
            const had = existing.find(e => fileNameKey(e.file_name) === key)?.task
            if (had && r.custom && !had.dropped_at && (admin || had.task_owner_id === member.id || had.assignee_id === member.id)) {
              values += await writePastedValues(tx, columns, had.id, r.custom, member.id, { onlyEmpty: true })
            }
            continue
          }
          seen.add(key)
        }
        const task = await tx.task.create({
          data: {
            name:               r.title,
            parent_task_id:     video.id,
            brand_id:           video.brand_id,
            content_type_label: 'Reel',
            platform:           video.platform,
            project_id:         video.project_id,
            task_owner_id:      member.id,
            assignee_id:        null,
            initiator_role:     member.role,
            nine_stage:         video.nine_stage,
            status:             'todo',
            stage_date:         now,
            hours_estimate:     0,
            priority:           'Medium',
            created_by:         member.id,
          },
        })
        const clip = await tx.taskClip.create({
          data: {
            task_id:   task.id,
            video_id:  video.id,
            file_name: r.file,
            clip_no:   r.parsed?.clip_no ?? null,
            source:    r.parsed?.source ?? null,
            in_ms:     r.parsed?.in_ms ?? null,
            out_ms:    r.parsed?.out_ms ?? null,
          },
        })
        const att = r.link
          ? await tx.taskAttachment.create({
              data: {
                task_id: task.id, filename: linkLabel(r.link), url: r.link,
                content_type: LINK_CONTENT_TYPE, uploaded_by: member.id,
              },
            })
          : null
        values += await writePastedValues(tx, columns, task.id, r.custom, member.id, { onlyEmpty: false })
        created.push({
          id: task.id, name: task.name,
          clip: {
            clip_no: clip.clip_no, source: clip.source, file_name: clip.file_name, in_ms: clip.in_ms,
            out_ms: clip.out_ms, video_id: clip.video_id, created_at: clip.created_at.toISOString(),
          },
          link_attachment: att
            ? { id: att.id, filename: att.filename, url: att.url ?? '', content_type: LINK_CONTENT_TYPE, uploaded_at: att.uploaded_at.toISOString() }
            : null,
        })
      }
      return { created, skipped, values }
    }, { timeout: 30_000 })

    revalidatePath('/board')
    revalidatePath('/overview')
    return { success: true, ...result }
  } catch (e: unknown) {
    // Only reachable if the lock was somehow bypassed; say so plainly.
    if (isUniqueViolation(e)) return { success: false, error: 'duplicate_file_name' }
    return { success: false, error: String(e).slice(0, 200) }
  }
}

/**
 * Attach a Drive or web link to a task (spec 008 FR-040, research R7).
 *
 * Stored as an ordinary attachment whose content type marks it as a link, so
 * it shows in the task's Attachments section and opens in a new tab. Same rule
 * as uploading. The same URL twice returns the row already there.
 */
export async function addLinkAttachment(
  taskId: string,
  url: string,
): Promise<{ success: boolean; error?: string; row?: { id: string; filename: string; url: string; content_type: string; uploaded_by: string | null; uploaded_at: string } }> {
  const member = await getSessionMember()
  if (!member) return { success: false, error: 'not_authenticated' }
  const guard = await mayAttachTo(taskId, member.id, member.access)
  if (!guard.ok) return { success: false, error: guard.error }
  const link = cleanLink(url)
  if (!link) return { success: false, error: 'bad_link' }

  const shape = (a: { id: string; filename: string; url: string | null; uploaded_by: string | null; uploaded_at: Date }) => ({
    id: a.id, filename: a.filename, url: a.url ?? link, content_type: LINK_CONTENT_TYPE,
    uploaded_by: a.uploaded_by, uploaded_at: a.uploaded_at.toISOString(),
  })
  const already = await prisma.taskAttachment.findFirst({ where: { task_id: taskId, url: link, content_type: LINK_CONTENT_TYPE } })
  if (already) return { success: true, row: shape(already) }

  const row = await prisma.taskAttachment.create({
    data: { task_id: taskId, filename: linkLabel(link), url: link, content_type: LINK_CONTENT_TYPE, uploaded_by: member.id },
  })
  revalidatePath('/board')
  return { success: true, row: shape(row) }
}

/** A task that may be dropped: a clip of a video (spec 008) or a piece of a theme (spec 009). */
async function droppable(task: { parent_task_id: string | null; project_id: string | null }): Promise<boolean> {
  if (await videoOf(task)) return true
  if (!task.project_id) return false
  const p = await prisma.project.findUnique({ where: { id: task.project_id }, select: { is_theme: true } })
  return !!p?.is_theme
}

/**
 * Drop a clip, or archive a piece: off the board, greyed in the sheets,
 * nothing deleted (spec 008 FR-060, FR-063; spec 009 FR-022). Same rule as
 * editing it. Idempotent.
 */
export async function dropTask(taskId: string): Promise<{ success: boolean; error?: string; dropped_at?: string }> {
  const member = await getSessionMember()
  if (!member) return { success: false, error: 'not_authenticated' }
  const task = await prisma.task.findUnique({ where: { id: taskId } })
  if (!task) return { success: false, error: 'not_found' }
  if (!canAct(task, member)) return { success: false, error: 'not_authorized' }
  if (!(await droppable(task))) return { success: false, error: 'not_a_clip' }
  if (task.dropped_at) return { success: true, dropped_at: task.dropped_at.toISOString() }

  const at = new Date()
  await prisma.task.update({ where: { id: taskId }, data: { dropped_at: at, updated_at: at } })
  revalidatePath('/board')
  revalidatePath('/overview')
  revalidatePath('/capacity')
  return { success: true, dropped_at: at.toISOString() }
}

/**
 * Restore a dropped clip to the board at the stage it had, with its SLA clock
 * as it was when dropped (spec 008 FR-061, research R14): the stage date moves
 * forward so the business days it had spent in its stage are the same again.
 */
export async function restoreTask(taskId: string): Promise<{ success: boolean; error?: string; stage_date?: string }> {
  const member = await getSessionMember()
  if (!member) return { success: false, error: 'not_authenticated' }
  const task = await prisma.task.findUnique({ where: { id: taskId } })
  if (!task) return { success: false, error: 'not_found' }
  if (!canAct(task, member)) return { success: false, error: 'not_authorized' }
  if (!(await droppable(task))) return { success: false, error: 'not_a_clip' }
  const ymd = (d: Date) => d.toISOString().slice(0, 10)
  if (!task.dropped_at) return { success: true, stage_date: ymd(task.stage_date) }

  const spent = businessDaysBetween(task.stage_date, task.dropped_at)
  const stageDate = subtractBusinessDays(new Date(), spent)
  // stage_date is a DATE column: store the local calendar day at UTC midnight.
  const day = new Date(Date.UTC(stageDate.getFullYear(), stageDate.getMonth(), stageDate.getDate()))
  await prisma.task.update({ where: { id: taskId }, data: { dropped_at: null, stage_date: day, updated_at: new Date() } })
  revalidatePath('/board')
  revalidatePath('/overview')
  revalidatePath('/capacity')
  return { success: true, stage_date: ymd(day) }
}

/** Spec 008's names for the same actions. */
export async function dropClip(taskId: string) { return dropTask(taskId) }
export async function restoreClip(taskId: string) { return restoreTask(taskId) }

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
      if (!path.includes(patch.status) || task.dropped_at) { refused++; continue }

      // The same rule as a drag or the sheet's menu (src/lib/stage-moves.ts).
      if (patch.status !== task.status) {
        if (!allowedStages(task, member).includes(patch.status)) { refused++; continue }
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
    if (patch.project_id !== undefined)         data.project_id         = patch.project_id || null
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
  project_id?:        string | null
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
      project_id:         input.project_id ?? null,
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
        project_id:         shared.project_id ?? null,
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
 * Files arrive already encoded as data URLs, read by the browser exactly as
 * picked: nothing is shrunk or re-encoded on the way (spec 007 FR-059). Only
 * the separate card thumbnail is a small copy.
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
): Promise<{
  success: boolean; created?: number; error?: string
  /** The stored rows, without their bytes: the panel already holds those (spec 007). */
  rows?: { id: string; filename: string; uploaded_by: string | null; uploaded_at: string; size_bytes: number | null; content_type: string | null }[]
}> {
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
    return { success: false, error: `${tooBig.filename} is over the about 5 MB limit for files on this workspace.` }
  }

  try {
    // One row at a time so each comes back with its id; the size and type are
    // read off the data URL, which is the file exactly as picked.
    const rows = []
    for (const f of clean) {
      const comma = f.data.indexOf(',')
      const meta  = f.data.slice(5, comma)                  // "image/png;base64"
      const b64   = f.data.slice(comma + 1)
      const pad   = b64.endsWith('==') ? 2 : b64.endsWith('=') ? 1 : 0
      const row = await prisma.taskAttachment.create({
        data: {
          task_id:      taskId,
          filename:     f.filename.trim().slice(0, 200),
          data:         f.data,
          uploaded_by:  member.id,
          size_bytes:   meta.endsWith(';base64') ? Math.max(0, Math.floor(b64.length * 3 / 4) - pad) : null,
          content_type: meta.split(';')[0] || null,
        },
        select: { id: true, filename: true, uploaded_by: true, uploaded_at: true, size_bytes: true, content_type: true },
      })
      rows.push({ ...row, uploaded_at: row.uploaded_at.toISOString() })
    }
    if (thumb && thumb.startsWith('data:') && thumb.length <= MAX_THUMB_CHARS) {
      await prisma.task.update({ where: { id: taskId }, data: { cover_thumb: thumb } })
    }

    revalidatePath('/board')
    revalidatePath('/overview')
    return { success: true, created: rows.length, rows }
  } catch (e: unknown) {
    return { success: false, error: String(e).slice(0, 200) }
  }
}

export async function removeAttachment(
  attachmentId: string,
): Promise<{ success: boolean; error?: string }> {
  const member = await getSessionMember()
  if (!member) return { success: false, error: 'not_authenticated' }

  // The row, the stored object and the card's preview, under the same guard
  // the keepalive DELETE route uses (spec 007, src/lib/attachment-delete.ts).
  const r = await deleteAttachmentFor(attachmentId, member)
  if (!r.ok) return { success: false, error: r.error }

  revalidatePath('/board')
  revalidatePath('/overview')
  return { success: true }
}

/**
 * Set the small preview a card shows.
 *
 * Its own action because uploads no longer pass through one. The file goes
 * straight to the bucket; only this — a few kilobytes of downscaled JPEG —
 * still belongs on the task row, because the board reads every task and cannot
 * fetch three hundred full-size pictures to draw its covers.
 */
export async function setCoverThumb(
  taskId: string,
  thumb: string,
): Promise<{ success: boolean; error?: string }> {
  const member = await getSessionMember()
  if (!member) return { success: false, error: 'not_authenticated' }

  const guard = await mayAttachTo(taskId, member.id, member.access)
  if (!guard.ok) return { success: false, error: guard.error }

  // A preview is small by construction. Anything this size is not one, and
  // storing it would put back exactly the weight the bucket just removed.
  if (!thumb.startsWith('data:image/') || thumb.length > 200_000) {
    return { success: false, error: 'That is not a preview' }
  }

  await prisma.task.update({ where: { id: taskId }, data: { cover_thumb: thumb } })
  revalidatePath('/board')
  revalidatePath('/overview')
  return { success: true }
}

/**
 * Rename a file.
 *
 * The filename is the only thing most of these rows show — an upload arrives
 * called "IMG_4471.jpg" or "Screenshot 2026-08-17 at 14.02.11.png", which
 * tells the next reader nothing. The bytes are untouched; this is the label.
 *
 * The extension is preserved rather than trusted to the typist: the grid
 * decides what is an image from the name, so a file renamed to "final cut"
 * would stop previewing itself.
 */
export async function renameAttachment(
  attachmentId: string,
  filename: string,
): Promise<{ success: boolean; filename?: string; error?: string }> {
  const member = await getSessionMember()
  if (!member) return { success: false, error: 'not_authenticated' }

  const a = await prisma.taskAttachment.findUnique({
    where: { id: attachmentId }, select: { task_id: true, filename: true },
  })
  if (!a) return { success: false, error: 'That file is already gone' }

  const guard = await mayAttachTo(a.task_id, member.id, member.access)
  if (!guard.ok) return { success: false, error: guard.error }

  // Strip what would make this a path rather than a name — separators and
  // control characters — and nothing else. Spaces, hyphens and brackets are
  // how people actually name files.
  const typed = filename
    .replace(/[\\/\u0000-\u001F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 180)
  if (!typed) return { success: false, error: 'A file needs a name' }

  const oldExt = a.filename.match(/\.[A-Za-z0-9]{1,8}$/)?.[0] ?? ''
  const next = oldExt && !typed.toLowerCase().endsWith(oldExt.toLowerCase())
    ? typed + oldExt
    : typed

  await prisma.taskAttachment.update({ where: { id: attachmentId }, data: { filename: next } })

  revalidatePath('/board')
  revalidatePath('/overview')
  return { success: true, filename: next }
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
  size_bytes: number | null; content_type: string | null
  uploaded_by: string | null; uploaded_at: string
}[]> {
  const member = await getSessionMember()
  if (!member) return []

  // Newest first, the order the panel shows (spec 007 FR-001, research R2).
  const rows = await prisma.taskAttachment.findMany({
    where: { task_id: taskId },
    orderBy: [{ uploaded_at: 'desc' }, { id: 'asc' }],
  })
  return rows.map(r => ({
    id: r.id, filename: r.filename, url: r.url, data: r.data,
    size_bytes: r.size_bytes, content_type: r.content_type,
    uploaded_by: r.uploaded_by, uploaded_at: r.uploaded_at.toISOString(),
  }))
}
