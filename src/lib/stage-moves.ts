/**
 * Which stages a member may move a task to (spec 008 research R3).
 *
 * One rule for the board's drag, the task panel, bulk moves and the video
 * sheet's status menu, so what the menu offers and what the server accepts can
 * never differ (FR-021, SC-003). Pure: imported by server actions and client
 * components alike.
 *
 * The rule is the board's, unchanged: whoever holds the stage the task is
 * leaving may send it to any stage on its own path, forward or back. A review
 * stage is held by the role named in STAGE_META; a working stage by the task's
 * assignee or its owner. Admins and superusers may move any task. A dropped
 * clip may not be moved until it is restored.
 */
import type { AccessLevel, StageId } from '@/types/index'
import { STAGE_META, NINE_STAGE, EIGHT_STAGE } from '@/lib/stage-meta'

interface MoveTask {
  status: StageId | string
  nine_stage: boolean
  task_owner_id: string
  assignee_id?: string | null
  dropped_at?: string | Date | null
}
interface MoveMember { id: string; role: string; access: AccessLevel | string }

/** Whether the member holds the task's current stage (the right to hand it on). */
export function holdsStage(
  task: Pick<MoveTask, 'status' | 'task_owner_id' | 'assignee_id'>,
  member: Pick<MoveMember, 'id' | 'role'>,
): boolean {
  const meta = STAGE_META[task.status as StageId]
  if (!meta) return false
  return meta.owner_role
    ? meta.owner_role === member.role
    : task.assignee_id === member.id || task.task_owner_id === member.id
}

/** Every stage the member may move this task to, in path order; [] when none. */
export function allowedStages(task: MoveTask, member: MoveMember): StageId[] {
  if (task.dropped_at) return []
  const override = member.access === 'admin' || member.access === 'superuser'
  if (!override && !holdsStage(task, member)) return []
  const path = task.nine_stage ? NINE_STAGE : EIGHT_STAGE
  if (!path.includes(task.status as StageId)) return []
  return path.filter(s => s !== task.status)
}

/** The stage after the current one on the task's path, if any. */
export function nextOnPath(task: Pick<MoveTask, 'status' | 'nine_stage'>): StageId | null {
  const path = task.nine_stage ? NINE_STAGE : EIGHT_STAGE
  const i = path.indexOf(task.status as StageId)
  return i >= 0 && i < path.length - 1 ? path[i + 1] : null
}
