/**
 * The Content sheet's rows (spec 009 data-model §4). Pure.
 *
 * A theme row, then each pillar's row and pieces, then pieces without a
 * pillar, drafts and "+ Piece". An expanded video piece is followed by its
 * clips. Clips are not pieces: a child of a video is never listed on its own.
 */
import type { ContentTheme, Task } from '@/types/index'
import type { ContentRowRec } from '@/lib/content-rows'
import { clipsOf, isVideoTask, matchesQuery, normQuery } from '@/components/sheet/rows'

export type ContentRow =
  | { kind: 'theme'; key: string; theme: ContentTheme; pieces: Task[]; collapsed: boolean; n: number; lines: number }
  | { kind: 'pillar'; key: string; theme: ContentTheme; pillar: ContentTheme['pillars'][number]; count: number; n: number }
  /** A linked row: a task (sheet 2b: `rec` is its row; null for a task the sheet hasn't given a row yet). */
  | { kind: 'piece'; key: string; task: Task; theme: ContentTheme; clips: Task[]; expanded: boolean; n: number; rec: ContentRowRec | null; depth: 0 | 1 }
  /** Sheet 2b: a plain row — a line of the plan with no task. */
  | { kind: 'line'; key: string; rec: ContentRowRec; theme: ContentTheme; n: number; depth: 0 | 1 }
  | { kind: 'clip'; key: string; task: Task; video: Task; theme: ContentTheme; n: number }
  | { kind: 'draft'; key: string; theme: ContentTheme; pillarId: string | null; parentId: string | null; n: number }
  /** "+ Row" at the end of a theme or pillar, or "+ Child row" under a parent's children. */
  | { kind: 'add'; key: string; theme: ContentTheme; pillarId: string | null; parentId: string | null }
  /** Spec 019 stage 2: a heading when rows are grouped by stage, assignee or type instead of theme. */
  | { kind: 'group'; key: string; label: string; count: number; n: number }

/** Children of a video are clips, not pieces. */
export function piecesOf(tasks: Task[], themeId: string): Task[] {
  const videos = new Set(tasks.filter(isVideoTask).map(t => t.id))
  // Spec 021 (US5): simple tasks are never pieces on the Content sheet.
  return tasks.filter(t => t.project_id === themeId && !t.media_board && !(t.parent_task_id && videos.has(t.parent_task_id)))
}

export function comparePieces(a: Task, b: Task): number {
  // By publishing date (the Content sheet's Date), then due date.
  const da = a.publish_date ?? a.due_date ?? '9999', db = b.publish_date ?? b.due_date ?? '9999'
  if (da !== db) return da < db ? -1 : 1
  return a.created_at < b.created_at ? -1 : a.created_at > b.created_at ? 1 : a.id < b.id ? -1 : 1
}

export interface ContentDraft { key: string; themeId: string; pillarId: string | null; parentId?: string | null; anchor?: { id: string; where: 'above' | 'below' } | null }

export interface ContentRowOptions {
  mine: boolean
  showArchived: boolean
  me: string
  collapsed: ReadonlySet<string>
  expanded: ReadonlySet<string>
  drafts: readonly ContentDraft[]
  /** The header's search (spec 011 R6): piece and theme names; empty shows everything. */
  query?: string
  /** Sheet 2b: the sheet's rows. Without them every piece is a row, in date order (the sheet before 2b). */
  recs?: readonly ContentRowRec[]
}

/**
 * Theme, then each pillar with its rows and "+ Row", then rows with no pillar
 * and the theme's "+ Row". A row's children follow it, then "+ Child row". A
 * linked video row that's open is followed by its clips.
 */
