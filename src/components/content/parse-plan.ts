/**
 * Reading a pasted Content Library plan (spec 009 FR-030–FR-035, research R8).
 *
 * Google Sheets copies merged cells as `rowspan`: gridFromHtml expands them,
 * which also carries Theme, Owner, Frequency, Audience and Pillar down to every
 * row they cover. Plain text has blanks instead, so readPlan carries them down
 * itself. Columns are matched by their headings. Pure: the DOMParser is passed
 * in, so the rest runs in Node.
 */
import type { AudienceKey, FrequencyPeriod, StageId, Task, Member, ContentTheme } from '@/types/index'
import {
  readStatus, readType, readFrequency, readAudience, taskIdFromLink, isWebLink, norm,
} from '@/lib/content-plan'
import type { PastedCell } from '@/components/sheet/parse-clips'

export type PlanColumn =
  | 'theme' | 'owner' | 'frequency' | 'audience' | 'pillar' | 'title' | 'type' | 'status'
  | 'doc' | 'design' | 'task' | 'post' | 'published'

/** The reference's column order, for rows pasted without their heading row. */
export const DEFAULT_ORDER: PlanColumn[] = [
  'theme', 'owner', 'frequency', 'audience', 'pillar', 'title', 'type', 'status', 'doc', 'design', 'task', 'post', 'published',
]
const HEADINGS: Record<string, PlanColumn> = {
  theme: 'theme', owner: 'owner', frequency: 'frequency', targetaudience: 'audience', audience: 'audience',
  pillar: 'pillar', piecetitle: 'title', title: 'title', piece: 'title', type: 'type', status: 'status',
  workingdoc: 'doc', doc: 'doc', document: 'doc', designlink: 'design', design: 'design',
  tasklink: 'task', task: 'task', linkedinlink: 'post', linkedin: 'post', postlink: 'post', post: 'post',
  publishedlink: 'published', published: 'published', publishlink: 'published',
}
export const LINK_COLUMNS = ['doc', 'design', 'post', 'published'] as const
export type LinkColumn = typeof LINK_COLUMNS[number]

/** Max rows read from one paste. */
export const MAX_PLAN_ROWS = 300

/** text/html with rowspan and colspan expanded into a full grid. */
export function gridFromHtml(html: string, parser: { parseFromString(s: string, type: 'text/html'): Document }): PastedCell[][] {
  const doc = parser.parseFromString(html, 'text/html')
  doc.querySelectorAll('style, script').forEach(n => n.remove())
  const grid: PastedCell[][] = []
  Array.from(doc.querySelectorAll('tr')).forEach((tr, r) => {
    grid[r] = grid[r] ?? []
    let c = 0
    for (const td of Array.from(tr.querySelectorAll('td, th'))) {
      while (grid[r][c]) c++
      const a = td.querySelector('a[href]') as HTMLAnchorElement | null
      const href = a?.getAttribute('href') ?? null
      const cell: PastedCell = { text: (td.textContent ?? '').replace(/\s+/g, ' ').trim(), href: href && /^https?:/i.test(href) ? href : null }
      const rs = Math.max(1, Number(td.getAttribute('rowspan') ?? 1) || 1)
      const cs = Math.max(1, Number(td.getAttribute('colspan') ?? 1) || 1)
      for (let i = 0; i < rs; i++) {
        grid[r + i] = grid[r + i] ?? []
        for (let j = 0; j < cs; j++) grid[r + i][c + j] = cell
      }
      c += cs
    }
  })
  return grid.map(row => Array.from({ length: row.length }, (_, i) => row[i] ?? { text: '', href: null }))
}

export type ProblemCode =
  | { code: 'noTitle' }
  | { code: 'badLink'; column: LinkColumn }
  | { code: 'badStatus'; status: string }
  | { code: 'missingTask' }
  | { code: 'unknownOwner'; name: string }
  | { code: 'newThemeAdmin'; name: string }
  | { code: 'mayNotAdd'; theme: string }

export interface PlanRow {
  /** 1-based, in paste order. */
  index: number
  theme: string
  owner: string
  frequency: { count: number; period: FrequencyPeriod } | null
  audience: AudienceKey[]
  pillar: string
  title: string
  type: string | null
  status: { stage: StageId; archived: boolean } | null
  statusText: string
  links: Record<LinkColumn, string | null>
  /** Cell text that wasn't a web address, per link column. */
  badLinks: Partial<Record<LinkColumn, string>>
  taskId: string | null
  problems: ProblemCode[]
}

