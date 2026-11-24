/**
 * Sheet columns you can shape (spec 010, data-model §3, research R3, R4, R12).
 *
 * Pure, and shared by the server actions, both sheets and the lab: which
 * columns a sheet shows and in what order, what a custom value may be, and
 * what a name may be. The server re-checks everything the client checks.
 */
import type { ChoiceOption, ColumnKind, SheetColumnRecord, SheetId } from '@/types/index'
import { isWebLink } from '@/lib/content-plan'
import { CHOICE_COLORS } from '@/lib/tokens'
import { intlLocale } from '@/lib/sheet-format'

export const COLUMN_KINDS: ColumnKind[] = ['text', 'number', 'date', 'link', 'person', 'choice', 'checkbox', 'task']
export const MAX_CUSTOM_COLUMNS = 30
export const MAX_NAME = 40
export const MAX_OPTIONS = 50
export const MAX_TEXT = 2000
export const MIN_WIDTH = 60
export const MAX_WIDTH = 600
export const CUSTOM_WIDTH = 140

export interface BuiltInColumn {
  key: string
  width: number
  /** English default name, for the server's uniqueness check (FR-011). */
  en: string
  /** Video only: the sets that show it by default. */
  sets?: string[]
}

/** The built-in columns of each sheet, in default order. Title is always first. */
export const BUILT_INS: Record<'content' | 'video', BuiltInColumn[]> = {
  content: [
    { key: 'title', width: 300, en: 'Title' },
    { key: 'type', width: 130, en: 'Type' },
    { key: 'status', width: 156, en: 'Status' },
    // Spec 022 (R19): Link task — the piece's Design and Video tasks.
    { key: 'media', width: 340, en: 'Link task' },
    { key: 'assignee', width: 130, en: 'Assignee' },
    { key: 'doc', width: 124, en: 'Working Doc' },
    { key: 'design', width: 116, en: 'Design Link' },
    { key: 'task', width: 104, en: 'Task Link' },
    { key: 'post', width: 120, en: 'LinkedIn Link' },
    { key: 'published', width: 128, en: 'Published Link' },
    { key: 'pillar', width: 120, en: 'Pillar' },
    { key: 'date', width: 104, en: 'Date' },
    { key: 'archive', width: 80, en: 'Archive or restore' },
  ],
  // The redesigned Video sheet (design/video-sheet-v4.html) shows its own set,
  // 'sheet': Clip, Type, Stage, Owner, Reviewer, Due, In stage, File, the
  // Content sheet's link columns, and Archive. The clip details are a click
  // away in Columns. The older sets stay for saved layouts.
  video: [
    { key: 'title', width: 280, en: 'Clip', sets: ['editing', 'copy', 'full', 'sheet'] },
    { key: 'type', width: 96, en: 'Type', sets: ['copy', 'full', 'sheet'] },
    { key: 'status', width: 160, en: 'Stage', sets: ['editing', 'copy', 'full', 'sheet'] },
    // Spec 022 (R19): Link task on a video's own row — its Design and Video tasks.
    { key: 'media', width: 340, en: 'Link task', sets: ['full', 'sheet'] },
    { key: 'editor', width: 150, en: 'Owner', sets: ['editing', 'copy', 'full', 'sheet'] },
    { key: 'reviewer', width: 150, en: 'Reviewer', sets: ['sheet'] },
    { key: 'due', width: 90, en: 'Due', sets: ['sheet'] },
    { key: 'inStage', width: 88, en: 'In stage', sets: ['sheet'] },
    { key: 'files', width: 220, en: 'File', sets: ['editing', 'full', 'sheet'] },
    { key: 'doc', width: 150, en: 'Working Doc', sets: ['sheet'] },
    { key: 'design', width: 150, en: 'Design Link', sets: ['sheet'] },
    { key: 'task', width: 120, en: 'Task Link', sets: ['sheet'] },
    { key: 'post', width: 150, en: 'LinkedIn Link', sets: ['sheet'] },
    { key: 'published', width: 150, en: 'Published Link', sets: ['copy', 'full', 'sheet'] },
    { key: 'drop', width: 80, en: 'Archive or restore', sets: ['full', 'sheet'] },
    { key: 'clipNo', width: 40, en: '#', sets: ['editing', 'copy', 'full'] },
    { key: 'source', width: 92, en: 'Source', sets: ['editing', 'full'] },
    { key: 'fileName', width: 250, en: 'File name', sets: ['editing', 'full'] },
    { key: 'in', width: 64, en: 'In', sets: ['editing', 'full'] },
    { key: 'out', width: 64, en: 'Out', sets: ['editing', 'full'] },
    { key: 'length', width: 64, en: 'Length', sets: ['editing', 'full'] },
  ],
}
/** The sets a sheet has: the Video sheet's three, or one for the Content sheet. */
export const SHEET_SETS: Record<'content' | 'video', string[]> = { content: ['all'], video: ['editing', 'copy', 'full', 'sheet'] }