export function buildContentRows(tasks: Task[], themes: ContentTheme[], o: ContentRowOptions): ContentRow[] {
  const rows: ContentRow[] = []
  const q = normQuery(o.query)
  let n = 1
  const byId = new Map(tasks.map(t => [t.id, t]))
  const recs = o.recs ?? []
  const shownTask = (t: Task) => (o.showArchived || !t.dropped_at) && (!o.mine || t.task_owner_id === o.me || t.assignee_id === o.me || !!t.assignee_ids?.includes(o.me))
  for (const theme of themes) {
    const pieces = piecesOf(tasks, theme.id)
    const mineRecs = recs.filter(r => r.project_id === theme.id)
    const linkedIds = new Set(mineRecs.map(r => r.task_id).filter(Boolean) as string[])
    // A piece the sheet has no row for yet (just made elsewhere) still shows, at the end of its group.
    let tail = 1e12
    const pseudo: ContentRowRec[] = pieces.filter(t => !linkedIds.has(t.id)).sort(comparePieces).map(t => ({
      id: `t:${t.id}`, project_id: theme.id, pillar_id: t.pillar_id ?? null, parent_id: null, position: tail++, title: t.name, date: null, values: {}, task_id: t.id, created_by: null,
    }))
    const all = [...mineRecs.filter(r => !r.task_id || byId.has(r.task_id)), ...pseudo]
    const known = new Set(theme.pillars.map(p => p.id))
    const pillarOf = (r: ContentRowRec) => (r.pillar_id && known.has(r.pillar_id) ? r.pillar_id : null)
    const themeHit = !q || matchesQuery(theme.name, q)
    const titleOf = (r: ContentRowRec) => (r.task_id ? byId.get(r.task_id)?.name ?? r.title : r.title)
    const visible = (r: ContentRowRec) => {
      const t = r.task_id ? byId.get(r.task_id) : null
      if (t ? !shownTask(t) : o.mine && r.created_by !== o.me) return false
      return themeHit || matchesQuery(titleOf(r), q)
    }
    const kids = (id: string) => all.filter(r => r.parent_id === id).sort((a, b) => a.position - b.position)
    const tops = (pillarId: string | null) => all.filter(r => !r.parent_id || !all.some(x => x.id === r.parent_id)).filter(r => pillarOf(r) === pillarId).sort((a, b) => a.position - b.position)
    const visibleTree = (r: ContentRowRec) => visible(r) || kids(r.id).some(visible)
    if (!themeHit && !all.some(visible)) continue
    const collapsed = o.collapsed.has(theme.id) && themeHit
    rows.push({ kind: 'theme', key: `t:${theme.id}`, theme, pieces, collapsed, n: n++, lines: all.filter(r => !r.task_id).length })
    if (collapsed) continue

    const pushRec = (r: ContentRowRec, depth: 0 | 1) => {
      const t = r.task_id ? byId.get(r.task_id) : null
      if (t) {
        const clips = isVideoTask(t) ? clipsOf(tasks, t.id) : []
        const expanded = clips.length > 0 && o.expanded.has(t.id)
        rows.push({ kind: 'piece', key: `k:${t.id}`, task: t, theme, clips, expanded, n: n++, rec: r.id.startsWith('t:') ? null : r, depth })
        if (expanded) for (const c of clips) if (o.showArchived || !c.dropped_at) rows.push({ kind: 'clip', key: `q:${c.id}`, task: c, video: t, theme, n: n++ })
      } else {
        rows.push({ kind: 'line', key: `l:${r.id}`, rec: r, theme, n: n++, depth })
      }
    }
    const pushDraft = (d: ContentDraft) => rows.push({ kind: 'draft', key: `d:${d.key}`, theme, pillarId: d.pillarId, parentId: d.parentId ?? null, n: n++ })
    const draftsFor = (pillarId: string | null, parentId: string | null) => o.drafts.filter(d => d.themeId === theme.id && (d.parentId ?? null) === parentId && (parentId ? true : d.pillarId === pillarId))
    /** Rows in order, with anchored drafts beside their anchors and the rest at the end. */
    const emit = (list: ContentRowRec[], drafts: ContentDraft[], depth: 0 | 1, after: (r: ContentRowRec) => void) => {
      const placed = new Set<string>()
      for (const r of list) {
        for (const d of drafts) if (d.anchor?.id === r.id && d.anchor.where === 'above') { pushDraft(d); placed.add(d.key) }
        if (visibleTree(r)) { if (visible(r)) pushRec(r, depth); after(r) }
        for (const d of drafts) if (d.anchor?.id === r.id && d.anchor.where === 'below') { pushDraft(d); placed.add(d.key) }
      }
      for (const d of drafts) if (!placed.has(d.key)) pushDraft(d)
    }
    const children = (r: ContentRowRec) => {
      const ks = kids(r.id), ds = draftsFor(null, r.id)
      if (!ks.length && !ds.length) return
      emit(ks, ds, 1, () => {})
      rows.push({ kind: 'add', key: `ac:${r.id}`, theme, pillarId: pillarOf(r), parentId: r.id })
    }
    for (const pillar of theme.pillars) {
      const list = tops(pillar.id)
      if (!themeHit && !list.some(visibleTree)) continue
      const count = list.reduce((c, r) => c + 1 + kids(r.id).length, 0)
      rows.push({ kind: 'pillar', key: `p:${pillar.id}`, theme, pillar, count, n: n++ })
      emit(list, draftsFor(pillar.id, null), 0, children)
      // "+ Row" at the end of each pillar (sheet 2b; the sheet before it had one per theme).
      if (o.recs) rows.push({ kind: 'add', key: `a:${theme.id}:${pillar.id}`, theme, pillarId: pillar.id, parentId: null })
    }
    emit(tops(null), draftsFor(null, null), 0, children)
    rows.push({ kind: 'add', key: `a:${theme.id}`, theme, pillarId: null, parentId: null })
  }
  return rows
}

/**
 * Spec 019 stage 2: the same pieces grouped another way (Group by in ⚙ Fields).
 * Each piece keeps its clips under it; theme, pillar, draft and "+ Piece" rows
 * drop out. `keyOf` null lists the pieces with no headings (None). Pure.
 */
export function regroupContent(rows: ContentRow[], keyOf: ((task: Task | null) => { key: string; label: string; order: string }) | null): ContentRow[] {
  const blocks: ContentRow[][] = []
  for (const r of rows) {
    if (r.kind === 'piece' || r.kind === 'line') blocks.push([r])
    else if (r.kind === 'clip' && blocks.length) blocks[blocks.length - 1].push(r)
  }
  const out: ContentRow[] = []
  let n = 1
  const number = (r: ContentRow): ContentRow => (r.kind === 'piece' || r.kind === 'clip' || r.kind === 'line' ? { ...r, n: n++ } : r)
  if (!keyOf) { for (const b of blocks) out.push(...b.map(number)); return out }
  const groups = new Map<string, { label: string; order: string; blocks: ContentRow[][] }>()
  for (const b of blocks) {
    const head = b[0]
    const k = keyOf(head.kind === 'piece' ? head.task : null)
    const g = groups.get(k.key)
    if (g) g.blocks.push(b); else groups.set(k.key, { label: k.label, order: k.order, blocks: [b] })
  }
  for (const [key, g] of [...groups.entries()].sort((a, b) => a[1].order.localeCompare(b[1].order))) {
    const count = g.blocks.filter(b => b[0].kind !== 'piece' || !b[0].task.dropped_at).length
    out.push({ kind: 'group', key: `g:${key}`, label: g.label, count, n: n++ })
    for (const b of g.blocks) out.push(...b.map(number))
  }
  return out
}
