'use server'

/**
 * The Content sheet's server actions (spec 009, contracts/server.md).
 *
 * Every value is re-read here with the same readers the preview uses
 * (src/lib/content-plan.ts): nothing from the browser is trusted, and a cell
 * that isn't a web address is never stored as a link (SC-005).
 */
import { revalidatePath } from 'next/cache'
import { prisma } from '@/lib/prisma'
import { getSessionMember } from '@/lib/authz'
import type { Prisma } from '@prisma/client'
import type { AudienceKey, FrequencyPeriod, LinkRole, StageId } from '@/types/index'
import { LINK_CONTENT_TYPE } from '@/lib/attachments'
import { periodStart } from '@/components/content/summary'
import {
  AUDIENCE_KEYS, KNOWN_TYPES, isWebLink, norm, readAudience, readFrequency, readStatus, readType, siteName, taskIdFromLink,
} from '@/lib/content-plan'

type Member = NonNullable<Awaited<ReturnType<typeof getSessionMember>>>
type Tx = Prisma.TransactionClient

const isAdmin = (m: { access: string }) => m.access === 'admin' || m.access === 'superuser'
const canAct = (t: { task_owner_id: string; assignee_id: string | null }, m: { id: string; access: string }) =>
  t.task_owner_id === m.id || t.assignee_id === m.id || isAdmin(m)

function done(paths: string[] = ['/board', '/overview', '/projects']) { paths.forEach(p => revalidatePath(p)) }

/** Whether the member may add pieces to a theme (research R7). */
async function mayAddPiece(db: Tx | typeof prisma, themeId: string, m: Member): Promise<boolean> {
  if (isAdmin(m)) return true
  const theme = await db.project.findUnique({ where: { id: themeId }, select: { owner_id: true, is_theme: true } })
  if (!theme?.is_theme) return false
  if (theme.owner_id === m.id) return true
  const mine = await db.task.count({
    where: { project_id: themeId, dropped_at: null, OR: [{ task_owner_id: m.id }, { assignee_id: m.id }] },
  })
  return mine > 0
}
async function mayEditTheme(themeId: string, m: Member): Promise<boolean> {
  if (isAdmin(m)) return true
  const theme = await prisma.project.findUnique({ where: { id: themeId }, select: { owner_id: true } })
  return theme?.owner_id === m.id
}

/** Sets (or clears) a piece's working-doc or design link: one per role. */
async function setRoleLink(db: Tx | typeof prisma, taskId: string, role: LinkRole, url: string | null, by: string, onlyIfEmpty = false) {
  const existing = await db.taskAttachment.findFirst({ where: { task_id: taskId, link_role: role } })
  if (onlyIfEmpty && existing) return existing
  if (!url) { if (existing) await db.taskAttachment.delete({ where: { id: existing.id } }); return null }
  if (existing) return db.taskAttachment.update({ where: { id: existing.id }, data: { url, filename: siteName(url) || 'Link' } })
  return db.taskAttachment.create({
    data: { task_id: taskId, url, filename: siteName(url) || 'Link', content_type: LINK_CONTENT_TYPE, link_role: role, uploaded_by: by },
  })
}

const link = (v: string | null | undefined) => (isWebLink(v) ? v!.trim() : null)

// ─── Paste plan ─────────────────────────────────────────────────────────────

export interface PlanRowInput {
  theme: string; owner?: string; frequency?: string; audience?: string; pillar?: string
  title: string; type?: string; status?: string
  working_doc?: string; design?: string; task_link?: string; post?: string; published?: string
  /** A matched task in another theme moves here only when this is true. */
  move?: boolean
}
export interface AddPlanResult {
  success: boolean; error?: string
  created?: string[]; updated?: string[]; skipped?: string[]
  themesCreated?: string[]; pillarsCreated?: string[]
  problems?: { row: number; code: string }[]
}

/**
 * Bring the Content Library in (FR-030–FR-035, research R9). One transaction
 * under an advisory lock, so two pastes never create the same theme or piece
 * twice, and a second paste of the same rows adds nothing.
 */
