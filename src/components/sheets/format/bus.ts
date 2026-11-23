'use client'

/**
 * The format toolbar and the open sheet talk through two document events
 * (spec 015 contracts/ui.md §1), as the undo buttons do (spec 013): the
 * Content and Video sheets are rendered by the board's page, not by the
 * workbook, so neither can hand the other props.
 *
 * - The sheet announces what is selected (`FORMAT_STATE`): the active
 *   cell's look, its value, whether it may be changed.
 * - The toolbar sends what to do (`FORMAT_CMD`): a style patch, a border
 *   preset, a merge, a new comment. The sheet turns it into format records,
 *   one undo step, and saves it.
 */
import { useEffect, useRef, useState } from 'react'
import type { BorderSide, CellStyle, ColFilter, ConditionalRule, SortKey, TotalFn, ValidationRule } from '@/types/index'
import type { BorderPreset, StylePatch } from '@/lib/sheet-format'
import type { SeriesSpec } from '@/lib/sheet-fill'
import type { PasteOp, SplitOpts } from '@/lib/sheet-clean'
import type { GoSpecial } from '@/lib/sheet-selection'

export const FORMAT_STATE = 'momentum:format-state'
export const FORMAT_CMD = 'momentum:format-cmd'

export type FormatSource = 'blank' | 'linked'

export interface FormatState {
  source: FormatSource
  /** The active cell's look, all layers resolved. */
  style: CellStyle | null
  /** The active cell's value as typed. */
  value: string
  /** How people name the active cell: B4, or "Ramadan teaser · Status". */
  cell: string
  /** The active cell's keys, as formats and comments store them (row id or task id; column id or key). */
  rowKey: string
  colKey: string
  /** Why this member can't change the formatting here, or null. */
  readOnly: string | null
  /** Why Merge is off here (the Content and Video sheets), or null. */
  mergeOff: string | null
  /** The active cell is part of a merge. */
  merged: boolean
  /** More than one cell is selected. */
  multi: boolean
  /** Spec 017: how many separate areas are selected (Ctrl+click); tools that need one block are off above 1. */
  areas?: number
  /** Spec 018: the name box: the newest area's name ("B8:D9"), and how many cells are selected. */
  range?: string
  count?: number
  /** Spec 018: the name box takes a typed cell or range here (blank sheets). */
  canGoto?: boolean
  /** Spec 017: Add to selection (Shift+F8) is on. */
  adding?: boolean
  /** Stage 2: why Hide and Freeze are off here (the Content and Video sheets), or null. */
  viewOff?: string | null
  /** Stage 2: the sheet's frozen panes, for the Freeze menu's tick. */
  frozen?: { rows: number; cols: number }
  /** Stage 3: the table the active cell is in, or null; why tables are off here (linked sheets), or null. */
  table?: { style: string } | null
  tableOff?: string | null
  /** Stage 3: the filter buttons are showing; how many columns are filtered. */
  filter?: { on: boolean; cols: number }
  /** Stage 3: the columns Sort would use (the selection, the table or the filter area), and whether its first row reads as headings. */
  sortCols?: { key: string; name: string }[]
  sortHeader?: boolean | null
  /** Stage 3: the sheet's conditional formatting rules, in order, with where each applies ("E3:E6", "Status"). */
  rules?: (ConditionalRule & { where: string })[]
  /** Spec 020: the active cell's data validation (null = none), and whether the selection mixes several; why it's off here (linked sheets). */
  validation?: ValidationRule | null
  validationMixed?: boolean
  validationOff?: string | null
  /** Spec 020: the Go To Special choices this sheet answers; the selection's values (Custom Lists › Import). */
  goSpecial?: GoSpecial[]
  selValues?: string[]
  /** Spec 020 stage B: the block around the active cell ("A1:D6"), the selection's first column's values (Text to Columns' preview), and the table's Total row and columns. */
  region?: string
  splitValues?: string[]
  tableInfo?: { totals: boolean; cols: { key: string; name: string }[] } | null
  /** Remove Duplicates' columns (named by the headings when there are some) and whether the first row reads as headings. */
  dedupe?: { header: boolean; cols: { key: string; name: string }[] }
  /** Why Clean up and the other team-sheet tools are off here (linked sheets), or null. */
  cleanOff?: string | null
  /** Rows or columns in an outline group; the Advanced Filter is on in place. */
  outline?: boolean
  advancedOn?: boolean
}

