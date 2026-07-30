import { Stage, StageId, Task } from '../types'

export const STAGES: Stage[] = [
  { id: 'todo',         label: 'تاسكاتك ياسطا',       phase: 'content', reviewer: '',           skip8: false },
  { id: 'c-prog',       label: 'الشغل اللي شايلاه',   phase: 'content', reviewer: '',           skip8: false },
  { id: 'c-final',      label: 'C-Final',              phase: 'content', reviewer: 'MM check',  skip8: false },
  { id: 'c-check',      label: 'C-Check',              phase: 'content', reviewer: 'MD review', skip8: true  },
  { id: 'r-design',     label: 'Ready for Design',     phase: 'design',  reviewer: '',           skip8: false },
  { id: 'd-prog',       label: 'D-In Progress',        phase: 'design',  reviewer: '',           skip8: false },
  { id: 'd-check',      label: 'D-Check',              phase: 'design',  reviewer: 'BD review', skip8: false },
  { id: 'final-check',  label: 'Final Check',          phase: 'design',  reviewer: 'MM review', skip8: false },
  { id: 'publish',      label: 'امتى بتسلم يعني؟',    phase: 'design',  reviewer: '',           skip8: false },
]

export const STAGE_MAP: Record<StageId, Stage> = Object.fromEntries(
  STAGES.map(s => [s.id, s])
) as Record<StageId, Stage>

/** Returns stages for a given initiator role (8 or 9 stage flow) */
export function getStageFlow(initiatorRole: string): Stage[] {
  if (initiatorRole === 'Content Creator') {
    return STAGES
  }
  return STAGES.filter(s => !s.skip8)
}

/** Returns the next stage id in the flow, or null if at end */
export function getNextStage(task: Task): StageId | null {
  const flow = getStageFlow(task.initiator)
  const idx = flow.findIndex(s => s.id === task.status)
  if (idx === -1 || idx >= flow.length - 1) return null
  return flow[idx + 1].id
}

/** Returns the previous stage id in the flow, or null if at start */
export function getPrevStage(task: Task): StageId | null {
  const flow = getStageFlow(task.initiator)
  const idx = flow.findIndex(s => s.id === task.status)
  if (idx <= 0) return null
  return flow[idx - 1].id
}

/** Determines whose "turn" it is at a given stage */
export function getStageOwner(task: Task, stageId: StageId): string {
  switch (stageId) {
    case 'todo':         return task.assignee
    case 'c-prog':       return task.assignee
    case 'c-final':      return 'Raneem'
    case 'c-check':      return 'Islam'
    case 'r-design':     return task.assignee
    case 'd-prog':       return task.assignee
    case 'd-check':      return 'Brand Director'
    case 'final-check':  return 'Raneem'
    case 'publish':      return task.assignee
    default:             return task.assignee
  }
}

export const SLA_DEFAULTS: Record<StageId, number> = {
  'todo':        3,
  'c-prog':      4,
  'c-final':     2,
  'c-check':     2,
  'r-design':    1,
  'd-prog':      3,
  'd-check':     2,
  'final-check': 2,
  'publish':     1,
}
