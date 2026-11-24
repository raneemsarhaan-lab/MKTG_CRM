/**
 * Spec 025 (§3, Assets tab): a brand's files — logos, templates, photos and
 * finished designs. Pure: kinds, the row shape, sorting, filtering and search.
 */
export const ASSET_KINDS = ['logo', 'template', 'photo', 'design', 'other'] as const
export type AssetKind = typeof ASSET_KINDS[number]
export const asKind = (v: unknown): AssetKind => ((ASSET_KINDS as readonly string[]).includes(v as string) ? v as AssetKind : 'other')

export interface AssetRow {
  /** `a:<id>` an uploaded or linked brand asset; `t:<id>` a file on one of the brand's finished tasks. */
  key: string
  id: string
  /** 'asset' can be renamed, re-typed, linked and deleted here; 'task' belongs to its task. */
  source: 'asset' | 'task'
  name: string
  kind: AssetKind
  /** Where to open it. */
  href: string | null
  /** A small picture to show, when it is an image. */
  preview: string | null
  content_type: string | null
  size_bytes: number | null
  task: { id: string; name: string } | null
  added_by: { id: string; name: string } | null
  added_at: string
}

export type AssetSort = 'name' | 'kind' | 'task' | 'added_by' | 'added_at'
export interface AssetQuery { sort: AssetSort; dir: 'asc' | 'desc'; kinds: AssetKind[]; search: string }
export const DEFAULT_QUERY: AssetQuery = { sort: 'added_at', dir: 'desc', kinds: [], search: '' }

const norm = (s: string | null | undefined) => (s ?? '').toLowerCase().normalize('NFKD').trim()

/** What a kind is guessed to be from a file's name and type, until someone sets it. */
export function guessKind(name: string, contentType?: string | null): AssetKind {
  const n = norm(name)
  if (/logo|mark|wordmark|favicon/.test(n) || /\.svg$/.test(n)) return 'logo'
  if (/template|\.(pptx?|potx|key|indd|ai|psd|fig|docx?)$/.test(n)) return 'template'
  if ((contentType ?? '').startsWith('image/') || /\.(jpe?g|png|webp|heic|gif)$/.test(n)) return 'photo'
  return 'other'
}

/** The rows a query shows, in its order. Search looks at the name, the linked task and who added it. */
export function queryAssets(rows: AssetRow[], q: AssetQuery): AssetRow[] {
  const s = norm(q.search)
  const kept = rows.filter(r => (!q.kinds.length || q.kinds.includes(r.kind))
    && (!s || norm(r.name).includes(s) || norm(r.task?.name).includes(s) || norm(r.added_by?.name).includes(s)))
  const val = (r: AssetRow): string => (q.sort === 'name' ? norm(r.name) : q.sort === 'kind' ? r.kind : q.sort === 'task' ? norm(r.task?.name) : q.sort === 'added_by' ? norm(r.added_by?.name) : r.added_at)
  const sign = q.dir === 'asc' ? 1 : -1
  return [...kept].sort((a, b) => {
    const x = val(a), y = val(b)
    // Rows with nothing in the sorted column go last, whichever way it is sorted.
    if (!x !== !y) return x ? -1 : 1
    return x === y ? norm(a.name).localeCompare(norm(b.name)) : x < y ? -sign : sign
  })
}
