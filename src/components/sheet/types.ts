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
  /** The sheet's shaped columns and custom values (spec 010). */
  columns: ColumnsBundle
}

// ─── Sheet columns (spec 010) ─────────────────────────────────────────────────
import type { ChoiceOption, ColumnKind, SheetColumnRecord, SheetId, SheetValues } from '@/types/index'

export interface ColumnInput {
  name: string
  kind: ColumnKind
  options?: Partial<ChoiceOption>[]
  before?: string
  after?: string
  set?: string
}
export interface ColumnPatch {
  name?: string
  kind?: ColumnKind
  options?: Partial<ChoiceOption>[]
  replace?: Record<string, string | null>
}
/** The host's column calls: optimistic where the change is known, then the server decides. */
export interface ColumnsApi {
  add(sheet: SheetId, input: ColumnInput): Promise<Result & { column?: SheetColumnRecord }>
  rename(sheet: SheetId, key: string, name: string | null): Promise<Result>
  move(sheet: SheetId, key: string, before: string | null): Promise<Result>
  setShown(sheet: SheetId, key: string, set: string, shown: boolean): Promise<Result>
  resize(sheet: SheetId, key: string, width: number): Promise<Result>
  update(id: string, patch: ColumnPatch): Promise<Result & { cleared?: number }>
  remove(id: string): Promise<Result & { values?: number }>
  restore(id: string): Promise<Result>
  setValue(columnId: string, taskId: string, raw: string): Promise<Result & { value?: string }>
  /** Admins: a new content type from a Type cell, starting with Post's deadlines. */
  addContentType(label: string): Promise<Result & { label?: string }>
}
/** What a sheet needs to shape its columns. */
export interface ColumnsBundle {
  records: SheetColumnRecord[]
  values: SheetValues
  api: ColumnsApi
}
