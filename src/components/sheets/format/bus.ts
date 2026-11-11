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
import type { BorderSide, CellStyle, ColFilter, ConditionalRule, SortKey } from '@/types/index'
import type { BorderPreset, StylePatch } from '@/lib/sheet-format'

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
}

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
  | { kind: 'pasteSpecial'; mode: 'all' | 'values' | 'formats'; transpose: boolean; grid: string[][]; styles: (CellStyle | null)[][] | null }
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
