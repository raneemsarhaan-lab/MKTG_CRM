/**
 * Media tasks (spec 022, research R1–R6). Pure: used by the server actions,
 * the views and the lab.
 *
 * A media task is a task on the Design or Video board (`media_board`). A
 * linked one has `content_task_id`. While a content task has linked media
 * tasks that haven't passed D-Check, its stage is the earliest of theirs and
 * it can't move past D-Check; once they all have, it moves to F-Check. After
 * its D-Check, a linked media task follows its content task.
 */
import type { MediaBoard, StageId } from '@/types/index'

export const MEDIA_BOARDS: MediaBoard[] = ['design', 'video']
export const isMediaBoard = (v: unknown): v is MediaBoard => v === 'design' || v === 'video'

/** The media half of the pipeline, in order; passing D-Check means reaching F-Check or later. */
const ORDER: StageId[] = ['todo', 'c-prog', 'c-final', 'c-check', 'r-design', 'd-prog', 'd-check', 'final-check', 'ready-publish', 'scheduled', 'publish']
const at = (s: string) => ORDER.indexOf(s as StageId)
export const MEDIA_STAGES: StageId[] = ['r-design', 'd-prog', 'd-check']

export interface MediaLike { id: string; status: string; media_board?: string | null; content_task_id?: string | null; dropped_at?: string | Date | null }

/** A linked media task has passed D-Check once it's at F-Check or later. */
export const passedDCheck = (m: Pick<MediaLike, 'status'>) => at(m.status) >= at('final-check')

/** The linked, live media tasks of a content task. */
export const linkedTo = <T extends MediaLike>(contentId: string, tasks: T[]): T[] =>
  tasks.filter(t => t.content_task_id === contentId && !!t.media_board && !t.dropped_at)

/** The content task's stage while it waits: the earliest stage among the media tasks that haven't passed D-Check. */
export function contentStageFrom(media: Pick<MediaLike, 'status'>[]): StageId | null {
  const open = media.filter(m => !passedDCheck(m))
  if (!open.length) return null
  return open.map(m => m.status as StageId).sort((a, b) => at(a) - at(b))[0]
}

/** Every linked media task has passed D-Check (or there are none). */
export const allMediaPassed = (media: Pick<MediaLike, 'status'>[]) => media.every(passedDCheck)

/**
 * Why a move is refused by the media rules, or null when it's fine.
 *   - a content task waiting on media can't be moved forward into or past the media half;
 *   - a linked media task that passed D-Check follows its content task.
 */
export function mediaBlock(
  task: MediaLike,
  target: StageId,
  linkedMedia: Pick<MediaLike, 'status'>[],
): 'waiting_on_media' | 'follows_content' | null {
  if (task.media_board && task.content_task_id && passedDCheck(task)) return 'follows_content'
  if (task.media_board && task.content_task_id && at(target) > at('final-check')) return 'follows_content'
  if (!task.media_board && linkedMedia.length && !allMediaPassed(linkedMedia) && at(target) > at(task.status) && at(target) >= at('r-design')) return 'waiting_on_media'
  return null
}

/** The boards a content type goes to at Ready For Design (R6). Defaults: Video and Reel → Video; others → Design. */
export function boardsFor(type: string | null | undefined, contentTypes: { label: string; media_boards?: string[] | null }[]): MediaBoard[] {
  const set = contentTypes.find(c => c.label === type)?.media_boards?.filter(isMediaBoard)
  if (set && set.length) return [...new Set(set)]
  return type === 'Video' || type === 'Reel' ? ['video'] : ['design']
}

/** The Space that is a board: marked `media_board`, else the Space with that key. */
export function spaceForBoard<S extends { id: string; key: string; media_board?: string | null; archived_at?: unknown }>(board: MediaBoard, spaces: S[]): S | undefined {
  const live = spaces.filter(s => !s.archived_at)
  return live.find(s => s.media_board === board) ?? live.find(s => s.key === board)
}

/** A linked media task is shown through its content task everywhere but its own board. */
export const isLinkedMedia = (t: MediaLike) => !!t.media_board && !!t.content_task_id
