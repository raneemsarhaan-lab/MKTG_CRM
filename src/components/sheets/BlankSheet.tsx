'use client'

/**
 * A blank sheet (spec 013 US1–US4): the shared GridCore over a SheetDoc.
 *
 * Every edit becomes a BlankChange handed to the workbook (`apply`), which
 * shows it at once, puts it on the sheet's undo stack and queues it for the
 * server. This file only works out what an action changes: which cells, which
 * rows and columns, and what they held, so that undo can put them back.
 *
 * Headings are letters (A, B … Z, AA), rows are numbered, and the sheet grows
 * when a paste runs past its edge, up to 5,000 rows and 200 columns.
 *
 * Spec 015 stage 2: hidden rows and columns are left out of the grid, so the
 * grid's indexes are over what's visible (`vRows`, `vCols`); names and
 * letters still count every row and column, as in Excel (hide row 5 and the
 * next one is still 6).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { GridCore, type ActiveCell, type AreasNotice, type CellWrite, type FillInfo, type FillRequest, type GridModel, type GridRect, type MenuTarget, type WriteWhy } from '@/components/sheet/GridCore'
import type { CellStyle, ColFilter, ConditionalRule, GroupBy, OutlineGroupRecord, SheetDoc, SheetMergeRecord, SheetTableRecord, SheetView, SortKey, StageId, TaskField, TotalFn, ValidationRecord, ValidationRule, WordField } from '@/types/index'
import { defaultMode, fillModesFor, learnFlash, planSeries, planSeriesDialog, previewValue, sourceKind, type FillCtx, type FillMode, type SeriesSpec } from '@/lib/sheet-fill'
import { allowed, listSpelling, overlaps } from '@/lib/sheet-validate'
import { foldCells, type GoSpecial } from '@/lib/sheet-selection'
import { WORD_FIELDS } from '@/types/index'
import { STAGE_META } from '@/lib/stage-meta'
import type { BlankChange } from '@/lib/sheet-undo'
import { BLANK_COL_LIMIT, BLANK_ROW_LIMIT, DEFAULT_COL_W, cellsOfCols, cellsOfRows, emptyExtras, growTo, insertAt } from '@/lib/sheet-doc'
import { display, formatKey, indexFormats, parseNumber, planBorders, planFormat, planRect, resolveStyle, showsRed, toCss, validateStyle, type FormatItem } from '@/lib/sheet-format'
import { clearPatch, matches, nextMatch, paintPatch, replaceIn, transpose } from '@/lib/sheet-tools'
import { cellStylePatch, columnValues, evalRules, filterOn, filterRows, looksLikeHeader, barCss, sortRows, tableLook, tableStyle, type CellView } from '@/lib/sheet-rules'
import { TOTAL_FNS } from '@/types/index'
import { FilterMenu } from './format/StyleTools'
import { useTaskLinks, type LinksApi } from './links/useTaskLinks'
import { normTitle, shownWord, taskIdFrom } from '@/lib/sheet-links'
import { CONTROL_FIELDS, FieldEditor, FieldIcon, FieldValue } from './links/FieldCells'
import { AddFieldMenu, FIELDS_OPEN, FieldsDrawer, MatchDialog, ValuesDialog, type ColRef } from './links/FieldsPanel'
import { SERIES_OPEN, announceFind, askComment, clearComments, useCommentBridge, useFormatBridge, type CleanOp, type FormatCmd, type FormatState, type MergeMode, type SplitFormat, type ViewOp } from './format/bus'
import { fitHeight } from './format/fit'
import { areaCols, areaRows, cellName, colLetters, unionCells, unionSize, wholeCols, wholeRows } from '@/lib/sheet-selection'
import { parseClipboard, pastePlan, toGrid } from '@/lib/sheet-clipboard'
import { PopMenu, type PopItem } from './PopMenu'
import { SheetPopover } from '@/components/sheet/SheetMenu'
import { NamePrompt } from '@/components/content/ThemeEditor'
import { openLinks } from './links/useTaskLinks'
import { ConfirmDialog, ResizeDialog } from './Dialogs'
import { ValidationAlert } from './format/TipsDialogs'
import { iconFor } from './format/RuleIcon'
import { type SplitOpts, advancedPlan, applyOp, blanksFromAbove, changeCase, dedupePlan, readCriteria, splitPlan, storedAsText, toNumber, trimClean } from '@/lib/sheet-clean'
import { group as outlineGroup, hiddenIds, showLevel, spans as olSpansOf, toggle as olToggle, ungroup as outlineUngroup } from '@/lib/sheet-outline'
import { fitWidth } from './format/fit'

const MAX_CELL = 50_000
/** Spec 020: the status bar's figures for the selection (Excel's Average, Count, Sum). */
export interface SelStats { count: number; nums: number; sum: number; avg: number | null; min: number | null; max: number | null }
const STATS_CAP = 50_000
export const BLANK_ROW_H = 24

type Row = { key: string; id: string; position: number; height: number | null }

export interface BlankSheetProps {
  doc: SheetDoc
  name: string
  /** Why this member can't change it (a protected sheet), or null. */
  readOnly: string | null
  apply(label: string, changes: BlankChange[]): void
  onUndo(): void
  onRedo(): void
  /** What is selected, for the toolbar: the active cell's name and the count; with several areas (spec 017) their names. */
  onSelect(info: { cell: string; count: number; areas?: number; label?: string; more?: number; adding?: boolean; stats?: SelStats }): void
  onSkipped(skipped: Partial<Record<string, number>>): void
  /** A short message for the workbook's toast (a menu Paste the browser refused). */
  onNotice(text: string, undo?: boolean): void
  /** Spec 020: Advanced Filter › Copy to a new sheet. */
  onNewSheet?(grid: string[][]): void
  newId(): string
  /** Spec 016: the link actions, and a change to the doc that isn't an undo step (values from the board). */
  links?: LinksApi
  patch?(fn: (doc: SheetDoc) => SheetDoc): void
  /** Spec 020: the workspace's custom lists for the fill handle; the zoom; whether there's something to redo (Ctrl+Y repeats otherwise); the status bar's mode text. */
  fillLists?: string[][]
  zoom?: number
  onZoom?(z: number): void
  canRedo?: boolean
  onStatus?(text: string | null): void
}

