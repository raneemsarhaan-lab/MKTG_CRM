/**
 * Workspace tags (spec 023 US4, R8, D9–D10). Pure. One list for the workspace;
 * a name is unique ignoring case and spacing ("Eid" = " eid "). Merging moves
 * every task's link to the kept tag once.
 */
export const TAG_COLORS = ['#3E7BEA', '#8F6FE8', '#1E9E8A', '#2F8F3F', '#C99A06', '#E8772E', '#D22040', '#D6409F', '#4A5061', '#6B7280'] as const
export const MAX_TAG_NAME = 40

export const tagKey = (name: string) => name.trim().replace(/\s+/g, ' ').toLowerCase()
export const cleanTagName = (name: unknown) => (typeof name === 'string' ? name.trim().replace(/\s+/g, ' ').slice(0, MAX_TAG_NAME) : '')

/** A colour for a new tag: the next one in the palette by how many tags exist. */
export const nextTagColor = (count: number) => TAG_COLORS[count % TAG_COLORS.length]

/** The task links a merge writes: every task of `from` gets `into`, once. */
export function mergePlan(links: { task_id: string; tag_id: string }[], from: string, into: string): { add: string[]; drop: string[] } {
  const hasInto = new Set(links.filter(l => l.tag_id === into).map(l => l.task_id))
  const fromTasks = links.filter(l => l.tag_id === from).map(l => l.task_id)
  return { add: fromTasks.filter(t => !hasInto.has(t)), drop: fromTasks }
}
