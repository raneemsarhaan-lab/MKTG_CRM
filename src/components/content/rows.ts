/**
 * The Content sheet's rows (spec 009 data-model §4). Pure.
 *
 * A theme row, then each pillar's row and pieces, then pieces without a
 * pillar, drafts and "+ Piece". An expanded video piece is followed by its
 * clips. Clips are not pieces: a child of a video is never listed on its own.
 */
import type { ContentTheme, Task } from '@/types/index'
import { clipsOf, isVideoTask } from '@/components/sheet/rows'

export type ContentRow =
  | { kind: 'theme'; key: string; theme: ContentTheme; pieces: Task[]; collapsed: boolean; n: number }
  | { kind: 'pillar'; key: string; theme: ContentTheme; pillar: ContentTheme['pillars'][number]; count: number; n: number }
  | { kind: 'piece'; key: string; task: Task; theme: ContentTheme; clips: Task[]; expanded: boolean; n: number }
  | { kind: 'clip'; key: string; task: Task; video: Task; theme: ContentTheme; n: number }
  | { kind: 'draft'; key: string; theme: ContentTheme; pillarId: string | null; n: number }
  | { kind: 'add'; key: string; theme: ContentTheme }

/** Children of a video are clips, not pieces. */
export function piecesOf(tasks: Task[], themeId: string): Task[] {
  const videos = new Set(tasks.filter(isVideoTask).map(t => t.id))
  return tasks.filter(t => t.project_id === themeId && !(t.parent_task_id && videos.has(t.parent_task_id)))
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
}

export function buildContentRows(tasks: Task[], themes: ContentTheme[], o: ContentRowOptions): ContentRow[] {
  const rows: ContentRow[] = []
  let n = 1
  const visible = (t: Task) => (o.showArchived || !t.dropped_at) && (!o.mine || t.task_owner_id === o.me || t.assignee_id === o.me)
  for (const theme of themes) {
    const pieces = piecesOf(tasks, theme.id).sort(comparePieces)
    const collapsed = o.collapsed.has(theme.id)
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
