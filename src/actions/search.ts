'use server'

/**
 * Workspace search (user, 2026-11-23): tasks, my to-dos and assets, ranked by
 * src/lib/search.ts. Every member sees every task (as on the boards); to-dos
 * are only ever the searcher's own.
 */
import { prisma } from '@/lib/prisma'
import { getSessionMember } from '@/lib/authz'
import { closest, didYouMean, parseQuery, rank, vocabulary, type Hit, type Searchable } from '@/lib/search'
import { formatValue, isEmpty } from '@/lib/task-fields'
import { mapTaskField } from '@/lib/mappers'
import type { StageId } from '@/types/index'

export interface TaskResult {
  id: string; name: string; status: StageId; open: boolean
  brand: { id: string; name: string; color: string } | null
  space: { id: string; key: string; name: string } | null
  publish_date: string | null
  hit: Hit
}
export interface AssetResult { id: string; filename: string; url: string | null; where: 'task' | 'brand'; taskId?: string; taskName?: string; brand: { id: string; name: string; color: string } | null; hit: Hit }
export interface TodoResult { id: string; name: string; day: string | null; done: boolean; hit: Hit }
export interface SearchResult {
  success: true
  query: string
  exact: boolean
  /** "Did you mean …": the search with its misspellings corrected from the workspace's own words. */
  suggestion: string | null
  tasks: TaskResult[]; taskCount: number
  assets: AssetResult[]; assetCount: number
  /** My to-dos only (they are private). */
  todos: TodoResult[]; todoCount: number
  /** Nothing matched: the tasks nearest the search, by spelling. */
  nearest: TaskResult[]
}

const FREE_TEXT = new Set(['caption', 'tov'])