export async function addPlan(rows: PlanRowInput[], opts: { useSheetTitleStatus: boolean }): Promise<AddPlanResult> {
  const member = await getSessionMember()
  if (!member) return { success: false, error: 'not_authenticated' }
  if (!Array.isArray(rows) || rows.length === 0) return { success: false, error: 'Nothing to add' }
  if (rows.length > 300) return { success: false, error: 'At most 300 rows at a time' }

  const members = await prisma.member.findMany({ select: { id: true, name: true } })
  const memberByName = (name: string | undefined) => {
    const n = norm(name)
    if (!n) return null
    const whole = members.find(x => norm(x.name) === n)
    if (whole) return whole.id
    const first = members.filter(x => norm(x.name.split(/\s+/)[0]) === n)
    return first.length === 1 ? first[0].id : null
  }
  const types = (await prisma.contentType.findMany({ select: { label: true } })).map(t => t.label)

  try {
    const out = await prisma.$transaction(async tx => {
      // $executeRaw: the lock returns void, which $queryRaw cannot read back.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('content-plan'))`
      const res = { created: [] as string[], updated: [] as string[], skipped: [] as string[], themesCreated: [] as string[], pillarsCreated: [] as string[], problems: [] as { row: number; code: string }[] }
      const themeCache = new Map<string, { id: string; brand_id: string | null }>()
      const now = new Date()
      // A piece that arrives already Published was published on a day the sheet
      // doesn't say. Dated just before this week, so the import doesn't count
      // toward this week's cadence; only pieces published in Momentum do.
      const before = new Date(periodStart('week', now).getTime() - 864e5)
      const stageDateFor = (stage: string) => (stage === 'publish' ? before : now)

      for (const [i, r] of rows.entries()) {
        const row = i + 1
        const title = (r.title ?? '').replace(/\s+/g, ' ').trim().slice(0, 200)
        const themeName = (r.theme ?? '').replace(/\s+/g, ' ').trim().slice(0, 120)
        if (!title) { res.problems.push({ row, code: 'noTitle' }); continue }
        if (!themeName) { res.problems.push({ row, code: 'noTheme' }); continue }
        const status = readStatus(r.status)
        if (!status) { res.problems.push({ row, code: 'badStatus' }); continue }

        // The theme: matched by name, or created by an admin.
        const tkey = norm(themeName)
        let theme = themeCache.get(tkey)
        if (!theme) {
          const all = await tx.project.findMany({ select: { id: true, name: true, brand_id: true, is_theme: true, owner_id: true, frequency_count: true, audience: true } })
          const found = all.find(p => norm(p.name) === tkey)
          const ownerId = memberByName(r.owner)
          const freq = readFrequency(r.frequency)
          const audience = readAudience(r.audience)
          if (found) {
            await tx.project.update({
              where: { id: found.id },
              data: {
                is_theme: true,
                ...(found.owner_id ? {} : ownerId ? { owner_id: ownerId } : {}),
                ...(found.frequency_count ? {} : freq ? { frequency_count: freq.count, frequency_period: freq.period } : {}),
                ...(found.audience.length ? {} : audience.length ? { audience } : {}),
              },
            })
            theme = { id: found.id, brand_id: found.brand_id }
          } else {
            if (!isAdmin(member)) { res.problems.push({ row, code: 'newThemeAdmin' }); continue }
            const created = await tx.project.create({
              data: {
                name: themeName, standing: true, is_theme: true, owner_id: ownerId,
                frequency_count: freq?.count ?? null, frequency_period: freq?.period ?? null, audience,
              },
            })
            theme = { id: created.id, brand_id: null }
            res.themesCreated.push(themeName)
          }
          themeCache.set(tkey, theme)
        }
        if (!(await mayAddPiece(tx, theme.id, member))) { res.problems.push({ row, code: 'mayNotAdd' }); continue }

        // The pillar: matched by name within the theme, or created.
        let pillarId: string | null = null
        const pillarName = (r.pillar ?? '').replace(/\s+/g, ' ').trim().slice(0, 80)
        if (pillarName) {
          const pillars = await tx.contentPillar.findMany({ where: { project_id: theme.id } })
          const p = pillars.find(x => norm(x.name) === norm(pillarName))
          if (p) pillarId = p.id
          else {
            const created = await tx.contentPillar.create({ data: { project_id: theme.id, name: pillarName, sort_order: pillars.length } })
            pillarId = created.id
            res.pillarsCreated.push(`${themeName} · ${pillarName}`)
          }
        }

        const type = readType(r.type, types.length ? types : KNOWN_TYPES)
        const links = { doc: link(r.working_doc), design: link(r.design), post: link(r.post), published: link(r.published) }
        const taskId = taskIdFromLink(r.task_link)

        if (taskId) {
          const task = await tx.task.findUnique({ where: { id: taskId } })
          if (!task) { res.problems.push({ row, code: 'missingTask' }); continue }
          // A task in another theme moves only when the preview ticked Move here.
          if (task.project_id && task.project_id !== theme.id && !r.move) {
            const other = await tx.project.findUnique({ where: { id: task.project_id }, select: { is_theme: true } })
            if (other?.is_theme) { res.skipped.push(title); continue }
          }
          const data: Prisma.TaskUpdateInput = {
            project: { connect: { id: theme.id } },
            pillar: pillarId ? { connect: { id: pillarId } } : undefined,
            updated_at: now,
            ...(type ? { content_type: { connect: { label: type } } } : {}),
            ...(!task.post_url && links.post ? { post_url: links.post } : {}),
            ...(!task.published_url && links.published ? { published_url: links.published } : {}),
          }
          if (opts.useSheetTitleStatus) {
            data.name = title
            if (status.archived) data.dropped_at = task.dropped_at ?? now
            else if (status.stage !== task.status) {
              data.stage = { connect: { id: status.stage } }
              data.stage_date = stageDateFor(status.stage)
            }
          }
          await tx.task.update({ where: { id: taskId }, data })
          if (links.doc) await setRoleLink(tx, taskId, 'working_doc', links.doc, member.id, true)
          if (links.design) await setRoleLink(tx, taskId, 'design', links.design, member.id, true)
          res.updated.push(taskId)
          continue
        }

        // Already in this theme by title: nothing to add (FR-035).
        const same = await tx.task.findFirst({
          where: { project_id: theme.id, name: { equals: title, mode: 'insensitive' } }, select: { id: true },
        })
        if (same) { res.skipped.push(title); continue }

        const owner = memberByName(r.owner) ?? member.id
        const task = await tx.task.create({
          data: {
            name: title, project_id: theme.id, pillar_id: pillarId, brand_id: theme.brand_id,
            content_type_label: type ?? 'Post', task_owner_id: owner, assignee_id: null,
            initiator_role: member.role, status: status.stage as StageId, stage_date: stageDateFor(status.stage),
            dropped_at: status.archived ? now : null, hours_estimate: 0, priority: 'Medium', created_by: member.id,
            post_url: links.post, published_url: links.published,
          },
        })
        if (links.doc) await setRoleLink(tx, task.id, 'working_doc', links.doc, member.id)
        if (links.design) await setRoleLink(tx, task.id, 'design', links.design, member.id)
        res.created.push(task.id)
      }
      return res
    }, { timeout: 60_000 })
    done()
    return { success: true, ...out }
  } catch (e: unknown) {
    return { success: false, error: String(e).slice(0, 200) }
  }
}

