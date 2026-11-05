/**
 * Sheet lab: an in-memory ColumnsApi (spec 010) for both sheets. It applies
 * the same pure rules as src/actions/sheet-columns.ts: applyOp for layout,
 * checkName, cleanOptions, convertValues and parseValue, and the row rule for
 * values. `#cols=1` seeds sample columns (column-fixtures.ts); without it the
 * sheets start with today's built-in columns, so the earlier scenarios hold.
 * Records and values are on `window.__cols`.
 */
import { useState } from 'react'
import type { ChoiceOption, ColumnKind, Member, SheetColumnRecord, SheetId, SheetValues, Task } from '@/types/index'
import {
  BUILT_INS, MAX_CUSTOM_COLUMNS, applyOp, builtInOf, checkName, cleanOptions, convertValues, isCustomKey, materialise,
  normName, parseValue, type LayoutOp,
} from '@/lib/sheet-columns'
import type { ColumnsApi, ColumnsBundle } from '@/components/sheet/types'

type Call = { fn: string; args: unknown[]; at: number }
export interface ColumnsLab {
  records: SheetColumnRecord[]
  values: SheetValues
  types: string[]
}
declare global { interface Window { __cols: ColumnsLab } }

const wait = (ms = 40) => new Promise(r => setTimeout(r, ms))
let uid = 0
const newId = () => `col${++uid}x${Math.random().toString(36).slice(2, 6)}`

