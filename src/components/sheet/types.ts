/**
 * The sheet's host contract (spec 008 contracts/sheet-ui.md §2).
 *
 * KanbanBoard supplies all of it in the app; the lab supplies stubs with the
 * same shape. Every `api` call updates the host's shared task state
 * optimistically, so the sheet keeps no copy of task data.
 */
import type { Member, MoveTaskResult, StageId, Task, BoardView } from '@/types/index'
import type { UploadFn } from '@/components/kanban/attachments/useUploadQueue'

export type Result = { success: boolean; error?: string }

export interface SheetTaskPatch {
  name?: string
  assignee_id?: string
  content_type_label?: string
}
export interface SheetClipPatch {
  clip_no?: number | null
  source?: string | null
  file_name?: string | null
  in_ms?: number | null
  out_ms?: number | null
  published_url?: string | null
}
export interface SheetClipRow { title: string; file_name?: string | null; link?: string | null }
export interface AddClipsResult extends Result { created?: { id: string }[]; skipped?: string[] }

export interface SheetApi {
  /** The board's own move: optimistic, rollback, refresh, celebration. */
  move(taskId: string, to: StageId): Promise<MoveTaskResult>
  update(taskId: string, patch: SheetTaskPatch): Promise<Result>
  updateClip(taskId: string, patch: SheetClipPatch): Promise<Result>
  addClips(videoId: string, rows: SheetClipRow[]): Promise<AddClipsResult>
  addLink(taskId: string, url: string): Promise<Result>
  upload(taskId: string): UploadFn
  drop(taskId: string): Promise<Result>
  restore(taskId: string): Promise<Result>
}

export interface VideoSheetProps {
  /** Every task, dropped ones included: the sheet filters. */
  tasks: Task[]
  me: Member
  members: Member[]
  contentTypes: { id: string; label: string }[]
  hasStorage: boolean
  /** One video's sheet, or null for every video with clips. */
  videoId: string | null
  /** A row to scroll to and highlight (?row=). */
  highlightId: string | null
  onOpenVideo(id: string | null): void
  onOpenTask(id: string, opts?: { previewId?: string }): void
  /** The toolbar's Board | Sheet switch. */
  onView(view: BoardView): void
  api: SheetApi
}
