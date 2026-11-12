/**
 * A blank sheet's columns linked to board tasks (spec 016), the parts that
 * don't need a server or a screen. Pure.
 *
 * - Reading a Task cell: a board link, a full URL with a task id, a bare id,
 *   or a title (R3).
 * - Matching a column of Task cells to tasks, with ambiguity.
 * - Cleaning a column mapping (R2) and which fields a task has (R4).
 * - Reading typed values for fields: a member by name, a stage by name, a
 *   priority, a date.
 */
import type { SheetTaskMap, TaskField } from '@/types/index'
import { TASK_FIELDS } from '@/types/index'
import { parseDate } from '@/lib/sheet-format'

const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i

/** The task id a Task cell names: `/board?task=<id>`, any URL with `task=<id>`, or a bare id. Null for a title. */
export function taskIdFrom(text: string): string | null {
  const t = text.trim()
  if (!t) return null
  const q = /[?&]task=([0-9a-f-]{36})/i.exec(t)
  if (q && UUID.test(q[1])) return q[1].toLowerCase()
  const bare = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.exec(t)
  return bare ? t.toLowerCase() : null
}
/** A title as matched: trimmed, inner spaces collapsed, ignoring case. */
export const normTitle = (text: string) => text.trim().replace(/\s+/g, ' ').toLocaleLowerCase()
/** The link a Task cell gets once its row is linked. */
export const taskLink = (id: string, origin = '') => `${origin}/board?task=${id}`

export interface MatchResult {
  linked: { rowId: string; taskId: string }[]
  ambiguous: { rowId: string; text: string; choices: string[] }[]
  unmatched: { rowId: string; text: string }[]
  /** Rows whose Task cell is empty: not linked, and not reported. */
  empty: string[]
}
/** Match Task cells to tasks (R3): by id first, then by a title only one task has. */
export function matchCells(cells: { rowId: string; text: string }[], ids: Set<string>, byTitle: Map<string, string[]>): MatchResult {
  const out: MatchResult = { linked: [], ambiguous: [], unmatched: [], empty: [] }
  for (const c of cells) {
    const text = c.text.trim()
    if (!text) { out.empty.push(c.rowId); continue }
    const id = taskIdFrom(text)
    if (id) { if (ids.has(id)) out.linked.push({ rowId: c.rowId, taskId: id }); else out.unmatched.push({ rowId: c.rowId, text }); continue }
    const hits = byTitle.get(normTitle(text)) ?? []
    if (hits.length === 1) out.linked.push({ rowId: c.rowId, taskId: hits[0] })
    else if (hits.length > 1) out.ambiguous.push({ rowId: c.rowId, text, choices: hits })
    else out.unmatched.push({ rowId: c.rowId, text })
  }
  return out
}

export const MAX_MAPPED = 20
/** A field a column may stand for: one of TASK_FIELDS, or a team column that exists. */
export function isTaskField(f: unknown, teamCols: Set<string>): f is TaskField {
  if (typeof f !== 'string') return false
  if ((TASK_FIELDS as readonly string[]).includes(f)) return true
  return f.startsWith('col:') && teamCols.has(f.slice(4))
}
/** A mapping as sent, checked (R2): real columns, the Task column not also a field, each field once. Null when unusable. */
export function cleanMap(map: unknown, colIds: Set<string>, teamCols: Set<string>): SheetTaskMap | null {
  const m = map as Partial<SheetTaskMap> | null
  if (!m || typeof m.taskCol !== 'string' || !colIds.has(m.taskCol)) return null
  const fields: Record<string, TaskField> = {}
  const used = new Set<string>()
  for (const [col, f] of Object.entries(m.fields ?? {})) {
    if (Object.keys(fields).length >= MAX_MAPPED) break
    if (col === m.taskCol || !colIds.has(col) || !isTaskField(f, teamCols) || used.has(f)) continue
    used.add(f)
    fields[col] = f
  }
  return { taskCol: m.taskCol, fields }
}

/** What kind of task a row is, for which fields it has (R4). */
export interface TaskKind { piece: boolean; video: boolean; clip: boolean }
export function fieldApplies(k: TaskKind, field: TaskField): boolean {
  if (field === 'theme' || field === 'pillar') return k.piece
  if (field.startsWith('link:')) return k.piece || k.video
  if (field.startsWith('col:')) return k.piece || k.clip
  return true
}

// ─── reading typed values ────────────────────────────────────────────────────

/** A member by what was typed: their full name, or a first name only one member has (ignoring case). */
export function matchMember(text: string, members: { id: string; name: string }[]): { id: string } | 'none' | 'ambiguous' {
  const t = normTitle(text)
  if (!t) return 'none'
  const full = members.filter(m => normTitle(m.name) === t)
  if (full.length === 1) return { id: full[0].id }
  if (full.length > 1) return 'ambiguous'
  const first = members.filter(m => normTitle(m.name).split(' ')[0] === t)
  if (first.length === 1) return { id: first[0].id }
  return first.length > 1 ? 'ambiguous' : 'none'
}
/** A stage by its id or its English or Arabic name. */
export function matchStage(text: string, stages: { id: string; names: string[] }[]): string | null {
  const t = normTitle(text)
  if (!t) return null
  return stages.find(s => s.id.toLowerCase() === t || s.names.some(n => normTitle(n) === t))?.id ?? null
}
const PRIORITY: Record<string, 'Low' | 'Medium' | 'High'> = { low: 'Low', medium: 'Medium', high: 'High', 'منخفضة': 'Low', 'متوسطة': 'Medium', 'عالية': 'High' }
export const matchPriority = (text: string) => PRIORITY[normTitle(text)] ?? null
/** A typed date as yyyy-mm-dd, or null. */
export function readDay(text: string): string | null {
  const d = parseDate(text)
  return d ? `${d.y}-${String(d.m).padStart(2, '0')}-${String(d.d).padStart(2, '0')}` : null
}