/** Spec 021 (T081): a Space's, brand's or My tasks' Tasks sheet. */
export const TASK_BUILT_INS: BuiltInColumn[] = [
  { key: 'title', width: 300, en: 'Task' },
  { key: 'brand', width: 170, en: 'Brand' },
  // Spec 025: the Spaces a task shows in — on a brand's sheet only.
  { key: 'space', width: 150, en: 'Space' },
  { key: 'status', width: 150, en: 'Status' },
  // Spec 022 (R19): Link task — this task's Design and Video tasks.
  { key: 'media', width: 340, en: 'Link task' },
  { key: 'assignee', width: 140, en: 'Assignee' },
  { key: 'publish', width: 130, en: 'Publishing date' },
  { key: 'start', width: 120, en: 'Start date' },
  { key: 'due', width: 130, en: 'Due date' },
  { key: 'type', width: 110, en: 'Type' },
  { key: 'priority', width: 90, en: 'Priority' },
  { key: 'platform', width: 110, en: 'Platform' },
]
export const TASK_SHEET = /^tasks:(space|brand|me):[0-9a-f-]{36}$/
export const isTaskSheet = (sheet: string) => TASK_SHEET.test(sheet)
/** Spec 026: a Space's sheet of rows (`rows:<spaceId>`); the Content Space's keeps the id `content`. */
export const ROWS_SHEET = /^rows:[0-9a-f-]{36}$/
export const isRowsSheet = (sheet: string) => sheet === 'content' || ROWS_SHEET.test(sheet)
export const builtInsFor = (sheet: SheetId): BuiltInColumn[] => (isRowsSheet(sheet) ? BUILT_INS.content : sheet === 'video' ? BUILT_INS.video : TASK_BUILT_INS)
export const setsFor = (sheet: SheetId): string[] => (sheet === 'video' ? SHEET_SETS.video : ['all'])

/**
 * Spec 026: where a Space's sheet keeps its columns. The Content Space keeps the
 * id its sheet always had; every other Space has `rows:<its id>`, and the
 * one-time conversion moves the custom columns of its old sheet there.
 */
export const spaceSheetId = (space: { id: string; key: string }): SheetId =>
  (space.key === 'content' || !space.id ? 'content' : `rows:${space.id}`) as SheetId

export const isCustomKey = (key: string) => key.startsWith('c:')
/** Spec 026 (§6): a task-field column, `f:<field id>` — a field of the library shown on a sheet of rows. */
export const isFieldKey = (key: string) => /^f:[0-9a-f-]{36}$/.test(key)
/** A library field as a column: its key, and whether it shows before anyone decides (a type in use carries it). */
export interface FieldColumn { key: string; shown: boolean; width?: number }
export const builtInOf = (sheet: SheetId, key: string) => builtInsFor(sheet).find(b => b.key === key)

export interface LaidColumn {
  key: string
  builtIn: boolean
  /** The team's name for it; null = the default name. */
  name: string | null
  width: number
  shown: boolean
  kind: ColumnKind | null
  options: ChoiceOption[]
  record: SheetColumnRecord | null
  /** Spec 026: a task field of the library. It is renamed, moved and hidden like a built-in column. */
  field?: boolean
}

/**
 * The columns a sheet shows, in order (R4). Without records: the built-in
 * defaults. With records: their order, a built-in added to the code later
 * slotted after its default predecessor, Title always first and shown.
 */
