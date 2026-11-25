/**
 * Linking a sheet tab to the board (spec 027, US3). Pure, so the server and the link dialog count the
 * same way and the lab can prove the one rule that matters: linking never makes a duplicate task.
 *
 *   matchColumns   each column → a task field by name (Title → title, Brand → brand …), else Sheet only
 *   linkPreview    what linking would do: rows to create, rows to reconnect, untitled rows, conflicts
 *   rowToTask      a row's values as task fields, by the confirmed matches
 */

export type LinkField = 'title' | 'brand' | 'type' | 'status' | 'owner' | 'assignee' | 'publish' | 'due' | `f:${string}`
export interface TabColumn { id: string; name: string }
export interface FieldChoice { key: LinkField; names: string[] }
/** A column's match: a task field, or 'sheet' (stays on the row). */
export type Match = { column: string; field: LinkField | 'sheet' }

export interface TabRow {
  id: string
  title: string
  /** The task the row is linked to now. */
  taskId: string | null
  /** The task the row was linked to before it was unlinked (spec 027 R4). */
  lastTaskId: string | null
  values: Record<string, string>
}

export interface LinkPreview {
  /** Titled rows with no task, now or before: a task each is created. */
  create: string[]
  /** Rows that had a task which still exists: linked to it again, nothing created. */
  reconnect: string[]
  /** Rows already linked: left as they are. */
  linked: string[]
  /** Rows with no title: stay plain rows. */
  untitled: string[]
  /** Rows whose remembered task is already the task of another row in this tab: left plain, listed. */
  conflicts: string[]
}

const norm = (s: string) => s.normalize('NFKC').trim().replace(/\s+/g, ' ').toLowerCase()

/** Built-in task fields and the column names that mean them (English and Arabic). */
export const STANDARD_LINK_FIELDS: FieldChoice[] = [
  { key: 'title', names: ['title', 'task', 'name', 'post', 'العنوان', 'المهمة', 'الاسم'] },
  { key: 'brand', names: ['brand', 'البراند', 'العلامة'] },
  { key: 'type', names: ['type', 'content type', 'النوع'] },
  { key: 'status', names: ['status', 'stage', 'الحالة', 'المرحلة'] },
  { key: 'owner', names: ['owner', 'المالك'] },
  { key: 'assignee', names: ['assignee', 'assigned to', 'المسؤول'] },
  { key: 'publish', names: ['publishing date', 'publish date', 'publish', 'date', 'تاريخ النشر'] },
  { key: 'due', names: ['due date', 'due', 'تاريخ التسليم'] },
]

/** Each column to the field its name names; a field is matched once (first column wins); the rest are Sheet only. */
export function matchColumns(columns: TabColumn[], fields: FieldChoice[] = STANDARD_LINK_FIELDS): Match[] {
  const taken = new Set<string>()
  return columns.map(c => {
    const n = norm(c.name)
    const f = fields.find(x => !taken.has(x.key) && x.names.some(name => norm(name) === n))
    if (!f) return { column: c.id, field: 'sheet' as const }
    taken.add(f.key)
    return { column: c.id, field: f.key }
  })
}

/**
 * What linking the tab would do. `taskExists` says whether a remembered task can be reconnected (it
 * still exists, archived or not). A remembered task already claimed by another row of the tab is a
 * conflict: the row stays plain rather than share a task or make a second one.
 */
export function linkPreview(rows: TabRow[], taskExists: (id: string) => boolean): LinkPreview {
  const out: LinkPreview = { create: [], reconnect: [], linked: [], untitled: [], conflicts: [] }
  const claimed = new Set(rows.map(r => r.taskId).filter((x): x is string => !!x))
  for (const r of rows) {
    if (r.taskId) { out.linked.push(r.id); continue }
    if (!r.title.trim()) { out.untitled.push(r.id); continue }
    if (r.lastTaskId && taskExists(r.lastTaskId)) {
      if (claimed.has(r.lastTaskId)) { out.conflicts.push(r.id); continue }
      claimed.add(r.lastTaskId)
      out.reconnect.push(r.id)
      continue
    }
    out.create.push(r.id)
  }
  return out
}

/** A row's values for the task, by the confirmed matches (Title also comes from the row's own title). */
export function rowToTask(row: TabRow, matches: Match[]): Partial<Record<LinkField, string>> {
  const out: Partial<Record<LinkField, string>> = { title: row.title.trim() }
  for (const m of matches) {
    if (m.field === 'sheet') continue
    const v = (row.values[m.column] ?? '').trim()
    if (v && !(m.field === 'title' && out.title)) out[m.field] = v
  }
  return out
}
