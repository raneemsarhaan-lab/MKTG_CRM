'use client'

/**
 * A blank sheet's link to board tasks (spec 016), for BlankSheet.
 *
 * - Holds nothing of its own: the mapping, rows' tasks and the tasks' values
 *   live in the sheet's extras, so undo and reload see the same thing.
 * - `applyRouted` stands in front of the sheet's `apply`: cells in mapped
 *   columns of linked rows go to their tasks through `writeTaskFields` (the
 *   board's rules), a changed Task cell re-links its row, and the rest goes
 *   to the outbox as before. Each user action is still one undo step.
 * - Opens the dialogs (Link to board, Choose a task, Add tasks, Create tasks)
 *   when the workbook's Board ▾ menu asks, and refreshes values from the
 *   board when the tab comes back and every 60 seconds (R6).
 */
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import type { LinkedTask, SheetDoc, SheetTaskMap, TaskField, TaskFieldResult, TaskFieldValues } from '@/types/index'
import type { BlankChange, RowTasksChange, TaskFieldsChange } from '@/lib/sheet-undo'
import type { GridRect } from '@/components/sheet/GridCore'
import type { SheetsApi } from '../types'
import type { TaskHit } from '@/actions/sheet-links'
import { STAGE_META } from '@/lib/stage-meta'
import { taskIdFrom, taskLink } from '@/lib/sheet-links'
import { colLetters } from '@/lib/sheet-selection'
import { useUIStore } from '@/store/useUIStore'
import { AddTasks, ChooseTask, CreateTasksPreview, LinkDialog, stageLabel, type ColInfo, type CreateRow, type TeamCol } from './LinkDialogs'

export const LINKS_OPEN = 'momentum:links-open'
export type LinksWhat = 'link' | 'add' | 'create' | 'refresh'
export const openLinks = (what: LinksWhat) => document.dispatchEvent(new CustomEvent(LINKS_OPEN, { detail: what }))
/** The open blank sheet tells the workbook's Board ▾ menu what it can offer. */
export const LINKS_STATE = 'momentum:links-state'
export interface LinksState { linked: boolean; canCreate: boolean; unlinkedSelected: number; readOnly: string | null }

export type LinksApi = Pick<SheetsApi, 'resolveTaskCells' | 'writeTaskFields' | 'refreshTaskFields' | 'taskValues' | 'searchTasks' | 'linkChoices' | 'createTasksForRows'>
type Row = { id: string; position: number; height: number | null }

/** The text a snapshot cell keeps (R7): a stage's English name; the rest as shown. */
const snap = (f: TaskField, v: string) => (f === 'stage' ? STAGE_META[v as keyof typeof STAGE_META]?.label_en ?? v : v)

