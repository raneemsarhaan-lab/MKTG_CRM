/**
 * The Content sheet's rows (spec 009 data-model §4). Pure.
 *
 * A theme row, then each pillar's row and pieces, then pieces without a
 * pillar, drafts and "+ Piece". An expanded video piece is followed by its
 * clips. Clips are not pieces: a child of a video is never listed on its own.
 */
import type { ContentTheme, Task } from '@/types/index'
import { clipsOf, isVideoTask, matchesQuery, normQuery } from '@/components/sheet/rows'

export type ContentRow =
  | { kind: 'theme'; key: string; theme: ContentTheme; pieces: Task[]; collapsed: boolean; n: number }
  | { kind: 'pillar'; key: string; theme: ContentTheme; pillar: ContentTheme['pillars'][number]; count: number; n: number }
  | { kind: 'piece'; key: string; task: Task; theme: ContentTheme; clips: Task[]; expanded: boolean; n: number }
  | { kind: 'clip'; key: string; task: Task; video: Task; theme: ContentTheme; n: number }
  | { kind: 'draft'; key: string; theme: ContentTheme; pillarId: string | null; n: number }
  | { kind: 'add'; key: string; theme: ContentTheme }
  /** Spec 019 stage 2: a heading when rows are grouped by stage, assignee or type instead of theme. */
  | { kind: 'group'; key: string; label: string; count: number; n: number }

/** Children of a video are clips, not pieces. */
export function piecesOf(tasks: Task[], themeId: string): Task[] {
  const videos = new Set(tasks.filter(isVideoTask).map(t => t.id))
  // Spec 021 (US5): simple tasks are never pieces on the Content sheet.
  return tasks.filter(t => t.project_id === themeId && t.kind !== 'simple' && !(t.parent_task_id && videos.has(t.parent_task_id)))
}

export function comparePieces(a: Task, b: Task): number {
  const da = a.due_date ?? '9999', db = b.due_date ?? '9999'
  if (da !== db) return da < db ? -1 : 1
  return a.created_at < b.created_at ? -1 : a.created_at > b.created_at ? 1 : a.id < b.id ? -1 : 1
}

export interface ContentRowOptions {
  mine: boolean
  showArchived: boolean
  me: string
  collapsed: ReadonlySet<string>
  expanded: ReadonlySet<string>
  drafts: readonly { key: string; themeId: string; pillarId: string | null }[]
  /** The header's search (spec 011 R6): piece and theme names; empty shows everything. */
  query?: string
}

export function buildContentRows(tasks: Task[], themes: ContentTheme[], o: ContentRowOptions): ContentRow[] {
  const rows: ContentRow[] = []
  const q = normQuery(o.query)
  let n = 1
  const shown = (t: Task) => (o.showArchived || !t.dropped_at) && (!o.mine || t.task_owner_id === o.me || t.assignee_id === o.me)
  for (const theme of themes) {
    const pieces = piecesOf(tasks, theme.id).sort(comparePieces)
    // A theme whose name matches keeps all its pieces; otherwise only the
    // matching pieces show, under their theme and pillar.
    const themeHit = !q || matchesQuery(theme.name, q)
    const visible = (t: Task) => shown(t) && (themeHit || matchesQuery(t.name, q))
    if (!themeHit && !pieces.some(visible)) continue
    const collapsed = o.collapsed.has(theme.id) && themeHit
    rows.push({ kind: 'theme', key: `t:${theme.id}`, theme, pieces, collapsed, n: n++ })
    if (collapsed) continue
    const pushPiece = (task: Task) => {
      const clips = isVideoTask(task) ? clipsOf(tasks, task.id) : []
      const expanded = clips.length > 0 && o.expanded.has(task.id)
      rows.push({ kind: 'piece', key: `k:${task.id}`, task, theme, clips, expanded, n: n++ })
      if (expanded) for (const c of clips) if (o.showArchived || !c.dropped_at) rows.push({ kind: 'clip', key: `q:${c.id}`, task: c, video: task, theme, n: n++ })
    }
    const known = new Set(theme.pillars.map(p => p.id))
    for (const pillar of theme.pillars) {
      const inPillar = pieces.filter(t => t.pillar_id === pillar.id)
      if (!themeHit && !inPillar.some(visible)) continue
      rows.push({ kind: 'pillar', key: `p:${pillar.id}`, theme, pillar, count: inPillar.filter(t => !t.dropped_at).length, n: n++ })
      inPillar.filter(visible).forEach(pushPiece)
      for (const d of o.drafts) if (d.themeId === theme.id && d.pillarId === pillar.id) rows.push({ kind: 'draft', key: `d:${d.key}`, theme, pillarId: pillar.id, n: n++ })
    }
    pieces.filter(t => !t.pillar_id || !known.has(t.pillar_id)).filter(visible).forEach(pushPiece)
    for (const d of o.drafts) if (d.themeId === theme.id && !d.pillarId) rows.push({ kind: 'draft', key: `d:${d.key}`, theme, pillarId: null, n: n++ })
    rows.push({ kind: 'add', key: `a:${theme.id}`, theme })
  }
  return rows
}

/**
 * Spec 019 stage 2: the same pieces grouped another way (Group by in ⚙ Fields).
 * Each piece keeps its clips under it; theme, pillar, draft and "+ Piece" rows
 * drop out. `keyOf` null lists the pieces with no headings (None). Pure.
 */
export function regroupContent(rows: ContentRow[], keyOf: ((task: Task) => { key: string; label: string; order: string }) | null): ContentRow[] {
  const blocks: ContentRow[][] = []
  for (const r of rows) {
    if (r.kind === 'piece') blocks.push([r])
    else if (r.kind === 'clip' && blocks.length) blocks[blocks.length - 1].push(r)
  }
  const out: ContentRow[] = []
  let n = 1
  const number = (r: ContentRow): ContentRow => (r.kind === 'piece' || r.kind === 'clip' ? { ...r, n: n++ } : r)
  if (!keyOf) { for (const b of blocks) out.push(...b.map(number)); return out }
  const groups = new Map<string, { label: string; order: string; blocks: ContentRow[][] }>()
  for (const b of blocks) {
    const head = b[0] as Extract<ContentRow, { kind: 'piece' }>
    const k = keyOf(head.task)
    const g = groups.get(k.key)
    if (g) g.blocks.push(b); else groups.set(k.key, { label: k.label, order: k.order, blocks: [b] })
  }
  for (const [key, g] of [...groups.entries()].sort((a, b) => a[1].order.localeCompare(b[1].order))) {
    const count = g.blocks.filter(b => !(b[0] as Extract<ContentRow, { kind: 'piece' }>).task.dropped_at).length
    out.push({ kind: 'group', key: `g:${key}`, label: g.label, count, n: n++ })
    for (const b of g.blocks) out.push(...b.map(number))
  }
  return out
}