export function BlankSheet(p: BlankSheetProps) {
  const t = useTranslations('sheets')
  const tl = useTranslations('sheets.links')
  const tf = useTranslations('sheets.fields')
  const tt = useTranslations('sheets.tips')
  const { doc } = p
  const locale = useLocale()
  const [picked, setActive] = useState<ActiveCell | null>(null)
  const [notes, setNotes] = useState<Record<string, string | undefined>>({})
  const [menu, setMenu] = useState<{ at: { x: number; y: number }; items: PopItem[]; anchor: HTMLElement } | null>(null)
  const [resize, setResize] = useState<{ kind: 'row' | 'col'; ids: string[]; value: number } | null>(null)
  const [selectRect, setSelectRect] = useState<GridRect | null>(null)
  const rectRef = useRef<GridRect>({ r0: 0, c0: 0, r1: 0, c1: 0 })
  /** Spec 017: every selected area, the newest (`rectRef`) last. */
  const areasRef = useRef<GridRect[]>([{ r0: 0, c0: 0, r1: 0, c1: 0 }])
  const addingRef = useRef(false)
  const noteTimers = useRef(new Map<string, number>())

  const extras = doc.extras ?? emptyExtras()
  const view = extras.view
  // ── spec 019: the Content look (approved design team-sheet-content-style) ──
  const linkedMap = extras.taskMap ?? null
  /** A sheet linked to the board opens in the Content sheet's look; ⚙ Fields → Look switches it per sheet. */
  const look: 'content' | 'grid' = view.look ?? (linkedMap ? 'content' : 'grid')
  const content = look === 'content'
  /** The headings row: the first row, unless it names a task. In the Content look its cells are the column names. */
  const headRow = useMemo(() => {
    const f = doc.rows[0]
    if (!f) return null
    return linkedMap && taskIdFrom(doc.cells[f.id]?.[linkedMap.taskCol] ?? '') ? null : f.id
  }, [doc.rows, doc.cells, linkedMap])
  const [mine, setMine] = useState(false)
  const [showDone, setShowDone] = useState(() => { try { return typeof window === 'undefined' || window.localStorage.getItem('momentum.team.done') !== '0' } catch { return true } })
  const [meId, setMeId] = useState<string | null>(null)
  const index = useMemo(() => indexFormats(extras.formats), [extras.formats])
  const styleOf = useCallback((rowId: string, colId: string) => resolveStyle(index, rowId, colId), [index])
  // Stage 2: what's hidden is left out of the grid; indexes from the grid are over what's visible.
  const hiddenR = useMemo(() => new Set(view.hiddenRows ?? []), [view.hiddenRows])
  const hiddenC = useMemo(() => new Set(view.hiddenCols ?? []), [view.hiddenCols])
  // Stage 3 (FR-046): rows the filter leaves out are hidden the same way, until it's cleared.
  const fArea = view.filterArea ?? null
  const filter = useMemo(() => view.filter ?? {}, [view.filter])
  const cellView = useCallback((rowId: string, col: string): CellView => ({ text: doc.cells[rowId]?.[col] ?? '', style: resolveStyle(index, rowId, col) }), [doc.cells, index])
  /** The rows under the filter's header row, to its last row or the sheet's end. */
  const filterScope = useMemo(() => {
    if (!fArea) return [] as string[]
    const h = fArea.header ? doc.rows.findIndex(r => r.id === fArea.header) : -1
    const e = fArea.last ? doc.rows.findIndex(r => r.id === fArea.last) : -1
    return doc.rows.slice(h + 1, e >= 0 ? e + 1 : doc.rows.length).map(r => r.id)
  }, [fArea, doc.rows])
  const filteredOut = useMemo(() => {
    const out = new Set<string>()
    // Spec 020 tip 78: the Advanced Filter in place hides the list's rows that fail its criteria (and repeats, with Unique).
    const adv = view.advanced
    if (adv) {
      const a = doc.rows.findIndex(r => r.id === adv.top), b = doc.rows.findIndex(r => r.id === adv.bottom)
      const c0 = doc.cols.findIndex(c => c.id === adv.left), c1 = doc.cols.findIndex(c => c.id === adv.right)
      if (a >= 0 && b >= a && c0 >= 0 && c1 >= c0) {
        const body = doc.rows.slice(a + 1, b + 1), cols = doc.cols.slice(c0, c1 + 1).map(c => c.id)
        const keep = new Set(advancedPlan(body.map(r => cols.map(c => doc.cells[r.id]?.[c] ?? '')), cols, adv.groups, !!adv.unique))
        body.forEach((r, i) => { if (!keep.has(i)) out.add(r.id) })
      }
    }
    // Spec 020 tip 80: rows in a collapsed group.
    for (const id of hiddenIds(view.outline, 'rows', doc.rows.map(r => r.id))) out.add(id)
    if (!fArea || !Object.values(filter).some(filterOn)) return out
    const keep = new Set(filterRows(filterScope, filter, cellView))
    for (const id of filterScope) if (!keep.has(id)) out.add(id)
    return out
  }, [fArea, filter, filterScope, cellView, view.advanced, view.outline, doc.rows, doc.cols, doc.cells])
  const baseRows = useMemo(() => {
    const rt = extras.rowTasks ?? {}, tks = extras.tasks ?? {}
    const taskOf = (id: string) => (rt[id] ? tks[rt[id]] : undefined)
    return doc.rows.filter(r => {
      if (hiddenR.has(r.id) || filteredOut.has(r.id)) return false
      if (!content) return true
      if (r.id === headRow) return false
      const tk = taskOf(r.id)
      if (mine && !(tk && meId && (tk.meta?.assigneeId === meId || tk.meta?.ownerId === meId))) return false
      if (!showDone && tk?.stage === 'publish') return false
      return true
    })
  }, [doc.rows, hiddenR, filteredOut, content, headRow, mine, showDone, meId, extras.rowTasks, extras.tasks])
  /** Rows are grouped by Theme › Pillar in the Content look, unless the sheet chose otherwise. */
  const groupBy: GroupBy | null = view.groupBy ?? (content && linkedMap ? { by: 'theme' } : null)
  // Spec 019: Group rows by (a task's theme › pillar, stage, assignee or type, or a column's value).
  // The grid's order is the grouped one, so every index below stays over what's on screen.
  const grouping = useMemo(() => groupRows(doc, baseRows, groupBy, locale, {
    none: tf('bandNone'), blank: tf('bandBlank'), noTheme: tf('bandNoTheme'), unassigned: tf('bandUnassigned'), noType: tf('bandNoType'), noPillar: tf('noPillar'),
  }), [doc, baseRows, groupBy, locale, tf])
  const vRows = grouping.rows
  const vCols = useMemo(() => {
    const folded = hiddenIds(view.outline, 'cols', doc.cols.map(c => c.id))
    return doc.cols.filter(c => !hiddenC.has(c.id) && !folded.has(c.id))
  }, [doc.cols, hiddenC, view.outline])
  /** Spec 020 tip 80: the outline groups, placed on the sheet's rows and columns. */
  const olSpans = useMemo(() => ({ rows: olSpansOf(view.outline, 'rows', doc.rows.map(r => r.id)), cols: olSpansOf(view.outline, 'cols', doc.cols.map(c => c.id)) }), [view.outline, doc.rows, doc.cols])
  const olDepth = { rows: Math.max(0, ...olSpans.rows.map(g => g.level)), cols: Math.max(0, ...olSpans.cols.map(g => g.level)) }
  /** The grid shows its first cell as active before anything is clicked; the toolbar must agree. */
  const active: ActiveCell | null = picked && vRows.some(r => r.id === picked.key) ? picked
    : vRows[0] && vCols[0] ? { key: vRows[0].id, col: vCols[0].id } : null
  const rows: Row[] = useMemo(() => vRows.map(r => ({ key: r.id, ...r })), [vRows])
  const colIds = useMemo(() => vCols.map(c => c.id), [vCols])
  /** Every column's place in the sheet, hidden ones included: its letter. */
  const colIndex = useMemo(() => new Map(doc.cols.map((c, i) => [c.id, i])), [doc.cols])
  const vColIndex = useMemo(() => new Map(colIds.map((id, i) => [id, i])), [colIds])
  const widths = useMemo(() => Object.fromEntries(doc.cols.map(c => [c.id, c.width ?? DEFAULT_COL_W])), [doc.cols])
  const value = (rowId: string, colId: string) => doc.cells[rowId]?.[colId] ?? ''
  const ro = p.readOnly

  // ── spec 015: formatting, merges ────────────────────────────────────────
  /** Rows grow to fit wrapped text and large type, unless someone set their height (as Excel's autofit). */
  const autoH = useMemo(() => {
    const out = new Map<string, number>()
    const hasLayers = index.size > 0
    if (!hasLayers) return out
    for (const r of doc.rows) {
      if (r.height !== null) continue
      let h = 0
      const rowCells = doc.cells[r.id]
      for (const c of doc.cols) {
        const st = resolveStyle(index, r.id, c.id)
        if (!st) continue
        const v = rowCells?.[c.id] ?? ''
        if (!v && !st.size) continue
        h = Math.max(h, fitHeight(v, st, (c.width ?? DEFAULT_COL_W)))
      }
      if (h > BLANK_ROW_H) out.set(r.id, Math.min(400, h))
    }
    return out
  }, [doc.rows, doc.cols, doc.cells, index])
  const heightOf = (r: { id: string; height: number | null }) => r.height ?? autoH.get(r.id) ?? BLANK_ROW_H
  /** Every row's place in the sheet, hidden ones included: its number. */
  const rowIndex = useMemo(() => new Map(doc.rows.map((r, i) => [r.id, i])), [doc.rows])
  const vRowIndex = useMemo(() => new Map(vRows.map((r, i) => [r.id, i])), [vRows])
  /** The name of a visible cell: its real row number and column letter (B4). */
  const nameAt = (r: number, c: number) => cellName(rowIndex.get(vRows[r]?.id ?? '') ?? r, colIndex.get(vCols[c]?.id ?? '') ?? c)
  /** An area as Excel names it ("B2", "B2:D4", "C:E", "3:5"), by the sheet's own letters and numbers. */
  const areaName = (a: GridRect) => {
    const rowN = (r: number) => (rowIndex.get(vRows[r]?.id ?? '') ?? r) + 1, colL = (c: number) => colLetters(colIndex.get(vCols[c]?.id ?? '') ?? c)
    const allR = a.r0 === 0 && a.r1 >= vRows.length - 1, allC = a.c0 === 0 && a.c1 >= vCols.length - 1
    if (allR && !allC) return `${colL(a.c0)}:${colL(a.c1)}`
    if (allC && !allR) return `${rowN(a.r0)}:${rowN(a.r1)}`
    return a.r0 === a.r1 && a.c0 === a.c1 ? nameAt(a.r0, a.c0) : `${nameAt(a.r0, a.c0)}:${nameAt(a.r1, a.c1)}`
  }
  /** The status line (spec 017 FR-008): the active cell, the count, and with several areas their names. */
  function report() {
    const list = areasRef.current, q = rectRef.current
    const names = list.length > 1 ? list.map(areaName) : []
    // Spec 020: Average, Count and Sum of the selection, as Excel's status bar (capped for speed).
    // Only filled cells are read (a sheet is mostly empty), row by row, up to the cap.
    let count = 0, nums = 0, sum = 0, seen = 0, min = Infinity, max = -Infinity
    const counted = new Set<string>()
    for (const q of list) {
      for (let r = q.r0; r <= q.r1 && seen < STATS_CAP; r++) {
        const row = vRows[r], cells = row ? doc.cells[row.id] : undefined
        if (!cells) continue
        for (const [colId, v] of Object.entries(cells)) {
          const c = vColIndex.get(colId)
          if (c === undefined || c < q.c0 || c > q.c1 || !v) continue
          const k = `${row.id}|${colId}`
          if (counted.has(k)) continue
          counted.add(k); seen++; count++
          const n = parseNumber(v)
          if (n !== null) { nums++; sum += n; if (n < min) min = n; if (n > max) max = n }
        }
      }
    }
    const stats: SelStats = { count, nums, sum, avg: nums ? sum / nums : null, min: nums ? min : null, max: nums ? max : null }
    p.onSelect({ cell: nameAt(q.r0, q.c0), count: unionSize(list), areas: list.length, label: names.slice(0, 3).join(', '), more: Math.max(0, names.length - 3), adding: addingRef.current, stats })
    if (Date.now() - statusAt.current > 800) p.onStatus?.(null)
  }
  const statusAt = useRef(0)
  /** Merges as blocks of visible indexes; one whose edges are gone or hidden is left out. */
  const boxes = useMemo(() => extras.merges.map(m => {
    const a = vRowIndex.get(m.top), b = vRowIndex.get(m.bottom), c = vColIndex.get(m.left), d = vColIndex.get(m.right)
    if (a === undefined || b === undefined || c === undefined || d === undefined) return null
    return { m, r0: Math.min(a, b), r1: Math.max(a, b), c0: Math.min(c, d), c1: Math.max(c, d) }
  }).filter((x): x is { m: SheetMergeRecord; r0: number; r1: number; c0: number; c1: number } => !!x), [extras.merges, vRowIndex, vColIndex])
  const spans = useMemo(() => {
    const anchor = new Map<string, { width: number; height: number }>(), covered = new Map<string, string>()
    for (const b of boxes) {
      let width = 0, height = 0
      for (let c = b.c0; c <= b.c1; c++) width += vCols[c].width ?? DEFAULT_COL_W
      for (let r = b.r0; r <= b.r1; r++) height += heightOf(vRows[r])
      const ak = `${vRows[b.r0].id}|${vCols[b.c0].id}`
      anchor.set(ak, { width, height })
      for (let r = b.r0; r <= b.r1; r++) for (let c = b.c0; c <= b.c1; c++) if (r !== b.r0 || c !== b.c0) covered.set(`${vRows[r].id}|${vCols[c].id}`, ak)
    }
    return { anchor, covered }
  }, [boxes, vRows, vCols, autoH]) // eslint-disable-line react-hooks/exhaustive-deps

  const onNote = useCallback((key: string, note: string | null) => {
    setNotes(n => ({ ...n, [key]: note ?? undefined }))
    window.clearTimeout(noteTimers.current.get(key))
    if (note) noteTimers.current.set(key, window.setTimeout(() => setNotes(n => ({ ...n, [key]: undefined })), 4000))
  }, [])

  // ── spec 016: columns linked to board tasks ─────────────────────────────
  const noLinks = useMemo<LinksApi>(() => {
    const no = async () => ({ success: false as const, error: 'generic' })
    return { resolveTaskCells: no, writeTaskFields: no, refreshTaskFields: no, taskValues: no, searchTasks: no, linkChoices: no, createTasksForRows: no, addTheme: no } as unknown as LinksApi
  }, [])
  const lk = useTaskLinks({
    doc, api: p.links ?? noLinks, ro: p.readOnly, vRows, vCols, rowIndex, colIndex,
    value: (r, c) => doc.cells[r]?.[c] ?? '',
    apply: p.apply, patch: fn => p.patch?.(fn), rect: () => rectRef.current, rows: () => areaRows(areasRef.current), say: p.onNotice, onNote,
    makeRows: (at, n) => insertAt(doc.rows, at < vRows.length ? rowIndex.get(vRows[at].id) ?? doc.rows.length : doc.rows.length, n, p.newId),
  })
  /** Every change goes through the link router: mapped cells to their tasks, the rest as before (spec 016 R5). */
  const applyR = (label: string, changes: BlankChange[]) => { void lk.applyRouted(label, changes) }

  // ── spec 019: task fields, ＋, the Fields drawer, column drag ───────────
  const [fieldEd, setFieldEd] = useState<{ rowId: string; col: string; field: TaskField; anchor: HTMLElement } | null>(null)
  const [addMenu, setAddMenu] = useState<HTMLElement | null>(null)
  const [drawer, setDrawer] = useState(false)
  const [valuesFor, setValuesFor] = useState<WordField | null>(null)
  const [match, setMatch] = useState<{ field: WordField; colId: string; colName: string; values: { text: string; n: number }[] } | null>(null)
  const [rename, setRename] = useState<{ col: string; anchor: HTMLElement } | null>(null)
  const [newTheme, setNewTheme] = useState<HTMLElement | null>(null)
  useEffect(() => { if (lk.choices?.me) setMeId(lk.choices.me) }, [lk.choices?.me])
  /** The Content look: a column's name is its cell in the headings row; renaming writes that cell (one undo step). */
  const colName = (col: string) => (headRow ? value(headRow, col) : '')
  async function renameCol(col: string, name: string): Promise<string | null> {
    if (ro) return ro
    if (!headRow) return null
    const c = cellChange([{ rowId: headRow, colId: col, value: name.trim() }])
    if (c) applyR('renameCol', [c])
    setRename(null); focusActive()
    return null
  }
  /** + Column in the Content look: a regular column at the end, then its name. */
  function addRegularAtEnd(anchor: HTMLElement) {
    if (ro) { p.onNotice(ro); return }
    if (doc.cols.length + 1 > BLANK_COL_LIMIT) { p.onNotice(t('err.too_many_cols')); return }
    const made = insertAt(doc.cols, doc.cols.length, 1, p.newId)
    applyR('insertCols', [{ kind: 'insertCols', cols: made.map(c => ({ ...c, width: null })) }])
    if (content && headRow) setRename({ col: made[0].id, anchor })
  }
  useEffect(() => {
    const on = () => setDrawer(true)
    document.addEventListener(FIELDS_OPEN, on)
    return () => document.removeEventListener(FIELDS_OPEN, on)
  }, [])
  const isWord = (f: TaskField): f is WordField => (WORD_FIELDS as readonly string[]).includes(f)
  const fieldName = (f: TaskField) => (f.startsWith('col:') ? lk.teamCols.find(c => `col:${c.id}` === f)?.name ?? f : tf(`names.${f}`))
  /** The headings row: an unlinked sheet's first row, or a linked sheet's first row that names no task. */
  const headId = (() => { const f = doc.rows[0]?.id; if (!f) return null; return lk.map ? (lk.isHeading(f) ? f : null) : f })()
  const colRefs: ColRef[] = vCols.map(c => ({
    id: c.id, letter: colLetters(colIndex.get(c.id) ?? 0), name: headId ? value(headId, c.id) : '',
    field: lk.map?.fields[c.id] ?? null, task: lk.map?.taskCol === c.id,
  }))
  /** ＋ and the drawer: a field as a new column at the sheet's end, named in the headings row. */
  function addFieldAtEnd(f: TaskField) {
    if (ro) { p.onNotice(ro); return }
    if (!lk.map) { lk.askLink(); return }
    if (doc.cols.length + 1 > BLANK_COL_LIMIT) { p.onNotice(t('err.too_many_cols')); return }
    const last = doc.cols[doc.cols.length - 1]
    void lk.addField(f, { newCol: { id: p.newId(), position: (last?.position ?? 0) + 1 } }, { heading: fieldName(f) })
    p.onNotice(tf('added', { name: fieldName(f) }))
  }
  /** A field switched off: its column goes (undo brings it back); the tasks keep their values. */
  function hideField(f: TaskField) {
    if (ro) { p.onNotice(ro); return }
    const colId = Object.entries(lk.map?.fields ?? {}).find(([, x]) => x === f)?.[0]
    if (!colId) return
    const at = vCols.findIndex(c => c.id === colId)
    if (at < 0) lk.removeField(colId)
    else if (vCols.length <= 1) { p.onNotice(t('menu.keepOneCol')); return }
    else deleteColsAt([at])
    p.onNotice(tf('hidden', { name: fieldName(f) }))
  }
  /** "Use this column for a task field": Stage, Type and Priority match the column's own words first. */
  function useColumnFor(colId: string, f: TaskField) {
    if (ro) { p.onNotice(ro); return }
    if (isWord(f)) {
      const seen = new Map<string, { text: string; n: number }>()
      for (const r of doc.rows) {
        if (r.id === headId) continue
        const v = value(r.id, colId).trim()
        if (!v) continue
        const k = normTitle(v), e = seen.get(k)
        if (e) e.n++; else seen.set(k, { text: v, n: 1 })
      }
      if (seen.size) { setMatch({ field: f, colId, colName: (headId ? value(headId, colId) : '') || colLetters(colIndex.get(colId) ?? 0), values: [...seen.values()].slice(0, 60) }); return }
    }
    void lk.addField(f, { colId })
  }
  /** Drag a heading (spec 019): the column moves before the one it's dropped on, or to the end. One undo step. */
  function moveCol(from: string, before: string | null) {
    if (ro) { p.onNotice(ro); return }
    const src = doc.cols.find(c => c.id === from)
    if (!src || from === before) return
    const rest = doc.cols.filter(c => c.id !== from)
    const at = before ? rest.findIndex(c => c.id === before) : rest.length
    if (at < 0 || at === doc.cols.indexOf(src)) return
    // A merge across columns can't be split or entered by a move (as Excel).
    const spans = extras.merges.map(m => [colIndex.get(m.left) ?? 0, colIndex.get(m.right) ?? 0].sort((a, b) => a - b)).filter(([a, b]) => a !== b)
    const i = colIndex.get(from) ?? 0
    const prevI = at > 0 ? colIndex.get(rest[at - 1].id) ?? -1 : -1, nextI = at < rest.length ? colIndex.get(rest[at].id) ?? -1 : -1
    if (spans.some(([a, b]) => (i >= a && i <= b) || (prevI >= a && nextI <= b && prevI >= 0 && nextI >= 0))) { p.onNotice(tf('moveMerged')); return }
    const prev = rest[at - 1], next = rest[at]
    const pos = prev && next ? (prev.position + next.position) / 2 : next ? next.position - 1 : prev ? prev.position + 1 : 0
    applyR('moveCol', [{ kind: 'colOrder', cols: [{ id: from, before: src.position, after: pos }] }])
  }
  /** The items of "Use this column for a task field ▸": the fields not shown yet. */
  function useForItems(colId: string): PopItem[] {
    const shownF = new Set(Object.values(lk.map?.fields ?? {}))
    const all: TaskField[] = [...(['stage', 'assignee', 'owner', 'due', 'priority', 'platform', 'type', 'theme', 'pillar', 'link:doc', 'link:design', 'link:post', 'link:published'] as TaskField[]), ...lk.teamCols.map(c => `col:${c.id}` as TaskField)]
    return all.filter(f => !shownF.has(f)).map(f => ({ key: `use-${f}`, label: fieldName(f), onSelect: () => useColumnFor(colId, f) }))
  }

  /** Cells to change, with what they held; unchanged ones drop out. */
  function cellChange(list: { rowId: string; colId: string; value: string }[]): BlankChange | null {
    const cells = list
      .map(x => ({ rowId: x.rowId, colId: x.colId, before: value(x.rowId, x.colId), after: x.value }))
      .filter(x => x.before !== x.after)
    return cells.length ? { kind: 'cells', cells } : null
  }

  async function writeCells(writes: CellWrite[], why: WriteWhy) {
    if (ro) return { skipped: { protected: writes.length } }
    const skipped: Partial<Record<string, number>> = {}
    const bump = (k: string) => { skipped[k] = (skipped[k] ?? 0) + 1 }
    let maxR = -1, maxC = -1
    for (const w of writes) { if (w.r > maxR) maxR = w.r; if (w.c > maxC) maxC = w.c }
    // A paste past the edge grows the sheet (FR-024), up to the limits.
    const newRows = why === 'paste' ? growTo(doc.rows, doc.rows.length + maxR - vRows.length, BLANK_ROW_LIMIT, p.newId) : []
    const newCols = why === 'paste' ? growTo(doc.cols, doc.cols.length + maxC - vCols.length, BLANK_COL_LIMIT, p.newId) : []
    const allRows = [...vRows, ...newRows], allCols = [...vCols, ...newCols]
    const list: { rowId: string; colId: string; value: string }[] = []
    for (const w of writes) {
      const r = allRows[w.r], c = allCols[w.c]
      if (!r || !c) { if (w.value) bump('limit'); continue }
      if (w.value.length > MAX_CELL) { bump('invalid'); continue }
      list.push({ rowId: r.id, colId: c.id, value: w.value })
    }
    // Spec 020: pasted and filled values are checked against data validation; refused ones are counted.
    const checked = why === 'clear' || why === 'cut' ? list : checkList(list, bump)
    const forward: BlankChange[] = []
    if (newRows.length) forward.push({ kind: 'insertRows', rows: newRows.map(r => ({ ...r, height: null })) })
    if (newCols.length) forward.push({ kind: 'insertCols', cols: newCols.map(c => ({ ...c, width: null })) })
    const cells = cellChange(checked)
    if (cells) forward.push(cells)
    // A paste from an HTML table brings its formatting (spec 015 FR-041, SC-003); text leaves it alone.
    const items: FormatItem[] = []
    for (const w of writes) {
      if (w.style === undefined) continue
      const r = allRows[w.r], c = allCols[w.c]
      if (!r || !c) continue
      const before = index.get(formatKey(r.id, c.id)) ?? null, after = validateStyle(w.style)
      if (JSON.stringify(before) !== JSON.stringify(after)) items.push({ rowKey: r.id, colKey: c.id, before, after })
    }
    if (items.length) forward.push({ kind: 'formats', items })
    if (forward.length) applyR(why, forward)
    return { skipped }
  }

  // ── structure ───────────────────────────────────────────────────────────
  /** A visible index as a place in the whole sheet, for inserts. */
  const docRow = (at: number) => (at < vRows.length ? rowIndex.get(vRows[at].id) ?? doc.rows.length : doc.rows.length)
  const docCol = (at: number) => (at < vCols.length ? colIndex.get(vCols[at].id) ?? doc.cols.length : doc.cols.length)
  function insertRows(at: number, n: number) {
    const made = insertAt(doc.rows, docRow(at), n, p.newId)
    applyR('insertRows', [{ kind: 'insertRows', rows: made.map(r => ({ ...r, height: null })) }])
    setSelectRect({ r0: at, c0: 0, r1: at + n - 1, c1: Math.max(0, vCols.length - 1) })
  }
  function insertCols(at: number, n: number) {
    const made = insertAt(doc.cols, docCol(at), n, p.newId)
    applyR('insertCols', [{ kind: 'insertCols', cols: made.map(c => ({ ...c, width: null })) }])
    setSelectRect({ r0: 0, c0: at, r1: Math.max(0, vRows.length - 1), c1: at + n - 1 })
  }
  /** Stage 3: a table whose edge row or column is deleted keeps its other rows and columns; one fully deleted goes. */
  function tablesAfter(kind: 'rows' | 'cols', goneIds: Set<string>): BlankChange[] {
    const list = extras.tables ?? []
    if (!list.length) return []
    const all = kind === 'rows' ? doc.rows : doc.cols, idx = kind === 'rows' ? rowIndex : colIndex
    const [a, b] = kind === 'rows' ? ['top', 'bottom'] as const : ['left', 'right'] as const
    let changed = false
    const after = list.flatMap(tb => {
      if (!goneIds.has(tb[a]) && !goneIds.has(tb[b])) return [tb]
      const i0 = idx.get(tb[a]) ?? 0, i1 = idx.get(tb[b]) ?? 0
      const kept = all.slice(Math.min(i0, i1), Math.max(i0, i1) + 1).filter(x => !goneIds.has(x.id))
      changed = true
      return kept.length ? [{ ...tb, [a]: kept[0].id, [b]: kept[kept.length - 1].id }] : []
    })
    const out: BlankChange[] = changed ? [{ kind: 'tables', before: list, after }] : []
    const area = view.filterArea
    if (area && ((kind === 'rows' && area.header && goneIds.has(area.header)) || (kind === 'cols' && area.cols.every(c => goneIds.has(c))))) {
      out.push({ kind: 'view', before: viewNow(), after: { ...viewNow(), filterArea: null, filter: {} } })
    }
    return out
  }
  const range = (a: number, b: number) => Array.from({ length: b - a + 1 }, (_, i) => a + i)
  function deleteRowsAt(at: number[]) {
    const gone = at.map(i => vRows[i]).filter((x): x is NonNullable<typeof x> => !!x)
    const ids = new Set(gone.map(r => r.id))
    applyR('deleteRows', [...tablesAfter('rows', ids), ...validationsAfter('rows', ids), { kind: 'deleteRows', rows: gone, cells: cellsOfRows(doc, gone.map(r => r.id)) }])
  }
  function deleteColsAt(at: number[]) {
    const gone = at.map(i => vCols[i]).filter((x): x is NonNullable<typeof x> => !!x)
    const ids = new Set(gone.map(c => c.id))
    applyR('deleteCols', [...tablesAfter('cols', ids), ...validationsAfter('cols', ids), { kind: 'deleteCols', cols: gone, cells: cellsOfCols(doc, gone.map(c => c.id)) }])
  }
  function setHeights(ids: string[], h: number | null) {
    const list = doc.rows.filter(r => ids.includes(r.id) && r.height !== h).map(r => ({ id: r.id, before: r.height, after: h }))
    if (list.length) applyR('rowHeights', [{ kind: 'rowHeights', rows: list }])
  }
  function setWidths(ids: string[], w: number | null) {
    const list = doc.cols.filter(c => ids.includes(c.id) && c.width !== w).map(c => ({ id: c.id, before: c.width, after: w }))
    if (list.length) applyR('colWidths', [{ kind: 'colWidths', cols: list }])
  }
  function clear(sel: GridRect[]) {
    const list: { rowId: string; colId: string; value: string }[] = []
    for (const { r, c } of unionCells(sel)) {
      const row = vRows[r], col = vCols[c]
      if (row && col && value(row.id, col.id)) list.push({ rowId: row.id, colId: col.id, value: '' })
    }
    const ch = cellChange(list)
    if (ch) applyR('clear', [ch])
  }
  // ── spec 017: several areas ─────────────────────────────────────────────
  const tA = (k: string) => t(`areas.${k}`)
  const many = () => areasRef.current.length > 1
  /** A tool that needs one block, asked for with several areas: say so and stop (FR-014). */
  const oneArea = () => { if (!many()) return false; p.onNotice(tA('oneArea')); return true }
  /** The areas a menu acts on: the whole selection when it was opened inside it, else its own block. */
  function menuAreas(target: MenuTarget): GridRect[] {
    const list = areasRef.current
    const r = target.kind === 'col' ? 0 : target.r, c = target.kind === 'row' ? 0 : target.c
    const inside = target.kind === 'row' ? list.some(q => r >= q.r0 && r <= q.r1)
      : target.kind === 'col' ? list.some(q => c >= q.c0 && c <= q.c1)
      : list.some(q => r >= q.r0 && r <= q.r1 && c >= q.c0 && c <= q.c1)
    return inside && list.length > 1 ? list : [target.rect]
  }
  /** One format change per area, as one undo step: a cell in two areas changes once. */
  function planAreas(plan: (q: GridRect) => FormatItem[] | null): FormatItem[] | null {
    const byKey = new Map<string, FormatItem>()
    for (const q of areasRef.current) {
      const items = plan(q)
      if (!items) return null
      for (const it of items) {
        const k = `${it.rowKey}|${it.colKey}`, had = byKey.get(k)
        byKey.set(k, had ? { ...it, before: had.before } : it)
      }
    }
    return [...byKey.values()]
  }

  /** Back to the grid after a menu or dialog, so the keys (Ctrl+Z…) keep working. */
  const rootRef = useRef<HTMLDivElement>(null)
  const focusActive = () => requestAnimationFrame(() => {
    const a = document.activeElement
    if (a && a !== document.body && !rootRef.current?.contains(a) && a.closest('[role="dialog"], [role="menu"]')) return
    rootRef.current?.querySelector<HTMLElement>('.fx-sheet-td.is-active')?.focus({ preventScroll: true })
  })

  // ── the clipboard from a menu ───────────────────────────────────────────
  /** Copy and Cut from a menu go through the grid's own handlers (a real copy event). */
  function clipboardCommand(kind: 'copy' | 'cut', anchor: HTMLElement) {
    const cell = anchor.closest('[data-sheet-grid]')?.querySelector<HTMLElement>('.fx-sheet-td.is-active') ?? anchor
    cell.focus()
    let ok = false
    try { ok = document.execCommand(kind) } catch { ok = false }
    if (!ok) p.onNotice(t('grid.pasteHint'))
  }
  async function menuPaste(q: GridRect, sel: GridRect[] = [q]) {
    let html = '', text = ''
    try {
      const items = await navigator.clipboard.read()
      for (const it of items) {
        if (it.types.includes('text/html')) html = await (await it.getType('text/html')).text()
        if (it.types.includes('text/plain')) text = await (await it.getType('text/plain')).text()
      }
    } catch {
      try { text = await navigator.clipboard.readText() } catch { p.onNotice(t('grid.pasteHint')); return }
    }
    const g = toGrid(parseClipboard({ html, text }, new DOMParser()))
    if (!g.length) return
    if (sel.length > 1) {
      // Several areas: one copied cell fills them all; a block needs one area (FR-012).
      if (g.length !== 1 || g[0].length !== 1) { p.onNotice(tA('pasteBlock')); return }
      const res = await writeCells(unionCells(sel).map(({ r, c }) => ({ r, c, value: g[0][0] })), 'paste')
      p.onSkipped(res.skipped)
      return
    }
    const plan = pastePlan(g, q)
    const list: CellWrite[] = []
    for (let r = 0; r < plan.rows; r++) for (let c = 0; c < plan.cols; c++) list.push({ r: q.r0 + r, c: q.c0 + c, value: plan.value(r, c) })
    const res = await writeCells(list, 'paste')
    p.onSkipped(res.skipped)
    setSelectRect({ r0: q.r0, c0: q.c0, r1: q.r0 + plan.rows - 1, c1: q.c0 + plan.cols - 1 })
  }

  // ── the menus (FR-040–FR-043) ───────────────────────────────────────────
  function contextMenu(target: MenuTarget, at: { x: number; y: number }, anchor: HTMLElement) {
    const q = target.rect
    const sel = menuAreas(target), several = sel.length > 1
    const selRows = areaRows(sel), selCols = areaCols(sel)
    const rowsWhole = wholeRows(sel, vCols.length), colsWhole = wholeCols(sel, vRows.length)
    const nr = several ? selRows.length : q.r1 - q.r0 + 1, nc = several ? selCols.length : q.c1 - q.c0 + 1
    const one = several ? { disabled: true, why: tA('oneArea') } : {}
    const lock = ro ? { disabled: true, why: ro } : {}
    const tooManyRows = doc.rows.length + nr > BLANK_ROW_LIMIT ? { disabled: true, why: t('err.too_many_rows') } : {}
    const tooManyCols = doc.cols.length + nc > BLANK_COL_LIMIT ? { disabled: true, why: t('err.too_many_cols') } : {}
    const allRows = nr >= vRows.length ? { disabled: true, why: t('menu.keepOneRow') }
      : several && !rowsWhole ? { disabled: true, why: tA('wholeRows') } : {}
    const allCols = nc >= vCols.length ? { disabled: true, why: t('menu.keepOneCol') }
      : several && !colsWhole ? { disabled: true, why: tA('wholeCols') } : {}
    const mac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform)
    const k = (key: string) => `${mac ? '⌘' : 'Ctrl+'}${key}`
    const clip: PopItem[] = [
      { key: 'cut', label: t('menu.cut'), kbd: k('X'), ...lock, ...(ro ? {} : one), onSelect: () => clipboardCommand('cut', anchor) },
      { key: 'copy', label: t('menu.copy'), kbd: k('C'), onSelect: () => clipboardCommand('copy', anchor) },
      { key: 'paste', label: t('menu.paste'), kbd: k('V'), ...lock, onSelect: () => void menuPaste(q, sel) },
    ]
    const rowItems: PopItem[] = [
      { key: 'insertRowAbove', label: t('menu.insertRowAbove'), ...lock, ...(ro ? {} : several ? one : tooManyRows), onSelect: () => { lastCmd.current = { kind: 'insert', what: 'rowAbove' }; insertRows(q.r0, target.kind === 'row' ? nr : 1) } },
      { key: 'insertRowBelow', label: t('menu.insertRowBelow'), ...lock, ...(ro ? {} : several ? one : tooManyRows), onSelect: () => { lastCmd.current = { kind: 'insert', what: 'rowBelow' }; insertRows(q.r1 + 1, target.kind === 'row' ? nr : 1) } },
    ]
    const colItems: PopItem[] = [
      { key: 'insertColLeft', label: t('menu.insertColLeft'), ...lock, ...(ro ? {} : several ? one : tooManyCols), onSelect: () => { lastCmd.current = { kind: 'insert', what: 'colLeft' }; insertCols(q.c0, target.kind === 'col' ? nc : 1) } },
      { key: 'insertColRight', label: t('menu.insertColRight'), ...lock, ...(ro ? {} : several ? one : tooManyCols), onSelect: () => { lastCmd.current = { kind: 'insert', what: 'colRight' }; insertCols(q.c1 + 1, target.kind === 'col' ? nc : 1) } },
    ]
    const delRow: PopItem = { key: 'deleteRow', label: t('menu.deleteRow', { n: nr }), danger: true, ...lock, ...(ro ? {} : allRows), onSelect: () => { lastCmd.current = { kind: 'deleteRows' }; deleteRowsAt(several ? selRows : range(q.r0, q.r1)) } }
    const delCol: PopItem = { key: 'deleteCol', label: t('menu.deleteCol', { n: nc }), danger: true, ...lock, ...(ro ? {} : allCols), onSelect: () => { lastCmd.current = { kind: 'deleteCols' }; deleteColsAt(several ? selCols : range(q.c0, q.c1)) } }
    const clearItem: PopItem = { key: 'clear', label: t('menu.clear'), kbd: 'Delete', ...lock, onSelect: () => clear(sel) }
    const commentItem: PopItem = { key: 'comment', label: t('comments.new'), kbd: mac ? '⌘⌥M' : 'Ctrl+Alt+M', onSelect: () => askComment() }
    const e = (k: string) => t(`format.edit.${k}`)
    let items: PopItem[]
    if (target.kind === 'row') {
      const ids = (several ? selRows : range(q.r0, q.r1)).map(r => vRows[r]?.id).filter((x): x is string => !!x)
      items = [...clip, { kind: 'sep', key: 's1' }, ...rowItems, delRow, clearItem, { kind: 'sep', key: 's2' },
        { key: 'resizeRow', label: t('menu.resizeRow'), ...lock, onSelect: () => setResize({ kind: 'row', ids, value: vRows[q.r0]?.height ?? BLANK_ROW_H }) },
        { key: 'hideRows', label: e('hideRows'), ...lock, ...(ro ? {} : allRows), onSelect: () => viewOp('hideRows') },
        ...(hiddenNear('rows', q).length ? [{ key: 'unhideRows', label: e('unhideRows'), ...lock, onSelect: () => viewOp('unhideRows') }] : [])]
    } else if (target.kind === 'col') {
      const ids = (several ? selCols : range(q.c0, q.c1)).map(c => vCols[c]?.id).filter((x): x is string => !!x)
      // Spec 019: a field column can be hidden or turned back into a regular one; a regular column can become a field.
      const fieldItems: PopItem[] = []
      const colId = !several && q.c0 === q.c1 ? vCols[q.c0]?.id : undefined
      if (colId && content && headRow) fieldItems.push({ key: 'renameCol', label: tf('rename'), ...lock, onSelect: () => setRename({ col: colId, anchor }) })
      if (colId) {
        const f = lk.map?.fields[colId]
        if (f) {
          fieldItems.push(
            { key: 'hideField', label: tf('menuHide'), ...lock, ...(ro ? {} : allCols), onSelect: () => hideField(f) },
            { key: 'toRegular', label: tf('menuToRegular'), ...lock, onSelect: () => lk.removeField(colId) },
          )
          if (isWord(f)) fieldItems.push({ key: 'values', label: tf('menuValues'), onSelect: () => setValuesFor(f) })
        } else if (lk.map && colId !== lk.map.taskCol) {
          fieldItems.push({ key: 'useFor', label: tf('menuUseFor'), sub: true, ...lock,
            onSelect: () => requestAnimationFrame(() => requestAnimationFrame(() => setMenu({ at, anchor, items: useForItems(colId) }))) })
        } else if (!lk.map) fieldItems.push({ key: 'linkBoard', label: tf('menuLink'), ...lock, onSelect: () => lk.askLink() })
      }
      items = [...clip, { kind: 'sep', key: 's1' }, ...colItems, delCol, clearItem, { kind: 'sep', key: 's2' },
        ...(fieldItems.length ? [...fieldItems, { kind: 'sep' as const, key: 's3' }] : []),
        { key: 'resizeCol', label: t('menu.resizeCol'), ...lock, onSelect: () => setResize({ kind: 'col', ids, value: vCols[q.c0]?.width ?? DEFAULT_COL_W }) },
        { key: 'hideCols', label: e('hideCols'), ...lock, ...(ro ? {} : allCols), onSelect: () => viewOp('hideCols') },
        ...(hiddenNear('cols', q).length ? [{ key: 'unhideCols', label: e('unhideCols'), ...lock, onSelect: () => viewOp('unhideCols') }] : [])]
    } else {
      const pickItem: PopItem = { key: 'pickList', label: `${tt('pickFrom')}…`, kbd: 'Alt+↓', ...lock,
        onSelect: () => { const row = vRows[target.r], col = vCols[target.c]; if (row && col) requestAnimationFrame(() => pickList({ key: row.id, ...row }, col.id, anchor, 'menu')) } }
      items = [...clip, { kind: 'sep', key: 's1' }, commentItem, clearItem, pickItem, { kind: 'sep', key: 's2' }, ...rowItems, ...colItems, { kind: 'sep', key: 's3' }, delRow, delCol]
    }
    setMenu({ at, items, anchor })
  }

  const model: GridModel<Row> = {
    rows,
    cols: colIds,
    widths,
    rowNoWidth: 46 + (olDepth.rows ? 4 + 12 * olDepth.rows : 0),
    label: t('grid.label', { name: p.name, rows: doc.rows.length, cols: doc.cols.length }),
    header: col => {
      const i = colIndex.get(col) ?? 0
      if (content) {
        // The Content look: the column's name with its field icon, as on the Content sheet; the letter when it has no name.
        const name = colName(col)
        const f = lk.map?.fields[col]
        const icon = <FieldIcon field={lk.map?.taskCol === col ? 'taskcol' : f ?? 'regular'} />
        return { text: <>{icon}{name || <span className="fx-sheet-muted">{colLetters(i)}</span>}</>, label: name || colLetters(i), className: `is-named${f ? ' is-field' : ''}` }
      }
      const before = i > 0 && hiddenC.has(doc.cols[i - 1].id)
      // Spec 020 tip 80: a column group draws a line above its letters, and − or + on the column after it.
      const inGroup = olSpans.cols.some(g => i >= g.i0 && i <= g.i1)
      const after = olSpans.cols.filter(g => i === g.i1 + 1).sort((x, y) => y.level - x.level)[0]
      const olBtn = after ? <button type="button" className="fx-ol-btn is-col" data-ol-toggle-col={after.from} tabIndex={-1} aria-expanded={!after.collapsed}
                                    aria-label={tt(after.collapsed ? 'outline.expand' : 'outline.collapse')} title={tt(after.collapsed ? 'outline.expand' : 'outline.collapse')}
                                    onPointerDown={ev => ev.stopPropagation()}
                                    onClick={ev => { ev.stopPropagation(); setOutline(olToggle(view.outline ?? [], after), after.collapsed ? 'outlineExpand' : 'outlineCollapse') }}>{after.collapsed ? '+' : '−'}</button> : null
      if (inGroup || olBtn) {
        return { text: <>{olBtn}{colLetters(i)}</>, className: `is-letter${inGroup ? ' is-ol-col' : ''}${lk.map?.fields[col] ? ' is-field' : ''}` }
      }
      return {
        text: before
          ? <>{colLetters(i)}<button type="button" className="fx-hid-mark" data-unhide-col={col} title={t('format.edit.unhideCols')} aria-label={t('format.edit.unhideCols')}
                                       onPointerDown={ev => ev.stopPropagation()}
                                       onClick={ev => { ev.stopPropagation(); unhideBefore('cols', i) }} /></>
          : colLetters(i),
        className: `is-letter${before ? ' is-after-hidden' : ''}${lk.map?.fields[col] ? ' is-field' : ''}`,
      }
    },
    // Spec 016: the Task column and mapped columns say so on their heading.
    headerExtra: col => {
      // The Content look: the headings row is the header, so its filter buttons live here.
      if (content) {
        if (!(fArea && fArea.header === headRow && fArea.cols.includes(col))) return null
        return <button type="button" className={`fx-flt-btn${filterOn(filter[col]) ? ' is-on' : ''}`} data-filter-btn={col} tabIndex={-1}
                       aria-label={sheetT('filterOf', { col: colName(col) || colLetters(colIndex.get(col) ?? 0) })} aria-haspopup="dialog"
                       onPointerDown={ev => ev.stopPropagation()} onClick={ev => { ev.stopPropagation(); setFilterUi({ col, anchor: ev.currentTarget }) }}>
          {filterOn(filter[col]) ? '▼' : '▾'}</button>
      }
      if (!lk.map) return null
      // Spec 019: a small icon beside the letter; its name is in the tooltip and for screen readers.
      if (col === lk.map.taskCol) return <span className="fx-lk-hic is-task" data-task-col-badge="" role="img" aria-label={tl('taskCol')} title={tl('taskCol')}><FieldIcon field="taskcol" /></span>
      const f = lk.map.fields[col]
      if (!f) return null
      const name = f.startsWith('col:') ? tl('teamCol', { name: lk.teamCols.find(c => c.id === f.slice(4))?.name ?? '' }) : tl(`fields.${f}`)
      return <span className="fx-lk-hic" data-field-badge={f} role="img" aria-label={tl('badgeTip', { field: name })} title={tl('badgeTip', { field: name })}><FieldIcon field={f} /></span>
    },
    rowProps: row => ({ className: `is-blank${(rowIndex.get(row.id) ?? 0) > 0 && hiddenR.has(doc.rows[(rowIndex.get(row.id) ?? 1) - 1].id) ? ' is-after-hidden' : ''}`, level: 1 }),
    cellRole: () => 'gridcell',
    cellClass: (row, col) => {
      if (col === 'rowNo') return 'fx-sheet-td is-frozen-no'
      const sh = lk.shown(row.id, col)
      return `fx-sheet-td is-blank-cell${sh ? (sh.na ? ' is-lk-na' : content ? '' : ' is-lk') : ''}`
    },
    isText: (row, col) => { if (col === 'rowNo' || ro) return false; if (totalCell(row.id, col)?.fn) return false; const sh = lk.shown(row.id, col); return !sh?.na && sh?.field !== 'task' },
    textValue: (row, col) => { const tot = totalCell(row.id, col); if (tot?.fn) return tot.raw; const sh = lk.shown(row.id, col); return sh ? (sh.na ? '' : sh.text) : value(row.id, col) },
    copyText: (row, col) => { const tot = totalCell(row.id, col); if (tot?.fn) return tot.raw; const sh = lk.shown(row.id, col); return sh ? (sh.na ? '' : sh.text) : value(row.id, col) },
    // Spec 019: a field cell on a linked row opens its control (typing still works, through the same rules).
    isMenu: (row, col) => {
      if (col === 'rowNo' || ro) return false
      const sh = lk.shown(row.id, col)
      return !!sh && !sh.na && sh.editable && CONTROL_FIELDS.has(sh.field)
    },
    render: (row, col) => {
      if (col === 'rowNo') return null
      // Spec 016: a mapped cell on a linked row shows its task's value; the Task cell shows its note.
      const sh = lk.shown(row.id, col)
      if (sh) {
        if (sh.na) return <span className="fx-sheet-cell-text fx-lk-na">{sh.text}</span>
        if (lk.map) return <FieldValue field={sh.field} raw={sh.raw} map={lk.map} people={lk.choices?.people ?? []} plain={content} />
        return <span className="fx-sheet-cell-text" dir="auto">{sh.text}</span>
      }
      if (lk.map && col === lk.map.taskCol) {
        const note = lk.noteOfRow(row.id), v = value(row.id, col), tk = lk.taskOfRow(row.id)
        // A pasted link shows the task's name instead of the URL; the row's ↗ marker (and a Task link column) open the task.
        // A row with no task offers Create task (spec 019): a task is either open or not created yet.
        return <>
          <span className={`fx-sheet-cell-text${tk && !content ? ' fx-lk-link' : ''}`} dir="auto">{tk && taskIdFrom(v) ? tk.name : v}</span>
          {note === 'notLinked' && lk.canCreate && !ro
            ? <button type="button" className="fx-lk-create is-icon" data-create-task={row.id} tabIndex={-1} aria-label={tf('createTask')} title={tf('createTask')}
                      onPointerDown={ev => ev.stopPropagation()} onClick={ev => { ev.stopPropagation(); lk.createForRow(row.id) }}>＋</button>
            : note && <button type="button" className={`fx-lk-note is-${note}`} data-link-note={note} tabIndex={-1}
                           onPointerDown={ev => ev.stopPropagation()} onClick={ev => { ev.stopPropagation(); if (note !== 'dropped') void lk.openChoose(row.id) }}>
            {note === 'choose' ? tl('notes.choose', { n: 2 }) : tl(`notes.${note}`)}</button>}
        </>
      }
      // A Task link column on a row with no task yet: Create task (the same preview as Board › Create tasks).
      if (lk.map?.fields[col] === 'task' && lk.noteOfRow(row.id) === 'notLinked' && lk.canCreate && !ro) {
        return <button type="button" className="fx-lk-create" data-create-task={row.id} tabIndex={-1}
                       onPointerDown={ev => ev.stopPropagation()} onClick={ev => { ev.stopPropagation(); lk.createForRow(row.id) }}>＋ {tf('createTask')}</button>
      }
      // Spec 020 tip 73: a table's Total row shows its totals (no formula in the cell) and a ▾ on the active cell.
      const tot = totalCell(row.id, col)
      if (tot) {
        const isAct = active?.key === row.id && active.col === col
        const drop = isAct && !ro && tot.pickable
          ? <button type="button" className="fx-total-drop" data-total-drop={col} tabIndex={-1} aria-haspopup="menu" aria-label={tt('total.pick')} title={tt('total.pick')}
                    onPointerDown={ev => ev.stopPropagation()}
                    onClick={ev => {
                      ev.stopPropagation()
                      const el = ev.currentTarget, r = el.getBoundingClientRect()
                      setMenu({ at: { x: rtl ? r.right : r.left, y: r.bottom + 4 }, anchor: el, items: TOTAL_FNS.map(fn => ({ key: fn, label: tt(`total.fns.${fn}`), checked: (tot.fn ?? 'none') === fn, onSelect: () => setTotal(tot.tb.id, col, fn) })) })
                    }}>▾</button>
          : null
        return <><span className="fx-sheet-cell-text" data-total={tot.fn ?? 'label'}>{tot.shown}</span>{drop}</>
      }
      const v = value(row.id, col)
      // Stage 3: the filter buttons sit in the filter's header row.
      const fb = fArea && fArea.header === row.id && fArea.cols.includes(col)
        ? <button type="button" className={`fx-flt-btn${filterOn(filter[col]) ? ' is-on' : ''}`} data-filter-btn={col} tabIndex={-1}
                  aria-label={sheetT('filterOf', { col: v || colLetters(colIndex.get(col) ?? 0) })} aria-haspopup="dialog"
                  onPointerDown={ev => ev.stopPropagation()} onClick={ev => { ev.stopPropagation(); setFilterUi({ col, anchor: ev.currentTarget }) }}>
            {filterOn(filter[col]) ? '▼' : '▾'}</button>
        : null
      if (!v) return fb
      const st = styleOf(row.id, col)
      const shown = st?.num ? display(v, st.num, locale) : v
      // Spec 020 tip 26: Center Across Selection lays the text over the next empty cells that also carry it.
      const across = st?.ha === 'across' ? acrossWidth(row.id, col) : 0
      const red = showsRed(v, st?.num) ? { color: '#C00000' } : undefined
      const text = across
        ? <span className="fx-sheet-cell-text fx-across" data-across={across} style={{ ...red, width: across }}>{shown}</span>
        : <span className="fx-sheet-cell-text" style={red}>{shown}</span>
      // Spec 020: Excel's green corner on a number kept as text, with its ! menu on the active cell.
      const isGreen = storedAsText(v, st?.num?.kind) && !ro && !ignored.has(`${row.id}|${col}`)
      const green = isGreen ? <>
        <span className="fx-num-text" data-num-text="" aria-hidden="true" />
        {active?.key === row.id && active.col === col && (
          <button type="button" className="fx-num-text-btn" data-num-text-btn="" tabIndex={-1} aria-haspopup="menu" aria-label={tt('clean.numText')} title={tt('clean.numText')}
                  onPointerDown={ev => ev.stopPropagation()}
                  onClick={ev => {
                    ev.stopPropagation()
                    const el = ev.currentTarget, r = el.getBoundingClientRect()
                    setMenu({ at: { x: rtl ? r.right : r.left, y: r.bottom + 4 }, anchor: el, items: [
                      { kind: 'node', key: 'h', node: <div role="presentation" className="fx-st-h">{tt('clean.numText')}</div> },
                      { key: 'convert', label: tt('clean.convert'), onSelect: () => convertCell(row.id, col) },
                      { key: 'ignore', label: tt('clean.ignore'), onSelect: () => ignoreCell(`${row.id}|${col}`) },
                    ] })
                  }}>!</button>
        )}
      </> : null
      return fb || green ? <>{text}{green}{fb}</> : text
    },
    cellStyle: (row, col) => lookCss(row.id, col),
    cellIcon: (row, col) => (ruleLooks.size && col !== 'rowNo' ? iconFor(ruleLooks.get(`${row.id}|${col}`)) : null),
    onCopied: (q, grid) => { lastCopy.current = { rows: vRows.slice(q.r0, q.r1 + 1).map(r => r.id), cols: vCols.slice(q.c0, q.c1 + 1).map(c => c.id), grid } },
    copyStyle: (row, col) => styleOf(row.id, col),
    copyShown: (row, col) => { const v = value(row.id, col), st = styleOf(row.id, col); return st?.num ? display(v, st.num, locale) : v },
    marked: (row, col) => marks.has(`${row.id}|${col}`),
    cellSpan: (row, col) => {
      const k = `${row.id}|${col}`
      if (spans.covered.has(k)) return 'covered'
      return spans.anchor.get(k) ?? null
    },
    corner: () => olDepth.rows ? (
      <span className="fx-ol-levels" data-ol-levels="" role="group" aria-label={tt('outline.levels')}>
        {Array.from({ length: olDepth.rows + 1 }, (_, k) => (
          <button key={k} type="button" data-ol-level={k + 1} tabIndex={-1} aria-label={tt('outline.level', { n: k + 1 })} title={tt('outline.level', { n: k + 1 })}
                  onPointerDown={ev => ev.stopPropagation()} onClick={ev => { ev.stopPropagation(); setOutline(showLevel(view.outline ?? [], 'rows', k + 1), 'outlineLevel') }}>{k + 1}</button>
        ))}
      </span>
    ) : null,
    rowLabel: row => <>{olGutter(row.id)}{(() => {
      const i = rowIndex.get(row.id) ?? 0
      const tk = lk.taskOfRow(row.id)
      const hasLinkCol = content && Object.values(lk.map?.fields ?? {}).includes('task')
      const marker = tk && !hasLinkCol ? <a className="fx-lk-mk" href={`/board?task=${tk.id}`} target="_blank" rel="noopener noreferrer" data-task-marker={tk.id}
                             aria-label={tl('marker', { name: tk.name })} title={tl('marker', { name: tk.name })}
                             onPointerDown={ev => ev.stopPropagation()} onClick={ev => ev.stopPropagation()}>↗</a> : null
      if (marker) return <>{marker}{i + 1}</>
      if (i > 0 && hiddenR.has(doc.rows[i - 1].id)) {
        return <>{i + 1}<button type="button" className="fx-hid-mark is-row" data-unhide-row={row.id} title={t('format.edit.unhideRows')} aria-label={t('format.edit.unhideRows')}
                                onPointerDown={ev => ev.stopPropagation()} onClick={ev => { ev.stopPropagation(); unhideBefore('rows', i) }} /></>
      }
      return i + 1
    })()}</>,
    isDraft: () => false,
    inputLabel: (row, col) => cellName(rowIndex.get(row.id) ?? 0, colIndex.get(col) ?? 0),
    inputDir: () => undefined,
    readOnlyNote: (row, col) => {
      if (col === 'rowNo') return null
      if (ro) return ro
      if (totalCell(row.id, col)?.fn) return tt('total.readOnly')
      const sh = lk.shown(row.id, col)
      if (sh?.na) return tl('naWhy', { field: tl(`fields.${sh.field.startsWith('col:') ? 'none' : sh.field}`) })
      if (sh?.field === 'task') return tf('taskLinkWhy')
      if (sh && !sh.editable) return lk.taskOfRow(row.id)?.dropped ? tl('why.dropped') : tl('why.not_authorized')
      return null
    },
    onCommit: async (row, col, v) => {
      if (ro) return ro
      if (v.length > MAX_CELL) return t('err.too_long')
      // Spec 020: a typed value outside the cell's validation asks first (Stop, Warning or Information).
      if (!validateTyped(row.id, col, v)) return null
      // A leading apostrophe keeps a value as text ('007, '1/2): stored without the mark, the cell set to Text (tip 15).
      const rule = ruleAt(row.id, col)
      const forward: BlankChange[] = []
      let val = rule ? listSpelling(rule, v) : v
      if (val.startsWith("'") && val.length > 1) {
        val = val.slice(1)
        const before = index.get(formatKey(row.id, col)) ?? null
        if (before?.num?.kind !== 'text') forward.push({ kind: 'formats', items: [{ rowKey: row.id, colKey: col, before, after: { ...(before ?? {}), num: { kind: 'text' } } }] })
      }
      const ch = cellChange([{ rowId: row.id, colId: col, value: val }])
      if (ch) forward.unshift(ch)
      if (forward.length) applyR('edit', forward)
      return null
    },
    onCancelDraft: () => {},
    onOpen: (row, col, anchor) => { const sh = lk.shown(row.id, col); if (sh && !sh.na) setFieldEd({ rowId: row.id, col, field: sh.field, anchor }) },
    onReorder: (col, before) => moveCol(col, before),
    tailHeader: <button type="button" className="fx-fd-plus" data-add-field="" aria-haspopup="menu" aria-label={tf('addTitle')} title={tf('addTitle')}
                        onPointerDown={ev => ev.stopPropagation()} onClick={ev => { if (ro) { p.onNotice(ro); return } setAddMenu(ev.currentTarget) }}>＋</button>,
    // The Content look: each heading has the Content sheet's ▾ (the column's menu).
    ...(content ? {
      headerMenu: (col: string, anchor: HTMLElement) => {
        const c = vColIndex.get(col)
        if (c === undefined) return
        const r = anchor.getBoundingClientRect()
        contextMenu({ kind: 'col', c, rect: { r0: 0, c0: c, r1: Math.max(0, vRows.length - 1), c1: c } }, { x: r.left, y: r.bottom + 2 }, anchor)
      },
      headerName: (col: string) => tf('colMenu', { name: colName(col) || colLetters(colIndex.get(col) ?? 0) }),
    } : {}),
    rowBandHeight: row => { const b = grouping.bands.get(row.id); return content && b?.main && b.sub ? 60 : 30 },
    rowBand: row => {
      const b = grouping.bands.get(row.id)
      if (!b) return null
      // The Content look: the theme in the Content sheet's band, its pillar under it.
      if (content) {
        return <span className="fx-cband" data-band-name={b.main ?? b.sub ?? ''}>
          {b.main && <span className={`fx-cband-main${b.theme ? ' is-theme' : ''}`} data-band-theme={b.main}><span className="fx-cband-label"><b>{b.main}</b><span className="fx-sheet-muted"> · {b.theme ? b.themeN ?? b.n : b.n}</span></span></span>}
          {b.sub && <span className="fx-cband-sub"><span className="fx-cband-label">{b.sub}<span className="fx-sheet-muted"> · {b.n}</span></span></span>}
        </span>
      }
      return <span className={`fx-band${b.main ? '' : ' is-sub'}`} data-band-name={b.main ?? b.sub ?? ''}>
        {b.main && <b>{b.main}</b>}{b.sub && <span className="fx-band-sub">{b.main ? ' › ' : '› '}{b.sub}</span>}<span className="fx-band-n">{b.n}</span>
      </span>
    },
    onPaste: () => {},
    onResize: (col, w) => { if (!ro) setWidths([col], w) },
    selection: true,
    spreadsheet: true,
    multiline: true,
    writeCells,
    onUndo: p.onUndo,
    // Spec 020: Ctrl+Y with nothing to redo repeats the last action, as Excel.
    onRedo: () => { if (p.canRedo === false) repeat(); else p.onRedo() },
    contextMenu,
    fillInfo: from => fillInfo(from),
    onFill,
    onFillMenu,
    onRepeat: () => repeat(),
    onFlashFill: () => flashFill(),
    pickList: (row, col, anchor, from) => pickList(row, col, anchor, from),
    validation: (row, col) => {
      const rule = ruleAt(row.id, col)
      if (!rule) return null
      return { dropdown: rule.allow === 'list' && rule.dropdown && !ro, input: rule.input && (rule.input.title || rule.input.msg) ? rule.input : null }
    },
    zoom: p.zoom,
    onZoom: p.onZoom,
    nowText,
    controlLabels: { handle: tt('handle'), options: tt('fillOptions'), dropdown: tt('dropdown') },
    rowHeight: row => row.height ?? autoH.get(row.id) ?? null,
    onRowResize: (row, h) => { if (!ro) setHeights([row.id], h) },
    onSkipped: p.onSkipped,
    onSelect: (q, list) => {
      rectRef.current = q
      areasRef.current = list
      report()
    },
    onAddMode: on => { addingRef.current = on; report() },
    onAreasNotice: (key: AreasNotice) => p.onNotice(tA(key)),
    // Stage 2: frozen panes count the sheet's first rows and columns; hidden ones among them don't show.
    frozenRows: vRows.filter(r => (rowIndex.get(r.id) ?? 0) < (view.frozenRows ?? 0)).length,
    frozenCols: vCols.filter(c => (colIndex.get(c.id) ?? 0) < (view.frozenCols ?? 0)).length,
  }

  // A covered cell isn't a place to stand: arrows step over the merge, a click lands on its top-left.
  const setActiveCell = useCallback((a: ActiveCell) => {
    const anchorKey = spans.covered.get(`${a.key}|${a.col}`)
    if (!anchorKey) { setActive(a); return }
    const [ak, ac] = anchorKey.split('|')
    setActive(prev => {
      if (prev && prev.key === ak && prev.col === ac) {
        // Moving out of the merge: past its far edge in the direction of travel.
        const b = boxes.find(x => vRows[x.r0].id === ak && vCols[x.c0].id === ac)
        const tr = vRowIndex.get(a.key) ?? 0, tc = vColIndex.get(a.col) ?? 0
        if (b) {
          if (tr > b.r0 && tr <= b.r1 && b.r1 + 1 < vRows.length && tc === b.c0) return { key: vRows[b.r1 + 1].id, col: a.col }
          if (tc > b.c0 && tc <= b.c1 && b.c1 + 1 < vCols.length && tr === b.r0) return { key: a.key, col: vCols[b.c1 + 1].id }
        }
        return prev
      }
      return { key: ak, col: ac }
    })
  }, [spans, boxes, vRows, vCols, vRowIndex, vColIndex])

  // ── spec 015: the format toolbar's commands ─────────────────────────────
  const [mergeAsk, setMergeAsk] = useState<{ value: string; run(): void } | null>(null)
  const size = { rows: vRows.length, cols: vCols.length }
  const rk = (r: number) => vRows[r]?.id ?? null, ck = (c: number) => vCols[c]?.id ?? null
  function applyItems(label: string, items: FormatItem[] | null) {
    if (ro) { p.onNotice(ro); return }
    if (!items) { p.onNotice(t('format.err.too_many_formats')); return }
    if (items.length) applyR(label, [{ kind: 'formats', items }])
  }
  function merge(mode: MergeMode) {
    if (ro) { p.onNotice(ro); return }
    if (oneArea()) return
    const q = rectRef.current
    const hit = boxes.filter(b => b.r0 <= q.r1 && q.r0 <= b.r1 && b.c0 <= q.c1 && q.c0 <= b.c1).map(b => b.m)
    if (mode === 'unmerge') { if (hit.length) applyR('unmerge', [{ kind: 'merges', add: [], remove: hit }]); return }
    const groups = mode === 'across' ? Array.from({ length: q.r1 - q.r0 + 1 }, (_, i) => ({ r0: q.r0 + i, r1: q.r0 + i, c0: q.c0, c1: q.c1 })) : [q]
    if (groups.every(g => g.r0 === g.r1 && g.c0 === g.c1)) return
    const clears: { rowId: string; colId: string; value: string }[] = []
    let keep = ''
    for (const g of groups) for (let r = g.r0; r <= g.r1; r++) for (let c = g.c0; c <= g.c1; c++) {
      const v = value(vRows[r].id, vCols[c].id)
      if (r === g.r0 && c === g.c0) { if (!keep) keep = v; continue }
      if (v) clears.push({ rowId: vRows[r].id, colId: vCols[c].id, value: '' })
    }
    const run = () => {
      const forward: BlankChange[] = [{
        kind: 'merges', remove: hit,
        add: groups.filter(g => g.r0 !== g.r1 || g.c0 !== g.c1).map(g => ({ id: p.newId(), top: vRows[g.r0].id, bottom: vRows[g.r1].id, left: vCols[g.c0].id, right: vCols[g.c1].id })),
      }]
      const ch = cellChange(clears)
      if (ch) forward.push(ch)
      if (mode === 'center') {
        const items = planFormat(index, groups.map(g => [vRows[g.r0].id, vCols[g.c0].id] as [string, string]), { ha: 'center' })
        if (items.length) forward.push({ kind: 'formats', items })
      }
      applyR('merge', forward)
    }
    if (clears.length) setMergeAsk({ value: keep, run }); else run()
  }
  // ── stage 2: hide, unhide, freeze (FR-047) ──────────────────────────────
  const viewNow = (): Partial<SheetView> => ({ frozenRows: view.frozenRows ?? 0, frozenCols: view.frozenCols ?? 0, hiddenRows: view.hiddenRows ?? [], hiddenCols: view.hiddenCols ?? [], filterArea: view.filterArea ?? null, filter: view.filter ?? {}, groupBy: view.groupBy ?? null, look: view.look, slicers: view.slicers ?? [], advanced: view.advanced ?? null, outline: view.outline ?? [] })
  function setView(label: string, after: Partial<SheetView>) {
    if (ro) { p.onNotice(ro); return }
    applyR(label, [{ kind: 'view', before: viewNow(), after: { ...viewNow(), ...after } }])
  }
  /** Hidden rows or columns in or next to the selection (what Unhide brings back). */
  function hiddenNear(kind: 'rows' | 'cols', q: GridRect): string[] {
    const all = kind === 'rows' ? doc.rows : doc.cols, hid = kind === 'rows' ? hiddenR : hiddenC
    const vis = kind === 'rows' ? vRows : vCols, idx = kind === 'rows' ? rowIndex : colIndex
    const a = kind === 'rows' ? q.r0 : q.c0, b = kind === 'rows' ? q.r1 : q.c1
    const lo = a > 0 ? (idx.get(vis[a - 1]?.id ?? '') ?? -1) + 1 : 0
    const hi = b + 1 < vis.length ? (idx.get(vis[b + 1].id) ?? all.length) - 1 : all.length - 1
    return all.slice(lo, hi + 1).filter(x => hid.has(x.id)).map(x => x.id)
  }
  /** The marker before a row or column: unhide the hidden run just before it. */
  function unhideBefore(kind: 'rows' | 'cols', at: number) {
    const all = kind === 'rows' ? doc.rows : doc.cols, hid = kind === 'rows' ? hiddenR : hiddenC
    const show: string[] = []
    for (let i = at - 1; i >= 0 && hid.has(all[i].id); i--) show.push(all[i].id)
    if (!show.length) return
    if (kind === 'rows') setView('unhideRows', { hiddenRows: (view.hiddenRows ?? []).filter(id => !show.includes(id)) })
    else setView('unhideCols', { hiddenCols: (view.hiddenCols ?? []).filter(id => !show.includes(id)) })
  }
  function viewOp(op: ViewOp) {
    const q = rectRef.current
    const activeR = active ? rowIndex.get(active.key) ?? 0 : 0, activeC = active ? colIndex.get(active.col) ?? 0 : 0
    switch (op) {
      case 'hideRows': {
        const ids = (many() ? areaRows(areasRef.current) : range(q.r0, q.r1)).map(r => vRows[r]?.id).filter((x): x is string => !!x)
        if (ids.length >= vRows.length) { p.onNotice(t('menu.keepOneRow')); return }
        setView('hideRows', { hiddenRows: [...new Set([...(view.hiddenRows ?? []), ...ids])] })
        break
      }
      case 'hideCols': {
        const ids = (many() ? areaCols(areasRef.current) : range(q.c0, q.c1)).map(c => vCols[c]?.id).filter((x): x is string => !!x)
        if (ids.length >= vCols.length) { p.onNotice(t('menu.keepOneCol')); return }
        setView('hideCols', { hiddenCols: [...new Set([...(view.hiddenCols ?? []), ...ids])] })
        break
      }
      case 'unhideRows': { const show = hiddenNear('rows', q); if (show.length) setView('unhideRows', { hiddenRows: (view.hiddenRows ?? []).filter(id => !show.includes(id)) }); break }
      case 'unhideCols': { const show = hiddenNear('cols', q); if (show.length) setView('unhideCols', { hiddenCols: (view.hiddenCols ?? []).filter(id => !show.includes(id)) }); break }
      case 'freezeTop': setView('freeze', { frozenRows: 1, frozenCols: 0 }); break
      case 'freezeFirst': setView('freeze', { frozenRows: 0, frozenCols: 1 }); break
      case 'freezeHere': setView('freeze', { frozenRows: activeR, frozenCols: activeC }); break
      case 'unfreeze': setView('freeze', { frozenRows: 0, frozenCols: 0 }); break
    }
  }

  // ── stage 2: Format Painter, Clear, Fill, Paste Special, Find and Replace ─
  function cellsIn(q: GridRect, f: (rowId: string, colId: string, r: number, c: number) => void) {
    for (let r = q.r0; r <= q.r1; r++) for (let c = q.c0; c <= q.c1; c++) { const row = vRows[r], col = vCols[c]; if (row && col) f(row.id, col.id, r, c) }
  }
  function clearWhat(what: 'all' | 'formats' | 'contents' | 'comments') {
    if (ro && what !== 'comments') { p.onNotice(ro); return }
    // Every area (spec 017 FR-009): each cell once.
    const each = (f: (rowId: string, colId: string) => void) => { for (const { r, c } of unionCells(areasRef.current)) { const row = vRows[r], col = vCols[c]; if (row && col) f(row.id, col.id) } }
    const forward: BlankChange[] = []
    if (what === 'all' || what === 'contents') {
      const list: { rowId: string; colId: string; value: string }[] = []
      each((rid, cid) => { if (value(rid, cid)) list.push({ rowId: rid, colId: cid, value: '' }) })
      const ch = cellChange(list)
      if (ch) forward.push(ch)
    }
    if (what === 'all' || what === 'formats') {
      const items = planAreas(a => planRect(index, a, size, rk, ck, clearPatch()))
      if (!items) { p.onNotice(t('format.err.too_many_formats')); return }
      if (items.length) forward.push({ kind: 'formats', items })
    }
    if (what === 'all' || what === 'comments') {
      const keys: string[] = []
      each((rid, cid) => { if (marks.has(`${rid}|${cid}`)) keys.push(`${rid}|${cid}`) })
      if (keys.length) clearComments('blank', keys)
    }
    if (forward.length) applyR(`clear-${what}`, forward)
  }
  /** Fill Down / Right (FR-043): the first row or column's values and look, into the rest. */
  function fill(dir: 'down' | 'right') {
    if (ro) { p.onNotice(ro); return }
    if (oneArea()) return
    const q = rectRef.current
    const list: { rowId: string; colId: string; value: string }[] = []
    const targets: { rowId: string; colId: string; src: { rowId: string; colId: string } }[] = []
    cellsIn(q, (rid, cid, r, c) => {
      const src = dir === 'down' ? { rowId: vRows[q.r0].id, colId: cid } : { rowId: rid, colId: vCols[q.c0].id }
      if ((dir === 'down' && r === q.r0) || (dir === 'right' && c === q.c0)) return
      list.push({ rowId: rid, colId: cid, value: value(src.rowId, src.colId) })
      targets.push({ rowId: rid, colId: cid, src })
    })
    if (!targets.length) return
    const forward: BlankChange[] = []
    const ch = cellChange(list)
    if (ch) forward.push(ch)
    const items: FormatItem[] = []
    for (const x of targets) {
      const before = index.get(formatKey(x.rowId, x.colId)) ?? null, after = index.get(formatKey(x.src.rowId, x.src.colId)) ?? null
      if (JSON.stringify(before) !== JSON.stringify(after)) items.push({ rowKey: x.rowId, colKey: x.colId, before, after })
    }
    if (items.length) forward.push({ kind: 'formats', items })
    if (forward.length) applyR(`fill-${dir}`, forward)
  }
  /** Spec 020: the block last copied on this sheet, by ids (Paste Special › Validation and Column widths). */
  const lastCopy = useRef<{ rows: string[]; cols: string[]; grid: string[][] } | null>(null)
  /**
   * Paste Special (FR-041; spec 020 tip 99): All, Values, Formats, All except
   * borders, Validation, Column widths; Add/Subtract/Multiply/Divide with the
   * copied number; Skip blanks; Transpose.
   */
  async function pasteSpecial(cmd: Extract<FormatCmd, { kind: 'pasteSpecial' }>) {
    if (ro) { p.onNotice(ro); return }
    if (oneArea()) return
    const q = rectRef.current
    const grid = cmd.transpose ? transpose(cmd.grid, '') : cmd.grid
    const styles = cmd.styles ? (cmd.transpose ? transpose(cmd.styles, null) : cmd.styles) : null
    if (!grid.length) return
    const plan = pastePlan(grid, q)
    const one = grid.length === 1 && grid[0].length === 1
    // An operation: the copied number applied to each number in the selection; other cells are left and counted.
    if (cmd.op) {
      const by = one ? parseNumber(grid[0][0]) : null
      if (by === null) { p.onNotice(tt('ps.opOne')); return }
      if (cmd.op === 'div' && by === 0) { p.onNotice(tt('ps.divZero')); return }
      const list: { rowId: string; colId: string; value: string }[] = []
      let skipped = 0
      for (const x of selFilled()) {
        const v = applyOp(x.v, by, cmd.op)
        if (v === null) skipped++
        else list.push({ rowId: x.rowId, colId: x.colId, value: v })
      }
      const ch = cellChange(list)
      if (ch) applyR(`paste-${cmd.op}`, [ch])
      p.onNotice(skipped ? tt('ps.opSkipped', { n: list.length, skipped }) : tt('ps.opDone', { n: list.length }), !!ch)
      return
    }
    // Validation and Column widths come from the cells copied on this sheet.
    if (cmd.mode === 'validation' || cmd.mode === 'widths') {
      const src = lastCopy.current
      if (!src || JSON.stringify(src.grid) !== JSON.stringify(cmd.grid)) { p.onNotice(tt('ps.needCopy')); return }
      if (cmd.mode === 'widths') {
        const list = src.cols.map((id, j) => {
          const from = doc.cols.find(c => c.id === id), to = vCols[q.c0 + j]
          return to ? { id: to.id, before: to.width ?? null, after: from?.width ?? null } : null
        }).filter((x): x is { id: string; before: number | null; after: number | null } => !!x && x.before !== x.after)
        if (list.length) applyR('pasteWidths', [{ kind: 'colWidths', cols: list }])
        return
      }
      const rules = new Set(src.rows.flatMap(r => src.cols.map(c => ruleAt(r, c)?.id ?? '')))
      if (rules.size > 1) { p.onNotice(tt('ps.dvMixed')); return }
      const rule = ruleAt(src.rows[0], src.cols[0])
      setValidation(rule ?? null, false)
      return
    }
    if (cmd.mode === 'formats') {
      if (!styles) { p.onNotice(t('format.edit.noFormats')); return }
      const items: FormatItem[] = []
      for (let r = 0; r < plan.rows; r++) for (let c = 0; c < plan.cols; c++) {
        const row = vRows[q.r0 + r], col = vCols[q.c0 + c]
        if (!row || !col) continue
        const st = (one ? styles[0]?.[0] : styles[r]?.[c]) ?? null
        const before = index.get(formatKey(row.id, col.id)) ?? null, after = validateStyle(st)
        if (JSON.stringify(before) !== JSON.stringify(after)) items.push({ rowKey: row.id, colKey: col.id, before, after })
      }
      if (items.length) applyR('pasteFormats', [{ kind: 'formats', items }])
    } else {
      const list: CellWrite[] = []
      for (let r = 0; r < plan.rows; r++) for (let c = 0; c < plan.cols; c++) {
        const v = plan.value(r, c)
        // Skip blanks: an empty copied cell leaves the cell under it alone.
        if (cmd.skipBlanks && !v) continue
        const w: CellWrite = { r: q.r0 + r, c: q.c0 + c, value: v }
        if ((cmd.mode === 'all' || cmd.mode === 'noBorders') && styles) {
          let st = (one ? styles[0]?.[0] : styles[r]?.[c]) ?? null
          if (cmd.mode === 'noBorders') {
            // All except borders: the copied look, with the cell's own borders kept.
            const row = vRows[q.r0 + r], col = vCols[q.c0 + c], mine = row && col ? index.get(formatKey(row.id, col.id)) ?? null : null
            st = { ...(st ?? {}), bt: mine?.bt ?? undefined, br: mine?.br ?? undefined, bb: mine?.bb ?? undefined, bl: mine?.bl ?? undefined }
          }
          w.style = st
        }
        list.push(w)
      }
      const res = await writeCells(list, 'paste')
      p.onSkipped(res.skipped)
    }
    setSelectRect({ r0: q.r0, c0: q.c0, r1: q.r0 + plan.rows - 1, c1: q.c0 + plan.cols - 1 })
  }
  /** Every filled visible cell, in reading order, for Find. */
  const filled = () => {
    const out: { r: number; c: number; text: string }[] = []
    vRows.forEach((row, r) => { const cells = doc.cells[row.id]; if (!cells) return; vCols.forEach((col, c) => { const v = cells[col.id]; if (v) out.push({ r, c, text: v }) }) })
    return out
  }
  function find(cmd: Extract<FormatCmd, { kind: 'find' }>) {
    const all = filled()
    const count = all.filter(x => matches(x.text, cmd.q.query, cmd.q)).length
    const from = active ? { r: vRowIndex.get(active.key) ?? 0, c: vColIndex.get(active.col) ?? 0 } : null
    const i = nextMatch(all, from, cmd.q.query, cmd.q, cmd.dir)
    if (i < 0) { announceFind({ source: 'blank', count: 0, at: 0, cell: null }); return }
    const hit = all[i]
    const at = all.filter(x => matches(x.text, cmd.q.query, cmd.q)).sort((a, b) => a.r - b.r || a.c - b.c).findIndex(x => x.r === hit.r && x.c === hit.c) + 1
    setActive({ key: vRows[hit.r].id, col: vCols[hit.c].id })
    setSelectRect({ r0: hit.r, c0: hit.c, r1: hit.r, c1: hit.c })
    announceFind({ source: 'blank', count, at, cell: nameAt(hit.r, hit.c) })
  }
  function replace(cmd: Extract<FormatCmd, { kind: 'replace' }>) {
    if (ro) { p.onNotice(ro); return }
    const all = filled()
    const from = active ? { r: vRowIndex.get(active.key) ?? 0, c: vColIndex.get(active.col) ?? 0 } : null
    let targets = all.filter(x => matches(x.text, cmd.q.query, cmd.q))
    if (!cmd.all) {
      // Replace: the selected match if it is one, then on to the next.
      const cur = targets.find(x => from && x.r === from.r && x.c === from.c)
      if (!cur) { find({ kind: 'find', q: cmd.q, dir: 1 }); return }
      targets = [cur]
    }
    const list = targets.map(x => ({ rowId: vRows[x.r].id, colId: vCols[x.c].id, value: replaceIn(x.text, cmd.q.query, cmd.by, cmd.q) }))
    const ch = cellChange(list)
    if (ch) applyR(cmd.all ? 'replaceAll' : 'replace', [ch])
    const replaced = ch?.kind === 'cells' ? ch.cells.length : 0
    const total = all.filter(x => matches(x.text, cmd.q.query, cmd.q)).length
    announceFind({ source: 'blank', count: Math.max(0, total - replaced), at: 0, cell: null, replaced, skipped: 0 })
    if (!cmd.all) requestAnimationFrame(() => find({ kind: 'find', q: cmd.q, dir: 1 }))
  }

  // ── stage 3: cell styles, tables, sort, filter, conditional formatting ─
  const tables = useMemo(() => extras.tables ?? [], [extras.tables])
  const rules = useMemo(() => extras.rules ?? [], [extras.rules])
  const sheetT = (k: string, v?: Record<string, string | number>) => t(`format.st3.${k}`, v)
  /** A table's rows and columns as they show now (filtered rows drop out of the banding, as in Excel). */
  const tableBoxes = useMemo(() => tables.map(tb => {
    const r0 = rowIndex.get(tb.top), r1 = rowIndex.get(tb.bottom), c0 = colIndex.get(tb.left), c1 = colIndex.get(tb.right)
    if (r0 === undefined || r1 === undefined || c0 === undefined || c1 === undefined) return null
    const rowsIn = vRows.filter(r => { const i = rowIndex.get(r.id) ?? -1; return i >= Math.min(r0, r1) && i <= Math.max(r0, r1) })
    const colsIn = new Set(vCols.filter(c => { const i = colIndex.get(c.id) ?? -1; return i >= Math.min(c0, c1) && i <= Math.max(c0, c1) }).map(c => c.id))
    return { tb, pos: new Map(rowsIn.map((r, i) => [r.id, i])), cols: colsIn, rows: rowsIn.length, dr: [Math.min(r0, r1), Math.max(r0, r1)], dc: [Math.min(c0, c1), Math.max(c0, c1)] }
  }).filter((x): x is NonNullable<typeof x> => !!x), [tables, rowIndex, colIndex, vRows, vCols])
  const tableLookAt = (rowId: string, colId: string): CellStyle | null => {
    for (const b of tableBoxes) { const r = b.pos.get(rowId); if (r !== undefined && b.cols.has(colId)) return tableLook(b.tb, r, 0, b.rows) }
    return null
  }
  const tableAt = (rowId: string, colId: string): SheetTableRecord | null => {
    const r = rowIndex.get(rowId) ?? -1, c = colIndex.get(colId) ?? -1
    return tableBoxes.find(b => r >= b.dr[0] && r <= b.dr[1] && c >= b.dc[0] && c <= b.dc[1])?.tb ?? null
  }
  /** Conditional formatting over the rows on screen (R8). */
  const ruleLooks = useMemo(() => evalRules(rules, vRows.map(r => r.id), colIds, (r, c) => doc.cells[r]?.[c] ?? ''), [rules, vRows, colIds, doc.cells])
  const rtl = locale.startsWith('ar')
  const lookCss = (rowId: string, colId: string) => {
    const own = styleOf(rowId, colId)
    const tl = tableBoxes.length ? tableLookAt(rowId, colId) : null
    const rl = ruleLooks.size ? ruleLooks.get(`${rowId}|${colId}`) : undefined
    if (!tl && !rl) return own ? toCss(own) : null
    let st: CellStyle = { ...(tl ?? {}), ...(own ?? {}) }
    // Spec 020: a Total row is bold under a double line in the table's colour.
    const ttb = tl ? totalTableOf(rowId) : null
    if (ttb) st = { b: true, ...st, bt: { w: 'double', c: tableStyle(ttb.style).base } }
    if (rl?.style) st = { ...st, ...rl.style }
    if (rl?.scale) st = { ...st, fill: rl.scale }
    const css = toCss(st)
    if (!rl?.bar) return css
    return { ...css, cell: { ...css.cell, ...barCss(rl.bar, rtl) } }
  }
  /** The bar beside a row number: a lane per level with the group's bracket, and − or + on the row under it. */
  function olGutter(rowId: string) {
    if (!olDepth.rows) return null
    const i = rowIndex.get(rowId) ?? -1
    return (
      <span className="fx-ol-gut" aria-hidden={false}>
        {Array.from({ length: olDepth.rows }, (_, k) => {
          const lv = k + 1
          const g = olSpans.rows.find(x => x.level === lv && i >= x.i0 && i <= x.i1)
          const after = olSpans.rows.find(x => x.level === lv && i === x.i1 + 1)
          return (
            <span key={lv} className={`fx-ol-lane${g ? ' is-in' : ''}${g && i === g.i0 ? ' is-top' : ''}${g && i === g.i1 ? ' is-end' : ''}`}>
              {after && (
                <button type="button" className="fx-ol-btn" data-ol-toggle={after.from} tabIndex={-1} aria-expanded={!after.collapsed}
                        aria-label={tt(after.collapsed ? 'outline.expand' : 'outline.collapse')} title={tt(after.collapsed ? 'outline.expand' : 'outline.collapse')}
                        onPointerDown={ev => ev.stopPropagation()}
                        onClick={ev => { ev.stopPropagation(); setOutline(olToggle(view.outline ?? [], after), after.collapsed ? 'outlineExpand' : 'outlineCollapse') }}>
                  {after.collapsed ? '+' : '−'}</button>
              )}
            </span>
          )
        })}
      </span>
    )
  }
  /** Spec 020 tip 73: a Total row cell: its total (computed from the rows on screen) or the "Total" label. */
  function totalCell(rowId: string, colId: string): { tb: SheetTableRecord; fn: TotalFn | null; raw: string; shown: string; pickable: boolean } | null {
    if (!tables.length) return null
    const tb = totalTableOf(rowId)
    if (!tb) return null
    const box = tableBoxes.find(b => b.tb.id === tb.id)
    if (!box?.cols.has(colId)) return null
    const first = vCols.find(c => box.cols.has(c.id))?.id === colId
    const fn = tb.totals?.[colId]
    if (!fn || fn === 'none') return first ? { tb, fn: null, raw: value(rowId, colId), shown: value(rowId, colId), pickable: false } : { tb, fn: null, raw: '', shown: '', pickable: true }
    const raw = totalOf(tb, colId, fn)
    // Shown in the column's number format (the cell's own, else the body's), as Excel's SUBTOTAL takes it.
    const above = vRows.find(r => box.pos.has(r.id) && r.id !== tb.top && r.id !== tb.bottom)
    const num = styleOf(rowId, colId)?.num ?? (above ? styleOf(above.id, colId)?.num : undefined)
    const shown = fn === 'count' || fn === 'countNums' ? raw : num ? display(raw, num, locale) : raw
    return { tb, fn, raw, shown, pickable: true }
  }
  /** Spec 020 tip 26: how far a Center Across cell's text reaches (px), or 0 when it stays in its cell. */
  function acrossWidth(rowId: string, colId: string): number {
    const at = vColIndex.get(colId)
    if (at === undefined) return 0
    let w = widths[colId] ?? DEFAULT_COL_W, n = 0
    for (let c = at + 1; c < vCols.length; c++) {
      const id = vCols[c].id
      if (value(rowId, id) || styleOf(rowId, id)?.ha !== 'across' || spans.anchor.has(`${rowId}|${id}`) || spans.covered.has(`${rowId}|${id}`)) break
      w += widths[id] ?? DEFAULT_COL_W; n++
    }
    return n ? w : 0
  }
  /** The block of filled cells around a cell, as Excel's "current region". */
  function region(r: number, c: number): GridRect {
    let r0 = r, r1 = r, c0 = c, c1 = c, grew = true
    const rowHas = (rr: number, a: number, b: number) => { for (let x = a; x <= b; x++) if (value(vRows[rr].id, vCols[x].id)) return true; return false }
    const colHas = (cc: number, a: number, b: number) => { for (let x = a; x <= b; x++) if (value(vRows[x].id, vCols[cc].id)) return true; return false }
    while (grew) {
      grew = false
      if (r0 > 0 && rowHas(r0 - 1, c0, c1)) { r0--; grew = true }
      if (r1 < vRows.length - 1 && rowHas(r1 + 1, c0, c1)) { r1++; grew = true }
      if (c0 > 0 && colHas(c0 - 1, r0, r1)) { c0--; grew = true }
      if (c1 < vCols.length - 1 && colHas(c1 + 1, r0, r1)) { c1++; grew = true }
    }
    return { r0, c0, r1, c1 }
  }
  const activeAt = () => ({ r: active ? vRowIndex.get(active.key) ?? 0 : 0, c: active ? vColIndex.get(active.col) ?? 0 : 0 })
  const multi = () => { const q = rectRef.current; return q.r0 !== q.r1 || q.c0 !== q.c1 }
  /** What Sort works on: the selection, the table, the filter's rows, or the block around the active cell; and whether it has a header row. */
  function sortScope(fromFilter = false): { rows: typeof vRows; header: boolean | null } {
    const q = rectRef.current
    if (fromFilter && fArea?.header) { const h = vRows.find(r => r.id === fArea.header); const inScope = new Set(filterScope); return { rows: [...(h ? [h] : []), ...vRows.filter(r => inScope.has(r.id))], header: !!h } }
    if (q.r0 !== q.r1) return { rows: vRows.slice(q.r0, q.r1 + 1), header: null }
    const tb = active ? tableAt(active.key, active.col) : null
    if (tb) { const b = tableBoxes.find(x => x.tb.id === tb.id)!; return { rows: vRows.filter(r => b.pos.has(r.id) && !(tb.totals && r.id === tb.bottom)), header: tb.header } }
    if (fArea?.header) { const h = vRows.find(r => r.id === fArea.header); const inScope = new Set(filterScope); return { rows: [...(h ? [h] : []), ...vRows.filter(r => inScope.has(r.id))], header: !!h } }
    const a = activeAt(), g = region(a.r, a.c)
    return { rows: vRows.slice(g.r0, g.r1 + 1), header: null }
  }
  function sortBy(keys: SortKey[], header: boolean | null, fromFilter = false) {
    if (ro) { p.onNotice(ro); return }
    if (!fromFilter && oneArea()) return
    if (!keys.length) return
    const sc = sortScope(fromFilter)
    const hdr = header ?? sc.header ?? looksLikeHeader(colIds.map(c => cellView(sc.rows[0]?.id ?? '', c)), sc.rows[1] ? colIds.map(c => cellView(sc.rows[1].id, c)) : undefined)
    const body = hdr ? sc.rows.slice(1) : sc.rows
    if (body.length < 2) return
    const first = vRowIndex.get(body[0].id) ?? 0, last = vRowIndex.get(body[body.length - 1].id) ?? 0
    if (boxes.some(b => b.r1 >= first && b.r0 <= last)) { p.onNotice(sheetT('sortMerged')); return }
    const ordered = sortRows(body, keys, (r, col) => cellView(r.id, col))
    const slots = body.map(r => r.position).sort((x, y) => x - y)
    const moved = ordered.map((r, i) => ({ id: r.id, before: r.position, after: slots[i] })).filter(x => x.before !== x.after)
    if (moved.length) applyR('sort', [{ kind: 'rowOrder', rows: moved }])
  }
  function formatAsTable(style: string, at?: GridRect, header = true) {
    if (ro) { p.onNotice(ro); return }
    const cur = active ? tableAt(active.key, active.col) : null
    if (cur && !at) { applyR('tableStyle', [{ kind: 'tables', before: tables, after: tables.map(x => (x.id === cur.id ? { ...x, style } : x)) }]); return }
    if (oneArea()) return
    const a = activeAt(), q = at ?? (multi() ? rectRef.current : region(a.r, a.c))
    const d0 = rowIndex.get(vRows[q.r0].id) ?? 0, d1 = rowIndex.get(vRows[q.r1].id) ?? 0, e0 = colIndex.get(vCols[q.c0].id) ?? 0, e1 = colIndex.get(vCols[q.c1].id) ?? 0
    if (tableBoxes.some(b => b.dr[0] <= d1 && d0 <= b.dr[1] && b.dc[0] <= e1 && e0 <= b.dc[1])) { p.onNotice(sheetT('tableOverlap')); return }
    if (boxes.some(b => b.r0 <= q.r1 && q.r0 <= b.r1 && b.c0 <= q.c1 && q.c0 <= b.c1)) { p.onNotice(sheetT('tableMerged')); return }
    const rec: SheetTableRecord = { id: p.newId(), top: vRows[q.r0].id, bottom: vRows[q.r1].id, left: vCols[q.c0].id, right: vCols[q.c1].id, style, header, banded: true }
    applyR('table', [
      { kind: 'tables', before: tables, after: [...tables, rec] },
      ...(header ? [{ kind: 'view' as const, before: viewNow(), after: { ...viewNow(), filterArea: { header: rec.top, cols: vCols.slice(q.c0, q.c1 + 1).map(c => c.id), last: rec.bottom }, filter: {} } }] : []),
    ])
    setSelectRect(q)
  }
  function tableOff() {
    if (ro) { p.onNotice(ro); return }
    const cur = active ? tableAt(active.key, active.col) : null
    if (!cur) return
    const forward: BlankChange[] = [{ kind: 'tables', before: tables, after: tables.filter(x => x.id !== cur.id) }]
    if (fArea?.header === cur.top) forward.push({ kind: 'view', before: viewNow(), after: { ...viewNow(), filterArea: null, filter: {} } })
    applyR('tableOff', forward)
  }
  function filterCmd(op: 'toggle' | 'clear' | 'reapply') {
    if (op === 'clear') { if (Object.keys(filter).length) setView('filterClear', { filter: {} }); return }
    if (op === 'reapply') return
    if (fArea) { setView('filterOff', { filterArea: null, filter: {} }); return }
    if (oneArea()) return
    const a = activeAt(), q = multi() ? rectRef.current : region(a.r, a.c)
    setView('filterOn', { filterArea: { header: vRows[q.r0].id, cols: vCols.slice(q.c0, q.c1 + 1).map(c => c.id), last: null }, filter: {} })
  }
  function filterCol(col: string, f: ColFilter | null) {
    const next = { ...filter }
    if (f && filterOn(f)) next[col] = f; else delete next[col]
    setView('filter', { filter: next })
  }
  const [filterUi, setFilterUi] = useState<{ col: string; anchor: HTMLElement } | null>(null)
  /** "E3:E6", or "E:G" for whole columns: where a rule applies. */
  function whereOf(r: ConditionalRule): string {
    const cs = r.range.cols.map(c => colIndex.get(c)).filter((x): x is number => x !== undefined)
    if (!cs.length) return ''
    const a = colLetters(Math.min(...cs)), b = colLetters(Math.max(...cs))
    if (r.range.rows === 'all') return `${a}:${b}`
    const rs = r.range.rows.map(x => rowIndex.get(x)).filter((x): x is number => x !== undefined)
    if (!rs.length) return `${a}:${b}`
    return `${a}${Math.min(...rs) + 1}:${b}${Math.max(...rs) + 1}`
  }
  function setRules(label: string, after: ConditionalRule[]) {
    if (ro) { p.onNotice(ro); return }
    applyR(label, [{ kind: 'rules', before: rules, after }])
  }
  function ruleNew(rule: Pick<ConditionalRule, 'kind' | 'args' | 'style'>) {
    if (oneArea()) return
    const q = rectRef.current
    const range: ConditionalRule['range'] = {
      rows: q.r0 === 0 && q.r1 === vRows.length - 1 && !Object.keys(filter).length ? 'all' : vRows.slice(q.r0, q.r1 + 1).map(r => r.id),
      cols: vCols.slice(q.c0, q.c1 + 1).map(c => c.id),
    }
    // Spec 020 tip 27: a whole-row rule tests a column of its own range.
    if (rule.args.row && rule.args.col && !range.cols.includes(rule.args.col)) range.cols = [...range.cols, rule.args.col]
    setRules('rule', [{ id: p.newId(), range, ...rule, priority: 0 }, ...[...rules].sort((x, y) => x.priority - y.priority).map((r, i) => ({ ...r, priority: i + 1 }))])
  }
  function rulesClear(where: 'selection' | 'sheet') {
    if (where === 'sheet') { if (rules.length) setRules('rulesClear', []); return }
    // Every area (spec 017): a rule goes when it touches any of them.
    const hits = (r: ConditionalRule) => areasRef.current.some(q => {
      const rs = new Set(vRows.slice(q.r0, q.r1 + 1).map(x => x.id)), cs = new Set(vCols.slice(q.c0, q.c1 + 1).map(x => x.id))
      return r.range.cols.some(c => cs.has(c)) && (r.range.rows === 'all' || r.range.rows.some(x => rs.has(x)))
    })
    const kept = rules.filter(r => !hits(r))
    if (kept.length !== rules.length) setRules('rulesClear', kept)
  }
  /** Sort's columns, named by the header row when there is one. */
  const usedCols = useMemo(() => { const u = new Set<string>(); for (const row of Object.values(doc.cells)) for (const c of Object.keys(row)) u.add(c); return vCols.filter(c => u.has(c.id)).map(c => c.id) }, [doc.cells, vCols])
  function sortInfo(): { cols: { key: string; name: string }[]; header: boolean | null } {
    const q = rectRef.current
    const tb = active ? tableAt(active.key, active.col) : null
    let cols: string[], headRow: string | null, header: boolean | null
    if (multi()) { cols = vCols.slice(q.c0, q.c1 + 1).map(c => c.id); headRow = vRows[q.r0]?.id ?? null; header = null }
    else if (tb) { cols = vCols.filter(c => tableBoxes.find(b => b.tb.id === tb.id)?.cols.has(c.id)).map(c => c.id); headRow = tb.header ? tb.top : null; header = tb.header }
    else if (fArea) { cols = fArea.cols.filter(c => vColIndex.has(c)); headRow = fArea.header; header = true }
    else { cols = usedCols.length ? usedCols : colIds.slice(0, 1); headRow = vRows[0]?.id ?? null; header = null }
    if (header === null && headRow) {
      const i = vRowIndex.get(headRow) ?? 0
      header = vRows[i + 1] ? looksLikeHeader(cols.map(c => cellView(headRow!, c)), cols.map(c => cellView(vRows[i + 1].id, c))) : false
    }
    return { cols: cols.map(c => ({ key: c, name: (header && headRow ? value(headRow, c) : '') || `${sheetT('column')} ${colLetters(colIndex.get(c) ?? 0)}` })), header }
  }

  /** The name box (spec 018): "D20" or "B2:C5", by the sheet's own letters and numbers; false when it isn't one. */
  function gotoRef(ref: string): boolean {
    const m = /^\s*([A-Za-z]{1,3})(\d{1,6})(?:\s*:\s*([A-Za-z]{1,3})(\d{1,6}))?\s*$/.exec(ref)
    if (!m) return false
    const col = (l: string) => [...l.toUpperCase()].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0) - 1
    const vis = (docR: number, docC: number) => ({ r: vRows.findIndex(x => (rowIndex.get(x.id) ?? -1) >= docR), c: vCols.findIndex(x => (colIndex.get(x.id) ?? -1) >= docC) })
    const a = vis(Number(m[2]) - 1, col(m[1])), b = m[3] ? vis(Number(m[4]) - 1, col(m[3])) : a
    if (a.r < 0 || a.c < 0 || b.r < 0 || b.c < 0) return false
    setSelectRect({ r0: Math.min(a.r, b.r), c0: Math.min(a.c, b.c), r1: Math.max(a.r, b.r), c1: Math.max(a.c, b.c) })
    return true
  }

  // ── spec 020 stage B (approved design power-tips-b) ─────────────────────
  /** The selection's filled cells, each once (a sheet is mostly empty); linked task cells are left out. */
  function selFilled(): { rowId: string; colId: string; v: string }[] {
    const out: { rowId: string; colId: string; v: string }[] = [], seen = new Set<string>()
    for (const q of areasRef.current) for (let r = q.r0; r <= q.r1; r++) {
      const row = vRows[r], cells = row ? doc.cells[row.id] : undefined
      if (!cells) continue
      for (const [colId, v] of Object.entries(cells)) {
        const c = vColIndex.get(colId)
        if (c === undefined || c < q.c0 || c > q.c1 || !v || lk.shown(row.id, colId)) continue
        const k = `${row.id}|${colId}`
        if (seen.has(k)) continue
        seen.add(k); out.push({ rowId: row.id, colId, v })
      }
    }
    return out
  }
  /** A rewrite of cells (and Text formats that go) as one step, with Excel's "N cells changed" note and Undo. */
  function rewrite(label: string, what: string, list: { rowId: string; colId: string; value: string }[], unText: [string, string][] = []) {
    const forward: BlankChange[] = []
    const ch = cellChange(list)
    if (ch) forward.push(ch)
    if (unText.length) { const f = planFormat(index, unText, { num: null }); if (f.length) forward.push({ kind: 'formats', items: f }) }
    if (!forward.length) { p.onNotice(tt('clean.none', { what })); return }
    const n = new Set([...(ch?.kind === 'cells' ? ch.cells.map(x => `${x.rowId}|${x.colId}`) : []), ...unText.map(([a, b]) => `${a}|${b}`)]).size
    applyR(label, forward)
    p.onNotice(tt('clean.done', { what, n }), true)
  }
  /** Data › Clean up: Trim Spaces and Clean, Change Case, Convert Text to Numbers, Fill Blanks from Above (tips 61–67). */
  function cleanup(op: CleanOp) {
    if (ro) { p.onNotice(ro); return }
    const list: { rowId: string; colId: string; value: string }[] = []
    const unText: [string, string][] = []
    if (op === 'blanks') {
      for (const q of areasRef.current) for (let c = q.c0; c <= q.c1; c++) {
        const col = vCols[c]
        if (!col) continue
        const vals: string[] = []
        for (let r = q.r0; r <= q.r1 && r < vRows.length; r++) vals.push(value(vRows[r].id, col.id))
        // Blanks below the last value aren't part of the list.
        let last = vals.length - 1
        while (last >= 0 && !vals[last].trim()) last--
        blanksFromAbove(vals.slice(0, last + 1)).forEach((v, i) => { if (v !== null) list.push({ rowId: vRows[q.r0 + i].id, colId: col.id, value: v }) })
      }
    } else {
      for (const x of selFilled()) {
        let v: string | null = null
        if (op === 'trim') v = trimClean(x.v)
        else if (op === 'toNumber') {
          v = toNumber(x.v)
          if (v !== null && styleOf(x.rowId, x.colId)?.num?.kind === 'text') unText.push([x.rowId, x.colId])
        } else v = changeCase(x.v, op)
        if (v !== null && v !== x.v) list.push({ rowId: x.rowId, colId: x.colId, value: v })
      }
    }
    rewrite(`clean-${op}`, tt(`clean.ops.${op}`), list, unText)
  }
  /** The green corner's Convert to Number, on one cell. */
  function convertCell(rowId: string, colId: string) {
    if (ro) { p.onNotice(ro); return }
    const v = toNumber(value(rowId, colId))
    if (v === null) return
    rewrite('clean-toNumber', tt('clean.ops.toNumber'), [{ rowId, colId, value: v }], [[rowId, colId]])
  }
  /** Ignore Error: the corner goes for this member (kept in this browser). */
  const [ignored, setIgnored] = useState<Set<string>>(() => new Set())
  useEffect(() => {
    try { setIgnored(new Set(JSON.parse(localStorage.getItem(`momentum.sheet.ignore.${p.doc.id}`) ?? '[]'))) } catch { /* private window */ }
  }, [p.doc.id])
  function ignoreCell(k: string) {
    setIgnored(s => { const n = new Set(s); n.add(k); try { localStorage.setItem(`momentum.sheet.ignore.${p.doc.id}`, JSON.stringify([...n].slice(-500))) } catch { /* not kept */ } return n })
  }
  /**
   * What Remove Duplicates works on (tip 52): the selection, the table, or
   * the block around the active cell; with headings when the first row's
   * labels don't repeat below (as Excel guesses).
   */
  function dataScope(): { rows: typeof vRows; cols: string[]; header: boolean } {
    const tb = !multi() ? tableHere() : null
    let rowsIn: typeof vRows, cols: string[], header: boolean | null = null
    if (tb) {
      const b = tableBoxes.find(x => x.tb.id === tb.id)!
      rowsIn = vRows.filter(r => b.pos.has(r.id) && !(tb.totals && r.id === tb.bottom))
      cols = vCols.filter(c => b.cols.has(c.id)).map(c => c.id)
      header = tb.header
    } else {
      const a = activeAt(), g = multi() ? rectRef.current : region(a.r, a.c)
      rowsIn = vRows.slice(g.r0, g.r1 + 1)
      cols = vCols.slice(g.c0, g.c1 + 1).map(c => c.id)
    }
    if (header === null) {
      const first = rowsIn[0], rest = rowsIn.slice(1)
      header = !!first && rest.length > 0 && (
        looksLikeHeader(cols.map(c => cellView(first.id, c)), cols.map(c => cellView(rest[0].id, c))) ||
        cols.every(c => { const v = value(first.id, c).trim(); return !!v && parseNumber(v) === null && !rest.some(r => value(r.id, c).trim() === v) }))
    }
    return { rows: rowsIn, cols, header }
  }
  function dedupe(cols: string[], header: boolean) {
    if (ro) { p.onNotice(ro); return }
    if (oneArea()) return
    const sc = dataScope()
    const body = header ? sc.rows.slice(1) : sc.rows
    if (!cols.length || body.length < 2) { p.onNotice(tt('clean.dupNone', { left: body.length })); return }
    const gone = new Set(dedupePlan(body.map(r => cols.map(c => value(r.id, c)))))
    if (!gone.size) { p.onNotice(tt('clean.dupNone', { left: body.length })); return }
    const kept = body.filter((_, i) => !gone.has(i))
    // The unique rows close up inside the range; what's left at its foot is cleared (Excel removes the cells, not whole rows).
    const list: { rowId: string; colId: string; value: string }[] = []
    body.forEach((r, i) => { const src = kept[i]; for (const c of sc.cols) list.push({ rowId: r.id, colId: c, value: src ? value(src.id, c) : '' }) })
    const ch = cellChange(list)
    if (ch) applyR('dedupe', [ch])
    p.onNotice(tt('clean.dupDone', { n: gone.size, left: kept.length }), true)
  }
  /** Text to Columns (tip 54): one column split into the next ones; data there is replaced after a confirm. */
  const [splitAsk, setSplitAsk] = useState<{ run(): void } | null>(null)
  function split(opts: SplitOpts, formats: SplitFormat[], confirmed = false) {
    if (ro) { p.onNotice(ro); return }
    if (oneArea()) return
    const q = rectRef.current
    if (q.c0 !== q.c1) { p.onNotice(tt('clean.splitOneCol')); return }
    const src = vCols[q.c0]
    if (!src) return
    const sel = vRows.slice(q.r0, q.r1 + 1)
    let last = sel.length - 1
    while (last >= 0 && !value(sel[last].id, src.id)) last--
    const rowsIn = sel.slice(0, last + 1)
    if (!rowsIn.length) return
    const plan = splitPlan(rowsIn.map(r => value(r.id, src.id)), opts)
    const keep = Array.from({ length: plan.width }, (_, i) => i).filter(i => formats[i] !== 'skip')
    if (!keep.length) return
    const newCols = growTo(doc.cols, doc.cols.length + (q.c0 + keep.length - 1) - vCols.length, BLANK_COL_LIMIT, p.newId)
    const allCols = [...vCols, ...newCols]
    if (q.c0 + keep.length > allCols.length) { p.onNotice(t('err.too_many_cols')); return }
    if (!confirmed && rowsIn.some(r => keep.slice(1).some((_, j) => !!value(r.id, allCols[q.c0 + 1 + j]?.id ?? '')))) {
      setSplitAsk({ run: () => split(opts, formats, true) }); return
    }
    const forward: BlankChange[] = []
    if (newCols.length) forward.push({ kind: 'insertCols', cols: newCols.map(c => ({ ...c, width: null })) })
    const list: { rowId: string; colId: string; value: string }[] = []
    rowsIn.forEach((r, ri) => keep.forEach((pi, j) => list.push({ rowId: r.id, colId: allCols[q.c0 + j].id, value: plan.parts[ri][pi] ?? '' })))
    const ch = cellChange(list)
    if (ch) forward.push(ch)
    for (const kind of ['text', 'date'] as const) {
      const targets: [string, string][] = []
      keep.forEach((pi, j) => { if (formats[pi] === kind) for (const r of rowsIn) targets.push([r.id, allCols[q.c0 + j].id]) })
      if (targets.length) { const f = planFormat(index, targets, { num: { kind } }); if (f.length) forward.push({ kind: 'formats', items: f }) }
    }
    if (!forward.length) return
    applyR('split', forward)
    p.onNotice(tt('clean.splitDone', { n: rowsIn.length, cols: keep.length }), true)
    setSelectRect({ r0: q.r0, c0: q.c0, r1: q.r0 + rowsIn.length - 1, c1: q.c0 + keep.length - 1 })
  }
  /** Format › Cell size › AutoFit Column Width / AutoFit Row Height, for every selected column or row, one step. */
  function autofit(what: 'row' | 'col') {
    if (ro) { p.onNotice(ro); return }
    const q = rectRef.current
    if (what === 'row') {
      const ids = (many() ? areaRows(areasRef.current) : range(q.r0, q.r1)).map(r => vRows[r]?.id).filter((x): x is string => !!x)
      setHeights(ids, null)
      return
    }
    const ids = (many() ? areaCols(areasRef.current) : range(q.c0, q.c1)).map(c => vCols[c]?.id).filter((x): x is string => !!x)
    const list = ids.map(id => {
      let w = 40
      for (const r of vRows) {
        const v = doc.cells[r.id]?.[id]
        if (!v) continue
        const st = styleOf(r.id, id) ?? {}
        if (st.ha === 'across' || spans.anchor.has(`${r.id}|${id}`)) continue
        w = Math.max(w, fitWidth(st.num ? display(v, st.num, locale) : v, st))
      }
      const col = doc.cols.find(c => c.id === id)
      return { id, before: col?.width ?? null, after: Math.min(600, w) }
    }).filter(x => x.before !== x.after)
    if (list.length) applyR('autofit', [{ kind: 'colWidths', cols: list }])
  }
  /** A typed range ("A1:D6", "$A$1:$D$6") as sheet indexes, or null. */
  function readRef(ref: string): { r0: number; c0: number; r1: number; c1: number } | null {
    const m = /^\s*=?\$?([A-Za-z]{1,3})\$?(\d{1,6})(?:\s*:\s*\$?([A-Za-z]{1,3})\$?(\d{1,6}))?\s*$/.exec(ref)
    if (!m) return null
    const col = (l: string) => [...l.toUpperCase()].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0) - 1
    const r0 = Number(m[2]) - 1, c0 = col(m[1]), r1 = m[3] ? Number(m[4]) - 1 : r0, c1 = m[3] ? col(m[3]) : c0
    const out = { r0: Math.min(r0, r1), r1: Math.max(r0, r1), c0: Math.min(c0, c1), c1: Math.max(c0, c1) }
    return out.r1 < doc.rows.length && out.c1 < doc.cols.length && out.r0 >= 0 && out.c0 >= 0 ? out : null
  }
  /** A sheet range as text ("A1:D6"). */
  const refOf = (r0: number, c0: number, r1: number, c1: number) => `${colLetters(c0)}${r0 + 1}:${colLetters(c1)}${r1 + 1}`
  /** The block around the active cell (or the selection), as the sheet names it: Create Table's and Advanced Filter's default. */
  function regionRef(): string {
    const a = activeAt(), q = multi() ? rectRef.current : region(a.r, a.c)
    const d = (r: number) => rowIndex.get(vRows[r]?.id ?? '') ?? 0, e = (c: number) => colIndex.get(vCols[c]?.id ?? '') ?? 0
    return refOf(d(q.r0), e(q.c0), d(q.r1), e(q.c1))
  }
  // ── tables: Ctrl+T, the Total row, slicers (tips 71, 73, 74, 79) ──
  const tableHere = () => (active ? tableAt(active.key, active.col) : null)
  function createTable(ref: string, header: boolean) {
    if (ro) { p.onNotice(ro); return }
    const g = readRef(ref)
    if (!g) { p.onNotice(t('toolbar2.badRef', { ref })); return }
    const vis = (docR: number, docC: number) => ({ r: vRows.findIndex(x => (rowIndex.get(x.id) ?? -1) >= docR), c: vCols.findIndex(x => (colIndex.get(x.id) ?? -1) >= docC) })
    const a = vis(g.r0, g.c0), b = vis(g.r1, g.c1)
    if (a.r < 0 || a.c < 0 || b.r < 0 || b.c < 0) { p.onNotice(t('toolbar2.badRef', { ref })); return }
    formatAsTable('medium-0', { r0: a.r, c0: a.c, r1: b.r, c1: b.c }, header)
  }
  /** The Total row's number for a column, over the rows the filter shows (Excel's SUBTOTAL). */
  function totalOf(tb: SheetTableRecord, col: string, fn: TotalFn): string {
    const box = tableBoxes.find(b => b.tb.id === tb.id)
    if (!box || fn === 'none') return ''
    const body = vRows.filter(r => box.pos.has(r.id) && r.id !== tb.bottom && !(tb.header && r.id === tb.top))
    const vals = body.map(r => value(r.id, col))
    const nums = vals.map(v => parseNumber(v)).filter((n): n is number => n !== null)
    const fmt = (n: number) => String(Number(n.toPrecision(15)))
    switch (fn) {
      case 'count': return String(vals.filter(v => v.trim()).length)
      case 'countNums': return String(nums.length)
      case 'sum': return fmt(nums.reduce((x, y) => x + y, 0))
      case 'avg': return nums.length ? fmt(nums.reduce((x, y) => x + y, 0) / nums.length) : ''
      case 'min': return nums.length ? fmt(Math.min(...nums)) : ''
      case 'max': return nums.length ? fmt(Math.max(...nums)) : ''
    }
    return ''
  }
  /** The table whose Total row a row is, or null. */
  const totalTableOf = (rowId: string) => tables.find(tb => tb.totals && tb.bottom === rowId) ?? null
  function totalRow(on: boolean) {
    if (ro) { p.onNotice(ro); return }
    const tb = tableHere()
    if (!tb) { p.onNotice(tt('table.none')); return }
    if (!!tb.totals === on) return
    const box = tableBoxes.find(b => b.tb.id === tb.id)!
    const cols = vCols.filter(c => box.cols.has(c.id)).map(c => c.id)
    const forward: BlankChange[] = []
    if (on) {
      // The row under the table becomes its Total row (one is inserted when that row holds data).
      const at = (rowIndex.get(tb.bottom) ?? 0) + 1
      let below = doc.rows[at]
      if (!below || cols.some(c => value(below!.id, c))) {
        const made = insertAt(doc.rows, at, 1, p.newId)[0]
        forward.push({ kind: 'insertRows', rows: [{ ...made, height: null }] })
        below = { ...made, height: null } as typeof below
      }
      const last = cols[cols.length - 1]
      const numeric = vRows.some(r => box.pos.has(r.id) && parseNumber(value(r.id, last)) !== null)
      forward.push({ kind: 'tables', before: tables, after: tables.map(x => (x.id === tb.id ? { ...x, bottom: below!.id, totals: { [last]: numeric ? 'sum' : 'count' } } : x)) })
      forward.push({ kind: 'cells', cells: [{ rowId: below.id, colId: cols[0], before: value(below.id, cols[0]), after: tt('total.label') }] })
      if (fArea?.header === tb.top) forward.push({ kind: 'view', before: viewNow(), after: { ...viewNow(), filterArea: { ...fArea, last: tb.bottom } } })
    } else {
      const i = rowIndex.get(tb.bottom) ?? 0, prev = doc.rows[i - 1]
      if (!prev) return
      forward.push({ kind: 'tables', before: tables, after: tables.map(x => (x.id === tb.id ? { ...x, bottom: prev.id, totals: null } : x)) })
      const ch = cellChange(cols.map(c => ({ rowId: tb.bottom, colId: c, value: '' })))
      if (ch) forward.push(ch)
    }
    applyR(on ? 'totalRowOn' : 'totalRowOff', forward)
  }
  function setTotal(tableId: string, col: string, fn: TotalFn) {
    if (ro) { p.onNotice(ro); return }
    const tb = tables.find(x => x.id === tableId)
    if (!tb?.totals) return
    applyR('total', [{ kind: 'tables', before: tables, after: tables.map(x => (x.id === tb.id ? { ...x, totals: { ...x.totals, [col]: fn } } : x)) }])
  }
  const [slicerMulti, setSlicerMulti] = useState<Set<string>>(() => new Set())
  const slicers = useMemo(() => (view.slicers ?? []).filter(sl => tables.some(tb => tb.id === sl.tableId)), [view.slicers, tables])
  function addSlicers(cols: string[]) {
    if (ro) { p.onNotice(ro); return }
    const tb = tableHere()
    if (!tb) { p.onNotice(tt('table.none')); return }
    const have = new Set(slicers.filter(x => x.tableId === tb.id).map(x => x.col))
    const add = cols.filter(c => !have.has(c)).map(col => ({ id: p.newId(), tableId: tb.id, col }))
    if (!add.length) return
    const box = tableBoxes.find(b => b.tb.id === tb.id)
    const after: Partial<SheetView> = { slicers: [...(view.slicers ?? []), ...add].slice(0, 20) }
    // A slicer filters through the table's filter buttons.
    if (box && fArea?.header !== tb.top) Object.assign(after, { filterArea: { header: tb.top, cols: vCols.filter(c => box.cols.has(c.id)).map(c => c.id), last: tb.totals ? doc.rows[(rowIndex.get(tb.bottom) ?? 1) - 1]?.id ?? tb.bottom : tb.bottom }, filter: {} })
    setView('slicers', after)
  }
  function slicerPick(sl: { tableId: string; col: string }, val: string | null, add: boolean) {
    const tb = tables.find(x => x.id === sl.tableId)
    if (!tb) return
    const cur = filter[sl.col]?.values
    let values: string[] | null
    if (val === null) values = null
    else if (add) { const set = new Set(cur ?? []); if (set.has(val)) set.delete(val); else set.add(val); values = set.size ? [...set] : null }
    else values = cur?.length === 1 && cur[0] === val ? null : [val]
    const next = { ...filter }
    if (values) next[sl.col] = { values }; else delete next[sl.col]
    setView('slicer', { filter: next })
  }
  function slicerOff(id: string) {
    const sl = slicers.find(x => x.id === id)
    const next = { ...filter }
    if (sl) delete next[sl.col]
    setView('slicerOff', { slicers: (view.slicers ?? []).filter(x => x.id !== id), filter: next })
  }
  // ── Data › Advanced Filter (tip 78) ──
  function advanced(cmd: Extract<FormatCmd, { kind: 'advanced' }>) {
    if (ro) { p.onNotice(ro); return }
    const L = readRef(cmd.list), C = readRef(cmd.criteria)
    if (!L || L.r1 - L.r0 < 1) { p.onNotice(t('toolbar2.badRef', { ref: cmd.list })); return }
    if (!C) { p.onNotice(t('toolbar2.badRef', { ref: cmd.criteria })); return }
    const lrows = doc.rows.slice(L.r0, L.r1 + 1), lcols = doc.cols.slice(L.c0, L.c1 + 1).map(c => c.id)
    const heads = lcols.map(c => ({ col: c, name: value(lrows[0].id, c) }))
    const crit = doc.rows.slice(C.r0, C.r1 + 1).map(r => doc.cols.slice(C.c0, C.c1 + 1).map(c => value(r.id, c.id)))
    const read = readCriteria(crit, heads)
    if ('error' in read) { p.onNotice(read.error === 'heading' ? tt('adv.badHeading', { name: read.name ?? '' }) : tt('adv.empty')); return }
    if (cmd.copy === 'none') {
      setView('advanced', { advanced: { top: lrows[0].id, bottom: lrows[lrows.length - 1].id, left: lcols[0], right: lcols[lcols.length - 1], groups: read.groups, ...(cmd.unique ? { unique: true } : {}) } })
      return
    }
    const body = lrows.slice(1)
    const rowsV = body.map(r => lcols.map(c => value(r.id, c)))
    const keep = advancedPlan(rowsV, lcols, read.groups, cmd.unique)
    const grid = [heads.map(h => h.name), ...keep.map(i => rowsV[i])]
    if (cmd.copy === 'sheet') { p.onNewSheet?.(grid); p.onNotice(tt('adv.copied', { n: keep.length })); return }
    const T = readRef(cmd.to ?? '')
    if (!T) { p.onNotice(t('toolbar2.badRef', { ref: cmd.to ?? '' })); return }
    const newRows = growTo(doc.rows, T.r0 + grid.length - 1, BLANK_ROW_LIMIT, p.newId)
    const newCols = growTo(doc.cols, T.c0 + grid[0].length - 1, BLANK_COL_LIMIT, p.newId)
    const allRows = [...doc.rows, ...newRows], allCols = [...doc.cols, ...newCols]
    if (T.r0 + grid.length > allRows.length || T.c0 + grid[0].length > allCols.length) { p.onNotice(t('err.too_many_rows')); return }
    const forward: BlankChange[] = []
    if (newRows.length) forward.push({ kind: 'insertRows', rows: newRows.map(r => ({ ...r, height: null })) })
    if (newCols.length) forward.push({ kind: 'insertCols', cols: newCols.map(c => ({ ...c, width: null })) })
    const ch = cellChange(grid.flatMap((line, i) => line.map((v, j) => ({ rowId: allRows[T.r0 + i].id, colId: allCols[T.c0 + j].id, value: v }))))
    if (ch) forward.push(ch)
    if (forward.length) applyR('advancedCopy', forward)
    p.onNotice(tt('adv.copied', { n: keep.length }), true)
  }
  // ── Data › Group (tip 80) ──
  function outline(op: 'group' | 'ungroup', what?: 'rows' | 'cols') {
    if (ro) { p.onNotice(ro); return }
    if (oneArea()) return
    const q = rectRef.current
    const allR = q.c0 === 0 && q.c1 >= vCols.length - 1, allC = q.r0 === 0 && q.r1 >= vRows.length - 1
    const kind: 'rows' | 'cols' = what ?? (allC && !allR ? 'cols' : 'rows')
    const order = kind === 'rows' ? doc.rows.map(r => r.id) : doc.cols.map(c => c.id)
    const idx = kind === 'rows' ? rowIndex : colIndex
    const a = idx.get(kind === 'rows' ? vRows[q.r0]?.id ?? '' : vCols[q.c0]?.id ?? '') ?? 0
    const b = idx.get(kind === 'rows' ? vRows[q.r1]?.id ?? '' : vCols[q.c1]?.id ?? '') ?? 0
    const next = op === 'group' ? outlineGroup(view.outline, kind, order, a, b) : outlineUngroup(view.outline, kind, order, a, b)
    if (!next) { p.onNotice(tt(op === 'group' ? 'outline.max' : 'outline.none')); return }
    setView(op, { outline: next })
  }
  function setOutline(next: OutlineGroupRecord[], label: string) { setView(label, { outline: next }) }

  function runFormat(cmd: FormatCmd) {
    const q = rectRef.current
    // Spec 020: what F4 repeats (formatting, inserting, hiding, clearing formats).
    if (REPEATABLE.has(cmd.kind) && !(cmd.kind === 'clear' && cmd.what === 'comments')) lastCmd.current = cmd
    if (cmd.kind === 'goSpecial') { goSpecial(cmd.what, cmd.numbers, cmd.text); focusActive(); return }
    if (cmd.kind === 'series') { series(cmd.spec, cmd.by); focusActive(); return }
    if (cmd.kind === 'validation') { setValidation(cmd.rule, cmd.all); focusActive(); return }
    if (cmd.kind === 'flashFill') { flashFill(); focusActive(); return }
    if (cmd.kind === 'repeat') { repeat(); focusActive(); return }
    // Spec 020 stage B.
    if (cmd.kind === 'autofit') { autofit(cmd.what); focusActive(); return }
    if (cmd.kind === 'clean') { cleanup(cmd.op); focusActive(); return }
    if (cmd.kind === 'dedupe') { dedupe(cmd.cols, cmd.header); focusActive(); return }
    if (cmd.kind === 'split') { split(cmd.opts, cmd.formats); focusActive(); return }
    if (cmd.kind === 'createTable') { createTable(cmd.ref, cmd.header); focusActive(); return }
    if (cmd.kind === 'totalRow') { totalRow(cmd.on); focusActive(); return }
    if (cmd.kind === 'total') { const tb = tableHere(); if (tb) setTotal(tb.id, cmd.col, cmd.fn); focusActive(); return }
    if (cmd.kind === 'slicers') { addSlicers(cmd.cols); focusActive(); return }
    if (cmd.kind === 'advanced') { advanced(cmd); focusActive(); return }
    if (cmd.kind === 'advancedClear') { if (view.advanced) setView('advancedClear', { advanced: null }); focusActive(); return }
    if (cmd.kind === 'outline') { outline(cmd.op, cmd.what); focusActive(); return }
    if (cmd.kind === 'pickList') {
      const el = rootRef.current?.querySelector<HTMLElement>('.fx-sheet-td.is-active')
      const row = active ? vRows.find(r => r.id === active.key) : undefined
      if (el && row && active) pickList({ key: row.id, ...row }, active.col, el, 'menu')
      return
    }
    // Formats go to every area (spec 017 FR-009); borders are drawn per area.
    if (cmd.kind === 'patch') applyItems(cmd.label, planAreas(a => planRect(index, a, size, rk, ck, cmd.patch)))
    else if (cmd.kind === 'borders') applyItems('borders', planAreas(a => planBorders(index, a, size, rk, ck, cmd.preset, cmd.line)))
    else if (cmd.kind === 'merge') merge(cmd.mode)
    else if (cmd.kind === 'paint') applyItems('paint', planAreas(a => planRect(index, a, size, rk, ck, paintPatch(cmd.style))))
    else if (cmd.kind === 'view') viewOp(cmd.op)
    else if (cmd.kind === 'resize') {
      if (ro) { p.onNotice(ro); return }
      const rows = (many() ? areaRows(areasRef.current) : range(q.r0, q.r1)).map(r => vRows[r]?.id).filter((x): x is string => !!x)
      const cols = (many() ? areaCols(areasRef.current) : range(q.c0, q.c1)).map(c => vCols[c]?.id).filter((x): x is string => !!x)
      if (cmd.what === 'row') setResize({ kind: 'row', ids: rows, value: heightOf(vRows[q.r0]) })
      else setResize({ kind: 'col', ids: cols, value: vCols[q.c0]?.width ?? DEFAULT_COL_W })
      return
    }
    else if (cmd.kind === 'clear') clearWhat(cmd.what)
    else if (cmd.kind === 'fill') fill(cmd.dir)
    else if (cmd.kind === 'pasteSpecial') void pasteSpecial(cmd)
    else if (cmd.kind === 'find') { find(cmd); return }
    else if (cmd.kind === 'replace') { replace(cmd); return }
    else if (cmd.kind === 'cellStyle') { const patch = cellStylePatch(cmd.key); if (patch) applyItems('cellStyle', planAreas(a => planRect(index, a, size, rk, ck, patch))) }
    else if (cmd.kind === 'table') formatAsTable(cmd.style)
    else if (cmd.kind === 'tableOff') tableOff()
    else if (cmd.kind === 'sort') sortBy(cmd.keys, cmd.header)
    else if (cmd.kind === 'filter') filterCmd(cmd.op)
    else if (cmd.kind === 'filterCol') filterCol(cmd.col, cmd.f)
    else if (cmd.kind === 'ruleNew') ruleNew(cmd.rule)
    else if (cmd.kind === 'rulesSet') setRules('rules', cmd.rules)
    else if (cmd.kind === 'rulesClear') rulesClear(cmd.where)
    // Spec 018: the cell bar, the name box, Insert.
    else if (cmd.kind === 'setValue') {
      if (ro) { p.onNotice(ro); return }
      if (!active) return
      if (cmd.value.length > MAX_CELL) { p.onNotice(t('err.too_long')); return }
      const ch = cellChange([{ rowId: active.key, colId: active.col, value: cmd.value }])
      if (ch) applyR('edit', [ch])
    }
    else if (cmd.kind === 'goto') { if (!gotoRef(cmd.ref)) { p.onNotice(t('toolbar2.badRef', { ref: cmd.ref })); return } }
    else if (cmd.kind === 'insert') {
      if (ro) { p.onNotice(ro); return }
      if (oneArea()) return
      if (cmd.what === 'rowAbove' || cmd.what === 'rowBelow') {
        const n = q.r1 - q.r0 + 1
        if (doc.rows.length + n > BLANK_ROW_LIMIT) { p.onNotice(t('err.too_many_rows')); return }
        insertRows(cmd.what === 'rowAbove' ? q.r0 : q.r1 + 1, n)
      } else {
        const n = q.c1 - q.c0 + 1
        if (doc.cols.length + n > BLANK_COL_LIMIT) { p.onNotice(t('err.too_many_cols')); return }
        insertCols(cmd.what === 'colLeft' ? q.c0 : q.c1 + 1, n)
      }
    }
    focusActive()
  }
  // ── spec 020: power tips (approved design power-tips-a) ─────────────────
  const fillCtx: FillCtx = useMemo(() => ({ lists: p.fillLists ?? [], weekend: [5, 6] }), [p.fillLists])
  const dirOf = (from: GridRect, to: GridRect): FillRequest['dir'] => (to.r1 > from.r1 ? 'down' : to.r0 < from.r0 ? 'up' : to.c1 > from.c1 ? 'right' : 'left')
  const vertical = (d: FillRequest['dir']) => d === 'down' || d === 'up'
  /** One line of the source block along the fill: a column going down or up, a row going right or left (read backwards going up or left). */
  function lineOf(base: SheetDoc, from: GridRect, dir: FillRequest['dir'], k: number): { ids: [string, string][]; vals: string[] } {
    const ids: [string, string][] = []
    if (vertical(dir)) for (let r = from.r0; r <= from.r1; r++) { const row = vRows[r], col = vCols[k]; if (row && col) ids.push([row.id, col.id]) }
    else for (let c = from.c0; c <= from.c1; c++) { const row = vRows[k], col = vCols[c]; if (row && col) ids.push([row.id, col.id]) }
    if (dir === 'up' || dir === 'left') ids.reverse()
    return { ids, vals: ids.map(([r, c]) => base.cells[r]?.[c] ?? '') }
  }
  /** The new cells of a fill along one line, nearest the source first. */
  function targetsOf(from: GridRect, to: GridRect, dir: FillRequest['dir'], k: number): [string, string][] {
    const out: [string, string][] = []
    if (dir === 'down') for (let r = from.r1 + 1; r <= to.r1; r++) out.push([vRows[r]?.id, vCols[k]?.id] as [string, string])
    if (dir === 'up') for (let r = from.r0 - 1; r >= to.r0; r--) out.push([vRows[r]?.id, vCols[k]?.id] as [string, string])
    if (dir === 'right') for (let c = from.c1 + 1; c <= to.c1; c++) out.push([vRows[k]?.id, vCols[c]?.id] as [string, string])
    if (dir === 'left') for (let c = from.c0 - 1; c >= to.c0; c--) out.push([vRows[k]?.id, vCols[c]?.id] as [string, string])
    return out.filter(([r, c]) => r && c)
  }
  /** The line the drag's tip previews: the active cell's column (or row). */
  const tipLine = (from: GridRect, dir: FillRequest['dir']) => {
    const a = activeAt()
    return vertical(dir) ? Math.min(from.c1, Math.max(from.c0, a.c)) : Math.min(from.r1, Math.max(from.r0, a.r))
  }
  function fillInfo(from: GridRect): FillInfo | null {
    if (ro || !vRows.length) return null
    const src = lineOf(doc, from, 'down', tipLine(from, 'down')).vals
    return {
      def: defaultMode(src, fillCtx),
      modes: fillModesFor(src, fillCtx),
      preview: (mode, to) => {
        const d = dirOf(from, to)
        const k = tipLine(from, d)
        const n = vertical(d) ? (to.r1 - to.r0) - (from.r1 - from.r0) : (to.c1 - to.c0) - (from.c1 - from.c0)
        return previewValue(lineOf(doc, from, d, k).vals, n, mode, fillCtx)
      },
    }
  }
  /** Data validation by the sheet's own row and column places (hidden rows too). */
  const dvBoxes = useMemo(() => (extras.validations ?? []).map(v => {
    const a = rowIndex.get(v.top), b = rowIndex.get(v.bottom), c = colIndex.get(v.left), d = colIndex.get(v.right)
    if (a === undefined || b === undefined || c === undefined || d === undefined) return null
    return { v, r0: Math.min(a, b), r1: Math.max(a, b), c0: Math.min(c, d), c1: Math.max(c, d) }
  }).filter((x): x is { v: ValidationRecord; r0: number; r1: number; c0: number; c1: number } => !!x), [extras.validations, rowIndex, colIndex])
  const ruleAt = useCallback((rowId: string, colId: string): ValidationRecord | null => {
    if (!dvBoxes.length) return null
    const r = rowIndex.get(rowId), c = colIndex.get(colId)
    if (r === undefined || c === undefined) return null
    return dvBoxes.find(b => r >= b.r0 && r <= b.r1 && c >= b.c0 && c <= b.c1)?.v ?? null
  }, [dvBoxes, rowIndex, colIndex])
  /** Values a rule (Error Alert: Stop) refuses are left out and counted; Warning and Information let them in. */
  function checkList(list: { rowId: string; colId: string; value: string }[], skip: (k: string) => void) {
    if (!dvBoxes.length) return list
    return list.flatMap(x => {
      const rule = ruleAt(x.rowId, x.colId)
      if (!rule || rule.error?.style !== 'stop' || allowed(rule, x.value)) return [rule ? { ...x, value: listSpelling(rule, x.value) } : x]
      skip('invalid')
      return []
    })
  }

  /** The changes a fill makes, worked out against `base` (Auto Fill Options works from before the last fill). */
  function fillChanges(req: FillRequest, base: SheetDoc): { forward: BlankChange[]; skipped: number } {
    const baseIndex = base === doc ? index : indexFormats(base.extras?.formats ?? [])
    const val = (r: string, c: string) => base.cells[r]?.[c] ?? ''
    let list: { rowId: string; colId: string; value: string }[] = []
    const items: FormatItem[] = []
    const forward: BlankChange[] = []
    let skipped = 0
    if (req.mode === 'clear') {
      // Dragging back inside the block clears the cells it leaves (contents only, as Excel).
      for (let r = req.from.r0; r <= req.from.r1; r++) for (let c = req.from.c0; c <= req.from.c1; c++) {
        if (r >= req.to.r0 && r <= req.to.r1 && c >= req.to.c0 && c <= req.to.c1) continue
        const row = vRows[r], col = vCols[c]
        if (row && col && val(row.id, col.id)) list.push({ rowId: row.id, colId: col.id, value: '' })
      }
    } else {
      const dir = req.dir
      const lines = vertical(dir) ? range(req.from.c0, req.from.c1) : range(req.from.r0, req.from.r1)
      // Shift+drag inserts rows (down) or columns (right) for the fill, instead of writing over what's there.
      let made: { id: string; position: number }[] = []
      const n = vertical(dir) ? req.to.r1 - req.to.r0 - (req.from.r1 - req.from.r0) : req.to.c1 - req.to.c0 - (req.from.c1 - req.from.c0)
      if (req.insert && (dir === 'down' || dir === 'right')) {
        if (dir === 'down') { made = insertAt(base.rows, docRow(req.from.r1 + 1), n, p.newId); forward.push({ kind: 'insertRows', rows: made.map(r => ({ ...r, height: null })) }) }
        else { made = insertAt(base.cols, docCol(req.from.c1 + 1), n, p.newId); forward.push({ kind: 'insertCols', cols: made.map(c => ({ ...c, width: null })) }) }
      }
      for (const k of lines) {
        const src = lineOf(base, req.from, dir, k)
        const tgts = made.length
          ? made.map(x => (dir === 'down' ? [x.id, vCols[k]?.id] : [vRows[k]?.id, x.id]) as [string, string]).filter(([r, c]) => r && c)
          : targetsOf(req.from, req.to, dir, k)
        const mode: FillMode = req.mode === 'flash' ? 'copy' : req.mode
        const vals = planSeries(src.vals, tgts.length, mode, fillCtx)
        tgts.forEach(([rid, cid], i) => {
          const v = vals[i]
          if (v !== null && v !== undefined && v !== val(rid, cid)) list.push({ rowId: rid, colId: cid, value: v })
          // Formats come along unless asked not to (Fill Without Formatting).
          if (mode !== 'values') {
            const [sr, sc] = src.ids[i % src.ids.length] ?? []
            if (!sr) return
            const before = baseIndex.get(formatKey(rid, cid)) ?? null, after = baseIndex.get(formatKey(sr, sc)) ?? null
            if (JSON.stringify(before) !== JSON.stringify(after)) items.push({ rowKey: rid, colKey: cid, before, after })
          }
        })
      }
      list = checkList(list, () => { skipped++ })
    }
    const cells = list.map(x => ({ rowId: x.rowId, colId: x.colId, before: val(x.rowId, x.colId), after: x.value })).filter(x => x.before !== x.after || made(x))
    function made(x: { rowId: string; colId: string }) { return forward.some(f => (f.kind === 'insertRows' && f.rows.some(r => r.id === x.rowId)) || (f.kind === 'insertCols' && f.cols.some(c => c.id === x.colId))) }
    if (cells.length) forward.push({ kind: 'cells', cells })
    if (items.length) forward.push({ kind: 'formats', items })
    return { forward, skipped }
  }
  /** The last fill, so Auto Fill Options can put it back and fill another way. */
  const lastFill = useRef<{ base: SheetDoc; applied: boolean } | null>(null)
  function onFill(req: FillRequest, again: boolean) {
    if (ro) { p.onNotice(ro); return }
    if (req.mode === 'flash') { if (again && lastFill.current?.applied) p.onUndo(); flashFill(vertical(req.dir) ? req.to.c0 : activeAt().c); return }
    let base = doc
    if (again && lastFill.current) { base = lastFill.current.base; if (lastFill.current.applied) p.onUndo() }
    if (req.insert && (req.dir === 'down' ? doc.rows.length + (req.to.r1 - req.from.r1) > BLANK_ROW_LIMIT : req.dir === 'right' && doc.cols.length + (req.to.c1 - req.from.c1) > BLANK_COL_LIMIT)) { p.onNotice(t(req.dir === 'down' ? 'err.too_many_rows' : 'err.too_many_cols')); return }
    const { forward, skipped } = fillChanges(req, base)
    if (forward.length) applyR(req.mode === 'clear' ? 'clear' : 'fill', forward)
    lastFill.current = req.mode === 'clear' ? null : { base, applied: forward.length > 0 }
    if (skipped) p.onSkipped({ invalid: skipped })
    lastCmd.current = null
  }
  const [fillMenu, setFillMenu] = useState<{ at: { x: number; y: number }; anchor: HTMLElement; items: PopItem[]; label: string } | null>(null)
  function onFillMenu(f: FillRequest, at: { x: number; y: number }, anchor: HTMLElement, kind: 'right' | 'options' | 'flash', run: (mode: FillMode) => void) {
    if (kind === 'flash') {
      const n = flashDone.current?.n ?? 0
      setFillMenu({ at, anchor, label: tt('flashOptions'), items: [
        { key: 'undo', label: tt('flashUndo'), onSelect: () => { p.onUndo(); flashDone.current = null } },
        { key: 'accept', label: tt('flashAccept'), onSelect: () => { flashDone.current = null } },
        { key: 'select', label: tt('flashSelect', { n }), onSelect: () => { const q = flashDone.current?.rect; if (q) setSelectRect({ ...q }) } },
      ] })
      return
    }
    // Auto Fill Options reads the source as it was before the fill it replaces; the right-drag menu, as it is now.
    const src = lineOf(kind === 'options' ? lastFill.current?.base ?? doc : doc, f.from, f.dir, tipLine(f.from, f.dir)).vals
    const kindOf = sourceKind(src, fillCtx)
    const can = new Set<FillMode>(fillModesFor(src, fillCtx))
    const item = (mode: FillMode, extra: Partial<PopItem> = {}): PopItem => ({ key: mode, label: tt(`fill.${mode}`), checked: kind === 'options' ? f.mode === mode : undefined, ...extra, onSelect: () => run(mode) } as PopItem)
    const dates: PopItem[] = (['days', 'weekdays', 'months', 'years'] as FillMode[]).map(m => item(m, can.has(m) ? {} : { disabled: true }))
    const items: PopItem[] = kind === 'right'
      ? [item('copy'), item('series'), item('formats'), item('values'), { kind: 'sep', key: 's1' }, ...dates, { kind: 'sep', key: 's2' },
          item('linear', kindOf === 'number' ? {} : { disabled: true }), item('growth', kindOf === 'number' ? {} : { disabled: true }),
          item('flash', { kbd: keyLabel('Ctrl+E') }), { kind: 'sep', key: 's3' },
          { key: 'seriesDlg', label: `${tt('fill.seriesDlg')}…`, onSelect: () => { setSelectRect({ ...f.to }); requestAnimationFrame(() => document.dispatchEvent(new CustomEvent(SERIES_OPEN))) } }]
      : [item('copy'), item('series'), item('formats'), item('values'),
          ...(kindOf === 'date' ? [{ kind: 'sep', key: 's1' } as PopItem, ...dates.filter(x => !('disabled' in x && x.disabled))] : []),
          { kind: 'sep', key: 's2' }, item('flash', { kbd: keyLabel('Ctrl+E') })]
    setFillMenu({ at, anchor, items, label: tt(kind === 'right' ? 'fillMenu' : 'fillOptions') })
  }
  const keyLabel = (k: string) => (typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform) ? k.replace('Ctrl+', '⌘') : k)

  // ── Flash Fill (Ctrl+E, tip 14) ──
  const [optionsAt, setOptionsAt] = useState<{ to: GridRect; n: number } | null>(null)
  const flashDone = useRef<{ n: number; rect: GridRect } | null>(null)
  function flashFill(targetC?: number) {
    if (ro) { p.onNotice(ro); return }
    const a = activeAt(), c = targetC ?? a.c
    const g = region(a.r, c)
    const srcCols = range(g.c0, g.c1).filter(x => x !== c)
    if (!srcCols.length) { p.onNotice(tt('flashNone')); return }
    const srcOf = (r: number) => srcCols.map(x => value(vRows[r].id, vCols[x].id))
    const examples: { row: string[]; out: string }[] = [], todo: number[] = []
    for (let r = g.r0; r <= g.r1; r++) {
      const v = value(vRows[r].id, vCols[c].id)
      if (v) examples.push({ row: srcOf(r), out: v })
      else if (srcOf(r).some(Boolean)) todo.push(r)
    }
    // A header row isn't an example: one whose output can't be built from its own row is left out.
    const usable = examples.filter(ex => learnFlash([ex], [ex.row])?.[0] === ex.out)
    if (!usable.length || !todo.length) { p.onNotice(tt('flashNone')); return }
    const outs = learnFlash(usable, todo.map(srcOf))
    if (!outs) { p.onNotice(tt('flashNone')); return }
    const ch = cellChange(todo.map((r, i) => ({ rowId: vRows[r].id, colId: vCols[c].id, value: outs[i] })).filter(x => x.value))
    if (!ch || ch.kind !== 'cells') { p.onNotice(tt('flashNone')); return }
    applyR('flashFill', [ch])
    const rect = { r0: Math.min(...todo), c0: c, r1: Math.max(...todo), c1: c }
    flashDone.current = { n: ch.cells.length, rect }
    lastFill.current = { base: doc, applied: true }
    setSelectRect(rect)
    setOptionsAt({ to: rect, n: Date.now() })
    statusAt.current = Date.now()
    p.onStatus?.(tt('flashChanged', { n: ch.cells.length }))
  }

  // ── Go To Special (F5 › Special…, tip 9) ──
  const [goAreas, setGoAreas] = useState<GridRect[] | null>(null)
  function goSpecial(what: GoSpecial, numbers = true, text = true) {
    const q = rectRef.current
    const multiCell = areasRef.current.length > 1 || q.r0 !== q.r1 || q.c0 !== q.c1
    // Within the selection when it's more than one cell, as Excel; otherwise the used range.
    const used = (() => {
      let r0 = Infinity, r1 = -1, c0 = Infinity, c1 = -1
      vRows.forEach((row, r) => { const cells = doc.cells[row.id]; if (!cells) return; vCols.forEach((col, c) => { if (cells[col.id]) { r0 = Math.min(r0, r); r1 = Math.max(r1, r); c0 = Math.min(c0, c); c1 = Math.max(c1, c) } }) })
      return r1 < 0 ? null : { r0, r1, c0, c1 }
    })()
    const scope: GridRect[] = multiCell ? areasRef.current : used ? [used] : []
    const pick: { r: number; c: number }[] = []
    const each = (f: (r: number, c: number, v: string) => boolean) => { for (const { r, c } of unionCells(scope)) { const row = vRows[r], col = vCols[c]; if (row && col && f(r, c, value(row.id, col.id))) pick.push({ r, c }) } }
    const a = activeAt()
    switch (what) {
      case 'blanks': each((_r, _c, v) => v === ''); break
      case 'constants': each((_r, _c, v) => v !== '' && (parseNumber(v) !== null ? numbers : text)); break
      case 'notes': each((r, c) => marks.has(`${vRows[r].id}|${vCols[c].id}`)); break
      case 'conditional': each((r, c) => ruleLooks.has(`${vRows[r].id}|${vCols[c].id}`) || rules.some(x => x.range.cols.includes(vCols[c].id) && (x.range.rows === 'all' || x.range.rows.includes(vRows[r].id)))); break
      case 'validation': case 'validationSame': {
        const mine = active ? ruleAt(active.key, active.col) : null
        const all: GridRect = { r0: 0, c0: 0, r1: vRows.length - 1, c1: vCols.length - 1 }
        for (const { r, c } of unionCells(multiCell ? areasRef.current : [all])) { const v = ruleAt(vRows[r].id, vCols[c].id); if (v && (what === 'validation' || v.id === mine?.id)) pick.push({ r, c }) }
        break
      }
      case 'region': { const g = region(a.r, a.c); setSelectRect(g); return }
      case 'lastCell': { if (used) setSelectRect({ r0: used.r1, c0: used.c1, r1: used.r1, c1: used.c1 }); return }
      case 'visible': setGoAreas([...areasRef.current]); return
      case 'rowDiffs': case 'colDiffs': {
        // Cells that differ from the active column's cell in their row (or the active row's cell in their column).
        for (const { r, c } of unionCells(areasRef.current)) {
          const ref = what === 'rowDiffs' ? value(vRows[r].id, vCols[a.c].id) : value(vRows[a.r].id, vCols[c].id)
          if (value(vRows[r].id, vCols[c].id) !== ref) pick.push({ r, c })
        }
        break
      }
    }
    if (!pick.length) { p.onNotice(tt('goNone')); return }
    const folded = foldCells(pick)
    if (!folded) { p.onNotice(tt('goTooMany')); return }
    setGoAreas(folded)
  }

  // ── Series… (Home › Fill › Series, tip 104) ──
  function series(spec: SeriesSpec, by: 'rows' | 'cols') {
    if (ro) { p.onNotice(ro); return }
    if (oneArea()) return
    const q = rectRef.current
    const list: { rowId: string; colId: string; value: string }[] = []
    const lines = by === 'cols' ? range(q.c0, q.c1) : range(q.r0, q.r1)
    for (const k of lines) {
      const cellsIn: [string, string][] = by === 'cols' ? range(q.r0, q.r1).map(r => [vRows[r].id, vCols[k].id]) : range(q.c0, q.c1).map(c => [vRows[k].id, vCols[c].id])
      const first = value(cellsIn[0][0], cellsIn[0][1])
      if (!first) continue
      // Without a stop value the selection is filled; with one, as far as the selection allows or the stop is reached.
      const vals = planSeriesDialog(first, cellsIn.length - 1, spec, fillCtx)
      vals.forEach((v, i) => list.push({ rowId: cellsIn[i + 1][0], colId: cellsIn[i + 1][1], value: v }))
    }
    let skipped = 0
    const ch = cellChange(checkList(list, () => { skipped++ }))
    if (ch) applyR('series', [ch])
    if (skipped) p.onSkipped({ invalid: skipped })
    if (!ch) p.onNotice(tt('seriesNone'))
  }

  // ── repeat (F4, tip 93) ──
  type Repeatable = FormatCmd | { kind: 'deleteRows' } | { kind: 'deleteCols' }
  const lastCmd = useRef<Repeatable | null>(null)
  const REPEATABLE = new Set(['patch', 'borders', 'merge', 'paint', 'clear', 'cellStyle', 'insert', 'view'])
  function repeat() {
    const c = lastCmd.current
    if (!c) { p.onNotice(tt('repeatNone')); return }
    if (c.kind === 'deleteRows' || c.kind === 'deleteCols') {
      const q = rectRef.current
      if (c.kind === 'deleteRows') { if (q.r1 - q.r0 + 1 >= vRows.length) { p.onNotice(t('menu.keepOneRow')); return } deleteRowsAt(range(q.r0, q.r1)) }
      else { if (q.c1 - q.c0 + 1 >= vCols.length) { p.onNotice(t('menu.keepOneCol')); return } deleteColsAt(range(q.c0, q.c1)) }
      return
    }
    runFormat(c)
  }

  // ── data validation (Data › Data Validation…, tip 18) ──
  const [dvAsk, setDvAsk] = useState<{ run(): void } | null>(null)
  const [alert, setAlert] = useState<{ rule: ValidationRecord; rowId: string; colId: string; value: string } | null>(null)
  const [editAgain, setEditAgain] = useState<{ key: string; col: string; value: string; n: number } | null>(null)
  /** Validation rules after rows or columns go: a rule whose edge goes keeps its other cells; one fully gone goes too. */
  function validationsAfter(kind: 'rows' | 'cols', goneIds: Set<string>): BlankChange[] {
    const list = extras.validations ?? []
    if (!list.length) return []
    const all = kind === 'rows' ? doc.rows : doc.cols, idx = kind === 'rows' ? rowIndex : colIndex
    const [a, b] = kind === 'rows' ? ['top', 'bottom'] as const : ['left', 'right'] as const
    let changed = false
    const after = list.flatMap(v => {
      if (!goneIds.has(v[a]) && !goneIds.has(v[b])) return [v]
      const i0 = idx.get(v[a]) ?? 0, i1 = idx.get(v[b]) ?? 0
      const kept = all.slice(Math.min(i0, i1), Math.max(i0, i1) + 1).filter(x => !goneIds.has(x.id))
      changed = true
      return kept.length ? [{ ...v, [a]: kept[0].id, [b]: kept[kept.length - 1].id }] : []
    })
    return changed ? [{ kind: 'validations', before: list, after }] : []
  }
  function setValidation(rule: ValidationRule | null, all: boolean) {
    if (ro) { p.onNotice(ro); return }
    if (oneArea()) return
    const list = extras.validations ?? []
    const q = rectRef.current
    const mine = active ? ruleAt(active.key, active.col) : null
    // "Apply these changes to all other cells with the same settings": the rule's whole range.
    if (all && mine) {
      const after = rule ? list.map(v => (v.id === mine.id ? { ...v, ...rule } : v)) : list.filter(v => v.id !== mine.id)
      applyR('validation', [{ kind: 'validations', before: list, after }])
      return
    }
    const d0 = rowIndex.get(vRows[q.r0].id) ?? 0, d1 = rowIndex.get(vRows[q.r1].id) ?? 0, e0 = colIndex.get(vCols[q.c0].id) ?? 0, e1 = colIndex.get(vCols[q.c1].id) ?? 0
    const sel = { r0: d0, r1: d1, c0: e0, c1: e1 }
    const hit = dvBoxes.filter(b => overlaps(b, sel))
    const inside = (b: typeof hit[number]) => b.r0 >= d0 && b.r1 <= d1 && b.c0 >= e0 && b.c1 <= e1
    const run = () => {
      const gone = new Set(hit.map(b => b.v.id))
      const kept = list.filter(v => !gone.has(v.id))
      const after = rule ? [...kept, { id: p.newId(), top: vRows[q.r0].id, bottom: vRows[q.r1].id, left: vCols[q.c0].id, right: vCols[q.c1].id, ...rule }] : kept
      if (after.length > 200) { p.onNotice(t('err.too_many_validations')); return }
      applyR('validation', [{ kind: 'validations', before: list, after }])
    }
    // A rule that reaches outside the selection is replaced as a whole: ask first.
    if (rule && hit.some(b => !inside(b))) { setDvAsk({ run }); return }
    run()
  }
  /** Alt+↓ or the ▾: the cell's list (validation), or the column's values (Pick From Drop-down List). */
  const [pick, setPick] = useState<{ at: { x: number; y: number }; anchor: HTMLElement; items: PopItem[]; label: string } | null>(null)
  function pickList(row: Row, col: string, anchor: HTMLElement, from: 'keys' | 'button' | 'menu'): boolean {
    const rule = ruleAt(row.id, col)
    const cur = value(row.id, col)
    let values: string[]
    if (rule && rule.allow === 'list') values = rule.values ?? []
    else {
      if (from === 'button') return false
      const seen = new Map<string, string>()
      for (const r of vRows) { const v = value(r.id, col).trim(); if (v && r.id !== row.id && !seen.has(v.toLowerCase())) seen.set(v.toLowerCase(), v) }
      values = [...seen.values()].sort((a, b) => a.localeCompare(b, locale, { numeric: true, sensitivity: 'base' })).slice(0, 500)
      if (!values.length) { p.onNotice(tt('pickNone')); return true }
    }
    const b = anchor.closest('[data-cell]')?.getBoundingClientRect() ?? anchor.getBoundingClientRect()
    const rtlCell = getComputedStyle(anchor).direction === 'rtl'
    setPick({
      at: { x: rtlCell ? b.right : b.left, y: b.bottom + 2 }, anchor, label: rule ? (rule.input?.title || tt('pickLabel')) : tt('pickLabel'),
      items: values.map(v => ({ key: v, label: v, checked: !!rule && v.toLowerCase() === cur.trim().toLowerCase() ? true : rule ? false : undefined, onSelect: () => {
        const ch = cellChange([{ rowId: row.id, colId: col, value: v }])
        if (ch) applyR('edit', [ch])
      } })),
    })
    return true
  }
  /** A typed value against the cell's rule: true when it may go in; otherwise the alert asks. */
  function validateTyped(rowId: string, colId: string, v: string): boolean {
    const rule = ruleAt(rowId, colId)
    if (!rule || allowed(rule, v)) return true
    setAlert({ rule, rowId, colId, value: v })
    return false
  }
  function nowText(kind: 'date' | 'time') {
    const d = new Date(), p2 = (n: number) => String(n).padStart(2, '0')
    return kind === 'date' ? `${p2(d.getDate())}/${p2(d.getMonth() + 1)}/${d.getFullYear()}` : `${p2(d.getHours())}:${p2(d.getMinutes())}`
  }

  const activeRow = active ? rowIndex.get(active.key) : undefined, activeCol = active ? colIndex.get(active.col) : undefined
  const fmtState: FormatState | null = active && activeRow !== undefined && activeCol !== undefined ? {
    source: 'blank',
    style: styleOf(active.key, active.col),
    value: value(active.key, active.col),
    cell: cellName(activeRow, activeCol),
    rowKey: active.key,
    colKey: active.col,
    readOnly: ro,
    mergeOff: null,
    merged: spans.anchor.has(`${active.key}|${active.col}`),
    multi: areasRef.current.length > 1 || rectRef.current.r0 !== rectRef.current.r1 || rectRef.current.c0 !== rectRef.current.c1,
    areas: areasRef.current.length,
    range: areaName(rectRef.current),
    count: unionSize(areasRef.current),
    canGoto: true,
    adding: addingRef.current,
    viewOff: null,
    frozen: { rows: view.frozenRows ?? 0, cols: view.frozenCols ?? 0 },
    table: (() => { const tb = tableAt(active.key, active.col); return tb ? { style: tb.style } : null })(),
    tableOff: null,
    filter: { on: !!fArea, cols: Object.values(filter).filter(filterOn).length },
    ...(() => { const si = sortInfo(); return { sortCols: si.cols, sortHeader: si.header } })(),
    rules: [...rules].sort((x, y) => x.priority - y.priority).map(r => ({ ...r, where: whereOf(r) })),
    ...(() => {
      const mine = ruleAt(active.key, active.col)
      const q = rectRef.current
      // Mixed: the selection reaches a rule other than the active cell's, or (with a rule) cells outside it.
      let mixed = false
      if (dvBoxes.length && (q.r0 !== q.r1 || q.c0 !== q.c1)) {
        const d0 = rowIndex.get(vRows[q.r0]?.id ?? '') ?? 0, d1 = rowIndex.get(vRows[q.r1]?.id ?? '') ?? 0
        const e0 = colIndex.get(vCols[q.c0]?.id ?? '') ?? 0, e1 = colIndex.get(vCols[q.c1]?.id ?? '') ?? 0
        const sel = { r0: d0, r1: d1, c0: e0, c1: e1 }
        const hits = dvBoxes.filter(b => overlaps(b, sel))
        const mineBox = mine ? dvBoxes.find(b => b.v.id === mine.id) : null
        mixed = hits.some(b => b.v.id !== mine?.id) || (!!mineBox && !(mineBox.r0 <= d0 && mineBox.r1 >= d1 && mineBox.c0 <= e0 && mineBox.c1 >= e1)) || (!mine && hits.length > 0)
      }
      // Custom Lists › Import: the selection's values in order (filled cells only, at most 200).
      const selValues: string[] = []
      for (let r = q.r0; r <= q.r1 && selValues.length < 200; r++) {
        const row = vRows[r], cells = row ? doc.cells[row.id] : undefined
        if (!cells) continue
        for (let c = q.c0; c <= q.c1 && selValues.length < 200; c++) { const v = (cells[vCols[c]?.id ?? ''] ?? '').trim(); if (v) selValues.push(v) }
      }
      // Spec 020 stage B: Text to Columns' preview (the first selected column, up to 8 values), the block around, the table's Total row.
      const splitValues: string[] = []
      for (let r = q.r0; r <= q.r1 && splitValues.length < 8; r++) { const v = value(vRows[r]?.id ?? '', vCols[q.c0]?.id ?? ''); if (v) splitValues.push(v) }
      const tb = tableAt(active.key, active.col), box = tb ? tableBoxes.find(b => b.tb.id === tb.id) : null
      const tableInfo = tb && box ? { totals: !!tb.totals, cols: vCols.filter(c => box.cols.has(c.id)).map(c => ({ key: c.id, name: (tb.header ? value(tb.top, c.id) : '') || `${sheetT('column')} ${colLetters(colIndex.get(c.id) ?? 0)}` })) } : null
      const ai = rowIndex.get(active.key) ?? 0
      const outline = olSpans.rows.some(g => ai >= g.i0 && ai <= g.i1)
      const ds = dataScope()
      const dedupeInfo = { header: ds.header, cols: ds.cols.map(c => ({ key: c, name: (ds.header && ds.rows[0] ? value(ds.rows[0].id, c) : '') || `${sheetT('column')} ${colLetters(colIndex.get(c) ?? 0)}` })) }
      return { dedupe: dedupeInfo, splitValues, tableInfo, region: regionRef(), cleanOff: null, outline, advancedOn: !!view.advanced, validation: mine, validationMixed: mixed, validationOff: null, selValues, goSpecial: ['notes', 'constants', 'blanks', 'region', 'lastCell', 'visible', 'conditional', 'validation', 'validationSame', 'rowDiffs', 'colDiffs'] as GoSpecial[] }
    })(),
  } : null
  useFormatBridge('blank', true, fmtState, runFormat)
  // Spec 015 comments: corner markers, and selecting a cell from the panel or a link.
  const marks = useCommentBridge('blank', true, (rowKey, colKey) => {
    if (!vRowIndex.has(rowKey) || !vColIndex.has(colKey)) return
    setActive({ key: rowKey, col: colKey })
    requestAnimationFrame(() => rootRef.current?.querySelector<HTMLElement>(`[data-cell="${rowKey}|${colKey}"]`)?.scrollIntoView({ block: 'nearest', inline: 'nearest' }))
  })

  // ── the Content look's bar and summary (as the Content sheet's) ──
  const rt = extras.rowTasks ?? {}, tks = extras.tasks ?? {}
  const dataRows = doc.rows.filter(r => r.id !== headRow)
  const linkedRows = dataRows.filter(r => rt[r.id] && tks[rt[r.id]])
  const notCreated = lk.map ? dataRows.filter(r => lk.noteOfRow(r.id) === 'notLinked').map(r => r.id) : []
  const sum = {
    rows: dataRows.filter(r => Object.values(doc.cells[r.id] ?? {}).some(v => v)).length,
    tasks: linkedRows.length,
    published: linkedRows.filter(r => tks[rt[r.id]].stage === 'publish').length,
  }
  const contentBar = content ? (
    <>
      <div className="fx-sheet-bar" role="toolbar" aria-label={tf('barLabel')} data-team-bar="">
        <span className="fx-sheet-bar-gap" />
        <button type="button" className="fx-sheet-btn" data-team-columns="" aria-haspopup="dialog" onClick={() => setDrawer(true)}>{tf('barColumns')}</button>
        <button type="button" className="fx-sheet-btn" data-team-add-column="" onClick={e => addRegularAtEnd(e.currentTarget)}>{tf('barAddColumn')}</button>
        {lk.map && <>
          <button type="button" className="fx-sheet-tog" aria-pressed={mine} data-team-mine="" onClick={() => setMine(v => !v)}>{tf('barMine')}</button>
          <button type="button" className="fx-sheet-tog" aria-pressed={showDone} data-team-done=""
                  onClick={() => setShowDone(v => { try { window.localStorage.setItem('momentum.team.done', v ? '0' : '1') } catch { /* private mode */ } return !v })}>{tf('barShowDone')}</button>
          {lk.canAddTheme && <button type="button" className="fx-sheet-btn" data-team-add-theme="" disabled={!!ro} onClick={e => setNewTheme(e.currentTarget)}>{tf('barAddTheme')}</button>}
          <button type="button" className="fx-sheet-btn" data-team-add-tasks="" disabled={!!ro} onClick={() => openLinks('add')}>{tf('barAddTasks')}</button>
          <button type="button" className="fx-sheet-btn is-primary" data-team-create="" disabled={!!ro || !notCreated.length || !lk.canCreate}
                  onClick={() => lk.createForRow(notCreated)}>{tf('barCreateTasks', { n: notCreated.length })}</button>
        </>}
      </div>
      <div className="fx-sheet-sum" data-team-summary="">
        <span className="fx-sheet-sum-name">{p.name}</span>
        <span><b>{tf('sumRows', { n: sum.rows })}</b></span>
        {lk.map && <>
          <span>{tf('sumTasks', { n: sum.tasks })}</span>
          {notCreated.length > 0 && <span className="fx-sheet-sum-bad">{tf('sumNotCreated', { n: notCreated.length })}</span>}
          <span>{tf('sumPublished', { n: sum.published })}</span>
        </>}
      </div>
    </>
  ) : null

  return (
    <>
    {contentBar}
    <div ref={rootRef} className={`fx-sheet-scroll fx-sh-blank${content ? ' is-content' : ''}`} data-blank-sheet={doc.id} data-look={look} data-protected={ro ? '' : undefined}>
      <GridCore model={model} active={active} setActive={setActiveCell} editDraft={null} notes={notes} onNote={onNote} selectRect={selectRect}
                selectAreas={goAreas} editAgain={editAgain} optionsAt={optionsAt} />
      {fillMenu && (
        <PopMenu key={`fill-${fillMenu.label}`} at={fillMenu.at} items={fillMenu.items} label={fillMenu.label} attr="data-fill-menu"
                 onClose={() => { setFillMenu(null); focusActive() }} />
      )}
      {pick && (
        <PopMenu key="pick" at={pick.at} items={pick.items} label={pick.label} attr="data-pick-list"
                 onClose={() => { setPick(null); focusActive() }} />
      )}
      {dvAsk && (
        <ConfirmDialog attr="data-dv-replace" title={tt('dv.replaceTitle')} body={tt('dv.replaceBody')} ok={tt('dv.replaceOk')} cancel={tt('cancel')}
                       onCancel={() => { setDvAsk(null); focusActive() }} onOk={() => { const run = dvAsk.run; setDvAsk(null); run(); focusActive() }} />
      )}
      {alert && (
        <ValidationAlert rule={alert.rule} value={alert.value}
          onAnswer={a => {
            const x = alert
            setAlert(null)
            // Retry / No: back into the cell with what was typed. Yes / OK: in it goes. Cancel: nothing changes.
            if (a === 'retry') { setEditAgain({ key: x.rowId, col: x.colId, value: x.value, n: Date.now() }); return }
            if (a === 'accept') { const ch = cellChange([{ rowId: x.rowId, colId: x.colId, value: x.value }]); if (ch) applyR('edit', [ch]) }
            focusActive()
          }} />
      )}
      {mergeAsk && (
        <ConfirmDialog attr="data-merge-warn" title={t('format.merge.warnTitle')} body={t('format.merge.warnBody', { value: mergeAsk.value })}
                       ok={t('format.merge.warnGo')} cancel={t('format.merge.cancel')}
                       onCancel={() => { setMergeAsk(null); focusActive() }}
                       onOk={() => { const run = mergeAsk.run; setMergeAsk(null); run(); focusActive() }} />
      )}
      {menu && (
        <PopMenu key={menu.items[0]?.key} at={menu.at} items={menu.items} label={t('tabMenu.label')} attr="data-cell-menu"
                 onClose={() => { setMenu(null); focusActive() }} />
      )}
      {lk.node}
      {slicers.length > 0 && (
        <div className="fx-slicers" data-slicers="">
          {slicers.map(sl => {
            const tb = tables.find(x => x.id === sl.tableId)!
            const box = tableBoxes.find(b => b.tb.id === tb.id)
            const name = (tb.header ? value(tb.top, sl.col) : '') || `${sheetT('column')} ${colLetters(colIndex.get(sl.col) ?? 0)}`
            // Every value in the table's column (filtered rows too), A to Z.
            const i0 = rowIndex.get(tb.top) ?? 0, i1 = rowIndex.get(tb.bottom) ?? 0
            const body = doc.rows.slice(i0 + (tb.header ? 1 : 0), i1 + 1 - (tb.totals ? 1 : 0))
            const vals = [...new Set(body.map(r => value(r.id, sl.col).trim()))].sort((a, b) => (!a ? 1 : !b ? -1 : a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' })))
            const cur = filter[sl.col]?.values
            const multiOn = slicerMulti.has(sl.id)
            if (!box) return null
            return (
              <section key={sl.id} className="fx-slicer" data-slicer={name} aria-label={tt('slicer.label', { name })}>
                <header>
                  <b>{name}</b>
                  <button type="button" data-slicer-multi="" aria-pressed={multiOn} title={tt('slicer.multi')} aria-label={tt('slicer.multi')}
                          onClick={() => setSlicerMulti(m => { const n = new Set(m); if (n.has(sl.id)) n.delete(sl.id); else n.add(sl.id); return n })}>☰</button>
                  <button type="button" data-slicer-clear="" disabled={!cur} title={tt('slicer.clear')} aria-label={tt('slicer.clear')} onClick={() => slicerPick(sl, null, false)}>✕</button>
                  {!ro && <button type="button" data-slicer-remove="" title={tt('slicer.remove')} aria-label={tt('slicer.remove')} onClick={() => slicerOff(sl.id)}>🗑</button>}
                </header>
                <div className="fx-slicer-items" role="group" aria-label={name}>
                  {vals.map(v => (
                    <button key={v} type="button" data-slicer-item={v} aria-pressed={!cur || cur.includes(v)}
                            onClick={ev => slicerPick(sl, v, multiOn || ev.ctrlKey || ev.metaKey)}>{v || tt('slicer.blank')}</button>
                  ))}
                </div>
              </section>
            )
          })}
        </div>
      )}
      {splitAsk && (
        <ConfirmDialog attr="data-split-replace" title={tt('clean.replaceTitle')} body={tt('clean.replaceBody')} ok={tt('clean.replaceOk')} cancel={tt('cancel')}
                       onCancel={() => { setSplitAsk(null); focusActive() }} onOk={() => { const run = splitAsk.run; setSplitAsk(null); run(); focusActive() }} />
      )}
      {fieldEd && lk.map && (() => {
        const tk = lk.taskOfRow(fieldEd.rowId)
        if (!tk) return null
        const ch = lk.choices
        return <FieldEditor field={fieldEd.field} task={tk} anchor={fieldEd.anchor} map={lk.map}
                            choices={{ people: ch?.people ?? [], types: ch?.types ?? [], pillars: ch?.pillars ?? [], projects: ch?.projects ?? [] }}
                            onPick={v => { const c = cellChange([{ rowId: fieldEd.rowId, colId: fieldEd.col, value: v }]); if (c) applyR('edit', [c]) }}
                            onClose={restore => { setFieldEd(null); if (restore) focusActive() }} />
      })()}
      {addMenu && (
        <AddFieldMenu anchor={addMenu} shown={new Set(Object.values(lk.map?.fields ?? {}))} teamCols={lk.teamCols} linked={!!lk.map}
                      onField={f => { setAddMenu(null); addFieldAtEnd(f) }} onRegular={() => { setAddMenu(null); insertCols(vCols.length, 1) }}
                      onClose={() => { setAddMenu(null); focusActive() }} />
      )}
      {drawer && (
        <FieldsDrawer map={lk.map} cols={colRefs} teamCols={lk.teamCols} groupBy={groupBy} groupCols={colRefs} readOnly={ro}
                      look={look} onLook={l => setView('look', { look: l })}
                      onToggle={(f, on) => (on ? addFieldAtEnd(f) : hideField(f))} onValues={f => setValuesFor(f)}
                      onGroupBy={g => setView('groupBy', { groupBy: g ?? (content && lk.map ? { by: 'none' } : null) })} onAddRegular={() => insertCols(vCols.length, 1)}
                      onAskLink={() => lk.askLink()} onClose={() => { setDrawer(false); focusActive() }} />
      )}
      {valuesFor && lk.map && (
        <ValuesDialog field={valuesFor} map={lk.map} types={lk.choices?.types ?? []}
                      onSave={(words, show) => { if (ro) p.onNotice(ro); else lk.setWords(valuesFor, words, show); setValuesFor(null); focusActive() }}
                      onClose={() => { setValuesFor(null); focusActive() }} />
      )}
      {match && lk.map && (
        <MatchDialog field={match.field} colName={match.colName} values={match.values} map={lk.map} types={lk.choices?.types ?? []}
                     linkedRows={Object.keys(lk.rowTasks).length}
                     onSave={(words, win) => { void lk.addField(match.field, { colId: match.colId }, { words, win }); setMatch(null); focusActive() }}
                     onClose={() => { setMatch(null); focusActive() }} />
      )}
      {filterUi && (() => {
        const others = { ...filter }
        delete others[filterUi.col]
        const rowsIn = filterRows(filterScope, others, cellView).filter(id => !hiddenR.has(id))
        const cv = columnValues(rowsIn, filterUi.col, cellView)
        const title = (fArea?.header ? value(fArea.header, filterUi.col) : '') || colLetters(colIndex.get(filterUi.col) ?? 0)
        const close = () => { setFilterUi(null); focusActive() }
        return <FilterMenu anchor={filterUi.anchor} title={title} values={cv.values} fills={cv.fills} current={filter[filterUi.col]}
                           onSort={dir => { sortBy([{ col: filterUi.col, dir }], true, true); close() }}
                           onApply={f => { filterCol(filterUi.col, f); close() }} onClose={close} />
      })()}
      {newTheme && (
        <SheetPopover anchor={newTheme} label={tf('newTheme')} onClose={() => setNewTheme(null)}>
          <div data-new-theme="">
            <NamePrompt title={tf('newTheme')} saveLabel={tf('save')} cancelLabel={tf('cancel')} onCancel={() => setNewTheme(null)}
                        onSave={async name => {
                          const err = await lk.addTheme(name.trim())
                          if (err) return err
                          setNewTheme(null)
                          p.onNotice(tf('themeAdded', { name: name.trim() }))
                          return null
                        }} />
          </div>
        </SheetPopover>
      )}
      {rename && (
        <SheetPopover anchor={rename.anchor} label={tf('rename')} onClose={() => { setRename(null); focusActive() }}>
          <div data-rename-col="">
            <NamePrompt title={tf('renameTitle')} initial={colName(rename.col)} saveLabel={tf('save')} cancelLabel={tf('cancel')}
                        onCancel={() => { setRename(null); focusActive() }} onSave={name => renameCol(rename.col, name)} />
          </div>
        </SheetPopover>
      )}
      {resize && (
        <ResizeDialog kind={resize.kind} value={resize.value} onCancel={() => { setResize(null); focusActive() }}
                      onOk={v => { if (resize.kind === 'row') setHeights(resize.ids, v); else setWidths(resize.ids, v); setResize(null); focusActive() }} />
      )}
    </div>
    </>
  )
}

/** A band over the first row of each group: its name (or a pillar under the theme above) and how many rows it holds. */
export interface Band { main: string | null; sub: string | null; n: number; /** A theme's rows over all its pillars (the Content look's theme band). */ themeN?: number; theme?: boolean }
const STAGE_ORDER = Object.keys(STAGE_META) as StageId[]

/**
 * Spec 019 FR (group by): the rows in groups, each group in the sheet's order.
 * The headings row (a first row that names no task) stays on top; rows with no
 * task go last when grouping by a task's field.
 */
export function groupRows<R extends { id: string }>(doc: SheetDoc, rows: R[], g: GroupBy | null, locale: string,
  w: { none: string; blank: string; noTheme: string; unassigned: string; noType: string; noPillar: string }): { rows: R[]; bands: Map<string, Band> } {
  const bands = new Map<string, Band>()
  if (!g || g.by === 'none' || !rows.length) return { rows, bands }
  const ex = doc.extras, map = ex?.taskMap ?? null
  if (g.by !== 'col' && !map) return { rows, bands }
  if (g.by === 'col' && !doc.cols.some(c => c.id === g.col)) return { rows, bands }
  const rt = ex?.rowTasks ?? {}, tks = ex?.tasks ?? {}
  const first = doc.rows[0]?.id
  const head = first && rows[0]?.id === first && (!map || !taskIdFrom(doc.cells[first]?.[map.taskCol] ?? '')) ? rows[0] : null
  type Key = { key: string; order: string; main: string; sub?: string }
  const keyOf = (rowId: string): Key => {
    if (g.by === 'col') {
      const v = (doc.cells[rowId]?.[g.col] ?? '').trim()
      return v ? { key: `v${normTitle(v)}`, order: `0${v.toLowerCase()}`, main: v } : { key: 'blank', order: '2', main: w.blank }
    }
    const tk = rt[rowId] ? tks[rt[rowId]] : null
    if (!tk) return { key: 'none', order: '9', main: w.none }
    const m = tk.meta
    if (g.by === 'theme') {
      const th = m?.theme ?? '', pl = m?.pillar ?? ''
      // Themes aren't required: a task with none is listed at the top, under no band.
      if (!th) return { key: 'notheme', order: '', main: '' }
      return { key: `t${th}\u0000${pl}`, order: `${th ? `0${th.toLowerCase()}` : '1'}\u0000${pl ? `0${pl.toLowerCase()}` : '1'}`, main: th || w.noTheme, sub: pl || w.noPillar }
    }
    if (g.by === 'stage') {
      const s = m?.stage || tk.stage
      const i = STAGE_ORDER.indexOf(s as StageId)
      const board = STAGE_META[s as StageId] ? (locale.startsWith('ar') ? STAGE_META[s as StageId].label_ar : STAGE_META[s as StageId].label_en) : s
      return { key: `s${s}`, order: `0${String(i < 0 ? 99 : i).padStart(3, '0')}`, main: shownWord(s, map?.words?.stage, map?.show, board) }
    }
    const v = g.by === 'assignee' ? m?.assignee ?? '' : m?.type ?? ''
    if (!v) return { key: 'empty', order: '1', main: g.by === 'assignee' ? w.unassigned : w.noType }
    return { key: `v${v}`, order: `0${v.toLowerCase()}`, main: g.by === 'type' ? shownWord(v, map?.words?.type, map?.show, v) : v }
  }
  const buckets = new Map<string, { k: Key; rows: R[] }>()
  for (const r of rows) {
    if (r === head) continue
    const k = keyOf(r.id)
    const b = buckets.get(k.key)
    if (b) b.rows.push(r); else buckets.set(k.key, { k, rows: [r] })
  }
  const list = [...buckets.values()].sort((a, b) => a.k.order.localeCompare(b.k.order))
  const out: R[] = head ? [head] : []
  let lastMain: string | null = null
  // Counts leave out empty rows (a sheet's spare rows sit in the last group without being counted).
  const filled = (r: R) => Object.values(doc.cells[r.id] ?? {}).some(v => v)
  const count = (rs: R[]) => rs.filter(filled).length
  const themeN = new Map<string, number>()
  for (const b of list) themeN.set(b.k.main, (themeN.get(b.k.main) ?? 0) + count(b.rows))
  for (const b of list) {
    if (b.k.key === 'notheme') { out.push(...b.rows); continue }
    const theme = g.by === 'theme' && b.k.key !== 'none'
    const sameTheme = theme && lastMain === b.k.main
    // Theme › Pillar: a new theme names both; the next pillars of the same theme name only themselves.
    // As on the Content sheet, rows with no pillar sit straight under their theme (named only after the theme's pillars).
    const noPillar = theme && b.k.sub === w.noPillar
    const sub = theme ? (noPillar && !sameTheme ? null : b.k.sub ?? null) : null
    bands.set(b.rows[0].id, { main: sameTheme ? null : b.k.main, sub, n: count(b.rows), themeN: themeN.get(b.k.main), theme: g.by === 'theme' })
    lastMain = b.k.main
    out.push(...b.rows)
  }
  return { rows: out, bands }
}
