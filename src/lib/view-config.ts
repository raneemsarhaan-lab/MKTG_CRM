/**
 * Saved views' settings (spec 021 FR-012a, T040), pure so the labs can run
 * them: what a view filters, how it groups and sorts, and which Sheet fields
 * it shows. A view's `config` comes from the database as plain JSON; every
 * reader goes through `cleanConfig`, so a bad or old value never breaks a page.
 */
import { NINE_STAGE } from '@/lib/stage-meta'
import { statusGroupOf } from '@/lib/status-groups'

export type ViewFilterKey = 'brand' | 'assignee' | 'type' | 'campaign' | 'statusGroup' | 'tag'
/**
 * Fields (25 Nov 2026, §5): a view also filters, sorts and groups by a field — a custom field from the
 * library (`f:<id>`) or one of the built-in custom fields below. The view keeps working on the stored
 * values even after a Space turns the field off (it then says so).
 */
export type FieldViewKey = `f:${string}` | 'priority' | 'pillar' | 'start' | 'platform'
export const BUILT_IN_VIEW_FIELDS: FieldViewKey[] = ['priority', 'pillar', 'start'] // QF-07: no Platform
export const isFieldViewKey = (k: unknown): k is FieldViewKey => typeof k === 'string' && (CUSTOM_FIELD.test(k) || (BUILT_IN_VIEW_FIELDS as string[]).includes(k))
export type ViewGroup = 'stage' | 'brand' | 'statusGroup' | FieldViewKey
export type ViewSort = 'due' | 'publish' | 'name' | 'priority' | 'stage' | FieldViewKey
/** A field filter's special values: the field has a value / is empty. A checkbox's values are 'yes' / 'no'. */
export const HAS_VALUE = '__set'
export const VIEW_FILTERS: ViewFilterKey[] = ['brand', 'assignee', 'type', 'campaign', 'statusGroup', 'tag']
export const VIEW_SORTS: ViewSort[] = ['due', 'publish', 'name', 'priority', 'stage']
export const VIEW_FIELDS = ['brand', 'status', 'assignee', 'owner', 'publish', 'start', 'due', 'type', 'priority', 'tags', 'theme', 'pillar'] as const // QF-07: no Platform
/** Owner, 26 Nov 2026: every field is listed; these start turned off, so nobody's cards change until they choose. */
export const VIEW_FIELDS_OFF: readonly string[] = ['owner', 'start', 'theme', 'pillar']

/** Spec 023: a custom field shows as `f:<field id>` beside the standard fields. */
export const CUSTOM_FIELD = /^f:[0-9a-f-]{36}$/i
export const isFieldKey = (x: string) => (VIEW_FIELDS as readonly string[]).includes(x) || CUSTOM_FIELD.test(x)

/**
 * The fields a Board, List or Sheet shows (user, 2026-11-23: "a button called
 * Fields — the standard ones + the custom ones + '+ Field'"). A choice saved
 * for the tab wins; without one every standard field shows, and the custom
 * fields of the task types on the page (on a Board, those marked "show on cards").
 */
export function shownFields(
  saved: string[] | null | undefined,
  view: 'board' | 'list' | 'sheet' | string,
  custom: { id: string; on_card: boolean; retired: boolean }[],
  typesOnPage: Set<string>,
  links: { type_label: string; field_id: string }[],
): string[] {
  const live = new Set(custom.filter(f => !f.retired).map(f => `f:${f.id}`))
  if (saved) return saved.filter(k => !CUSTOM_FIELD.test(k) || live.has(k))
  const onPage = custom.filter(f => !f.retired && links.some(l => l.field_id === f.id && typesOnPage.has(l.type_label)) && (view !== 'board' || f.on_card))
  return [...VIEW_FIELDS.filter(k => !VIEW_FIELDS_OFF.includes(k)), ...onPage.map(f => `f:${f.id}`)]
}

export interface ViewConfig {
  filters: Partial<Record<ViewFilterKey, string[]>>
  /** Fields (§5): filters on fields — field key → the values that match (any of them). */
  fieldFilters?: Record<string, string[]>
  group: ViewGroup | null
  sort: ViewSort | null
  /** Sheet fields shown (Task always is); null = all. */
  fields: string[] | null
}

export const EMPTY_CONFIG: ViewConfig = { filters: {}, group: null, sort: null, fields: null }

const strings = (v: unknown, max = 200): string[] =>
  Array.isArray(v) ? [...new Set(v.filter((x): x is string => typeof x === 'string' && x.length > 0 && x.length <= max))].slice(0, 100) : []