// ─── Pieces ─────────────────────────────────────────────────────────────────

/** + Piece (FR-052, US7): a task in To Do, in the theme, owned by the member. */
export async function addPiece(themeId: string, input: { title: string; pillarId?: string | null }): Promise<{ success: boolean; error?: string; id?: string }> {
  const member = await getSessionMember()
  if (!member) return { success: false, error: 'not_authenticated' }
  const title = (input.title ?? '').replace(/\s+/g, ' ').trim().slice(0, 200)
  if (!title) return { success: false, error: 'Task name cannot be empty' }
  const theme = await prisma.project.findUnique({ where: { id: themeId } })
  if (!theme?.is_theme) return { success: false, error: 'not_a_theme' }
  if (!(await mayAddPiece(prisma, themeId, member))) return { success: false, error: 'may_not_add' }
  let pillarId: string | null = null
  if (input.pillarId) {
    const p = await prisma.contentPillar.findUnique({ where: { id: input.pillarId } })
    if (p?.project_id === themeId) pillarId = p.id
  }
  const task = await prisma.task.create({
    data: {
      name: title, project_id: themeId, pillar_id: pillarId, brand_id: theme.brand_id, content_type_label: 'Post',
      task_owner_id: member.id, initiator_role: member.role, status: 'todo', stage_date: new Date(),
      hours_estimate: 0, priority: 'Medium', created_by: member.id,
    },
  })
  done()
  return { success: true, id: task.id }
}

