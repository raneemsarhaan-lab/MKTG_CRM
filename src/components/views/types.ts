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
    statusGroup: [],
    tag: d.tags.filter(g => tasks.some(x => x.tag_ids?.includes(g.id))).map(g => ({ id: g.id, name: g.name })),
  }
}

/** Spec 023: the Fields button's custom fields, the types on the page, and who may add a field. */
export function fieldsSetup(d: BoardData, tasks: ViewTask[]): import('@/components/fields/FieldsMenu').FieldsSetup {
  return {
    custom: d.taskFields, links: d.typeFields, types: d.contentTypes as import('@/types/index').ContentType[],
    typesOnPage: [...new Set(tasks.map(x => x.content_type_label).filter((x): x is string => !!x))],
    canCreate: d.currentUser.access !== 'user',
  }
}

/** A task's custom field values as the views show them, by field id. */
export function fieldValuesOf(d: BoardData): Map<string, Map<string, unknown>> {
  const out = new Map<string, Map<string, unknown>>()
  for (const v of d.fieldValues) {
    let m = out.get(v.task_id)
    if (!m) out.set(v.task_id, (m = new Map()))
    m.set(v.field_id, v.value)
  }
  return out
}