export function cleanConfig(raw: unknown): ViewConfig {
  const o = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw as Record<string, unknown> : {}
  const f = o.filters && typeof o.filters === 'object' ? o.filters as Record<string, unknown> : {}
  const filters: ViewConfig['filters'] = {}
  for (const k of VIEW_FILTERS) { const v = strings(f[k]); if (v.length) filters[k] = v }
  const fields = o.fields === null || o.fields === undefined ? null : strings(o.fields).filter(isFieldKey)
  const ff = o.fieldFilters && typeof o.fieldFilters === 'object' && !Array.isArray(o.fieldFilters) ? o.fieldFilters as Record<string, unknown> : {}
  const fieldFilters: Record<string, string[]> = {}
  for (const [k, v] of Object.entries(ff).slice(0, 20)) { if (!isFieldViewKey(k)) continue; const vs = strings(v); if (vs.length) fieldFilters[k] = vs }
  return {
    filters,
    ...(Object.keys(fieldFilters).length ? { fieldFilters } : {}),
    group: o.group === 'stage' || o.group === 'brand' || o.group === 'statusGroup' || isFieldViewKey(o.group) ? o.group as ViewGroup : null,
    sort: VIEW_SORTS.includes(o.sort as ViewSort) || isFieldViewKey(o.sort) ? o.sort as ViewSort : null,
    fields,
  }
}

export interface ViewableTask {
  name: string; status: string; brand_id: string; assignee_id?: string | null
  content_type_label?: string | null; project_id?: string | null; due_date?: string | null; publish_date?: string | null; priority?: string | null
  assignee_ids?: string[]; tag_ids?: string[]
}

const PRIORITY_RANK: Record<string, number> = { Urgent: 0, High: 1, Normal: 2, Medium: 2, Low: 3, None: 4 }
const NONE = '__none'

/** A task's value for a field key (custom values come from the page's field values). */
export type FieldValueOf = (task: ViewableTask & { id?: string }, key: FieldViewKey) => unknown

const empty = (v: unknown) => v === null || v === undefined || v === '' || v === false || (Array.isArray(v) && !v.length)
/** The values a field value counts as, for matching and grouping: each choice of a multi, 'yes'/'no' for a checkbox. */
export function valueKeys(v: unknown): string[] {
  if (empty(v)) return []
  if (v === true) return ['yes']
  if (Array.isArray(v)) return v.map(x => String(x))
  if (typeof v === 'object') return [JSON.stringify(v)]
  return [String(v)]
}
/** Whether a task's value passes a field filter: any listed value, "has a value", "empty" ('__none'), or a checkbox's 'no'. */
export function fieldMatches(v: unknown, wanted: string[]): boolean {
  if (!wanted.length) return true
  const keys = valueKeys(v)
  return wanted.some(w => (w === HAS_VALUE ? keys.length > 0 : w === NONE || w === 'no' ? keys.length === 0 || (w === 'no' && v === false) : keys.includes(w)))
}
/** The fields a view uses (filters, sort, group): the page notes any that are off in its Space. */
export const fieldsUsed = (c: ViewConfig): FieldViewKey[] => [...new Set([
  ...Object.keys(c.fieldFilters ?? {}).filter(isFieldViewKey),
  ...(isFieldViewKey(c.sort) ? [c.sort] : []),
  ...(isFieldViewKey(c.group) ? [c.group] : []),
])]
/** Built-in custom fields read straight off the task. */
export const builtInValue = (x: ViewableTask & { pillar_id?: string | null; start_date?: string | null; platform?: string | null }, key: FieldViewKey): unknown =>
  key === 'priority' ? (x.priority && x.priority !== 'None' ? x.priority : null) : key === 'pillar' ? x.pillar_id ?? null : key === 'start' ? x.start_date ?? null : key === 'platform' ? x.platform || null : undefined

