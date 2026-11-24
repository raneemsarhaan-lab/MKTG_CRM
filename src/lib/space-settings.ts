/**
 * Spec 024: Space settings — how each team Space works. Pure: used by the
 * server actions, board data, client views and the lab.
 *
 * A Space's flow says where its work starts, hands off, comes back and ends.
 * The stages from "Starts at" to "Ends at" are the Space's range; while a task
 * is handed off (from "Hands off at" up to, not including, "Returns at") the
 * receiving Space owns those stages. A stage is owned by exactly one Space for
 * a given task: its media board's Space for a media task, else its home Space.
 *
 * Fields: the task type decides which fields exist; a Space only shows/hides
 * them and says which are required and before which stage. A required field is
 * checked only when a task crosses that stage in the Space that owns it, and a
 * field required before a stage earlier than the Space's start is never asked.
 */
import type { StageId } from '@/types/index'
import { ALL_STAGES } from '@/lib/stage-meta'

/** Spec 025: a Space page's views. */
export type SpaceView = 'board' | 'sheet' | 'calendar'
export type SpaceCreators = 'everyone' | 'members' | 'leads'
export type SpaceVisibility = 'members' | 'everyone'
export type HandoffAsk = 'ask' | 'default'
/** Task panel sections under the top rows, in the order they can be arranged (the top rows and the activity rail stay put). */
export const PANEL_SECTIONS = ['above', 'description', 'below', 'fields', 'subtasks', 'attachments'] as const
export type PanelSection = typeof PANEL_SECTIONS[number]

export interface SpaceFlow {
  start: StageId
  /** Null: work never leaves this Space. */
  handoff: StageId | null
  /** Space keys the work goes to at "Hands off at" ('content' for back to Content). */
  handoff_to: string[]
  /** Null: work doesn't come back. */
  return: StageId | null
  end: StageId
}

export interface FieldRule {
  shown?: boolean
  /** Undefined keeps the task type's own rule. */
  required?: boolean
  /** Required before this stage; undefined keeps the type's stage. */
  before?: StageId | null
}

export interface SpaceSettings {
  name_ar: string | null
  icon: string | null
  visibility: SpaceVisibility
  flow: SpaceFlow
  new_label: { en: string; ar: string } | null
  /** Empty: every task type. */
  allowed_types: string[]
  default_type: string | null
  default_priority: string | null
  creators: SpaceCreators
  child_rows: boolean
  fields: Record<string, FieldRule>
  section_order: PanelSection[]
  views: { default: SpaceView; sort: 'due' | 'publish' | 'priority' | 'name' | 'created' | 'updated'; group: 'none' | 'stage' | 'brand' | 'statusGroup'; columns: string[] }
  linking: { roles: string[]; handoff: HandoffAsk }
  rules: {
    owners: Partial<Record<StageId, string>>
    approvers: Partial<Record<StageId, string>>
    /** Working days (Sunday–Thursday, Cairo); overrides the type's SLA for stages this Space owns. */
    sla: Partial<Record<StageId, number>>
    notify: { enter: string[]; overdue: string[]; back: string[] }
  }
}

const LINK_ROLES = ['Content Creator', 'Digital Marketing Specialist']

const base = (flow: SpaceFlow, extra: Partial<SpaceSettings> = {}): SpaceSettings => ({
  name_ar: null, icon: null, visibility: 'members', flow,
  new_label: null, allowed_types: [], default_type: null, default_priority: null,
  creators: 'members', child_rows: true, fields: {}, section_order: [...PANEL_SECTIONS],
  views: { default: 'board', sort: 'due', group: 'none', columns: [] },
  linking: { roles: [...LINK_ROLES], handoff: 'ask' },
  rules: { owners: {}, approvers: {}, sla: {}, notify: { enter: [], overdue: [], back: [] } },
  ...extra,
})

/** The defaults per Space key (spec 024 §2 table). Planning: the whole pipeline, no hand-off. */
export function defaultSettings(key: string): SpaceSettings {
  switch (key) {
    case 'content':
      return base({ start: 'todo', handoff: 'r-design', handoff_to: ['design', 'video'], return: 'final-check', end: 'publish' },
        { name_ar: 'المحتوى', icon: '✍️', new_label: { en: 'New post', ar: 'منشور جديد' }, default_type: 'Post', views: { default: 'sheet', sort: 'due', group: 'none', columns: [] } })
    case 'design':
      return base({ start: 'r-design', handoff: 'd-check', handoff_to: ['content'], return: null, end: 'd-check' },
        { name_ar: 'التصميم', icon: '🎨', new_label: { en: 'New design', ar: 'تصميم جديد' }, default_type: 'Post' })
    case 'video':
      return base({ start: 'r-design', handoff: 'd-check', handoff_to: ['content'], return: null, end: 'd-check' },
        { name_ar: 'الفيديو', icon: '🎬', new_label: { en: 'New clip', ar: 'مقطع جديد' }, allowed_types: ['Video', 'Reel'], default_type: 'Reel', child_rows: true, views: { default: 'sheet', sort: 'due', group: 'none', columns: [] } })
    case 'planning':
      return base({ start: 'todo', handoff: null, handoff_to: [], return: null, end: 'publish' },
        { name_ar: 'التخطيط', icon: '🗂️' })
    default:
      return base({ start: 'todo', handoff: null, handoff_to: [], return: null, end: 'publish' })
  }
}