export interface PiecePatch {
  pillar_id?: string | null
  due_date?: string | null
  post_url?: string | null
  published_url?: string | null
}

/** A piece's pillar, due date and post/published links (FR-053, FR-040). */
export async function updatePiece(taskId: string, patch: PiecePatch): Promise<{ success: boolean; error?: string }> {
  const member = await getSessionMember()
  if (!member) return { success: false, error: 'not_authenticated' }
  const task = await prisma.task.findUnique({ where: { id: taskId } })
  if (!task) return { success: false, error: 'not_found' }
  if (!canAct(task, member)) return { success: false, error: 'not_authorized' }
  const data: Prisma.TaskUncheckedUpdateInput = { updated_at: new Date() }
  if (patch.pillar_id !== undefined) {
    if (patch.pillar_id) {
      const p = await prisma.contentPillar.findUnique({ where: { id: patch.pillar_id } })
      if (!p || p.project_id !== task.project_id) return { success: false, error: 'not_a_theme' }
    }
    data.pillar_id = patch.pillar_id || null
  }
  if (patch.due_date !== undefined) {
    if (patch.due_date && !/^\d{4}-\d{2}-\d{2}$/.test(patch.due_date)) return { success: false, error: 'bad_date' }
    const d = patch.due_date ? new Date(`${patch.due_date}T00:00:00Z`) : null
    if (d && Number.isNaN(d.getTime())) return { success: false, error: 'bad_date' }
    data.due_date = d
  }
  for (const k of ['post_url', 'published_url'] as const) {
    const v = patch[k]
    if (v === undefined) continue
    if (v && !isWebLink(v)) return { success: false, error: 'bad_link' }
    data[k] = v ? v.trim() : null
  }
  await prisma.task.update({ where: { id: taskId }, data })
  done(['/board'])
  return { success: true }
}

/** A piece's working doc or design link: one per role, shown in Attachments (FR-041). */
export async function setPieceLink(taskId: string, role: LinkRole, url: string): Promise<{ success: boolean; error?: string; row?: { id: string; filename: string; url: string; link_role: LinkRole; uploaded_at: string } | null }> {
  const member = await getSessionMember()
  if (!member) return { success: false, error: 'not_authenticated' }
  if (role !== 'working_doc' && role !== 'design') return { success: false, error: 'generic' }
  const task = await prisma.task.findUnique({ where: { id: taskId }, select: { task_owner_id: true, assignee_id: true } })
  if (!task) return { success: false, error: 'not_found' }
  if (!canAct(task, member)) return { success: false, error: 'not_authorized' }
  const v = (url ?? '').trim()
  if (v && !isWebLink(v)) return { success: false, error: 'bad_link' }
  const row = await setRoleLink(prisma, taskId, role, v || null, member.id)
  done(['/board'])
  return { success: true, row: row ? { id: row.id, filename: row.filename, url: row.url ?? v, link_role: role, uploaded_at: row.uploaded_at.toISOString() } : null }
}

// ─── Themes and pillars ─────────────────────────────────────────────────────

/** + Theme: an existing project by name becomes a theme; otherwise a new standing project. Admins only. */
export async function addTheme(name: string): Promise<{ success: boolean; error?: string; id?: string }> {
  const member = await getSessionMember()
  if (!member) return { success: false, error: 'not_authenticated' }
  if (!isAdmin(member)) return { success: false, error: 'may_not_edit_theme' }
  const n = (name ?? '').replace(/\s+/g, ' ').trim().slice(0, 120)
  if (!n) return { success: false, error: 'generic' }
  const all = await prisma.project.findMany({ select: { id: true, name: true } })
  const found = all.find(p => norm(p.name) === norm(n))
  const id = found
    ? (await prisma.project.update({ where: { id: found.id }, data: { is_theme: true } })).id
    : (await prisma.project.create({ data: { name: n, standing: true, is_theme: true, owner_id: member.id } })).id
  done()
  return { success: true, id }
}

