/**
 * Open work per person (spec 021 Workload view). Pure.
 * Counts open tasks' hour estimates per assignee, split by brand — published
 * pipeline tasks, done simple tasks and dropped clips are left out.
 */
export interface LoadTask {
  assignee_id?: string | null
  brand_id?: string | null
  hours_estimate: number | string
  status: string
  kind?: string | null
  simple_status?: string | null
  dropped_at?: string | null
}

export interface PersonLoad { memberId: string; hours: number; tasks: number; byBrand: Record<string, number> }

export const isOpen = (t: LoadTask) =>
  !t.dropped_at && (t.kind === 'simple' ? t.simple_status !== 's-done' : t.status !== 'publish')

export function taskLoad(tasks: LoadTask[]): PersonLoad[] {
  const by = new Map<string, PersonLoad>()
  for (const t of tasks) {
    if (!t.assignee_id || !isOpen(t)) continue
    const p = by.get(t.assignee_id) ?? { memberId: t.assignee_id, hours: 0, tasks: 0, byBrand: {} }
    const h = Number(t.hours_estimate) || 0
    p.hours += h; p.tasks += 1
    const b = t.brand_id ?? 'none'
    p.byBrand[b] = (p.byBrand[b] ?? 0) + h
    by.set(t.assignee_id, p)
  }
  return [...by.values()].sort((a, b) => b.hours - a.hours)
}