export const stageAt = (s: string | null | undefined) => (s ? ALL_STAGES.indexOf(s as StageId) : -1)
const isStage = (s: unknown): s is StageId => typeof s === 'string' && (ALL_STAGES as string[]).includes(s)
const str = (v: unknown, max = 60) => (typeof v === 'string' && v.trim() ? v.trim().replace(/\s+/g, ' ').slice(0, max) : null)
const strs = (v: unknown, max = 60) => (Array.isArray(v) ? [...new Set(v.map(x => str(x, max)).filter((x): x is string => !!x))] : [])
const pick = <T extends string>(v: unknown, list: readonly T[], dflt: T): T => (list.includes(v as T) ? v as T : dflt)

/** Stored settings over the Space's defaults, every value checked. Unknown keys are dropped. */
export function resolveSettings(key: string, stored: unknown): SpaceSettings {
  const d = defaultSettings(key)
  const s = (stored && typeof stored === 'object' ? stored : {}) as Record<string, unknown>
  const f = (s.flow && typeof s.flow === 'object' ? s.flow : {}) as Record<string, unknown>
  const flow: SpaceFlow = {
    start: isStage(f.start) ? f.start : d.flow.start,
    handoff: f.handoff === null ? null : isStage(f.handoff) ? f.handoff : d.flow.handoff,
    handoff_to: Array.isArray(f.handoff_to) ? strs(f.handoff_to, 40) : d.flow.handoff_to,
    return: f.return === null ? null : isStage(f.return) ? f.return : d.flow.return,
    end: isStage(f.end) ? f.end : d.flow.end,
  }
  const lbl = s.new_label && typeof s.new_label === 'object' ? s.new_label as Record<string, unknown> : null
  const fields: Record<string, FieldRule> = {}
  if (s.fields && typeof s.fields === 'object') {
    for (const [id, r] of Object.entries(s.fields as Record<string, unknown>)) {
      if (!r || typeof r !== 'object') continue
      const x = r as Record<string, unknown>
      const rule: FieldRule = {}
      if (typeof x.shown === 'boolean') rule.shown = x.shown
      if (typeof x.required === 'boolean') rule.required = x.required
      if (x.before === null) rule.before = null
      else if (isStage(x.before)) rule.before = x.before
      if (Object.keys(rule).length) fields[id] = rule
    }
  }
  const order = strs(s.section_order, 20).filter((x): x is PanelSection => (PANEL_SECTIONS as readonly string[]).includes(x))
  const v = (s.views && typeof s.views === 'object' ? s.views : {}) as Record<string, unknown>
  const l = (s.linking && typeof s.linking === 'object' ? s.linking : {}) as Record<string, unknown>
  const r = (s.rules && typeof s.rules === 'object' ? s.rules : {}) as Record<string, unknown>
  const stageMap = <T>(m: unknown, ok: (x: unknown) => T | null): Partial<Record<StageId, T>> => {
    const out: Partial<Record<StageId, T>> = {}
    if (m && typeof m === 'object') for (const [k, x] of Object.entries(m as Record<string, unknown>)) { const y = ok(x); if (isStage(k) && y !== null) out[k] = y }
    return out
  }
  const n = (r.notify && typeof r.notify === 'object' ? r.notify : {}) as Record<string, unknown>
  return {
    name_ar: 'name_ar' in s ? str(s.name_ar) : d.name_ar,
    icon: 'icon' in s ? str(s.icon, 8) : d.icon,
    visibility: pick(s.visibility, ['members', 'everyone'] as const, d.visibility),
    flow,
    new_label: 'new_label' in s ? (lbl && str(lbl.en, 40) ? { en: str(lbl.en, 40)!, ar: str(lbl.ar, 40) ?? str(lbl.en, 40)! } : null) : d.new_label,
    allowed_types: Array.isArray(s.allowed_types) ? strs(s.allowed_types) : d.allowed_types,
    default_type: 'default_type' in s ? str(s.default_type) : d.default_type,
    default_priority: 'default_priority' in s ? str(s.default_priority, 20) : d.default_priority,
    creators: pick(s.creators, ['everyone', 'members', 'leads'] as const, d.creators),
    child_rows: typeof s.child_rows === 'boolean' ? s.child_rows : d.child_rows,
    fields,
    section_order: [...order, ...PANEL_SECTIONS.filter(x => !order.includes(x))],
    views: {
      default: pick(v.default, ['board', 'sheet', 'calendar'] as const, d.views.default),
      sort: pick(v.sort, ['due', 'publish', 'priority', 'name', 'created', 'updated'] as const, d.views.sort),
      group: pick(v.group, ['none', 'stage', 'brand', 'statusGroup'] as const, d.views.group),
      columns: Array.isArray(v.columns) ? strs(v.columns, 80) : d.views.columns,
    },
    linking: {
      roles: Array.isArray(l.roles) ? strs(l.roles) : d.linking.roles,
      handoff: pick(l.handoff, ['ask', 'default'] as const, d.linking.handoff),
    },
    rules: {
      owners: stageMap(r.owners, x => str(x)),
      approvers: stageMap(r.approvers, x => str(x)),
      sla: stageMap(r.sla, x => (typeof x === 'number' && Number.isFinite(x) && x >= 0 && x <= 60 ? Math.round(x) : null)),
      notify: { enter: strs(n.enter), overdue: strs(n.overdue), back: strs(n.back) },
    },
  }
}