export interface ThemePatch {
  name?: string
  owner_id?: string | null
  frequency_count?: number | null
  frequency_period?: FrequencyPeriod | null
  audience?: AudienceKey[]
}

/** Edit a theme (FR-012): admin, superuser or its owner. */
export async function saveTheme(id: string, patch: ThemePatch): Promise<{ success: boolean; error?: string }> {
  const member = await getSessionMember()
  if (!member) return { success: false, error: 'not_authenticated' }
  const theme = await prisma.project.findUnique({ where: { id } })
  if (!theme?.is_theme) return { success: false, error: 'not_a_theme' }
  if (!(await mayEditTheme(id, member))) return { success: false, error: 'may_not_edit_theme' }
  const data: Prisma.ProjectUncheckedUpdateInput = {}
  if (patch.name !== undefined) {
    const n = patch.name.replace(/\s+/g, ' ').trim().slice(0, 120)
    if (!n) return { success: false, error: 'generic' }
    data.name = n
  }
  if (patch.owner_id !== undefined) {
    if (patch.owner_id && !(await prisma.member.findUnique({ where: { id: patch.owner_id } }))) return { success: false, error: 'not_found' }
    data.owner_id = patch.owner_id || null
  }
  if (patch.frequency_count !== undefined || patch.frequency_period !== undefined) {
    const c = patch.frequency_count ?? null
    const p = patch.frequency_period ?? null
    if (c !== null && (!Number.isInteger(c) || c < 1 || c > 50)) return { success: false, error: 'bad_frequency' }
    if (p !== null && p !== 'week' && p !== 'month') return { success: false, error: 'bad_frequency' }
    data.frequency_count = c
    data.frequency_period = c === null ? null : p ?? 'week'
  }
  if (patch.audience !== undefined) {
    if (!Array.isArray(patch.audience) || patch.audience.some(a => !AUDIENCE_KEYS.includes(a))) return { success: false, error: 'bad_audience' }
    data.audience = AUDIENCE_KEYS.filter(k => patch.audience!.includes(k))
  }
  await prisma.project.update({ where: { id }, data })
  done()
  return { success: true }
}

/** Create or rename a pillar (FR-012). Names are unique per theme, ignoring case. */
export async function savePillar(themeId: string, input: { id?: string; name: string }): Promise<{ success: boolean; error?: string; id?: string }> {
  const member = await getSessionMember()
  if (!member) return { success: false, error: 'not_authenticated' }
  if (!(await mayEditTheme(themeId, member))) return { success: false, error: 'may_not_edit_theme' }
  const name = (input.name ?? '').replace(/\s+/g, ' ').trim().slice(0, 80)
  if (!name) return { success: false, error: 'generic' }
  const pillars = await prisma.contentPillar.findMany({ where: { project_id: themeId } })
  if (pillars.some(p => p.id !== input.id && norm(p.name) === norm(name))) return { success: false, error: 'duplicate_pillar' }
  if (input.id) {
    const p = pillars.find(x => x.id === input.id)
    if (!p) return { success: false, error: 'not_found' }
    await prisma.contentPillar.update({ where: { id: p.id }, data: { name } })
    done(['/board'])
    return { success: true, id: p.id }
  }
  const created = await prisma.contentPillar.create({ data: { project_id: themeId, name, sort_order: pillars.length } })
  done(['/board'])
  return { success: true, id: created.id }
}

/** Remove a pillar; its pieces stay in the theme with no pillar (FR-012). */
export async function removePillar(id: string): Promise<{ success: boolean; error?: string }> {
  const member = await getSessionMember()
  if (!member) return { success: false, error: 'not_authenticated' }
  const p = await prisma.contentPillar.findUnique({ where: { id } })
  if (!p) return { success: false, error: 'not_found' }
  if (!(await mayEditTheme(p.project_id, member))) return { success: false, error: 'may_not_edit_theme' }
  await prisma.contentPillar.delete({ where: { id } })
  done(['/board'])
  return { success: true }
}
