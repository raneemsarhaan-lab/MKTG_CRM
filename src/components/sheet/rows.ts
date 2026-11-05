/**
 * Which rows the sheet shows, in what order (spec 008 data-model §3). Pure.
 *
 * A video is a top-level task of content type Video. A clip is any child of a
 * video, with or without clip details (subtasks made before the sheet, or by
 * "New subtask", have none, and show blank cells).
 */
import type { Task } from '@/types/index'

export type SheetTask = Task

export type SheetRow =
  | { kind: 'video'; key: string; task: SheetTask; clips: SheetTask[]; collapsed: boolean; n: number }
  | { kind: 'clip';  key: string; task: SheetTask; video: SheetTask; n: number }
  | { kind: 'draft'; key: string; video: SheetTask; n: number }
  | { kind: 'add';   key: string; video: SheetTask }

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
export function isMine(t: Pick<Task, 'assignee_id' | 'task_owner_id'>, me: string): boolean {
  return t.assignee_id === me || t.task_owner_id === me
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

export interface RowOptions {
  /** One video's sheet, or null for every video with clips. */
  videoId: string | null
  mine: boolean
  showDropped: boolean
  me: string
  collapsed: ReadonlySet<string>
  /** "+ Clip" rows not saved yet: their key and video. */
  drafts: readonly { key: string; videoId: string }[]
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
    : videosWithClips(tasks)
  const rows: SheetRow[] = []
  let n = 1
  for (const { video, clips } of groups) {
    const collapsed = o.collapsed.has(video.id)
    rows.push({ kind: 'video', key: `v:${video.id}`, task: video, clips, collapsed, n: n++ })
    if (collapsed) continue
    for (const c of clips) {
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