export function useTaskLinks(p: {
  doc: SheetDoc
  api: LinksApi
  ro: string | null
  vRows: Row[]
  vCols: { id: string }[]
  rowIndex: Map<string, number>
  colIndex: Map<string, number>
  value(rowId: string, colId: string): string
  apply(label: string, changes: BlankChange[]): void
  patch(fn: (doc: SheetDoc) => SheetDoc): void
  rect(): GridRect
  say(text: string): void
  onNote(key: string, note: string | null): void
  /** New rows at a visible index, for Add tasks. */
  makeRows(at: number, n: number): { id: string; position: number }[]
}) {
  const t = useTranslations('sheets.links')
  const locale = useLocale()
  const ex = p.doc.extras
  const map = ex?.taskMap ?? null
  const rowTasks = ex?.rowTasks ?? {}
  const tasks = ex?.tasks ?? {}
  const ref = useRef(p)
  ref.current = p
  const [dlg, setDlg] = useState<
    | { k: 'link' }
    | { k: 'choose'; rowId: string; text: string; choices: TaskHit[] }
    | { k: 'add' }
    | { k: 'create'; rows: CreateRow[] }
    | null>(null)
  const [choices, setChoices] = useState<{ projects: { id: string; name: string }[]; people: { id: string; name: string }[]; teamCols: TeamCol[]; canCreate: boolean } | null>(null)
  /** Rows that matched several tasks, until they're chosen (not stored: after a reload they read as Not linked). */
  const [ambiguous, setAmbiguous] = useState<Record<string, TaskHit[]>>({})

  useEffect(() => { void p.api.linkChoices().then(r => { if (r.success) setChoices(r) }) }, [p.api])

  const mergeTasks = useCallback((more: Record<string, LinkedTask>) => {
    if (!Object.keys(more).length) return
    ref.current.patch(d => ({ ...d, extras: { ...d.extras!, tasks: { ...(d.extras?.tasks ?? {}), ...more } } }))
  }, [])

  // ── what a cell shows ──
  const taskOfRow = (rowId: string): LinkedTask | null => {
    if (!map) return null
    const id = rowTasks[rowId]
    return id ? tasks[id] ?? null : null
  }
  /** A mapped cell on a linked row: its field and shown text, or "Not applicable". Null for every other cell. */
  function shown(rowId: string, colId: string): { field: TaskField; text: string; raw: string; na: boolean; editable: boolean } | null {
    const f = map?.fields[colId]
    if (!f) return null
    const tk = taskOfRow(rowId)
    if (!tk) return null
    const na = !tk.applies.includes(f)
    const raw = tk.values[f] ?? ''
    return { field: f, raw, text: na ? t('na') : f === 'stage' ? stageLabel(raw, locale) : raw, na, editable: f === 'stage' ? !tk.dropped : tk.editable && !tk.dropped }
  }
  /** The first row is the sheet's headings unless it names a task by link. */
  const isHeading = (rowId: string, m = map) => !!m && p.doc.rows[0]?.id === rowId && !taskIdFrom(p.value(rowId, m.taskCol))
  function noteOfRow(rowId: string): 'notLinked' | 'choose' | 'dropped' | null {
    if (!map || isHeading(rowId)) return null
    if (ambiguous[rowId]) return 'choose'
    const tk = taskOfRow(rowId)
    if (tk) return tk.dropped ? 'dropped' : null
    return p.value(rowId, map.taskCol).trim() ? 'notLinked' : null
  }

  // ── saving ──
  const refusalText = (r: TaskFieldResult) => t(`why.${['not_authorized', 'not_allowed_move', 'not_applicable', 'not_linked', 'bad_value', 'bad_date', 'bad_stage', 'unknown_member', 'ambiguous_member', 'dropped', 'bad_link', 'protected', 'gone', 'not_mapped'].includes(r.reason ?? '') ? r.reason : 'generic'}`)
  /** Values and snapshot cells for newly linked rows, as parts of one step. */
  function linkParts(pairs: { rowId: string; taskId: string | null }[], m: SheetTaskMap | null, vals: Record<string, LinkedTask>): BlankChange[] {
    const out: BlankChange[] = []
    const rows: RowTasksChange['rows'] = pairs.map(x => ({ rowId: x.rowId, before: rowTasks[x.rowId] ?? null, after: x.taskId })).filter(x => x.before !== x.after)
    if (rows.length) out.push({ kind: 'rowTasks', rows })
    if (m) {
      const cells: { rowId: string; colId: string; before: string; after: string }[] = []
      for (const x of pairs) {
        const tk = x.taskId ? vals[x.taskId] : null
        if (!tk) continue
        for (const [colId, f] of Object.entries(m.fields)) {
          if (!tk.applies.includes(f)) continue
          const after = snap(f, tk.values[f] ?? ''), before = ref.current.value(x.rowId, colId)
          if (after !== before) cells.push({ rowId: x.rowId, colId, before, after })
        }
      }
      if (cells.length) out.push({ kind: 'cells', cells })
    }
    return out
  }

  /** In front of the sheet's apply: mapped cells to their tasks, Task cells re-link, the rest as before. */
  const applyRouted = useCallback(async (label: string, forward: BlankChange[]) => {
    const cur = ref.current, ex2 = cur.doc.extras, m = ex2?.taskMap ?? null
    if (!m) { cur.apply(label, forward); return }
    const rt = ex2?.rowTasks ?? {}, tk = ex2?.tasks ?? {}
    const writes: { rowId: string; field: TaskField; value: string; before: string; colId: string }[] = []
    const relink: { rowId: string; text: string }[] = []
    const fwd: BlankChange[] = []
    for (const ch of forward) {
      if (ch.kind === 'deleteRows') {
        // A deleted row takes its link with it, and undo brings both back (FR-041: never a task change).
        const linked = ch.rows.filter(r => rt[r.id]).map(r => ({ rowId: r.id, before: rt[r.id], after: null as string | null }))
        if (linked.length) fwd.push({ kind: 'rowTasks', rows: linked })
        fwd.push(ch)
        continue
      }
      if (ch.kind === 'deleteCols') {
        const gone = new Set(ch.cols.map(c => c.id))
        if (gone.has(m.taskCol)) fwd.push({ kind: 'taskMap', before: m, after: null })
        else if (Object.keys(m.fields).some(c => gone.has(c))) fwd.push({ kind: 'taskMap', before: m, after: { taskCol: m.taskCol, fields: Object.fromEntries(Object.entries(m.fields).filter(([c]) => !gone.has(c))) } })
        fwd.push(ch)
        continue
      }
      if (ch.kind !== 'cells') { fwd.push(ch); continue }
      const keep: typeof ch.cells = []
      for (const x of ch.cells) {
        const f = m.fields[x.colId], tid = rt[x.rowId]
        if (f && tid && tk[tid]) { writes.push({ rowId: x.rowId, field: f, value: x.after, before: tk[tid].values[f] ?? '', colId: x.colId }); continue }
        if (x.colId === m.taskCol) relink.push({ rowId: x.rowId, text: x.after })
        keep.push(x)
      }
      if (keep.length) fwd.push({ ...ch, cells: keep })
    }
    if (!writes.length && !relink.length) { if (fwd.length) cur.apply(label, fwd); return }

    const sheetId = cur.doc.id
    const extra: BlankChange[] = []
    if (relink.length) {
      const r = await cur.api.resolveTaskCells(sheetId, relink)
      if (r.success) {
        const pairs = [...r.linked.map(x => ({ rowId: x.rowId, taskId: x.taskId as string | null })), ...r.cleared.map(rowId => ({ rowId, taskId: null })), ...r.unmatched.map(x => ({ rowId: x.rowId, taskId: null })), ...r.ambiguous.map(x => ({ rowId: x.rowId, taskId: null }))]
        setAmbiguous(a => { const n = { ...a }; for (const x of relink) delete n[x.rowId]; for (const x of r.ambiguous) n[x.rowId] = x.choices.map(c => ({ ...c, dropped: false })); return n })
        mergeTasks(r.tasks)
        extra.push(...linkParts(pairs, m, r.tasks))
      }
    }
    if (writes.length) {
      const r = await cur.api.writeTaskFields(sheetId, writes.map(w => ({ rowId: w.rowId, field: w.field, value: w.value })))
      if (!r.success) { cur.say(t(`why.${r.error === 'protected' ? 'protected' : 'generic'}`)) }
      else {
        mergeTasks(r.tasks)
        const ok: TaskFieldsChange['cells'] = []
        let refused = 0
        r.results.forEach((res, i) => {
          const w = writes[i]
          if (res.ok) { if ((res.shown ?? '') !== w.before) ok.push({ rowId: w.rowId, field: w.field, before: w.before, after: res.shown ?? '' }); return }
          refused++
          if (writes.length === 1) cur.onNote(`${w.rowId}|${w.colId}`, refusalText(res))
        })
        if (ok.length) extra.push({ kind: 'taskFields', cells: ok })
        if (refused && writes.length > 1) cur.say(r.results.every(x => x.ok || x.reason === 'not_authorized') ? t('result.skipped', { n: refused }) : t('result.skippedMixed', { n: refused }))
        const cel = r.results.find(x => x.celebrate)
        if (cel) { const tid = rt[cel.rowId]; useUIStore.getState().setCelebration({ taskName: r.tasks[tid]?.name ?? '', stageLabel: cel.stageLabel ?? '' }) }
      }
    }
    if (fwd.length || extra.length) cur.apply(label, [...fwd, ...extra])
  }, [mergeTasks, t]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Link to board ──
  const colInfo = (): ColInfo[] => {
    const cur = ref.current
    const first = cur.vRows[0]?.id
    const second = cur.vRows[1]?.id
    return cur.vCols.map(c => ({ id: c.id, letter: colLetters(cur.colIndex.get(c.id) ?? 0), name: first ? cur.value(first, c.id) : '', sample: second ? cur.value(second, c.id) : '' }))
  }
  async function saveLink(next: SheetTaskMap) {
    const cur = ref.current, sheetId = cur.doc.id
    // Every row's Task cell, from what is on screen (unsaved edits included).
    const cells = cur.doc.rows.map(r => ({ rowId: r.id, text: cur.value(r.id, next.taskCol) })).filter(c => (c.text.trim() || rowTasks[c.rowId]) && !isHeading(c.rowId, next))
    const res = cells.length ? await cur.api.resolveTaskCells(sheetId, cells) : { success: true as const, linked: [], ambiguous: [], unmatched: [], cleared: [], tasks: {} }
    if (!res.success) { cur.say(t(`why.${res.error === 'protected' ? 'protected' : 'generic'}`)); return null }
    const ids = res.linked.map(x => x.taskId)
    const tv = ids.length ? await cur.api.taskValues(sheetId, ids, next) : { success: true as const, tasks: {} }
    const vals = tv.success ? tv.tasks : {}
    mergeTasks(vals)
    // Rows that were linked before and aren't in this answer keep their link only if the Task column didn't change.
    const pairs = [...res.linked.map(x => ({ rowId: x.rowId, taskId: x.taskId as string | null })), ...res.cleared.map(rowId => ({ rowId, taskId: null })), ...res.unmatched.map(x => ({ rowId: x.rowId, taskId: null })), ...res.ambiguous.map(x => ({ rowId: x.rowId, taskId: null }))]
    setAmbiguous(Object.fromEntries(res.ambiguous.map(a => [a.rowId, a.choices.map(c => ({ ...c, dropped: false }))])))
    cur.apply(map ? 'changeLink' : 'link', [{ kind: 'taskMap', before: map, after: next }, ...linkParts(pairs, next, vals)])
    return { linked: res.linked.length, notFound: res.unmatched.length, toChoose: res.ambiguous.length }
  }
  function unlink() {
    if (!map) return
    const rows = Object.entries(rowTasks).map(([rowId, id]) => ({ rowId, before: id as string | null, after: null }))
    ref.current.apply('unlink', [{ kind: 'taskMap', before: map, after: null }, ...(rows.length ? [{ kind: 'rowTasks' as const, rows }] : [])])
    setAmbiguous({})
    ref.current.say(t('result.unlinkedKept'))
  }
  function review() {
    const first = Object.keys(ambiguous)[0]
    if (first && map) setDlg({ k: 'choose', rowId: first, text: ref.current.value(first, map.taskCol), choices: ambiguous[first] })
  }
  async function chooseTask(rowId: string, taskId: string) {
    const cur = ref.current
    if (!map) return
    const tv = await cur.api.taskValues(cur.doc.id, [taskId], map)
    const vals = tv.success ? tv.tasks : {}
    mergeTasks(vals)
    const link = taskLink(taskId, window.location.origin)
    const parts = linkParts([{ rowId, taskId }], map, vals)
    cur.apply('chooseTask', [{ kind: 'cells', cells: [{ rowId, colId: map.taskCol, before: cur.value(rowId, map.taskCol), after: link }] }, ...parts])
    setAmbiguous(a => { const n = { ...a }; delete n[rowId]; return n })
  }
  async function openChoose(rowId: string) {
    if (!map) return
    const text = ref.current.value(rowId, map.taskCol)
    let list = ambiguous[rowId]
    if (!list) { const r = await ref.current.api.searchTasks(text, {}); list = r.success ? r.tasks : [] }
    setDlg({ k: 'choose', rowId, text, choices: list })
  }

  // ── Add tasks… ──
  async function addTasks(ids: string[]) {
    const cur = ref.current
    if (!map || !ids.length) return
    const q = cur.rect()
    const made = cur.makeRows(q.r1 + 1, ids.length)
    const tv = await cur.api.taskValues(cur.doc.id, ids, map)
    const vals = tv.success ? tv.tasks : {}
    mergeTasks(vals)
    const origin = window.location.origin
    const cells: { rowId: string; colId: string; before: string; after: string }[] = []
    made.forEach((r, i) => {
      cells.push({ rowId: r.id, colId: map.taskCol, before: '', after: taskLink(ids[i], origin) })
      const tk = vals[ids[i]]
      if (tk) for (const [colId, f] of Object.entries(map.fields)) if (tk.applies.includes(f) && tk.values[f]) cells.push({ rowId: r.id, colId, before: '', after: snap(f, tk.values[f] ?? '') })
    })
    cur.apply('addTasks', [
      { kind: 'insertRows', rows: made.map(r => ({ ...r, height: null })) },
      { kind: 'cells', cells },
      { kind: 'rowTasks', rows: made.map((r, i) => ({ rowId: r.id, before: null, after: ids[i] })) },
    ])
  }

  // ── Create tasks for rows… ──
  function createRows(): CreateRow[] {
    const cur = ref.current
    if (!map) return []
    const q = cur.rect()
    const out: CreateRow[] = []
    for (let r = q.r0; r <= q.r1; r++) {
      const row = cur.vRows[r]
      if (!row || rowTasks[row.id]) continue
      const values: TaskFieldValues = {}
      for (const [colId, f] of Object.entries(map.fields)) { const v = cur.value(row.id, colId).trim(); if (v) values[f] = v }
      if (!values.title) { const tc = cur.value(row.id, map.taskCol).trim(); if (tc) values.title = tc }
      if (!Object.keys(values).length) continue
      out.push({ rowId: row.id, n: (cur.rowIndex.get(row.id) ?? 0) + 1, values })
    }
    return out
  }
  async function createTasks(rows: { rowId: string; values: TaskFieldValues }[], due: string) {
    const cur = ref.current
    if (!map) return
    const r = await cur.api.createTasksForRows(cur.doc.id, rows, { due })
    if (!r.success) { cur.say(t(`why.${r.error === 'protected' || r.error === 'not_authorized' ? r.error : 'generic'}`)); return }
    mergeTasks(r.tasks)
    const origin = window.location.origin
    const cells = r.created.map(c => ({ rowId: c.rowId, colId: map.taskCol, before: cur.value(c.rowId, map.taskCol), after: taskLink(c.taskId, origin) }))
    const parts = linkParts(r.created.map(c => ({ rowId: c.rowId, taskId: c.taskId })), map, r.tasks)
    if (r.created.length) cur.apply('createTasks', [{ kind: 'cells', cells }, ...parts])
    cur.say(t('create.done', { n: r.created.length }) + (r.problems.length ? ` ${t('result.skippedMixed', { n: r.problems.length })}` : ''))
  }

  // ── the workbook's Board ▾ menu ──
  const unlinkedSelected = (() => { if (!map) return 0; const q = p.rect(); let n = 0; for (let r = q.r0; r <= q.r1; r++) { const row = p.vRows[r]; if (row && !rowTasks[row.id]) n++ } return n })()
  const stateKey = JSON.stringify({ linked: !!map, canCreate: !!choices?.canCreate, unlinkedSelected, readOnly: p.ro })
  useEffect(() => {
    document.dispatchEvent(new CustomEvent<LinksState>(LINKS_STATE, { detail: JSON.parse(stateKey) }))
  }, [stateKey])
  useEffect(() => () => { document.dispatchEvent(new CustomEvent(LINKS_STATE, { detail: null })) }, [])
  useEffect(() => {
    const on = (e: Event) => {
      const what = (e as CustomEvent<LinksWhat>).detail
      if (ref.current.ro && what !== 'refresh') { ref.current.say(ref.current.ro); return }
      if (what === 'link') setDlg({ k: 'link' })
      else if (what === 'add') setDlg({ k: 'add' })
      else if (what === 'create') setDlg({ k: 'create', rows: createRows() })
      else void refresh(true)
    }
    document.addEventListener(LINKS_OPEN, on)
    return () => document.removeEventListener(LINKS_OPEN, on)
  }) // eslint-disable-line react-hooks/exhaustive-deps

  // ── board changes (R6): on focus and every 60 s while visible ──
  const refresh = useCallback(async (loud = false) => {
    const cur = ref.current
    if (!cur.doc.extras?.taskMap) return
    const r = await cur.api.refreshTaskFields(cur.doc.id)
    if (!r.success) return
    cur.patch(d => {
      const cells = { ...d.cells }
      for (const c of r.cells) { const row = { ...(cells[c.rowId] ?? {}) }; if (c.value) row[c.colId] = c.value; else delete row[c.colId]; cells[c.rowId] = row }
      return { ...d, cells, extras: { ...d.extras!, tasks: { ...(d.extras?.tasks ?? {}), ...r.tasks }, rowTasks: r.rowTasks } }
    })
    if (loud) cur.say(t('result.refreshed'))
  }, [t])
  useEffect(() => {
    if (!map) return
    const tick = () => { if (document.visibilityState === 'visible') void refresh() }
    const id = window.setInterval(tick, 60_000)
    const onVis = () => { if (document.visibilityState === 'visible') void refresh() }
    document.addEventListener('visibilitychange', onVis)
    window.addEventListener('focus', onVis)
    return () => { window.clearInterval(id); document.removeEventListener('visibilitychange', onVis); window.removeEventListener('focus', onVis) }
  }, [!!map, refresh]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── dialogs ──
  const close = () => setDlg(null)
  let node: ReactNode = null
  if (dlg?.k === 'link') node = <LinkDialog cols={colInfo()} map={map} teamCols={choices?.teamCols ?? []} onSave={saveLink} onUnlink={unlink} onReview={review} onClose={close} />
  if (dlg?.k === 'choose') node = <ChooseTask text={dlg.text} row={(p.rowIndex.get(dlg.rowId) ?? 0) + 1} choices={dlg.choices}
    search={async q => { const r = await p.api.searchTasks(q, {}); return r.success ? r.tasks : [] }} onPick={id => void chooseTask(dlg.rowId, id)} onClose={close} />
  if (dlg?.k === 'add') node = <AddTasks below={(p.rowIndex.get(p.vRows[p.rect().r1]?.id ?? '') ?? 0) + 1} people={choices?.people ?? []} projects={choices?.projects ?? []}
    search={async (q, f) => { const r = await p.api.searchTasks(q, f); return r.success ? r.tasks : [] }} onAdd={ids => void addTasks(ids)} onClose={close} />
  if (dlg?.k === 'create') node = <CreateTasksPreview rows={dlg.rows} people={choices?.people ?? []} onCreate={createTasks} onClose={close} />

  return { map, rowTasks, tasks, taskOfRow, shown, noteOfRow, applyRouted, openChoose, node, teamCols: choices?.teamCols ?? [] }
}

/** Undo and redo of mapped cells: the earlier values go back through the board's rules (R5). */
export async function replayTaskFields(api: LinksApi, sheetId: string, change: TaskFieldsChange, patch: (fn: (d: SheetDoc) => SheetDoc) => void, say: (text: string) => void, tr: (k: string, v?: Record<string, number>) => string) {
  const r = await api.writeTaskFields(sheetId, change.cells.map(c => ({ rowId: c.rowId, field: c.field, value: c.after })))
  if (!r.success) { say(tr('why.generic')); return }
  patch(d => ({ ...d, extras: { ...d.extras!, tasks: { ...(d.extras?.tasks ?? {}), ...r.tasks } } }))
  const refused = r.results.filter(x => !x.ok).length
  if (refused) say(tr('result.skippedMixed', { n: refused }))
}
