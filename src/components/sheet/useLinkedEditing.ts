'use client'

/**
 * Spreadsheet editing on the linked sheets (spec 013 US2, US6; FR-020–FR-032,
 * FR-060): paste, clear and cut over a range, and undo and redo, for the
 * Video sheet and the Content sheet.
 *
 * Every cell goes through the sheet's own single-cell save (`commit`), so a
 * pasted title, clip time or team-column value is checked, permitted and
 * notified exactly as if it had been typed (contracts/server.md: "today's
 * paths"). A cell that can't be written is counted, with why, and the rest go
 * on. Undo replays a step's earlier values through the same saves.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import type { CellWrite, GridCol, WriteResult, WriteWhy } from './GridCore'
import { emptyStack, makeStep, push, redo as redoStack, undo as undoStack, type FormatsChange, type LinkedChange, type RulesChange, type Stack, type ViewChange } from '@/lib/sheet-undo'
import type { CellStyle } from '@/types/index'
import { validateStyle } from '@/lib/sheet-format'

const POOL = 4

export interface LinkedEditingInput<R extends { key: string }> {
  rows: R[]
  cols: GridCol[]
  isText(row: R, col: GridCol): boolean
  textValue(row: R, col: GridCol): string
  /** The sheet's single-cell save: null when saved, otherwise the reason. */
  commit(row: R, col: GridCol, value: string): Promise<string | null>
  /** Why a cell can't be typed into, when it's about who may edit (not the column). */
  readOnlyNote?(row: R, col: GridCol): string | null
  /** Only these rows hold cells (a task row, not a group or "+ Clip" row). */
  isCellRow(row: R): boolean
  onSkipped?(skipped: Partial<Record<string, number>>): void
  /** Drop (Video) or archive (Content) a task, and bring it back: true when it worked. */
  drop?(taskId: string): Promise<boolean>
  restore?(taskId: string): Promise<boolean>
  /** Spec 015: put format records to these looks (undo and redo of formatting); false when not saved. */
  applyFormats?(items: FormatsChange['items']): Promise<boolean>
  /** Spec 015 FR-041/FR-070: a paste carries the copied cells' looks — the task a row is, and a cell's current look. */
  taskOf?(row: R): string | null
  styleOf?(row: R, col: GridCol): CellStyle | null
  /** Spec 015 stage 3: put the sheet's rules, or its sort and filter, back (undo and redo). */
  applyExtra?(change: RulesChange | ViewChange): Promise<boolean>
}

/**
 * The workbook's toolbar and the linked grid talk through two document events,
 * since the board's sheet is rendered by the page, not by the workbook:
 * `momentum:sheet-history` says what can be undone, `momentum:sheet-undo` asks.
 */
export const HISTORY_EVENT = 'momentum:sheet-history'
export const UNDO_EVENT = 'momentum:sheet-undo'

type Cell = { rowKey: string; col: GridCol; before: string; after: string }

async function pool<T>(items: T[], fn: (x: T) => Promise<void>) {
  let i = 0
  await Promise.all(Array.from({ length: Math.min(POOL, items.length) }, async () => { while (i < items.length) await fn(items[i++]) }))
}