export function applyLayout(sheet: SheetId, records: SheetColumnRecord[], set: string, fields: FieldColumn[] = [], defaults: string[] = []): LaidColumn[] {
  const builtIns = builtInsFor(sheet)
  // Spec 024 (§5): the Space's default columns — the built-ins that show until someone shows or hides one.
  const picked = defaults.filter(k => builtIns.some(b => b.key === k))
  const recs = records.filter(r => r.sheet === sheet && (!isCustomKey(r.key) || r.kind))
  const byKey = new Map(recs.map(r => [r.key, r]))
  const fieldOf = new Map(fields.map(f => [f.key, f]))
  let keys: string[]
  if (!recs.length) keys = builtIns.map(b => b.key)
  else {
    keys = [...recs].sort((a, b) => a.position - b.position || a.key.localeCompare(b.key)).map(r => r.key)
    builtIns.forEach((b, i) => {
      if (keys.includes(b.key)) return
      const before = builtIns.slice(0, i).reverse().find(x => keys.includes(x.key))
      keys.splice(before ? keys.indexOf(before.key) + 1 : 0, 0, b.key)
    })
    // A task-field column keeps its place once it has a record (even while the caller's field list is
    // not at hand: the optimistic layer), so a change to another column never moves it.
    keys = keys.filter(k => isCustomKey(k) || isFieldKey(k) || builtIns.some(b => b.key === k))
  }
  // Task fields nobody has placed yet follow, in the library's order.
  for (const f of fields) if (!keys.includes(f.key)) keys.push(f.key)
  keys = ['title', ...keys.filter(k => k !== 'title')]
  return keys.map(key => {
    const r = byKey.get(key) ?? null
    const b = builtInOf(sheet, key)
    const f = isFieldKey(key) ? fieldOf.get(key) ?? { key, shown: false } : null
    const defaultShown = f ? f.shown : b ? (picked.length ? picked.includes(key) : b.sets ? b.sets.includes(set) : true) : true
    return {
      key,
      builtIn: !!b || !!f,
      name: r?.name ?? null,
      width: clampWidth(r?.width ?? b?.width ?? f?.width ?? CUSTOM_WIDTH),
      shown: key === 'title' ? true : r && !r.shownDefault ? r.shownIn.includes(set) : defaultShown,
      kind: b || f ? null : (r?.kind ?? null),
      options: b || f ? [] : (r?.options ?? []),
      record: r,
      ...(f ? { field: true } : {}),
    }
  })
}

/** Default visibility of a column in every set, the starting point for a first hide or show. */
export function defaultShownIn(sheet: SheetId, key: string): string[] {
  const b = builtInOf(sheet, key)
  return setsFor(sheet).filter(s => (b?.sets ? b.sets.includes(s) : true))
}

export const clampWidth = (w: number) => Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, Math.round(w)))

// ── names ───────────────────────────────────────────────────────────────────

export const normName = (s: string) => s.replace(/\s+/g, ' ').trim()
const same = (a: string, b: string) => normName(a).toLowerCase() === normName(b).toLowerCase()

/**
 * Whether a name may be used (R12): 1–40 characters, and unlike every other
 * column's current name and default names (so "Status" stays Status's).
 * `others` are [current name, ...default names] per other column.
 */
export function checkName(name: string, others: string[][]): 'empty' | 'long' | 'taken' | null {
  const n = normName(name)
  if (!n) return 'empty'
  if (n.length > MAX_NAME) return 'long'
  if (others.some(list => list.some(x => x && same(x, n)))) return 'taken'
  return null
}

/** The column a pasted heading fills, by current or default name (R9). */
export function headingKey(heading: string, columns: { key: string; names: string[] }[]): string | null {
  const h = normName(heading)
  if (!h) return null
  return columns.find(c => c.names.some(n => n && same(n, h)))?.key ?? null
}

/** A sheet column a paste can fill: its key and every name it answers to (R9). */
export interface PasteTarget { key: string; names: string[] }
/** A custom column a paste fills, with what parseValue needs. */
export interface PasteValueColumn { id: string; key: string; name: string; kind: ColumnKind; ctx: ValueCtx }
export interface PastedValueProblem { column: string; code: ParseCode; text: string }

/**
 * Pasted cells for custom columns (by column key) → normalised values by
 * column id, and the cells that don't fit their column (FR-051). A Link
 * column takes the cell's hyperlink when it has one.
 */
export function readPastedValues(
  cells: Record<string, { text: string; href: string | null }>,
  cols: PasteValueColumn[],
): { values: Record<string, string>; bad: PastedValueProblem[] } {
  const values: Record<string, string> = {}
  const bad: PastedValueProblem[] = []
  for (const [key, cell] of Object.entries(cells)) {
    const col = cols.find(c => c.key === key)
    if (!col) continue
    const raw = col.kind === 'link' ? (cell.href ?? cell.text) : cell.text
    const p = parseValue(col.kind, raw, col.ctx)
    if (!p.ok) bad.push({ column: col.name, code: p.code, text: raw.trim() })
    else if (p.value) values[col.id] = p.value
  }
  return { values, bad }
}

// ── values ──────────────────────────────────────────────────────────────────

