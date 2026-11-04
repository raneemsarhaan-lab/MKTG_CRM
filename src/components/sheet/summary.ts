/**
 * The summary line (spec 008 FR-004, data-model §3). Pure.
 *
 * Counted over every clip of the video, whatever Mine and Show dropped are set
 * to, so it always describes the video (SC-004). Dropped clips count only as
 * dropped.
 */
import type { Task } from '@/types/index'
import { VIDEO_EDITING_STAGES } from '@/lib/stage-meta'
import { clipLength } from './time'

export interface SheetSummary {
  clips: number
  totalMs: number
  editing: number
  published: number
  noLink: number
  dropped: number
}

export function summarise(clips: Pick<Task, 'status' | 'dropped_at' | 'published_url' | 'clip'>[]): SheetSummary {
  const s: SheetSummary = { clips: 0, totalMs: 0, editing: 0, published: 0, noLink: 0, dropped: 0 }
  for (const c of clips) {
    if (c.dropped_at) { s.dropped++; continue }
    s.clips++
    s.totalMs += clipLength(c.clip?.in_ms, c.clip?.out_ms) ?? 0
    if ((VIDEO_EDITING_STAGES as string[]).includes(c.status)) s.editing++
    if (c.status === 'publish') {
      s.published++
      if (!c.published_url) s.noLink++
    }
  }
  return s
}
