/**
 * Which rows the sheet shows, in what order (spec 008 data-model §3). Pure.
 *
 * A video is a top-level task of content type Video. A clip is any child of a
 * video, with or without clip details (subtasks made before the sheet, or by
 * "New subtask", have none, and show blank cells).
 */
import { featureOn } from '@/lib/brand-features'
import type { BrandFeatures } from '@/types/index'
import type { Task } from '@/types/index'

export type SheetTask = Task

export type SheetRow =
  | { kind: 'video'; key: string; task: SheetTask; clips: SheetTask[]; collapsed: boolean; n: number }
  | { kind: 'clip';  key: string; task: SheetTask; video: SheetTask; n: number }
  | { kind: 'draft'; key: string; video: SheetTask; n: number }
  | { kind: 'add';   key: string; video: SheetTask }
  /** Spec 019 stage 3: a heading when videos are grouped by stage or editor. */
  | { kind: 'group'; key: string; label: string; count: number; n: number }

export function isVideoTask(t: Pick<Task, 'content_type_label' | 'parent_task_id'>): boolean {
  return t.content_type_label === 'Video' && !t.parent_task_id
}

/** A clip's order: clip number (none last), then when its details were added, then when the task was. */
export function compareClips(a: SheetTask, b: SheetTask): number {
  const na = a.clip?.clip_no ?? Number.POSITIVE_INFINITY
  const nb = b.clip?.clip_no ?? Number.POSITIVE_INFINITY
  if (na !== nb) return na - nb
  const ca = a.clip?.created_at ?? a.created_at
  const cb = b.clip?.created_at ?? b.created_at
  if (ca !== cb) return ca < cb ? -1 : 1
  return a.created_at < b.created_at ? -1 : a.created_at > b.created_at ? 1 : a.id < b.id ? -1 : 1
}

/** Every clip of a video, in clip order, dropped ones included. */
export function clipsOf(tasks: SheetTask[], videoId: string): SheetTask[] {
  return tasks.filter(t => t.parent_task_id === videoId).sort(compareClips)
}

/** Whether a task belongs to the member for the Mine toggle (FR-054). */
export function isMine(t: Pick<Task, 'assignee_id' | 'task_owner_id' | 'assignee_ids'>, me: string): boolean {
  return t.assignee_id === me || t.task_owner_id === me || !!t.assignee_ids?.includes(me)
}

/** The most recent change across a video and its clips. */
function lastTouched(video: SheetTask, clips: SheetTask[]): string {
  return clips.reduce((m, c) => (c.updated_at > m ? c.updated_at : m), video.updated_at)
}

/** Videos that have at least one clip, most recently worked on first (FR-002). */
export function videosWithClips(tasks: SheetTask[]): { video: SheetTask; clips: SheetTask[] }[] {
  const byParent = new Map<string, SheetTask[]>()
  for (const t of tasks) {
    if (!t.parent_task_id) continue
    const list = byParent.get(t.parent_task_id)
    if (list) list.push(t); else byParent.set(t.parent_task_id, [t])
  }
  return tasks
    .filter(t => isVideoTask(t) && byParent.has(t.id))
    .map(video => ({ video, clips: (byParent.get(video.id) ?? []).sort(compareClips) }))
    .sort((a, b) => (lastTouched(b.video, b.clips) > lastTouched(a.video, a.clips) ? 1 : -1))
}

/**
 * The videos the sheet lists: every video with clips, and (the redesign's
 * "+ Video", design/video-sheet-v5.html) a live video without clips yet that
 * isn't published, so a new video's band is there to add clips to. Most
 * recently worked on first.
 */
export function sheetVideos(all: SheetTask[]): { video: SheetTask; clips: SheetTask[] }[] {
  // Spec 021 (US5): simple tasks are never videos or clips on the Video sheet.
  // Spec 022: media tasks live on their boards, never as videos or clips here.
  const tasks = all.filter(t => !(t as { media_board?: string | null }).media_board)
  const withClips = videosWithClips(tasks)
  const has = new Set(withClips.map(g => g.video.id))
  const empty = tasks
    .filter(t => isVideoTask(t) && !has.has(t.id) && !t.dropped_at && t.status !== 'publish')
    .map(video => ({ video, clips: [] as SheetTask[] }))
  return [...withClips, ...empty].sort((a, b) => (lastTouched(b.video, b.clips) > lastTouched(a.video, a.clips) ? 1 : -1))
}

