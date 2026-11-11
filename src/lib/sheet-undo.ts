/**
 * Undo and redo for a sheet (spec 013 R5, FR-030–FR-032). Pure.
 *
 * A step holds what it did and what undoes it, both as change sets the sheet
 * already knows how to apply and save. One step per action, however large: a
 * paste of 1,000 cells is one step. The stack is per sheet and per visit.
 *
 * Spec 015 adds formatting (`formats`: each record's style before and after),
 * merges and view settings. A whole column or Ctrl+A is one record, so one
 * step however many cells it covers.
 */
import type { CellStyle, ConditionalRule, SheetMergeRecord, SheetTableRecord, SheetView } from '@/types/index'

/** Formatting, on any sheet: rowKey and colKey as in sheet_formats ('' = every). */
export type FormatsChange = { kind: 'formats'; items: { rowKey: string; colKey: string; before: CellStyle | null; after: CellStyle | null }[] }
/** Merged cells added and removed (blank sheets only). */
export type MergesChange = { kind: 'merges'; add: SheetMergeRecord[]; remove: SheetMergeRecord[] }
/** Frozen panes, hidden rows and columns, the filter (stage 2–3). */
export type ViewChange = { kind: 'view'; before: Partial<SheetView>; after: Partial<SheetView> }
/** Stage 3: the sheet's conditional formatting rules, the whole list before and after (any sheet). */
export type RulesChange = { kind: 'rules'; before: ConditionalRule[]; after: ConditionalRule[] }
/** Stage 3: Format as Table and Convert to range, the whole list before and after (blank sheets). */
export type TablesChange = { kind: 'tables'; before: SheetTableRecord[]; after: SheetTableRecord[] }
/** Stage 3: Sort moves rows by changing their positions (blank sheets). */
export type RowOrderChange = { kind: 'rowOrder'; rows: { id: string; before: number; after: number }[] }

/** A blank sheet's change, with enough to reverse it. */
export type BlankChange =
  | { kind: 'cells'; cells: { rowId: string; colId: string; before: string; after: string }[] }
  | { kind: 'insertRows'; rows: { id: string; position: number; height: number | null }[] }
  | { kind: 'deleteRows'; rows: { id: string; position: number; height: number | null }[]; cells: { rowId: string; colId: string; value: string }[] }
  | { kind: 'insertCols'; cols: { id: string; position: number; width: number | null }[] }
  | { kind: 'deleteCols'; cols: { id: string; position: number; width: number | null }[]; cells: { rowId: string; colId: string; value: string }[] }
  | { kind: 'rowHeights'; rows: { id: string; before: number | null; after: number | null }[] }
  | { kind: 'colWidths'; cols: { id: string; before: number | null; after: number | null }[] }
  | FormatsChange
  | MergesChange
  | ViewChange
  | RulesChange
  | TablesChange
  | RowOrderChange

/** A linked sheet's change: task fields and team columns, before and after. */
export type LinkedChange =
  | { kind: 'taskCells'; cells: { taskId: string; field: string; before: string; after: string }[] }
  | { kind: 'dropRows'; taskIds: string[] }
  | { kind: 'restoreRows'; taskIds: string[] }
  | FormatsChange
  | ViewChange
  | RulesChange

export type Change = BlankChange | LinkedChange

/** The change that reverses this one. */
export function invert(ch: Change): Change {
  switch (ch.kind) {
    case 'cells': return { kind: 'cells', cells: ch.cells.map(x => ({ ...x, before: x.after, after: x.before })) }
    case 'insertRows': return { kind: 'deleteRows', rows: ch.rows, cells: [] }
    case 'deleteRows': return { kind: 'insertRows', rows: ch.rows }
    case 'insertCols': return { kind: 'deleteCols', cols: ch.cols, cells: [] }
    case 'deleteCols': return { kind: 'insertCols', cols: ch.cols }
    case 'rowHeights': return { kind: 'rowHeights', rows: ch.rows.map(x => ({ id: x.id, before: x.after, after: x.before })) }
    case 'colWidths': return { kind: 'colWidths', cols: ch.cols.map(x => ({ id: x.id, before: x.after, after: x.before })) }
    case 'taskCells': return { kind: 'taskCells', cells: ch.cells.map(x => ({ ...x, before: x.after, after: x.before })) }
    case 'dropRows': return { kind: 'restoreRows', taskIds: ch.taskIds }
    case 'restoreRows': return { kind: 'dropRows', taskIds: ch.taskIds }
    case 'formats': return { kind: 'formats', items: ch.items.map(x => ({ ...x, before: x.after, after: x.before })) }
    case 'merges': return { kind: 'merges', add: ch.remove, remove: ch.add }
    case 'view': return { kind: 'view', before: ch.after, after: ch.before }
    case 'rules': return { kind: 'rules', before: ch.after, after: ch.before }
    case 'tables': return { kind: 'tables', before: ch.after, after: ch.before }
    case 'rowOrder': return { kind: 'rowOrder', rows: ch.rows.map(x => ({ id: x.id, before: x.after, after: x.before })) }
  }
}

/**
 * Deleted rows or columns come back with their cells: the undo of a delete is
 * the insert plus the cells it held, as one step.
 */
export function inverseSteps(ch: Change): Change[] {
  if (ch.kind === 'deleteRows' || ch.kind === 'deleteCols') {
    const back: Change[] = [invert(ch)]
    if (ch.cells.length) back.push({ kind: 'cells', cells: ch.cells.map(x => ({ rowId: x.rowId, colId: x.colId, before: '', after: x.value })) })
    return back
  }
  return [invert(ch)]
}

/** One undoable action: what it did, and what undoes it, in order. */
export interface Step {
  label: string
  forward: Change[]
  backward: Change[]
}

export function makeStep(label: string, forward: Change[]): Step {
  return { label, forward, backward: forward.slice().reverse().flatMap(inverseSteps) }
}

export const MAX_STEPS = 100

export interface Stack { done: Step[]; undone: Step[] }
export const emptyStack = (): Stack => ({ done: [], undone: [] })

/** A new action: it goes on top, and the redo list is cleared (FR-031). */
export function push(s: Stack, step: Step): Stack {
  const done = [...s.done, step]
  return { done: done.length > MAX_STEPS ? done.slice(done.length - MAX_STEPS) : done, undone: [] }
}

/** Undo: the step to apply backwards, and the new stack; null when there is nothing. */
export function undo(s: Stack): { step: Step; stack: Stack } | null {
  const step = s.done[s.done.length - 1]
  if (!step) return null
  return { step, stack: { done: s.done.slice(0, -1), undone: [...s.undone, step] } }
}

/** Redo: the step to apply forwards again, and the new stack; null when there is nothing. */
export function redo(s: Stack): { step: Step; stack: Stack } | null {
  const step = s.undone[s.undone.length - 1]
  if (!step) return null
  return { step, stack: { done: [...s.done, step], undone: s.undone.slice(0, -1) } }
}

export const canUndo = (s: Stack) => s.done.length > 0
export const canRedo = (s: Stack) => s.undone.length > 0