/** The tasks a view shows, in its order. "No one" / "No campaign" filter with '__none'. */
export function applyView<T extends ViewableTask>(tasks: T[], c: ViewConfig, valueOf?: FieldValueOf): T[] {
  const val = (x: T, k: FieldViewKey) => (CUSTOM_FIELD.test(k) ? valueOf?.(x, k) : builtInValue(x, k))
  const fieldOk = (x: T) => Object.entries(c.fieldFilters ?? {}).every(([k, want]) => !isFieldViewKey(k) || fieldMatches(val(x, k), want))
  const hit = (list: string[] | undefined, v: string | null | undefined) => !list?.length || list.includes(v || NONE)
  // Spec 023: several assignees and tags — any of them matches ("No one" / "No tag" when there are none).
  const anyHit = (list: string[] | undefined, vs: string[]) => !list?.length || (vs.length ? vs.some(v => list.includes(v)) : list.includes(NONE))
  const out = tasks.filter(x =>
    hit(c.filters.brand, x.brand_id) && anyHit(c.filters.assignee, x.assignee_ids?.length ? x.assignee_ids : x.assignee_id ? [x.assignee_id] : []) && anyHit(c.filters.tag, x.tag_ids ?? []) &&
    hit(c.filters.type, x.content_type_label) && hit(c.filters.campaign, x.project_id) && hit(c.filters.statusGroup, statusGroupOf(x.status)) && fieldOk(x))
  if (!c.sort) return out
  const key = (x: T): [number, string] => {
    switch (c.sort) {
      // Due date, earliest first, undated last; ties by publishing date.
      case 'due': return x.due_date ? [0, `${x.due_date.slice(0, 10)}|${x.publish_date?.slice(0, 10) ?? '9999'}`] : [1, '']
      case 'publish': return x.publish_date ? [0, `${x.publish_date.slice(0, 10)}|${x.due_date?.slice(0, 10) ?? '9999'}`] : [1, '']
      case 'priority': return [PRIORITY_RANK[x.priority ?? ''] ?? 4, '']
      case 'stage': return [NINE_STAGE.indexOf(x.status as never), '']
      case 'name': return [0, x.name.toLowerCase()]
      default: {
        // A field: tasks with a value first, in the value's order (numbers as numbers); empty last.
        const v = isFieldViewKey(c.sort) ? val(x, c.sort) : null
        if (empty(v)) return [1, '']
        const n = typeof v === 'number' ? v : typeof v === 'object' && v && 'amount' in v ? Number((v as { amount: unknown }).amount) : NaN
        return [0, Number.isFinite(n) ? String(n + 1e12).padStart(20, '0') : valueKeys(v).join(',').toLowerCase()]
      }
    }
  }
  return [...out].sort((a, b) => {
    const [a1, a2] = key(a), [b1, b2] = key(b)
    return a1 - b1 || a2.localeCompare(b2) || a.name.localeCompare(b.name)
  })
}

/** How many filters a view uses (for the config bar's badge). */
export const filterCount = (c: ViewConfig) => Object.values(c.filters).reduce((n, v) => n + (v?.length ? 1 : 0), 0) + Object.values(c.fieldFilters ?? {}).filter(v => v.length).length

/** A member's tab choices on one page (spec 021): home view, pinned tabs first, hidden tabs tucked away. */
export interface TabPrefs {
  home: string | null; pinned: string[]; hidden: string[]
  /** Spec 023: the fields each built-in tab shows for this member (tab key → field keys). */
  fields?: Record<string, string[]>
  /** Spec 025: the view this member used last on this page; it opens there next time (after a home view). */
  last?: string | null
}
export const EMPTY_TAB_PREFS: TabPrefs = { home: null, pinned: [], hidden: [] }

export function cleanTabPrefs(raw: unknown): TabPrefs {
  const o = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw as Record<string, unknown> : {}
  const keys = (v: unknown) => strings(v, 60).slice(0, 40)
  const pinned = keys(o.pinned)
  const fields: Record<string, string[]> = {}
  const f = o.fields && typeof o.fields === 'object' && !Array.isArray(o.fields) ? o.fields as Record<string, unknown> : {}
  for (const [k, v] of Object.entries(f).slice(0, 20)) if (k.length <= 60 && Array.isArray(v)) fields[k] = strings(v).filter(isFieldKey)
  return { home: typeof o.home === 'string' && o.home.length <= 60 ? o.home : null, pinned, hidden: keys(o.hidden).filter(k => !pinned.includes(k)), ...(Object.keys(fields).length ? { fields } : {}), ...(typeof o.last === 'string' && o.last.length <= 60 ? { last: o.last } : {}) }
}

/** Tab order: pinned first (in pin order), then the rest in their own order; hidden ones left out. */
export function arrangeTabs<T extends { key: string }>(tabs: T[], p: TabPrefs): { shown: T[]; hidden: T[] } {
  const live = tabs.filter(x => !p.hidden.includes(x.key))
  const pinned = p.pinned.map(k => live.find(x => x.key === k)).filter((x): x is T => !!x)
  return { shown: [...pinned, ...live.filter(x => !p.pinned.includes(x.key))], hidden: tabs.filter(x => p.hidden.includes(x.key)) }
}
