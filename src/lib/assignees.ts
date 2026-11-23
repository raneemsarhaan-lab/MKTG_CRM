/**
 * Several assignees (spec 023 US5, R9, D11–D12). Pure. The lead is the task's
 * assignee_id; the others come after, in order. Hours: a person's own hours
 * when set, otherwise an even share of what's left of the estimate.
 */
export function isAssignee(t: { assignee_id?: string | null; assignee_ids?: string[] | null }, memberId: string): boolean {
  return t.assignee_id === memberId || !!t.assignee_ids?.includes(memberId)
}

export function everyAssignee(t: { assignee_id?: string | null; assignee_ids?: string[] | null }): string[] {
  const ids = t.assignee_ids?.length ? t.assignee_ids : t.assignee_id ? [t.assignee_id] : []
  return [...new Set(ids)]
}

/** Each assignee's hours: set hours as given, the rest split evenly among the others (never below 0). */
export function hoursSplit(t: { hours_estimate?: number | null; assignee_id?: string | null; assignee_ids?: string[] | null; assignee_hours?: Record<string, number> | null }): Record<string, number> {
  const ids = everyAssignee(t)
  const total = Number(t.hours_estimate ?? 0)
  const set = t.assignee_hours ?? {}
  const fixed = ids.filter(id => typeof set[id] === 'number')
  const free = ids.filter(id => typeof set[id] !== 'number')
  const left = Math.max(0, total - fixed.reduce((s, id) => s + set[id], 0))
  const out: Record<string, number> = {}
  for (const id of fixed) out[id] = set[id]
  for (const id of free) out[id] = free.length ? Math.round((left / free.length) * 100) / 100 : 0
  return out
}