export interface ValueCtx {
  members?: { id: string; name: string }[]
  options?: ChoiceOption[]
  /** Spec 021 (Task link): the tasks a value may name, by id or exact name. */
  tasks?: { id: string; name: string }[]
  /**
   * The reader's language, for a Number or Date shown in a cell. Absent: English,
   * which is what a kind change and the server read back (convertValues).
   */
  lang?: string
}

/**
 * The locale the video and content sheets show numbers and dates in: the app's
 * (`intlLocale`), with Western digits in Arabic as their specs ask (008 "times
 * and lengths stay in Western digits", 010 "Number: Western digits"), so one
 * sheet never mixes digit styles.
 */
export const sheetLocale = (lang: string) => intlLocale(lang)
export type ParseCode = 'number' | 'date' | 'link' | 'person' | 'choice' | 'checkbox' | 'long' | 'task'
export type Parsed = { ok: true; value: string } | { ok: false; code: ParseCode }

/** "2026-11-20" or "20/11/2026" (also 20.11.2026, 20-11-26) → YYYY-MM-DD, or null. */
export function readDay(text: string): string | null {
  const v = text.trim()
  let y: number, m: number, d: number
  let r: RegExpExecArray | null
  if ((r = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(v))) { y = +r[1]; m = +r[2]; d = +r[3] }
  else if ((r = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})$/.exec(v))) { d = +r[1]; m = +r[2]; y = r[3].length === 2 ? 2000 + +r[3] : +r[3] }
  else return null
  const dt = new Date(Date.UTC(y, m - 1, d))
  if (dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null
  return dt.toISOString().slice(0, 10)
}

const YES = ['1', 'true', 'yes', 'y', 'x', '✓', '✔', 'checked', 'on', 'done', 'نعم']
const NO = ['0', 'false', 'no', 'n', 'unchecked', 'off', 'لا']

/** A typed or pasted value for a column of this kind, normalised; '' clears (R3, FR-023). */
export function parseValue(kind: ColumnKind, raw: string, ctx: ValueCtx = {}): Parsed {
  const v = (raw ?? '').trim()
  if (!v) return { ok: true, value: '' }
  switch (kind) {
    case 'text':
      return v.length > MAX_TEXT ? { ok: false, code: 'long' } : { ok: true, value: v }
    case 'number': {
      const n = Number(v.replace(/[,\s]/g, ''))
      return Number.isFinite(n) ? { ok: true, value: String(n) } : { ok: false, code: 'number' }
    }
    case 'date': {
      const d = readDay(v)
      return d ? { ok: true, value: d } : { ok: false, code: 'date' }
    }
    case 'link':
      return isWebLink(v) ? { ok: true, value: v } : { ok: false, code: 'link' }
    case 'person': {
      const ms = ctx.members ?? []
      const m = ms.find(x => x.id === v) ?? ms.find(x => same(x.name, v)) ?? ms.find(x => same(x.name.split(' ')[0], v))
      return m ? { ok: true, value: m.id } : { ok: false, code: 'person' }
    }
    case 'choice': {
      const os = ctx.options ?? []
      const o = os.find(x => x.id === v) ?? os.find(x => same(x.name, v))
      return o ? { ok: true, value: o.id } : { ok: false, code: 'choice' }
    }
    case 'task': {
      // One task (approved design): its id, or a name only one task has.
      const ts = ctx.tasks ?? []
      const byId = ts.find(x => x.id === v)
      if (byId) return { ok: true, value: byId.id }
      const named = ts.filter(x => same(x.name, v))
      return named.length === 1 ? { ok: true, value: named[0].id } : { ok: false, code: 'task' }
    }
    case 'checkbox': {
      const l = v.toLowerCase()
      if (YES.includes(l)) return { ok: true, value: '1' }
      if (NO.includes(l)) return { ok: true, value: '' }
      return { ok: false, code: 'checkbox' }
    }
  }
}

/** A stored value as plain text: for copy, the task panel and kind changes. */
export function formatValue(kind: ColumnKind, value: string, ctx: ValueCtx = {}): string {
  if (!value) return ''
  switch (kind) {
    case 'person': return ctx.members?.find(m => m.id === value)?.name ?? ''
    case 'choice': return ctx.options?.find(o => o.id === value)?.name ?? ''
    case 'checkbox': return value === '1' ? 'yes' : ''
    case 'task': return ctx.tasks?.find(x => x.id === value)?.name ?? ''
    case 'date': {
      const d = new Date(`${value}T00:00:00`)
      return Number.isNaN(d.getTime()) ? value : d.toLocaleDateString(sheetLocale(ctx.lang ?? 'en'), { day: 'numeric', month: 'short', year: 'numeric' })
    }
    case 'number': return Number(value).toLocaleString(ctx.lang ? sheetLocale(ctx.lang) : 'en')
    default: return value
  }
}

