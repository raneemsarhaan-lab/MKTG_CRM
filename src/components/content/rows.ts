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

/**
 * A theme's tasks on one sheet. With the sheet's rows, they are the tasks its rows are linked to: the
 * theme's project may be a theme on other Spaces' sheets too, and their tasks don't belong here.
 */
export function piecesIn(tasks: Task[], themeId: string, recs?: readonly ContentRowRec[]): Task[] {
  if (!recs) return piecesOf(tasks, themeId)
  const ids = new Set(recs.filter(r => r.project_id === themeId && r.task_id).map(r => r.task_id as string))
  return tasks.filter(t => ids.has(t.id))
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
  /**
   * Spec 027 (US2): the Board tab — every task on the board (after the Board's own filter). A theme then
   * lists its board tasks whether or not they have a row, a row whose task is filtered out hides, and the
   * tasks with no theme on this sheet close the sheet in a "No theme" group.
   */
  boardTasks?: readonly Task[]
  /**
   * The Board's Mine or a filter is on. Only then do rows and pieces whose task the Board hides hide too;
   * otherwise the sheet keeps every row it has (a row whose task moved on to another board stays).
   */
  boardFiltered?: boolean
  noThemeLabel?: string
  /**
   * Spec 027 (US3): an added tab. Its rows under no theme close the tab in a group of their own, with
   * "+ Row" (the group stands for no project: `TAB_ROWS_ID`).
   */
  tabRows?: boolean
}

/**
 * The Board tab's read-only groups: "No theme", and `__none:<project id>` for a theme of another Space's
 * sheet. Not themes of this sheet, so no menu, no dragging and no "+ Row".
 */
export const NO_THEME_ID = '__none'
export const isReadOnlyTheme = (id: string) => id === NO_THEME_ID || id.startsWith(`${NO_THEME_ID}:`)
/** Spec 027 (US3): an added tab's rows under no theme. Rows go in and out of it; it has no menu. */
export const TAB_ROWS_ID = '__rows'
/** A group that isn't a theme of this sheet: no theme menu, no dragging the group. */
export const isPseudoTheme = (id: string) => isReadOnlyTheme(id) || id === TAB_ROWS_ID

/**
 * Theme, then each pillar with its rows and "+ Row", then rows with no pillar
 * and the theme's "+ Row". A row's children follow it, then "+ Child row". A
 * linked video row that's open is followed by its clips.
 */
export function buildContentRows(tasks: Task[], themesIn: ContentTheme[], o: ContentRowOptions): ContentRow[] {
  // Spec 027 (US3): in an added tab, rows under no theme sit in a last group of their own.
  const themes = o.tabRows
    ? [...themesIn, { id: TAB_ROWS_ID, name: o.noThemeLabel ?? 'No theme', brand_id: null, owner_id: null, frequency_count: null, frequency_period: null, audience: [], pillars: [] } as ContentTheme]
    : themesIn
  if (o.tabRows && o.recs) o = { ...o, recs: o.recs.map(r => (r.project_id ? r : { ...r, project_id: TAB_ROWS_ID })) }
  const rows: ContentRow[] = []
  const q = normQuery(o.query)
  let n = 1
  const byId = new Map(tasks.map(t => [t.id, t]))
  const recs = o.recs ?? []
  const shownTask = (t: Task) => (o.showArchived || !t.dropped_at) && (!o.mine || t.task_owner_id === o.me || t.assignee_id === o.me || !!t.assignee_ids?.includes(o.me))
  const onBoard = o.boardTasks ? new Set(o.boardTasks.map(t => t.id)) : null
  /** The Board's filter hides this task (only while Mine or a filter is on). */
  const hidden = (id: string) => !!(o.boardFiltered && onBoard && !onBoard.has(id))
  const boardVideos = o.boardTasks ? new Set(o.boardTasks.filter(isVideoTask).map(t => t.id)) : null
  /** A board task that is a row of its own (clips follow their video). */
  const ownRow = (t: Task) => !(t.parent_task_id && boardVideos?.has(t.parent_task_id))
  const placed = new Set<string>()
  for (const theme of themes) {
    const pieces = o.boardTasks
      ? [...new Map([...piecesIn(tasks, theme.id, o.recs).filter(t => !hidden(t.id)), ...o.boardTasks.filter(t => t.project_id === theme.id && ownRow(t))].map(t => [t.id, t])).values()]
      : piecesIn(tasks, theme.id, o.recs)
    for (const t of pieces) placed.add(t.id)
    const mineRecs = recs.filter(r => r.project_id === theme.id && (!r.task_id || !hidden(r.task_id)))
    const linkedIds = new Set(mineRecs.map(r => r.task_id).filter(Boolean) as string[])
    // Without rows (the sheet before 2b): every piece of the theme is a row. With rows, the sheet
    // shows only what was put on it — never the project's tasks from other Spaces.
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
  // Spec 027 (US2): the board's tasks with no theme on this sheet, last.
  if (o.boardTasks) {
    for (const r of recs) if (r.task_id) placed.add(r.task_id)
    const loose = o.boardTasks.filter(t => ownRow(t) && !placed.has(t.id) && shownTask(t) && (!q || matchesQuery(t.name, q))).sort(comparePieces)
    // Grouped by their theme's project when it has one (a theme of another Space's sheet: read only here),
    // then the tasks with no theme at all.
    const groups = new Map<string, { name: string; list: Task[] }>()
    for (const t of loose) {
      const name = (t as Task & { project?: { name?: string } | null }).project?.name
      const key = t.project_id && name ? `${NO_THEME_ID}:${t.project_id}` : NO_THEME_ID
      const g = groups.get(key) ?? { name: key === NO_THEME_ID ? o.noThemeLabel ?? 'No theme' : name!, list: [] }
      g.list.push(t)
      groups.set(key, g)
    }
    const ordered = [...groups].sort((a, b) => (a[0] === NO_THEME_ID ? 1 : b[0] === NO_THEME_ID ? -1 : a[1].name.localeCompare(b[1].name)))
    for (const [id, g] of ordered) {
      const theme: ContentTheme = { id, name: g.name, brand_id: null, owner_id: null, frequency_count: null, frequency_period: null, audience: [], pillars: [] }
      const collapsed = o.collapsed.has(id)
      rows.push({ kind: 'theme', key: `t:${id}`, theme, pieces: g.list, collapsed, n: n++, lines: 0 })
      if (collapsed) continue
      for (const t of g.list) {
        const clips = isVideoTask(t) ? clipsOf(tasks, t.id) : []
        const expanded = clips.length > 0 && o.expanded.has(t.id)
        rows.push({ kind: 'piece', key: `k:${t.id}`, task: t, theme, clips, expanded, n: n++, rec: null, depth: 0 })
        if (expanded) for (const c of clips) if (o.showArchived || !c.dropped_at) rows.push({ kind: 'clip', key: `q:${c.id}`, task: c, video: t, theme, n: n++ })
      }
    }
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