export function useLabColumns(opts: {
  me: Member
  members: Member[]
  lab: { calls: Call[]; failNext: Record<string, string>; tasks: Task[] }
  seed: { records: SheetColumnRecord[]; values: SheetValues }
  types: { id: string; label: string }[]
}): { bundle: ColumnsBundle; types: { id: string; label: string }[] } {
  const { me, lab } = opts
  const [records, setRecordsState] = useState<SheetColumnRecord[]>(() => opts.seed.records)
  const [values, setValuesState] = useState<SheetValues>(() => opts.seed.values)
  const [types, setTypes] = useState(opts.types)
  const g = (window.__cols ??= { records, values, types: types.map(x => x.label) })
  g.records = records; g.values = values; g.types = types.map(x => x.label)
  const setRecords = (fn: (r: SheetColumnRecord[]) => SheetColumnRecord[]) => setRecordsState(prev => { const n = fn(prev); window.__cols.records = n; return n })
  const setValues = (fn: (v: SheetValues) => SheetValues) => setValuesState(prev => { const n = fn(prev); window.__cols.values = n; return n })
  const who = { id: me.id, name: me.name }
  const record = (fn: string, ...args: unknown[]) => lab.calls.push({ fn, args, at: performance.now() })
  const failed = (fn: string) => { const e = lab.failNext[fn]; if (e) { delete lab.failNext[fn]; return e } return null }
  const cur = () => window.__cols.records

  const others = (sheet: SheetId, except?: string) => {
    const keys = new Set([...BUILT_INS[sheet].map(b => b.key), ...cur().filter(r => r.sheet === sheet).map(r => r.key)])
    return [...keys].filter(k => k !== except).map(k => [cur().find(r => r.sheet === sheet && r.key === k)?.name ?? '', builtInOf(sheet, k)?.en ?? ''].filter(Boolean))
  }
  async function layout(sheet: SheetId, fn: string, op: LayoutOp, check?: () => string | null) {
    record(fn, sheet, op)
    await wait()
    const f = failed(fn) ?? check?.() ?? null
    if (f) return { success: false, error: f }
    setRecords(r => applyOp(sheet, r, op, who))
    return { success: true }
  }

  const api: ColumnsApi = {
    async add(sheet, input) {
      record('col.add', sheet, input)
      await wait()
      const f = failed('col.add'); if (f) return { success: false, error: f }
      const mine = materialise(sheet, cur(), who).filter(r => r.sheet === sheet).sort((a, b) => a.position - b.position)
      if (mine.filter(r => isCustomKey(r.key)).length >= MAX_CUSTOM_COLUMNS) return { success: false, error: 'limit' }
      const bad = checkName(input.name, others(sheet))
      if (bad) return { success: false, error: `name_${bad}` }
      const options = input.kind === 'choice' ? cleanOptions(input.options ?? [], () => newId().slice(0, 8)) : []
      if (input.kind === 'choice' && !options.length) return { success: false, error: 'no_options' }
      const id = newId()
      const key = `c:${id}`
      const keys = mine.map(r => r.key)
      const at = input.after && keys.includes(input.after) ? keys.indexOf(input.after) + 1
        : input.before && keys.includes(input.before) && input.before !== 'title' ? keys.indexOf(input.before) : keys.length
      keys.splice(Math.max(1, at), 0, key)
      const column: SheetColumnRecord = {
        id, sheet, key, name: normName(input.name), position: 0, width: null,
        shownDefault: sheet === 'content' || !input.set, shownIn: sheet === 'video' && input.set ? [...new Set(['full', input.set])] : [],
        kind: input.kind, options, updatedBy: me.id, updatedByName: me.name, updatedAt: new Date().toISOString(),
      }
      setRecords(r => {
        const all = [...materialise(sheet, r, who), column]
        return all.map(x => (x.sheet === sheet ? { ...x, position: keys.indexOf(x.key) } : x))
      })
      return { success: true, column }
    },
    rename: (sheet, key, name) => layout(sheet, 'col.rename', { op: 'rename', key, name }, () => {
      if (name === null) return isCustomKey(key) ? 'name_empty' : null
      const bad = checkName(name, others(sheet, key))
      return bad ? `name_${bad}` : null
    }),
    move: (sheet, key, before) => layout(sheet, 'col.move', { op: 'move', key, before }, () => (key === 'title' || before === 'title' ? 'title_fixed' : null)),
    setShown: (sheet, key, set, shown) => layout(sheet, 'col.shown', { op: 'shown', key, set, shown }, () => (key === 'title' ? 'title_fixed' : null)),
    resize: (sheet, key, width) => layout(sheet, 'col.resize', { op: 'width', key, width }),
    async update(id, patch) {
      record('col.update', id, patch)
      await wait()
      const f = failed('col.update'); if (f) return { success: false, error: f }
      const col = cur().find(r => r.id === id)
      if (!col || !col.kind) return { success: false, error: 'not_found' }
      if (patch.name !== undefined) { const bad = checkName(patch.name, others(col.sheet, col.key)); if (bad) return { success: false, error: `name_${bad}` } }
      const kind = (patch.kind ?? col.kind) as ColumnKind
      const options: ChoiceOption[] = kind === 'choice' ? cleanOptions(patch.options ?? col.options, () => newId().slice(0, 8)) : []
      const vals = { ...(window.__cols.values[id] ?? {}) }
      let cleared = 0
      if (kind !== col.kind) {
        const r = convertValues(col.kind, kind, vals, { members: opts.members, options: col.options }, { members: opts.members, options })
        cleared = r.cleared.length
        setValues(v => ({ ...v, [id]: r.kept }))
      } else if (kind === 'choice') {
        const ids = new Set(options.map(o => o.id))
        for (const [taskId, v] of Object.entries(vals)) {
          if (ids.has(v)) continue
          const to = patch.replace?.[v]
          if (to === undefined) return { success: false, error: 'option_in_use' }
          if (to && ids.has(to)) vals[taskId] = to; else { delete vals[taskId]; cleared++ }
        }
        setValues(v => ({ ...v, [id]: vals }))
      }
      setRecords(rs => rs.map(r => (r.id === id ? { ...r, name: patch.name !== undefined ? normName(patch.name) : r.name, kind, options, updatedBy: me.id, updatedByName: me.name, updatedAt: new Date().toISOString() } : r)))
      return { success: true, cleared }
    },
    async remove(id) {
      record('col.delete', id)
      await wait()
      const f = failed('col.delete'); if (f) return { success: false, error: f }
      const col = cur().find(r => r.id === id)
      if (!col) return { success: false, error: 'not_found' }
      if (!isCustomKey(col.key)) return { success: false, error: 'built_in' }
      deleted.set(id, col)
      setRecords(rs => rs.filter(r => r.id !== id))
      return { success: true, values: Object.keys(window.__cols.values[id] ?? {}).length }
    },
    async restore(id) {
      record('col.restore', id)
      await wait()
      const col = deleted.get(id)
      if (!col) return { success: false, error: 'not_found' }
      deleted.delete(id)
      setRecords(rs => [...rs, col])
      return { success: true }
    },
    async setValue(columnId, taskId, raw) {
      record('col.value', columnId, taskId, raw)
      await wait()
      const f = failed('col.value'); if (f) return { success: false, error: f }
      const col = cur().find(r => r.id === columnId)
      if (!col || !col.kind) return { success: false, error: 'gone' }
      const task = lab.tasks.find(x => x.id === taskId)
      if (!task) return { success: false, error: 'not_found' }
      const admin = me.access === 'admin' || me.access === 'superuser'
      if (!(task.task_owner_id === me.id || task.assignee_id === me.id || admin)) return { success: false, error: 'not_authorized' }
      if (task.dropped_at) return { success: false, error: 'archived' }
      const p = parseValue(col.kind, raw, { members: opts.members, options: col.options })
      if (!p.ok) return { success: false, error: `invalid_${p.code}` }
      setValues(v => {
        const c = { ...(v[columnId] ?? {}) }
        if (p.value) c[taskId] = p.value; else delete c[taskId]
        return { ...v, [columnId]: c }
      })
      return { success: true, value: p.value }
    },
    async addContentType(label) {
      record('col.addType', label)
      await wait()
      if (me.access !== 'admin') return { success: false, error: 'not_authorized' }
      const name = normName(label)
      setTypes(ts => (ts.some(x => x.label.toLowerCase() === name.toLowerCase()) ? ts : [...ts, { id: name, label: name }]))
      return { success: true, label: name }
    },
  }
  return { bundle: { records, values, api }, types }
}
const deleted = new Map<string, SheetColumnRecord>()
