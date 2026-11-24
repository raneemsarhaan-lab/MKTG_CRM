/**
 * The Content sheet's host contract (spec 009 contracts/content-ui.md): the
 * video sheet's api plus the content calls. KanbanBoard supplies it; the lab
 * supplies stubs with the same shape.
 */
import type { BoardView, ContentTheme, LinkRole, Member, Task } from '@/types/index'
import type { ContentRowRec } from '@/lib/content-rows'
import type { SheetApi, Result, ColumnsBundle } from '@/components/sheet/types'
import type { PlanRowInput, AddPlanResult, PiecePatch, ThemePatch } from '@/actions/content'

export type { PlanRowInput, AddPlanResult, PiecePatch, ThemePatch }

export interface ContentApi extends SheetApi {
  addPlan(rows: PlanRowInput[], opts: { useSheetTitleStatus: boolean; target?: { projectId: string; pillarId?: string | null } | null }): Promise<AddPlanResult>
  addPiece(themeId: string, input: { title: string; pillarId?: string | null }): Promise<Result & { id?: string }>
  updatePiece(taskId: string, patch: PiecePatch): Promise<Result>
  setPieceLink(taskId: string, role: LinkRole, url: string): Promise<Result>
  addTheme(name: string): Promise<Result & { id?: string }>
  saveTheme(id: string, patch: ThemePatch): Promise<Result>
  savePillar(themeId: string, input: { id?: string; name: string }): Promise<Result & { id?: string }>
  removePillar(id: string): Promise<Result>
  // ── Sheet 2b: rows, themes and pillars (optional: a host without them shows every piece as a row) ──
  addRow?(input: { projectId: string; pillarId?: string | null; parentId?: string | null; title: string; anchor?: { id: string; where: 'above' | 'below' } | null }): Promise<Result & { row?: ContentRowRec }>
  updateRow?(id: string, patch: { title?: string; date?: string | null; values?: Record<string, string | null> }): Promise<Result>
  moveRow?(id: string, to: { projectId: string; pillarId?: string | null; parentId?: string | null; anchor?: { id: string; where: 'above' | 'below' } | null }): Promise<Result>
  indentRow?(id: string, dir: 'in' | 'out'): Promise<Result>
  deleteRow?(id: string, opts: { task?: 'unlink' | 'delete'; children?: 'up' | 'delete' }): Promise<Result>
  rowToTask?(id: string): Promise<Result & { taskId?: string }>
  linkRowTask?(id: string, taskId: string): Promise<Result>
  /** Spec 026 (§4–§5): Make task — a new task in a Space, or an existing one; a child row makes a subtask. */
  makeTask?(id: string, opts: { spaceId?: string | null; taskId?: string | null; type?: string | null }): Promise<Result & { taskId?: string }>
  /** Spec 026 (§4): unlink — the row keeps its last values as plain text. */
  unlinkRow?(id: string): Promise<Result>
  addSheetTheme?(input: { projectId?: string; newProject?: ThemePatch & { name: string }; anchor?: { projectId: string; where: 'above' | 'below' } | null }): Promise<Result & { projectId?: string }>
  reorderThemes?(projectId: string, target: string, where: 'before' | 'after'): Promise<Result>
  removeSheetTheme?(projectId: string, dest: { projectId: string; pillarId?: string | null } | null): Promise<Result>
  addPillarAt?(projectId: string, name: string, anchor?: { pillarId: string; where: 'above' | 'below' } | null): Promise<Result & { id?: string }>
  reorderPillars?(projectId: string, pillarId: string, target: string, where: 'before' | 'after'): Promise<Result>
  removePillarTo?(pillarId: string, dest: { projectId: string; pillarId?: string | null } | null): Promise<Result>
  themeCandidates?(): Promise<{ id: string; name: string }[]>
}

export interface ContentSheetProps {
  /** Spec 022 (US4): the linked Space's stages. */
  stages?: import('@/components/spaces/useSpaceStages').SpaceStagesApi | null
  tasks: Task[]
  themes: ContentTheme[]
  me: Member
  members: Member[]
  contentTypes: { id: string; label: string }[]
  onOpenTask(id: string): void
  /** "Open in video sheet": the video sheet of that video. */
  onOpenVideoSheet(videoId: string): void
  onView(view: BoardView): void
  /** The header's search (spec 011 R6): narrows rows by title. */
  query?: string
  api: ContentApi
  /** The sheet's shaped columns and custom values (spec 010). */
  columns: ColumnsBundle
  /** Spec 013: saved row heights by task id. */
  rowHeights?: Record<string, number>
  /** Sheet 2b: the sheet's rows. Without them, every piece is a row in date order. */
  rows?: ContentRowRec[]
  /** Spec 026: where this sheet keeps its columns (`content`, or `rows:<spaceId>`). */
  sheet?: import('@/types/index').SheetId
  /** Spec 026: the Space whose sheet this is, and every Space a task can be made in. */
  space?: { id: string; key: string; name: string; settings?: { views?: { columns?: string[] } } | null } | null
  spaces?: { id: string; key: string; name: string; color: string; media_board?: string | null }[]
  /** Which tasks show in which Space (Make task › an existing task there). */
  taskSpaces?: { task_id: string; space_id: string }[]
}
