import type { loadBoardData } from '@/lib/board-data'
import type { mapTask } from '@/lib/mappers'

/** Everything a Space, brand or My tasks page receives from `loadBoardData`. */
export type BoardData = Awaited<ReturnType<typeof loadBoardData>>
/** One task as the views read it (the loader hands them over untyped for the Board). */
export type ViewTask = ReturnType<typeof mapTask>

export const viewTasks = (d: BoardData): ViewTask[] => d.initialTasks as ViewTask[]

/** What a saved view's filters list on a page (spec 021 T040). */
export function viewOptions(d: BoardData, tasks: ViewTask[], hide: { brand?: boolean } = {}) {
  const byName = <T extends { name: string }>(a: T, b: T) => a.name.localeCompare(b.name)
  return {
    brand: hide.brand ? [] : d.brands.filter(b => tasks.some(x => x.brand_id === b.id)).map(b => ({ id: b.id, name: b.name })).sort(byName),
    assignee: d.members.filter(m => tasks.some(x => x.assignee_id === m.id)).map(m => ({ id: m.id, name: m.name })).sort(byName),
    type: [...new Set(tasks.map(x => x.content_type_label).filter((x): x is string => !!x))].sort().map(x => ({ id: x, name: x })),
    campaign: [...new Map(tasks.filter(x => x.project).map(x => [x.project!.id, { id: x.project!.id, name: x.project!.name }])).values()].sort(byName),
  }
}
