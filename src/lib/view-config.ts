/**
 * Saved views' settings (spec 021 FR-012a, T040), pure so the labs can run
 * them: what a view filters, how it groups and sorts, and which Sheet fields
 * it shows. A view's `config` comes from the database as plain JSON; every
 * reader goes through `cleanConfig`, so a bad or old value never breaks a page.
 */
import { NINE_STAGE } from '@/lib/stage-meta'

export type ViewFilterKey = 'brand' | 'assignee' | 'type' | 'campaign'
export type ViewGroup = 'stage' | 'brand'
export type ViewSort = 'due' | 'publish' | 'name' | 'priority' | 'stage'
export const VIEW_FILTERS: ViewFilterKey[] = ['brand', 'assignee', 'type', 'campaign']
export const VIEW_SORTS: ViewSort[] = ['due', 'publish', 'name', 'priority', 'stage']
export const VIEW_FIELDS = ['brand', 'status', 'assignee', 'publish', 'due', 'type', 'priority', 'platform'] as const

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
  const fields = o.fields === null || o.fields === undefined ? null : strings(o.fields).filter(x => (VIEW_FIELDS as readonly string[]).includes(x))
  return {
    filters,
    group: o.group === 'stage' || o.group === 'brand' ? o.group : null,
    sort: VIEW_SORTS.includes(o.sort as ViewSort) ? o.sort as ViewSort : null,
    fields,
  }
}

export interface ViewableTask {
  name: string; status: string; brand_id: string; assignee_id?: string | null
  content_type_label?: string | null; project_id?: string | null; due_date?: string | null; publish_date?: string | null; priority?: string | null
}

const PRIORITY_RANK: Record<string, number> = { High: 0, Medium: 1, Low: 2 }
const NONE = '__none'

/** The tasks a view shows, in its order. "No one" / "No campaign" filter with '__none'. */
export function applyView<T extends ViewableTask>(tasks: T[], c: ViewConfig): T[] {
  const hit = (list: string[] | undefined, v: string | null | undefined) => !list?.length || list.includes(v || NONE)
  const out = tasks.filter(x =>
    hit(c.filters.brand, x.brand_id) && hit(c.filters.assignee, x.assignee_id) &&
    hit(c.filters.type, x.content_type_label) && hit(c.filters.campaign, x.project_id))
  if (!c.sort) return out
  const key = (x: T): [number, string] => {
    switch (c.sort) {
      // Due date, earliest first, undated last; ties by publishing date.
      case 'due': return x.due_date ? [0, `${x.due_date.slice(0, 10)}|${x.publish_date?.slice(0, 10) ?? '9999'}`] : [1, '']
      case 'publish': return x.publish_date ? [0, `${x.publish_date.slice(0, 10)}|${x.due_date?.slice(0, 10) ?? '9999'}`] : [1, '']
      case 'priority': return [PRIORITY_RANK[x.priority ?? ''] ?? 3, '']
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
export interface TabPrefs { home: string | null; pinned: string[]; hidden: string[] }
export const EMPTY_TAB_PREFS: TabPrefs = { home: null, pinned: [], hidden: [] }

export function cleanTabPrefs(raw: unknown): TabPrefs {
  const o = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw as Record<string, unknown> : {}
  const keys = (v: unknown) => strings(v, 60).slice(0, 40)
  const pinned = keys(o.pinned)
  return { home: typeof o.home === 'string' && o.home.length <= 60 ? o.home : null, pinned, hidden: keys(o.hidden).filter(k => !pinned.includes(k)) }
}

/** Tab order: pinned first (in pin order), then the rest in their own order; hidden ones left out. */
export function arrangeTabs<T extends { key: string }>(tabs: T[], p: TabPrefs): { shown: T[]; hidden: T[] } {
  const live = tabs.filter(x => !p.hidden.includes(x.key))
  const pinned = p.pinned.map(k => live.find(x => x.key === k)).filter((x): x is T => !!x)
  return { shown: [...pinned, ...live.filter(x => !p.pinned.includes(x.key))], hidden: tabs.filter(x => p.hidden.includes(x.key)) }
}
