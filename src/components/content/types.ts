/**
 * The Content sheet's host contract (spec 009 contracts/content-ui.md): the
 * video sheet's api plus the content calls. KanbanBoard supplies it; the lab
 * supplies stubs with the same shape.
 */
import type { BoardView, ContentTheme, LinkRole, Member, Task } from '@/types/index'
import type { SheetApi, Result } from '@/components/sheet/types'
import type { PlanRowInput, AddPlanResult, PiecePatch, ThemePatch } from '@/actions/content'

export type { PlanRowInput, AddPlanResult, PiecePatch, ThemePatch }

export interface ContentApi extends SheetApi {
  addPlan(rows: PlanRowInput[], opts: { useSheetTitleStatus: boolean }): Promise<AddPlanResult>
  addPiece(themeId: string, input: { title: string; pillarId?: string | null }): Promise<Result & { id?: string }>
  updatePiece(taskId: string, patch: PiecePatch): Promise<Result>
  setPieceLink(taskId: string, role: LinkRole, url: string): Promise<Result>
  addTheme(name: string): Promise<Result & { id?: string }>
  saveTheme(id: string, patch: ThemePatch): Promise<Result>
  savePillar(themeId: string, input: { id?: string; name: string }): Promise<Result & { id?: string }>
  removePillar(id: string): Promise<Result>
}

export interface ContentSheetProps {
  tasks: Task[]
  themes: ContentTheme[]
  me: Member
  members: Member[]
  contentTypes: { id: string; label: string }[]
  onOpenTask(id: string): void
  /** "Open in video sheet": the video sheet of that video. */
  onOpenVideoSheet(videoId: string): void
  onView(view: BoardView): void
  api: ContentApi
}