/**
 * What changing a column's kind would do to its values (R11): the converted
 * values, and the task ids whose value would be cleared.
 */
export function convertValues(from: ColumnKind, to: ColumnKind, values: Record<string, string>, fromCtx: ValueCtx, toCtx: ValueCtx) {
  const kept: Record<string, string> = {}
  const cleared: string[] = []
  for (const [taskId, v] of Object.entries(values)) {
    // A date keeps its ISO form for a date or text target; other values go through their text.
    const text = from === 'date' ? v : formatValue(from, v, fromCtx)
    const r = parseValue(to, text, toCtx)
    if (r.ok && r.value) kept[taskId] = r.value
    else cleared.push(taskId)
  }
  return { kept, cleared }
}

/** The next unused option colour. */
export function nextChoiceColor(options: ChoiceOption[]): string {
  const used = new Set(options.map(o => o.color))
  return CHOICE_COLORS.find(c => !used.has(c)) ?? CHOICE_COLORS[options.length % CHOICE_COLORS.length]
}

/** Options as given, trimmed, unique by name, with ids and colours. */
export function cleanOptions(options: Partial<ChoiceOption>[], newId: () => string): ChoiceOption[] {
  const out: ChoiceOption[] = []
  for (const o of options.slice(0, MAX_OPTIONS)) {
    const name = normName(o.name ?? '').slice(0, MAX_NAME)
    if (!name || out.some(x => same(x.name, name))) continue
    const color = o.color && (CHOICE_COLORS as readonly string[]).includes(o.color) ? o.color : nextChoiceColor(out)
    out.push({ id: o.id || newId(), name, color })
  }
  return out
}

// ── optimistic layout changes (the host and the lab apply what the server will) ──

export type LayoutOp =
  | { op: 'rename'; key: string; name: string | null }
  | { op: 'move'; key: string; before: string | null }
  | { op: 'shown'; key: string; set: string; shown: boolean }
  | { op: 'width'; key: string; width: number }

/** The sheet's records with every built-in present, as the server writes them on a first change. */
export function materialise(sheet: SheetId, records: SheetColumnRecord[], who: { id: string; name: string }): SheetColumnRecord[] {
  const mine = records.filter(r => r.sheet === sheet)
  const others = records.filter(r => r.sheet !== sheet)
  const laid = applyLayout(sheet, mine, setsFor(sheet)[0])
  const now = new Date().toISOString()
  const full = laid.map((c, i): SheetColumnRecord => c.record
    ? { ...c.record, position: i }
    : { id: `tmp:${sheet}:${c.key}`, sheet, key: c.key, name: null, position: i, width: null, shownDefault: true, shownIn: [],
        kind: null, options: [], updatedBy: who.id, updatedByName: who.name, updatedAt: now })
  return [...others, ...full]
}

export function applyOp(sheet: SheetId, records: SheetColumnRecord[], o: LayoutOp, who: { id: string; name: string }): SheetColumnRecord[] {
  const all = materialise(sheet, records, who)
  const mine = all.filter(r => r.sheet === sheet).sort((a, b) => a.position - b.position)
  const others = all.filter(r => r.sheet !== sheet)
  const stamp = (r: SheetColumnRecord): SheetColumnRecord => ({ ...r, updatedBy: who.id, updatedByName: who.name, updatedAt: new Date().toISOString() })
  let next = mine
  if (o.op === 'move') {
    if (o.key === 'title' || o.before === 'title') return records
    const moving = mine.find(r => r.key === o.key)
    if (!moving) return records
    const rest = mine.filter(r => r.key !== o.key)
    const at = o.before ? rest.findIndex(r => r.key === o.before) : rest.length
    rest.splice(Math.max(1, at < 0 ? rest.length : at), 0, stamp(moving))
    next = rest.map((r, i) => ({ ...r, position: i }))
  } else {
    next = mine.map(r => {
      if (r.key !== o.key) return r
      if (o.op === 'rename') return stamp({ ...r, name: o.name === null ? null : normName(o.name) })
      if (o.op === 'width') return stamp({ ...r, width: clampWidth(o.width) })
      const start = r.shownDefault ? defaultShownIn(sheet, r.key) : r.shownIn
      const set = new Set(start)
      if (o.shown) set.add(o.set); else set.delete(o.set)
      return stamp({ ...r, shownDefault: false, shownIn: [...set] })
    })
  }
  return [...others, ...next]
}