export type PasteMode = 'all' | 'values' | 'formats' | 'comments' | 'noBorders' | 'validation' | 'widths'
export type CleanOp = 'trim' | 'upper' | 'lower' | 'proper' | 'toNumber' | 'blanks'
export type SplitFormat = 'general' | 'text' | 'date' | 'skip'
/** The dialogs the toolbar asks the workbook to open. */
export type TipKey = 'goto' | 'gotoSpecial' | 'series' | 'validation' | 'lists' | 'dedupe' | 'split' | 'createTable' | 'slicers' | 'advanced'
export type MergeMode = 'center' | 'across' | 'cells' | 'unmerge'
export type ViewOp = 'hideRows' | 'hideCols' | 'unhideRows' | 'unhideCols' | 'freezeTop' | 'freezeFirst' | 'freezeHere' | 'unfreeze'
export type ClearWhat = 'all' | 'formats' | 'contents' | 'comments'
export interface FindQuery { query: string; matchCase: boolean; whole: boolean }
export type FormatCmd =
  | { kind: 'patch'; patch: StylePatch; label: string }
  | { kind: 'borders'; preset: BorderPreset; line: BorderSide }
  | { kind: 'merge'; mode: MergeMode }
  | { kind: 'comment' }
  // Stage 2: the editing tools (FR-040–FR-047).
  | { kind: 'view'; op: ViewOp }
  | { kind: 'resize'; what: 'row' | 'col' }
  | { kind: 'paint'; style: CellStyle | null }
  | { kind: 'clear'; what: ClearWhat }
  | { kind: 'fill'; dir: 'down' | 'right' }
  | { kind: 'pasteSpecial'; mode: PasteMode; transpose: boolean; grid: string[][]; styles: (CellStyle | null)[][] | null; op?: PasteOp | null; skipBlanks?: boolean; keys?: (string | null)[][] | null }
  | { kind: 'find'; q: FindQuery; dir: 1 | -1 }
  | { kind: 'replace'; q: FindQuery; by: string; all: boolean }
  // Stage 3: Styles, Sort & Filter (FR-030–FR-032, FR-045, FR-046).
  | { kind: 'cellStyle'; key: string }
  | { kind: 'table'; style: string }
  | { kind: 'tableOff' }
  | { kind: 'sort'; keys: SortKey[]; header: boolean | null }
  | { kind: 'filter'; op: 'toggle' | 'clear' | 'reapply' }
  | { kind: 'filterCol'; col: string; f: ColFilter | null }
  | { kind: 'ruleNew'; rule: Pick<ConditionalRule, 'kind' | 'args' | 'style'> }
  | { kind: 'rulesSet'; rules: ConditionalRule[] }
  | { kind: 'rulesClear'; where: 'selection' | 'sheet' }
  // Spec 018: the cell bar, the name box and Insert from the menu bar.
  | { kind: 'setValue'; value: string }
  | { kind: 'goto'; ref: string }
  | { kind: 'insert'; what: 'rowAbove' | 'rowBelow' | 'colLeft' | 'colRight' }
  // Spec 020: Go To Special, Series…, Data Validation, Flash Fill, repeat (F4), Pick From Drop-down List.
  | { kind: 'goSpecial'; what: GoSpecial; numbers?: boolean; text?: boolean }
  | { kind: 'series'; spec: SeriesSpec; by: 'rows' | 'cols' }
  | { kind: 'validation'; rule: ValidationRule | null; all: boolean }
  | { kind: 'flashFill' }
  | { kind: 'repeat' }
  | { kind: 'pickList' }
  // Spec 020 stage B (approved design power-tips-b): cell size, Clean up, tables, slicers, Advanced Filter, groups.
  | { kind: 'autofit'; what: 'row' | 'col' }
  /** Work out the block around the cell now (a dialog that needs it is opening). */
  | { kind: 'scope' }
  /** Spec 020 stage C: File › Print (Ctrl+P). */
  | { kind: 'print' }
  | { kind: 'clean'; op: CleanOp }
  | { kind: 'dedupe'; cols: string[]; header: boolean }
  | { kind: 'split'; opts: SplitOpts; formats: SplitFormat[] }
  | { kind: 'createTable'; ref: string; header: boolean }
  | { kind: 'totalRow'; on: boolean }
  | { kind: 'total'; col: string; fn: TotalFn }
  | { kind: 'slicers'; cols: string[] }
  | { kind: 'advanced'; list: string; criteria: string; copy: 'none' | 'sheet' | 'cell'; to?: string; unique: boolean }
  | { kind: 'advancedClear' }
  | { kind: 'outline'; op: 'group' | 'ungroup'; what?: 'rows' | 'cols' }

/** The toolbar started listening after a sheet announced itself: sheets announce again. */
export const FORMAT_ASK = 'momentum:format-ask'
export const announceFormat = (s: FormatState | { source: FormatSource; gone: true }) =>
  document.dispatchEvent(new CustomEvent(FORMAT_STATE, { detail: s }))
export const sendFormat = (target: FormatSource, cmd: FormatCmd) =>
  document.dispatchEvent(new CustomEvent(FORMAT_CMD, { detail: { target, cmd } }))

/**
 * A sheet's side of the bus: announce `state` whenever it changes, and run
 * commands meant for this sheet. `enabled` false (a hidden linked pane) keeps
 * it quiet.
 */