export function useLinkedEditing<R extends { key: string }>(p: LinkedEditingInput<R>) {
  const ref = useRef(p)
  ref.current = p
  const stack = useRef<Stack>(emptyStack())
  const [, setTick] = useState(0)

  /** Save cells; returns those that saved and the reasons for those that didn't. */
  const save = useCallback(async (cells: Cell[], forward: boolean) => {
    const { rows, commit } = ref.current
    const byKey = new Map(rows.map(r => [r.key, r]))
    const done: Cell[] = []
    const failed: { cell: Cell; note: string }[] = []
    const skipped: Partial<Record<string, number>> = {}
    await pool(cells, async c => {
      const row = byKey.get(c.rowKey)
      if (!row) { skipped.gone = (skipped.gone ?? 0) + 1; return }
      const note = await commit(row, c.col, forward ? c.after : c.before)
      if (note) { skipped.invalid = (skipped.invalid ?? 0) + 1; failed.push({ cell: c, note }) }
      else done.push(c)
    })
    return { done, skipped, failed }
  }, [])

  const record = (label: string, cells: Cell[], formats: FormatsChange['items'] = []) => {
    if (!cells.length && !formats.length) return
    const changes: LinkedChange[] = []
    if (cells.length) changes.push({ kind: 'taskCells', cells: cells.map(c => ({ taskId: c.rowKey, field: c.col, before: c.before, after: c.after })) })
    if (formats.length) changes.push({ kind: 'formats', items: formats })
    stack.current = push(stack.current, makeStep(label, changes))
    setTick(t => t + 1)
  }

  /** One typed cell: saved as before, and remembered for undo. */
  const onCommit = useCallback(async (row: R, col: GridCol, value: string) => {
    const before = ref.current.isCellRow(row) ? ref.current.textValue(row, col) : null
    const note = await ref.current.commit(row, col, value)
    if (!note && before !== null && before !== value) record('edit', [{ rowKey: row.key, col, before, after: value }])
    return note
  }, [])

  const writeCells = useCallback(async (writes: CellWrite[], why: WriteWhy): Promise<WriteResult> => {
    const { rows, cols, isText, textValue, readOnlyNote, isCellRow } = ref.current
    const skipped: Partial<Record<string, number>> = {}
    const bump = (k: string) => { skipped[k] = (skipped[k] ?? 0) + 1 }
    const cells: Cell[] = []
    // Spec 020: which cells were refused, and why (a move puts nothing in when any value doesn't fit).
    const refused: NonNullable<NonNullable<WriteResult>['refused']> = []
    const at = new Map<string, { r: number; c: number }>()
    for (const w of writes) {
      const row = rows[w.r], col = cols[w.c]
      if (!row || !col) { if (w.value) bump('read_only'); continue }
      if (!isCellRow(row)) continue
      const before = textValue(row, col)
      if (before === w.value) continue
      if (!isText(row, col)) {
        const note = readOnlyNote?.(row, col)
        bump(note ? 'not_authorized' : 'read_only')
        refused.push({ r: w.r, c: w.c, value: w.value, note: note ?? '' })
        continue
      }
      at.set(`${row.key}|${col}`, { r: w.r, c: w.c })
      cells.push({ rowKey: row.key, col, before, after: w.value })
    }
    const res = await save(cells, true)
    for (const [k, n] of Object.entries(res.skipped)) skipped[k] = (skipped[k] ?? 0) + (n ?? 0)
    for (const f of res.failed) { const p = at.get(`${f.cell.rowKey}|${f.cell.col}`); if (p) refused.push({ ...p, value: f.cell.after, note: f.note }) }
    // The copied looks go with the values (a text paste carries none): one undo step for both.
    const formats: FormatsChange['items'] = []
    const { taskOf, styleOf, applyFormats } = ref.current
    if (taskOf && styleOf && applyFormats) {
      for (const w of writes) {
        if (w.style === undefined) continue
        const row = rows[w.r], col = cols[w.c]
        if (!row || !col || col === 'rowNo' || !isCellRow(row)) continue
        const task = taskOf(row)
        if (!task) continue
        const before = styleOf(row, col) ?? null, after = validateStyle(w.style)
        if (JSON.stringify(before) !== JSON.stringify(after)) formats.push({ rowKey: task, colKey: String(col), before, after })
      }
      if (formats.length && !(await applyFormats(formats))) formats.length = 0
    }
    record(why, res.done, formats)
    return { skipped, refused, done: res.done.length }
  }, [save])

  const apply = useCallback(async (dir: 'undo' | 'redo') => {
    const r = dir === 'undo' ? undoStack(stack.current) : redoStack(stack.current)
    if (!r) return
    stack.current = r.stack
    setTick(t => t + 1)
    // The backward changes already hold the earlier values; replay them forwards.
    const skipped: Partial<Record<string, number>> = {}
    for (const change of dir === 'undo' ? r.step.backward : r.step.forward) {
      if (change.kind === 'taskCells') {
        const res = await save(change.cells.map(c => ({ rowKey: c.taskId, col: c.field, before: c.before, after: c.after })), true)
        for (const [k, n] of Object.entries(res.skipped)) skipped[k] = (skipped[k] ?? 0) + (n ?? 0)
      } else if (change.kind === 'formats') {
        if (ref.current.applyFormats && !(await ref.current.applyFormats(change.items))) skipped.invalid = (skipped.invalid ?? 0) + change.items.length
      } else if (change.kind === 'rules' || change.kind === 'view') {
        if (ref.current.applyExtra && !(await ref.current.applyExtra(change))) skipped.invalid = (skipped.invalid ?? 0) + 1
      } else if (change.kind === 'dropRows' || change.kind === 'restoreRows') {
        const fn = change.kind === 'dropRows' ? ref.current.drop : ref.current.restore
        if (!fn) continue
        await pool(change.taskIds, async id => { if (!(await fn(id))) skipped.invalid = (skipped.invalid ?? 0) + 1 })
      }
    }
    if (Object.keys(skipped).length) ref.current.onSkipped?.(skipped)
  }, [save])

  /** Drop or archive tasks (the row menu's Delete), as one undoable step. */
  const dropRows = useCallback(async (taskIds: string[]) => {
    const fn = ref.current.drop
    if (!fn) return
    const done: string[] = []
    let failed = 0
    await pool(taskIds, async id => { if (await fn(id)) done.push(id); else failed++ })
    if (done.length) {
      stack.current = push(stack.current, makeStep('dropRows', [{ kind: 'dropRows', taskIds: done }]))
      setTick(t => t + 1)
    }
    if (failed) ref.current.onSkipped?.({ invalid: failed })
  }, [])

  // The workbook's toolbar (spec 013): say what can be undone, and listen for its buttons.
  const canUndo = stack.current.done.length > 0, canRedo = stack.current.undone.length > 0
  useEffect(() => {
    document.dispatchEvent(new CustomEvent(HISTORY_EVENT, { detail: { canUndo, canRedo } }))
  }, [canUndo, canRedo])
  useEffect(() => {
    const on = (e: Event) => { void apply((e as CustomEvent<'undo' | 'redo'>).detail) }
    document.addEventListener(UNDO_EVENT, on)
    return () => {
      document.removeEventListener(UNDO_EVENT, on)
      document.dispatchEvent(new CustomEvent(HISTORY_EVENT, { detail: { canUndo: false, canRedo: false } }))
    }
  }, [apply])

  /** Spec 015: a formatting change already applied and saved, remembered as one undo step. */
  const recordFormats = useCallback((label: string, items: FormatsChange['items']) => {
    if (!items.length) return
    stack.current = push(stack.current, makeStep(label, [{ kind: 'formats', items }]))
    setTick(t => t + 1)
  }, [])

  /** Stage 3: rules or the view, already applied and saved, as one undo step. */
  const recordChanges = useCallback((label: string, changes: LinkedChange[]) => {
    if (!changes.length) return
    stack.current = push(stack.current, makeStep(label, changes))
    setTick(t => t + 1)
  }, [])

  return {
    onCommit,
    writeCells,
    recordFormats,
    record: recordChanges,
    onUndo: useCallback(() => { void apply('undo') }, [apply]),
    onRedo: useCallback(() => { void apply('redo') }, [apply]),
    dropRows,
    canUndo,
    canRedo,
  }
}
