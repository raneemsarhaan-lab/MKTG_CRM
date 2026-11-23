/**
 * Team Spaces (spec 021): which Spaces a task shows in, and when a move needs
 * the hand-off box. Pure — imported by server actions, the seed migration,
 * client components and the lab alike, so the rules can't drift apart.
 *
 * A task lives in its brand. A Space only lists it: a Shows in row is added
 * when the task is created from the Space, when its assignee belongs to the
 * Space, at hand-off, or by hand, and only ever removed by hand (FR-032).
 */
import type { StageId, TaskKind, TaskSpaceVia } from '@/types/index'
import { NINE_STAGE, EIGHT_STAGE } from '@/lib/stage-meta'
import { DESIGN_HALF_START } from '@/lib/stage-moves'

export interface SpaceLike {
  id: string
  key?: string
  is_production: boolean
  default_kind: TaskKind | string
  archived_at?: string | Date | null
}

export interface SpaceTask {
  status: StageId | string
  nine_stage: boolean
  kind?: TaskKind | string | null
  content_type_label?: string | null
  assignee_id?: string | null
  /** Spec 022: set on a media task. */
  media_board?: string | null
  /** Spec 022 (R5): set once a content task has been linked at Ready For Design. */
  auto_linked_at?: string | Date | null
}

/** Space id → member ids. */
export type MembersBySpace = Record<string, string[]>

const live = (s: SpaceLike) => !s.archived_at

export const isProduction = (s: SpaceLike): boolean => s.is_production && live(s)

export const isVideoType = (type?: string | null): boolean => type === 'Video' || type === 'Reel'

const kindOf = (t: Pick<SpaceTask, 'kind'>): TaskKind => (t.kind === 'simple' ? 'simple' : 'pipeline')

/** Where a stage sits on the task's own path; -1 when it isn't on it. */
function indexOn(task: Pick<SpaceTask, 'nine_stage'>, stage: StageId | string): number {
  return (task.nine_stage ? NINE_STAGE : EIGHT_STAGE).indexOf(stage as StageId)
}

/** True once the task is at Ready For Design or later on its path. */
export function inDesignHalf(task: Pick<SpaceTask, 'status' | 'nine_stage'>): boolean {
  const at = indexOn(task, task.status)
  return at >= 0 && at >= indexOn(task, DESIGN_HALF_START)
}

/**
 * The Spaces an assignee brings with them (FR-029): every live Space they are a
 * member of. A Space whose default kind is 'simple' (Planning) is added only
 * for simple tasks, so assigning a writer who is also in Planning doesn't put
 * every post into Planning.
 */
export function spacesForAssignee(
  task: Pick<SpaceTask, 'kind'>,
  assigneeId: string | null | undefined,
  spaces: SpaceLike[],
  members: MembersBySpace,
): string[] {
  if (!assigneeId) return []
  // Every task starts simple now (user, 2026-11-23), so the kind no longer decides
  // placement: an assignee's Planning-type Space is skipped for every task.
  void kindOf(task)
  return spaces
    .filter(s => live(s) && (members[s.id] ?? []).includes(assigneeId))
    .filter(s => s.default_kind !== 'simple')
    .map(s => s.id)
}

/**
 * The Shows in rows a task starts with on release (FR-008):
 *   - Planning for a simple task;
 *   - otherwise Content, plus Design (other types) or Video (Video, Reel) once
 *     the task is at Ready For Design or later;
 *   - plus every Space its assignee belongs to.
 * Spaces are found by key; a missing key is skipped.
 */
export function startingSpaces(task: SpaceTask, spaces: SpaceLike[], members: MembersBySpace): string[] {
  const byKey = (k: string) => spaces.find(s => s.key === k && live(s))?.id
  const out: (string | undefined)[] = []
  if (kindOf(task) === 'simple') out.push(byKey('planning'))
  else {
    out.push(byKey('content'))
    if (inDesignHalf(task)) out.push(byKey(isVideoType(task.content_type_label) ? 'video' : 'design'))
  }
  out.push(...spacesForAssignee(task, task.assignee_id, spaces, members))
  return [...new Set(out.filter((x): x is string => !!x))]
}