export function useFormatBridge(source: FormatSource, enabled: boolean, state: FormatState | null, run: (cmd: FormatCmd) => void) {
  const runRef = useRef(run)
  runRef.current = run
  const key = state ? JSON.stringify(state) : ''
  const stateRef = useRef(state)
  stateRef.current = state
  useEffect(() => {
    if (enabled && state) announceFormat(state)
  }, [enabled, key]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!enabled) return
    const ask = () => { if (stateRef.current) announceFormat(stateRef.current) }
    document.addEventListener(FORMAT_ASK, ask)
    return () => document.removeEventListener(FORMAT_ASK, ask)
  }, [enabled])
  useEffect(() => {
    if (!enabled) return
    const on = (e: Event) => {
      const d = (e as CustomEvent<{ target: FormatSource; cmd: FormatCmd }>).detail
      if (d.target === source) runRef.current(d.cmd)
    }
    document.addEventListener(FORMAT_CMD, on)
    return () => { document.removeEventListener(FORMAT_CMD, on); announceFormat({ source, gone: true }) }
  }, [enabled, source])
}

// ─── spec 015 comments ───────────────────────────────────────────────────────

/** "New comment" from the toolbar, a cell menu or Ctrl+Alt+M: the workbook opens the box on the active cell. */
export const COMMENT_NEW = 'momentum:comment-new'
export const askComment = () => document.dispatchEvent(new Event(COMMENT_NEW))
/** The cells with open threads (`rowKey|colKey`), for the corner markers. */
export const COMMENT_MARKS = 'momentum:comment-marks'
export const announceMarks = (source: FormatSource, keys: string[]) =>
  document.dispatchEvent(new CustomEvent(COMMENT_MARKS, { detail: { source, keys } }))
/** A sheet that just mounted asks for its markers again. */
export const COMMENT_MARKS_ASK = 'momentum:comment-marks-ask'
/** Select a cell by its keys (the comments panel, a notification's link). */
export const SELECT_CELL = 'momentum:select-cell'
export const selectCell = (source: FormatSource, rowKey: string, colKey: string) =>
  document.dispatchEvent(new CustomEvent(SELECT_CELL, { detail: { source, rowKey, colKey } }))

/** A sheet's side of the markers and selection: the marked keys, and a callback when asked to select a cell. */
export function useCommentBridge(source: FormatSource, enabled: boolean, onSelect: (rowKey: string, colKey: string) => void): Set<string> {
  const [marks, setMarks] = useState<Set<string>>(() => new Set())
  const sel = useRef(onSelect)
  sel.current = onSelect
  useEffect(() => {
    if (!enabled) return
    const onMarks = (e: Event) => { const d = (e as CustomEvent<{ source: FormatSource; keys: string[] }>).detail; if (d.source === source) setMarks(new Set(d.keys)) }
    const onSel = (e: Event) => { const d = (e as CustomEvent<{ source: FormatSource; rowKey: string; colKey: string }>).detail; if (d.source === source) sel.current(d.rowKey, d.colKey) }
    document.addEventListener(COMMENT_MARKS, onMarks)
    document.addEventListener(SELECT_CELL, onSel)
    document.dispatchEvent(new CustomEvent(COMMENT_MARKS_ASK, { detail: { source } }))
    return () => { document.removeEventListener(COMMENT_MARKS, onMarks); document.removeEventListener(SELECT_CELL, onSel) }
  }, [enabled, source])
  return marks
}

// ─── stage 2: find and replace, clearing comments ────────────────────────────

/** The sheet's answer to Find or Replace: how many matches, which one is selected, how many changed. */
export const FIND_RESULT = 'momentum:find-result'
export interface FindResult { source: FormatSource; count: number; at: number; cell: string | null; replaced?: number; skipped?: number }
export const announceFind = (r: FindResult) => document.dispatchEvent(new CustomEvent(FIND_RESULT, { detail: r }))
/** Clear › Comments: the cells whose threads to clear, `rowKey|colKey`. */
export const COMMENTS_CLEAR = 'momentum:comments-clear'
export const clearComments = (source: FormatSource, keys: string[]) =>
  document.dispatchEvent(new CustomEvent(COMMENTS_CLEAR, { detail: { source, keys } }))

/**
 * Undo for comments (spec 015 FR-048): the comments panel says what an action
 * changed, and the open sheet puts it on its own undo stack. After an undo or
 * redo, the sheet asks the panel to load the threads again.
 */
export const COMMENT_RECORD = 'momentum:comment-record'
export const recordCommentStep = (source: FormatSource, sheet: string, label: string, ops: import('@/lib/sheet-undo').CommentOp[]) =>
  document.dispatchEvent(new CustomEvent(COMMENT_RECORD, { detail: { source, sheet, label, ops } }))
export const COMMENTS_RELOAD = 'momentum:comments-reload'
export const reloadComments = (source: FormatSource) => document.dispatchEvent(new CustomEvent(COMMENTS_RELOAD, { detail: { source } }))

/** Paste carries comments (spec 015 FR-041): copy the threads at `from` ("sheet|rowKey|colKey") to these cells. */
export const COMMENTS_PASTE = 'momentum:comments-paste'
export const pasteComments = (source: FormatSource, pairs: { from: string; rowKey: string; colKey: string }[]) =>
  document.dispatchEvent(new CustomEvent(COMMENTS_PASTE, { detail: { source, pairs } }))

/** Spec 020: the right-drag menu's Series… asks the workbook for the Series dialog. */
export const SERIES_OPEN = 'momentum:series-open'