export interface RowOptions {
  /** One video's sheet, or null for every video with clips. */
  videoId: string | null
  mine: boolean
  showDropped: boolean
  me: string
  collapsed: ReadonlySet<string>
  /** "+ Clip" rows not saved yet: their key and video. */
  drafts: readonly { key: string; videoId: string }[]
  /** The header's search (spec 011 R6): titles and file names; empty shows everything. */
  query?: string
}

/** Whether text contains the search, ignoring case and extra spaces. */
export function matchesQuery(text: string | null | undefined, q: string): boolean {
  return (text ?? '').toLowerCase().includes(q)
}
/** The search as matched: trimmed and lower-cased. */
export function normQuery(q: string | undefined): string {
  return (q ?? '').replace(/\s+/g, ' ').trim().toLowerCase()
}

/**
 * The rows, in order, with their row numbers. The video row always shows
 * (FR-053); Mine and Show dropped only filter clips. Every expanded video ends
 * with its drafts and its "+ Clip" row.
 */
export function buildRows(tasks: SheetTask[], o: RowOptions): SheetRow[] {
  const groups = o.videoId
    ? (() => {
        const video = tasks.find(t => t.id === o.videoId)
        return video ? [{ video, clips: clipsOf(tasks, video.id) }] : []
      })()
    : sheetVideos(tasks)
  const rows: SheetRow[] = []
  const q = normQuery(o.query)
  let n = 1
  for (const { video, clips } of groups) {
    // A video whose name matches keeps all its clips; otherwise only the
    // matching clips show, under their video, opened so they can be seen.
    const videoHit = !q || matchesQuery(video.name, q)
    const clipHit = (c: SheetTask) => videoHit || matchesQuery(c.name, q) || matchesQuery(c.clip?.file_name, q)
    if (!videoHit && !clips.some(clipHit)) continue
    // Spec 021 (US4): a brand with Video clips off shows its videos alone; the clips are kept.
    if (!featureOn((video as { brand?: { features?: BrandFeatures } }).brand, 'clips')) {
      if (videoHit) rows.push({ kind: 'video', key: `v:${video.id}`, task: video, clips: [], collapsed: true, n: n++ })
      continue
    }
    const collapsed = o.collapsed.has(video.id) && videoHit
    rows.push({ kind: 'video', key: `v:${video.id}`, task: video, clips, collapsed, n: n++ })
    if (collapsed) continue
    for (const c of clips) {
      if (!clipHit(c)) continue
      if (!o.showDropped && c.dropped_at) continue
      if (o.mine && !isMine(c, o.me)) continue
      rows.push({ kind: 'clip', key: `c:${c.id}`, task: c, video, n: n++ })
    }
    for (const d of o.drafts) {
      if (d.videoId === video.id) rows.push({ kind: 'draft', key: `d:${d.key}`, video, n: n++ })
    }
    rows.push({ kind: 'add', key: `a:${video.id}`, video })
  }
  return rows
}

/**
 * Spec 019 stage 3: the videos grouped by their stage or editor (Group by in
 * ⚙ Fields). Each video keeps its clips, drafts and "+ Clip" under it. Pure.
 */
export function regroupVideos(rows: SheetRow[], keyOf: (video: SheetTask) => { key: string; label: string; order: string }): SheetRow[] {
  const blocks: SheetRow[][] = []
  for (const r of rows) {
    if (r.kind === 'video') blocks.push([r])
    else if (r.kind !== 'group' && blocks.length) blocks[blocks.length - 1].push(r)
  }
  const groups = new Map<string, { label: string; order: string; blocks: SheetRow[][] }>()
  for (const b of blocks) {
    const k = keyOf((b[0] as Extract<SheetRow, { kind: 'video' }>).task)
    const g = groups.get(k.key)
    if (g) g.blocks.push(b); else groups.set(k.key, { label: k.label, order: k.order, blocks: [b] })
  }
  const out: SheetRow[] = []
  let n = 1
  for (const [key, g] of [...groups.entries()].sort((a, b) => a[1].order.localeCompare(b[1].order))) {
    out.push({ kind: 'group', key: `g:${key}`, label: g.label, count: g.blocks.length, n: n++ })
    for (const b of g.blocks) for (const r of b) out.push(r.kind === 'add' || r.kind === 'group' ? r : { ...r, n: n++ })
  }
  return out
}
