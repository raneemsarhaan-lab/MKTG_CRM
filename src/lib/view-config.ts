/**
 * Saved views' settings (spec 021 FR-012a, T040), pure so the labs can run
 * them: what a view filters, how it groups and sorts, and which Sheet fields
 * it shows. A view's `config` comes from the database as plain JSON; every
 * reader goes through `cleanConfig`, so a bad or old value never breaks a page.
 */
import { NINE_STAGE } from '@/lib/stage-meta'
import { statusGroupOf } from '@/lib/status-groups'

export type ViewFilterKey = 'brand' | 'assignee' | 'type' | 'campaign' | 'statusGroup' | 'tag'
export type ViewGroup = 'stage' | 'brand' | 'statusGroup'
export type ViewSort = 'due' | 'publish' | 'name' | 'priority' | 'stage'
export const VIEW_FILTERS: ViewFilterKey[] = ['brand', 'assignee', 'type', 'campaign', 'statusGroup', 'tag']
export const VIEW_SORTS: ViewSort[] = ['due', 'publish', 'name', 'priority', 'stage']
export const VIEW_FIELDS = ['brand', 'status', 'assignee', 'publish', 'due', 'type', 'priority', 'platform', 'tags'] as const

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
  return [...VIEW_FIELDS, ...onPage.map(f => `f:${f.id}`)]
}

export interface ViewConfig {
  filters: Partial<Record<ViewFilterKey, string[]>>
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
  return {
    filters,
    group: o.group === 'stage' || o.group === 'brand' || o.group === 'statusGroup' ? o.group : null,
    sort: VIEW_SORTS.includes(o.sort as ViewSort) ? o.sort as ViewSort : null,
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

/** The tasks a view shows, in its order. "No one" / "No campaign" filter with '__none'. */
export function applyView<T extends ViewableTask>(tasks: T[], c: ViewConfig): T[] {
  const hit = (list: string[] | undefined, v: string | null | undefined) => !list?.length || list.includes(v || NONE)
  // Spec 023: several assignees and tags — any of them matches ("No one" / "No tag" when there are none).
  const anyHit = (list: string[] | undefined, vs: string[]) => !list?.length || (vs.length ? vs.some(v => list.includes(v)) : list.includes(NONE))
  const out = tasks.filter(x =>
    hit(c.filters.brand, x.brand_id) && anyHit(c.filters.assignee, x.assignee_ids?.length ? x.assignee_ids : x.assignee_id ? [x.assignee_id] : []) && anyHit(c.filters.tag, x.tag_ids ?? []) &&
    hit(c.filters.type, x.content_type_label) && hit(c.filters.campaign, x.project_id) && hit(c.filters.statusGroup, statusGroupOf(x.status)))
  if (!c.sort) return out
  const key = (x: T): [number, string] => {
    switch (c.sort) {
      // Due date, earliest first, undated last; ties by publishing date.
      case 'due': return x.due_date ? [0, `${x.due_date.slice(0, 10)}|${x.publish_date?.slice(0, 10) ?? '9999'}`] : [1, '']
      case 'publish': return x.publish_date ? [0, `${x.publish_date.slice(0, 10)}|${x.due_date?.slice(0, 10) ?? '9999'}`] : [1, '']
      case 'priority': return [PRIORITY_RANK[x.priority ?? ''] ?? 4, '']
      case 'stage': return [NINE_STAGE.indexOf(x.status as never), '']
      default: return [0, x.name.toLowerCase()]
    }
  }
  return [...out].sort((a, b) => {
    const [a1, a2] = key(a), [b1, b2] = key(b)
    return a1 - b1 || a2.localeCompare(b2) || a.name.localeCompare(b.name)
  })
}

/** How many filters a view uses (for the config bar's badge). */
export const filterCount = (c: ViewConfig) => Object.values(c.filters).reduce((n, v) => n + (v?.length ? 1 : 0), 0)

/** A member's tab choices on one page (spec 021): home view, pinned tabs first, hidden tabs tucked away. */
export interface TabPrefs {
  home: string | null; pinned: string[]; hidden: string[]
  /** Spec 023: the fields each built-in tab shows for this member (tab key → field keys). */
  fields?: Record<string, string[]>
}
export const EMPTY_TAB_PREFS: TabPrefs = { home: null, pinned: [], hidden: [] }

export function cleanTabPrefs(raw: unknown): TabPrefs {
  const o = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw as Record<string, unknown> : {}
  const keys = (v: unknown) => strings(v, 60).slice(0, 40)
  const pinned = keys(o.pinned)
  const fields: Record<string, string[]> = {}
  const f = o.fields && typeof o.fields === 'object' && !Array.isArray(o.fields) ? o.fields as Record<string, unknown> : {}
  for (const [k, v] of Object.entries(f).slice(0, 20)) if (k.length <= 60 && Array.isArray(v)) fields[k] = strings(v).filter(isFieldKey)
  return { home: typeof o.home === 'string' && o.home.length <= 60 ? o.home : null, pinned, hidden: keys(o.hidden).filter(k => !pinned.includes(k)), ...(Object.keys(fields).length ? { fields } : {}) }
}

/** Tab order: pinned first (in pin order), then the rest in their own order; hidden ones left out. */
export function arrangeTabs<T extends { key: string }>(tabs: T[], p: TabPrefs): { shown: T[]; hidden: T[] } {
  const live = tabs.filter(x => !p.hidden.includes(x.key))
  const pinned = p.pinned.map(k => live.find(x => x.key === k)).filter((x): x is T => !!x)
  return { shown: [...pinned, ...live.filter(x => !p.pinned.includes(x.key))], hidden: tabs.filter(x => p.hidden.includes(x.key)) }
}