/**
 * Whether moving the task to `target` needs the hand-off box (FR-030):
 * a pipeline task crossing from before Ready For Design to Ready For Design
 * or later, while it shows in no live production Space.
 */
export function needsHandoff(
  task: Pick<SpaceTask, 'status' | 'nine_stage' | 'kind' | 'media_board' | 'auto_linked_at'>,
  target: StageId | string,
  _shownIn: string[],
  _spaces: SpaceLike[],
): boolean {
  // Spec 022 (R5): a content task's first move into Ready For Design or later links it to media, once.
  if (task.media_board || task.auto_linked_at) return false
  const from = indexOn(task, task.status)
  const to = indexOn(task, target)
  const gate = indexOn(task, DESIGN_HALF_START)
  if (from < 0 || to < 0 || gate < 0) return false
  return from < gate && to >= gate
}

/**
 * What the hand-off box opens with: the production Space that fits the task's
 * type pre-ticked (Video for Video and Reel, Design otherwise), and the members
 * of every production Space as candidates.
 */
export function handoffDefaults(
  task: Pick<SpaceTask, 'content_type_label'>,
  spaces: SpaceLike[],
  members: MembersBySpace,
): { spaceIds: string[]; candidates: Record<string, string[]> } {
  const prod = spaces.filter(isProduction)
  const want = isVideoType(task.content_type_label) ? 'video' : 'design'
  const pick = prod.find(s => s.key === want) ?? prod[0]
  return {
    spaceIds: pick ? [pick.id] : [],
    candidates: Object.fromEntries(prod.map(s => [s.id, members[s.id] ?? []])),
  }
}

/** The default Spaces for a member creating a task outside any Space (FR-028). */
export function creatorSpaces(memberId: string, _kind: TaskKind, spaces: SpaceLike[], members: MembersBySpace): string[] {
  // The same for every task (user, 2026-11-23): the creator's working Spaces, not Planning.
  return spaces
    .filter(s => live(s) && (members[s.id] ?? []).includes(memberId))
    .filter(s => s.default_kind !== 'simple')
    .map(s => s.id)
}

/** Group Space membership rows into the map the helpers take. */
export function membersBySpace(rows: { space_id: string; member_id: string }[]): MembersBySpace {
  const out: MembersBySpace = {}
  for (const r of rows) (out[r.space_id] ??= []).push(r.member_id)
  return out
}

/** Job role → starting Space keys (research R3). */
export const ROLE_SPACES: Record<string, string[]> = {
  'Video Editor': ['video'],
  'Graphic Designer': ['design'],
  'Content Creator': ['content', 'planning'],
  'Digital Marketing Specialist': ['content', 'planning'],
}

export const VIA_ORDER: TaskSpaceVia[] = ['created', 'migration', 'assignee', 'handoff', 'manual']

/**
 * Spec 022 (R9): who a new task made in a Space goes to — the member holding
 * the Space's default assignee role, the first of them in the Space's member
 * list (by name) when several do; null when the Space has no role or nobody
 * holds it (the caller then uses the creator).
 */
export function defaultAssigneeFor(
  space: { id: string; default_assignee_role?: string | null } | null | undefined,
  members: { id: string; name: string; role: string }[],
  spaceMemberIds: string[],
): string | null {
  const role = space?.default_assignee_role
  if (!space || !role) return null
  const holders = members.filter(m => m.role === role)
  const inSpace = holders.filter(m => spaceMemberIds.includes(m.id)).sort((a, b) => a.name.localeCompare(b.name))
  const pick = inSpace[0] ?? [...holders].sort((a, b) => a.name.localeCompare(b.name))[0]
  return pick?.id ?? null
}