export type FlowProblem = 'end_before_start' | 'handoff_outside' | 'return_before_handoff' | 'return_outside' | 'handoff_no_target'

/** What's wrong with a flow: every stage inside the range, hand-off before return. */
export function validateFlow(flow: SpaceFlow): FlowProblem[] {
  const out: FlowProblem[] = []
  const s = stageAt(flow.start), e = stageAt(flow.end)
  if (e < s) out.push('end_before_start')
  if (flow.handoff) {
    const h = stageAt(flow.handoff)
    if (h < s || h > e) out.push('handoff_outside')
    if (!flow.handoff_to.length) out.push('handoff_no_target')
  }
  if (flow.return) {
    const r = stageAt(flow.return)
    if (r < s || r > e) out.push('return_outside')
    if (!flow.handoff || r <= stageAt(flow.handoff)) out.push('return_before_handoff')
  }
  return out
}

/** The stages a Space's views show: "Starts at" to "Ends at", in pipeline order. */
export function rangeOf(flow: SpaceFlow, stages: readonly StageId[] = ALL_STAGES): StageId[] {
  const s = stageAt(flow.start), e = stageAt(flow.end)
  return stages.filter(x => stageAt(x) >= s && stageAt(x) <= e)
}

export const inRange = (flow: SpaceFlow, stage: string) => stageAt(stage) >= stageAt(flow.start) && stageAt(stage) <= stageAt(flow.end)

/** Stages the Space has handed off: from "Hands off at" up to (not including) "Returns at"; past the end when nothing returns. */
export function handedOff(flow: SpaceFlow, stage: string): boolean {
  if (!flow.handoff) return false
  const at = stageAt(stage)
  if (at < stageAt(flow.handoff)) return false
  // A Space whose hand-off is its last stage hands off once a task passes it.
  if (!flow.return) return stageAt(flow.handoff) === stageAt(flow.end) ? at > stageAt(flow.end) : at >= stageAt(flow.handoff)
  return at < stageAt(flow.return)
}

/** Whether a Space owns `stage` for its own tasks: in its range and not handed off. */
export const ownsStage = (flow: SpaceFlow, stage: string) => inRange(flow, stage) && !handedOff(flow, stage)

export interface SpaceLite { id: string; key: string; media_board?: string | null; archived_at?: unknown; settings: SpaceSettings }

/**
 * The Space whose rules apply to a task: its media board's Space for a media
 * task; else the Space it was created in, when that Space covers the task's
 * work; else Content (the Space whose flow starts at To Do and hands off).
 */
export function homeSpace<S extends SpaceLite>(
  task: { id: string; media_board?: string | null },
  spaces: S[],
  createdIn?: string | null,
): S | undefined {
  const live = spaces.filter(s => !s.archived_at)
  if (task.media_board) return live.find(s => s.media_board === task.media_board) ?? live.find(s => s.key === task.media_board)
  const made = createdIn ? live.find(s => s.id === createdIn && !s.media_board) : undefined
  if (made) return made
  return live.find(s => s.key === 'content') ?? live.find(s => !s.media_board)
}

export interface TypeFieldLink { type_label: string; field_id: string; required_from: string | null }