/** The plan's rows, with columns found by their headings and merged cells carried down. */
export function readPlan(cells: PastedCell[][]): { rows: PlanRow[]; overflow: number } {
  const headAt = cells.findIndex(r => r.some(c => HEADINGS[norm(c.text)] === 'title'))
  const cols: (PlanColumn | null)[] = headAt >= 0
    ? cells[headAt].map(c => HEADINGS[norm(c.text)] ?? null)
    : DEFAULT_ORDER
  const body = headAt >= 0 ? cells.slice(headAt + 1) : cells
  const rows: PlanRow[] = []
  let overflow = 0
  const carry = { theme: '', owner: '', frequency: '', audience: '', pillar: '' }
  for (const raw of body) {
    const get = (k: PlanColumn): PastedCell | undefined => { const i = cols.indexOf(k); return i >= 0 ? raw[i] : undefined }
    const text = (k: PlanColumn) => (get(k)?.text ?? '').trim()
    if (!raw.some(c => c.text || c.href)) continue
    const theme = text('theme')
    if (theme && norm(theme) !== norm(carry.theme)) {
      carry.theme = theme; carry.owner = ''; carry.frequency = ''; carry.audience = ''; carry.pillar = ''
    }
    for (const k of ['owner', 'frequency', 'audience', 'pillar'] as const) {
      const v = text(k)
      if (v) carry[k] = v
    }
    const title = text('title')
    // Lines with no piece on them (the audience list above the table) are not rows.
    if (!title && !LINK_COLUMNS.some(k => text(k)) && !text('status') && !text('task')) continue
    if (rows.length >= MAX_PLAN_ROWS) { overflow++; continue }
    const links = {} as Record<LinkColumn, string | null>
    const badLinks: Partial<Record<LinkColumn, string>> = {}
    for (const k of LINK_COLUMNS) {
      const cell = get(k)
      const v = cell?.href ?? cell?.text ?? ''
      if (!v.trim()) { links[k] = null; continue }
      if (isWebLink(v)) links[k] = v.trim()
      else { links[k] = null; badLinks[k] = v.trim() }
    }
    const statusText = text('status')
    const status = readStatus(statusText)
    const taskCell = get('task')
    const problems: ProblemCode[] = []
    if (!title) problems.push({ code: 'noTitle' })
    for (const k of LINK_COLUMNS) if (badLinks[k]) problems.push({ code: 'badLink', column: k })
    if (!status) problems.push({ code: 'badStatus', status: statusText })
    rows.push({
      index: rows.length + 1,
      theme: carry.theme, owner: carry.owner,
      frequency: readFrequency(carry.frequency), audience: readAudience(carry.audience),
      pillar: carry.pillar, title, type: readType(text('type')), status, statusText,
      links, badLinks, taskId: taskIdFromLink(taskCell?.href ?? taskCell?.text), problems,
    })
  }
  return { rows, overflow }
}

export interface PlanContext {
  tasks: Pick<Task, 'id' | 'name' | 'project_id' | 'dropped_at' | 'parent_task_id' | 'task_owner_id' | 'assignee_id'>[]
  themes: ContentTheme[]
  members: Pick<Member, 'id' | 'name'>[]
  me: Pick<Member, 'id' | 'access'>
}
export type Classified = PlanRow & {
  kind: 'fresh' | 'linked' | 'existing' | 'problem'
  themeIsNew: boolean
  /** A matched task that sits in another theme (spec edge case). */
  otherTheme: string | null
  ownerId: string | null
}

/** Problems that don't stop a row: the cell is left empty, or the paster owns it. */
export function isWarning(p: ProblemCode): boolean {
  return p.code === 'unknownOwner' || p.code === 'badLink'
}

/** Whether a member may add pieces to a theme (research R7). */
export function mayAddTo(theme: ContentTheme | undefined, ctx: PlanContext): boolean {
  if (ctx.me.access === 'admin' || ctx.me.access === 'superuser') return true
  if (!theme) return false
  if (theme.owner_id === ctx.me.id) return true
  return ctx.tasks.some(t => t.project_id === theme.id && !t.dropped_at && (t.task_owner_id === ctx.me.id || t.assignee_id === ctx.me.id))
}

/** Matches a person by name: whole name, then first name, ignoring case. */
export function memberByName(name: string, members: PlanContext['members']): string | null {
  const n = norm(name)
  if (!n) return null
  const whole = members.find(m => norm(m.name) === n)
  if (whole) return whole.id
  const first = members.filter(m => norm(m.name.split(/\s+/)[0]) === n)
  return first.length === 1 ? first[0].id : null
}

/** Sorts the rows into new, matched by Task Link, already in the sheet, and rows with problems. */
export function classifyPlan(rows: PlanRow[], ctx: PlanContext): Classified[] {
  const byId = new Map(ctx.tasks.map(t => [t.id, t]))
  const themeByName = new Map(ctx.themes.map(t => [norm(t.name), t]))
  const seen = new Map<string, Set<string>>()   // theme → titles in this paste
  const admin = ctx.me.access === 'admin' || ctx.me.access === 'superuser'
  return rows.map(r => {
    const problems = [...r.problems]
    const theme = themeByName.get(norm(r.theme))
    const themeIsNew = !theme
    const ownerId = memberByName(r.owner, ctx.members)
    if (r.owner && !ownerId) problems.push({ code: 'unknownOwner', name: r.owner })
    if (themeIsNew && !admin) problems.push({ code: 'newThemeAdmin', name: r.theme })
    else if (theme && !mayAddTo(theme, ctx)) problems.push({ code: 'mayNotAdd', theme: theme.name })
    let kind: Classified['kind'] = 'fresh'
    let otherTheme: string | null = null
    if (r.taskId) {
      const task = byId.get(r.taskId)
      if (!task) problems.push({ code: 'missingTask' })
      else {
        kind = 'linked'
        if (task.project_id && task.project_id !== theme?.id) {
          otherTheme = ctx.themes.find(t => t.id === task.project_id)?.name ?? null
        }
      }
    } else if (theme) {
      const titles = new Set(ctx.tasks.filter(t => t.project_id === theme.id).map(t => norm(t.name)))
      if (titles.has(norm(r.title))) kind = 'existing'
    }
    const key = norm(r.theme)
    const mine = seen.get(key) ?? new Set<string>()
    if (kind === 'fresh' && mine.has(norm(r.title))) kind = 'existing'
    mine.add(norm(r.title)); seen.set(key, mine)
    // An unknown owner falls back to the person pasting, and a cell that isn't a
    // link is left empty: notes, not blockers. Nothing else is added unfixed.
    const blocking = problems.filter(p => !isWarning(p))
    if (blocking.length && kind !== 'existing') kind = 'problem'
    return { ...r, problems, kind, themeIsNew, otherTheme, ownerId }
  })
}
