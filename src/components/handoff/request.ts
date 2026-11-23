/**
 * Build the hand-off box's request from a `needs_handoff` move result and
 * the data the caller already holds (spec 021, contracts/handoff.md).
 */
import type { HandoffRequest, Member, MoveTaskResult, TaskSpace, TeamSpace } from '@/types/index'
import { spaceLabel } from '@/components/shared/NavTree/labels'

export function handoffRequest(
  res: MoveTaskResult,
  task: { id: string; name: string },
  spaces: TeamSpace[],
  taskSpaces: TaskSpace[],
  members: Member[],
  t: (k: string) => string,
): HandoffRequest | null {
  if (res.error !== 'needs_handoff' || !res.target || !res.handoff) return null
  const byId = new Map(members.map(m => [m.id, m]))
  const offered = spaces.filter(s => s.id in res.handoff!.candidates)
  return {
    taskId: task.id,
    taskName: task.name,
    target: res.target,
    shownIn: spaces.filter(s => taskSpaces.some(r => r.task_id === task.id && r.space_id === s.id)).map(s => spaceLabel(s, t)),
    spaces: offered.map(s => ({ id: s.id, key: s.key, name: spaceLabel(s, t), color: s.color })),
    ticked: res.handoff.spaceIds,
    suggested: Object.fromEntries((res.handoff.boards ?? []).map(b => [b.spaceId, b.suggested])),
    candidates: Object.fromEntries(Object.entries(res.handoff.candidates).map(([sid, ids]) => [
      sid, ids.map(id => byId.get(id)).filter((m): m is Member => !!m).map(m => ({ id: m.id, name: m.name, role: m.role })),
    ])),
  }
}