/** A field's effective rule in a Space: shown, and the stage it's required before (null when optional). */
export function fieldRule(settings: SpaceSettings | null | undefined, link: TypeFieldLink): { shown: boolean; before: StageId | null } {
  const r = settings?.fields[link.field_id] ?? {}
  const shown = r.shown !== false
  let before: StageId | null = isStage(link.required_from) ? link.required_from : null
  if (r.required === false) before = null
  else if (r.required === true) before = r.before !== undefined ? r.before : before ?? settings?.flow.start ?? null
  else if (r.before !== undefined && before) before = r.before
  return { shown, before }
}

/**
 * The fields a move from `from` to `target` must have, under one Space's rules:
 * required before a stage the move reaches or passes, that the task hadn't
 * reached yet, and that isn't earlier than the Space's start.
 */
export function requiredForMove(
  settings: SpaceSettings | null | undefined,
  links: TypeFieldLink[],
  from: string | null | undefined,
  target: string,
): { field_id: string; before: StageId }[] {
  const t = stageAt(target)
  if (t < 0) return []
  const f = stageAt(from)
  const start = settings ? stageAt(settings.flow.start) : -1
  const out: { field_id: string; before: StageId }[] = []
  for (const link of links) {
    const { before } = fieldRule(settings, link)
    if (!before) continue
    const b = stageAt(before)
    if (b < 0 || b > t || b <= f || b < start) continue
    out.push({ field_id: link.field_id, before })
  }
  return out
}

/** The stage a new task made in this Space starts at. */
export const startStage = (settings: SpaceSettings | null | undefined): StageId => settings?.flow.start ?? 'todo'

/** The add button's and the sheet add row's text: the Space's label, else the given fallback. */
export function newTaskLabel(settings: SpaceSettings | null | undefined, locale: string, fallback: string): string {
  const l = settings?.new_label
  if (!l) return fallback
  return (locale === 'ar' ? l.ar : l.en) || l.en || fallback
}

/** Whether a member may create tasks in the Space. */
export function mayCreateIn(settings: SpaceSettings, member: { id: string; access: string }, memberIds: string[]): boolean {
  if (member.access === 'admin' || member.access === 'superuser') return true
  if (settings.creators === 'leads') return false
  if (settings.creators === 'members') return memberIds.includes(member.id)
  return true
}

/** Whether the type is allowed in the Space. */
export const typeAllowed = (settings: SpaceSettings, type: string | null | undefined) =>
  !settings.allowed_types.length || (!!type && settings.allowed_types.includes(type))

/** Whether a member may link or unlink content and media in this Space. */
export function mayLink(settings: SpaceSettings, member: { access: string; role: string | null }) {
  if (member.access === 'admin' || member.access === 'superuser') return true
  return !!member.role && settings.linking.roles.includes(member.role)
}

/** A Space's SLA for a stage it owns, when set; else null (the type's SLA applies). */
export const slaFor = (settings: SpaceSettings | null | undefined, stage: string) =>
  settings && ownsStage(settings.flow, stage) ? settings.rules.sla[stage as StageId] ?? null : null

/** The role that holds each stage this Space owns: its approver, else its owner (spec 024 §7). */
export function stageRoles(settings: SpaceSettings | null | undefined): Partial<Record<string, string>> | null {
  if (!settings) return null
  const out: Partial<Record<string, string>> = {}
  for (const s of ALL_STAGES) {
    if (!ownsStage(settings.flow, s)) continue
    const r = settings.rules.approvers[s] ?? settings.rules.owners[s]
    if (r) out[s] = r
  }
  return Object.keys(out).length ? out : null
}

/** The roles a Space tells about an event on one of its tasks (spec 024 §7). */
export function notifyRoles(settings: SpaceSettings | null | undefined, kind: string, status: string): string[] {
  if (!settings) return []
  const n = settings.rules.notify
  if (kind === 'overdue') return n.overdue
  if (kind === 'task_created_in_stage') return status === settings.flow.start ? n.enter : []
  if (kind === 'task_moved_to_stage') return [...(status === settings.flow.start ? n.enter : []), ...(settings.flow.return && status === settings.flow.return ? n.back : [])]
  return []
}

/** The task types a Space's add form offers: the allowed ones, its default type first. */
export function typesForSpace<T extends { label: string }>(settings: SpaceSettings | null | undefined, types: T[]): T[] {
  if (!settings) return types
  const allowed = settings.allowed_types.length ? types.filter(x => settings.allowed_types.includes(x.label)) : types
  const list = allowed.length ? allowed : types
  const first = list.find(x => x.label === settings.default_type)
  return first ? [first, ...list.filter(x => x !== first)] : list
}