export async function searchWorkspace(raw: string, opts: { spaceKey?: string | null; brandId?: string | null; limit?: number } = {}): Promise<SearchResult | { success: false; error: string }> {
  const me = await getSessionMember()
  if (!me) return { success: false, error: 'not_authenticated' }
  const q = parseQuery(String(raw ?? '').slice(0, 200))
  const limit = Math.min(Math.max(opts.limit ?? 5, 1), 200)
  const empty: SearchResult = { success: true, query: q.raw, exact: q.exact, suggestion: null, tasks: [], taskCount: 0, assets: [], assetCount: 0, todos: [], todoCount: 0, nearest: [] }
  if (!q.words.length) return empty

  const [tasks, spaces, brandAssets, myTodos] = await Promise.all([
    prisma.task.findMany({
      where: { dropped_at: null },
      select: {
        id: true, name: true, description: true, status: true, publish_date: true, brand_id: true,
        brand: { select: { id: true, name: true, color: true } },
        assignee: { select: { name: true } },
        spaces: { select: { space_id: true } },
        attachments: { select: { id: true, filename: true, url: true } },
        field_values: { select: { value: true, field: true } },
      },
    }),
    prisma.teamSpace.findMany({ select: { id: true, key: true, name: true } }),
    prisma.brandAsset.findMany({ select: { id: true, filename: true, url: true, brand: { select: { id: true, name: true, color: true } } } }),
    prisma.todo.findMany({ where: { owner_id: me.id, OR: [{ done_at: null }, { done_at: { gte: new Date(Date.now() - 30 * 86_400_000) } }] } }),
  ])
  const spaceById = new Map(spaces.map(s => [s.id, s]))
  const ctxSpace = opts.spaceKey ? spaces.find(s => s.key === opts.spaceKey)?.id ?? null : null
  const day = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null)

  const rows = tasks.map(t => {
    const text: Searchable['text'] = t.description ? [{ field: 'description', value: t.description }] : []
    const other: Searchable['other'] = []
    if (t.brand) other.push({ field: 'brand', value: t.brand.name })
    if (t.assignee) other.push({ field: 'assignee', value: t.assignee.name })
    for (const s of t.spaces) { const sp = spaceById.get(s.space_id); if (sp) other.push({ field: 'space', value: sp.name }) }
    for (const a of t.attachments) other.push({ field: 'asset', value: a.filename })
    for (const v of t.field_values) {
      const f = mapTaskField(v.field)
      if (f.retired || isEmpty(v.value)) continue
      const shown = formatValue(f, v.value, { locale: 'en' })
      const key = f.name_en.trim().toLowerCase()
      if (f.kind === 'text' && FREE_TEXT.has(key)) text.unshift({ field: key as 'caption' | 'tov', value: shown })
      else if (shown) other.push({ field: 'field', label: f.name_en, value: shown })
    }
    return {
      id: t.id, name: t.name, text, other, open: t.status !== 'publish', brand_id: t.brand_id,
      space_ids: t.spaces.map(s => s.space_id), publish_date: day(t.publish_date),
      status: t.status as StageId, brand: t.brand, attachments: t.attachments,
    }
  })
  const ctx = { spaceId: ctxSpace, brandId: opts.brandId ?? null, today: new Date().toISOString().slice(0, 10) }
  const ranked = rank(rows, q, ctx)
  const result = (r: (typeof rows)[number], hit: Hit): TaskResult => {
    const sid = (ctxSpace && r.space_ids.includes(ctxSpace) ? ctxSpace : r.space_ids[0]) ?? null
    const sp = sid ? spaceById.get(sid) ?? null : null
    return { id: r.id, name: r.name, status: r.status, open: r.open, brand: r.brand, space: sp, publish_date: r.publish_date, hit }
  }

  // Assets: files on tasks and in brand folders, by file name.
  const assetRows = [
    ...rows.flatMap(r => r.attachments.map(a => ({ id: a.id, name: a.filename, url: a.url, where: 'task' as const, taskId: r.id, taskName: r.name, brand: r.brand,
      text: [], other: [], open: r.open, brand_id: r.brand_id, space_ids: r.space_ids, publish_date: r.publish_date }))),
    ...brandAssets.map(a => ({ id: a.id, name: a.filename, url: a.url, where: 'brand' as const, taskId: undefined, taskName: undefined, brand: a.brand,
      text: [], other: [], open: true, brand_id: a.brand?.id ?? null, space_ids: [], publish_date: null })),
  ]
  const assets = rank(assetRows, q, ctx)

  // My to-dos: the name, then the note (as Description).
  const todoRows = myTodos.map(x => ({ id: x.id, name: x.name, text: x.note ? [{ field: 'description' as const, value: x.note }] : [], other: [],
    open: !x.done_at, brand_id: null, space_ids: [], publish_date: x.day ? x.day.toISOString().slice(0, 10) : null }))
  const todos = rank(todoRows, q, ctx)

  // "Did you mean": only from words the workspace uses (task names, Caption, TOV, brands).
  const vocab = vocabulary([...rows.map(r => r.name), ...rows.flatMap(r => r.text.filter(x => x.field !== 'description').map(x => x.value)), ...new Set(rows.map(r => r.brand?.name ?? ''))])
  const typo = ranked.length ? didYouMean(q, vocab) : null
  const misspelt = !!typo && !ranked.some(r => r.hit.level <= 5)

  return {
    success: true, query: q.raw, exact: q.exact,
    suggestion: misspelt ? typo : null,
    tasks: ranked.slice(0, limit).map(r => result(r.task, r.hit)), taskCount: ranked.length,
    assets: assets.slice(0, limit).map(a => ({ id: a.task.id, filename: a.task.name, url: a.task.url, where: a.task.where, taskId: a.task.taskId, taskName: a.task.taskName, brand: a.task.brand, hit: a.hit })),
    assetCount: assets.length,
    todos: todos.slice(0, limit).map(r => ({ id: r.task.id, name: r.task.name, day: r.task.publish_date, done: !r.task.open, hit: r.hit })), todoCount: todos.length,
    nearest: ranked.length || assets.length || todos.length ? [] : closest(rows, q).map(r => result(r, { id: r.id, level: 7, sub: 0, field: 'name', bold: [] })),
  }
}
