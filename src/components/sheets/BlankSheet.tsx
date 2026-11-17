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
import { GridCore, type ActiveCell, type AreasNotice, type CellWrite, type GridModel, type GridRect, type MenuTarget, type WriteWhy } from '@/components/sheet/GridCore'
import type { CellStyle, ColFilter, ConditionalRule, GroupBy, SheetDoc, SheetMergeRecord, SheetTableRecord, SheetView, SortKey, StageId, TaskField, WordField } from '@/types/index'
import { WORD_FIELDS } from '@/types/index'
import { STAGE_META } from '@/lib/stage-meta'
import type { BlankChange } from '@/lib/sheet-undo'
import { BLANK_COL_LIMIT, BLANK_ROW_LIMIT, DEFAULT_COL_W, cellsOfCols, cellsOfRows, emptyExtras, growTo, insertAt } from '@/lib/sheet-doc'
import { display, formatKey, indexFormats, planBorders, planFormat, planRect, resolveStyle, showsRed, toCss, validateStyle, type FormatItem } from '@/lib/sheet-format'
import { clearPatch, matches, nextMatch, paintPatch, replaceIn, transpose } from '@/lib/sheet-tools'
import { cellStylePatch, columnValues, evalRules, filterOn, filterRows, looksLikeHeader, barCss, sortRows, tableLook, type CellView } from '@/lib/sheet-rules'
import { FilterMenu } from './format/StyleTools'
import { useTaskLinks, type LinksApi } from './links/useTaskLinks'
import { normTitle, shownWord, taskIdFrom } from '@/lib/sheet-links'
import { CONTROL_FIELDS, FieldEditor, FieldIcon, FieldValue } from './links/FieldCells'
import { AddFieldMenu, FIELDS_OPEN, FieldsDrawer, MatchDialog, ValuesDialog, type ColRef } from './links/FieldsPanel'
import { announceFind, askComment, clearComments, useCommentBridge, useFormatBridge, type FormatCmd, type FormatState, type MergeMode, type ViewOp } from './format/bus'
import { fitHeight } from './format/fit'
import { areaCols, areaRows, cellName, colLetters, unionCells, unionSize, wholeCols, wholeRows } from '@/lib/sheet-selection'
import { parseClipboard, pastePlan, toGrid } from '@/lib/sheet-clipboard'
import { PopMenu, type PopItem } from './PopMenu'
import { SheetPopover } from '@/components/sheet/SheetMenu'
import { NamePrompt } from '@/components/content/ThemeEditor'
import { openLinks } from './links/useTaskLinks'
import { ConfirmDialog, ResizeDialog } from './Dialogs'

const MAX_CELL = 50_000
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
  onSelect(info: { cell: string; count: number; areas?: number; label?: string; more?: number; adding?: boolean }): void
  onSkipped(skipped: Partial<Record<string, number>>): void
  /** A short message for the workbook's toast (a menu Paste the browser refused). */
  onNotice(text: string): void
  newId(): string
  /** Spec 016: the link actions, and a change to the doc that isn't an undo step (values from the board). */
  links?: LinksApi
  patch?(fn: (doc: SheetDoc) => SheetDoc): void
}

export function BlankSheet(p: BlankSheetProps) {
  const t = useTranslations('sheets')
  const tl = useTranslations('sheets.links')
  const tf = useTranslations('sheets.fields')
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
    if (!fArea || !Object.values(filter).some(filterOn)) return out
    const keep = new Set(filterRows(filterScope, filter, cellView))
    for (const id of filterScope) if (!keep.has(id)) out.add(id)
    return out
  }, [fArea, filter, filterScope, cellView])
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
  const vCols = useMemo(() => doc.cols.filter(c => !hiddenC.has(c.id)), [doc.cols, hiddenC])
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
    p.onSelect({ cell: nameAt(q.r0, q.c0), count: unionSize(list), areas: list.length, label: names.slice(0, 3).join(', '), more: Math.max(0, names.length - 3), adding: addingRef.current })
  }
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
    const forward: BlankChange[] = []
    if (newRows.length) forward.push({ kind: 'insertRows', rows: newRows.map(r => ({ ...r, height: null })) })
    if (newCols.length) forward.push({ kind: 'insertCols', cols: newCols.map(c => ({ ...c, width: null })) })
    const cells = cellChange(list)
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
    applyR('deleteRows', [...tablesAfter('rows', new Set(gone.map(r => r.id))), { kind: 'deleteRows', rows: gone, cells: cellsOfRows(doc, gone.map(r => r.id)) }])
  }
  function deleteColsAt(at: number[]) {
    const gone = at.map(i => vCols[i]).filter((x): x is NonNullable<typeof x> => !!x)
    applyR('deleteCols', [...tablesAfter('cols', new Set(gone.map(c => c.id))), { kind: 'deleteCols', cols: gone, cells: cellsOfCols(doc, gone.map(c => c.id)) }])
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
      { key: 'insertRowAbove', label: t('menu.insertRowAbove'), ...lock, ...(ro ? {} : several ? one : tooManyRows), onSelect: () => insertRows(q.r0, target.kind === 'row' ? nr : 1) },
      { key: 'insertRowBelow', label: t('menu.insertRowBelow'), ...lock, ...(ro ? {} : several ? one : tooManyRows), onSelect: () => insertRows(q.r1 + 1, target.kind === 'row' ? nr : 1) },
    ]
    const colItems: PopItem[] = [
      { key: 'insertColLeft', label: t('menu.insertColLeft'), ...lock, ...(ro ? {} : several ? one : tooManyCols), onSelect: () => insertCols(q.c0, target.kind === 'col' ? nc : 1) },
      { key: 'insertColRight', label: t('menu.insertColRight'), ...lock, ...(ro ? {} : several ? one : tooManyCols), onSelect: () => insertCols(q.c1 + 1, target.kind === 'col' ? nc : 1) },
    ]
    const delRow: PopItem = { key: 'deleteRow', label: t('menu.deleteRow', { n: nr }), danger: true, ...lock, ...(ro ? {} : allRows), onSelect: () => deleteRowsAt(several ? selRows : range(q.r0, q.r1)) }
    const delCol: PopItem = { key: 'deleteCol', label: t('menu.deleteCol', { n: nc }), danger: true, ...lock, ...(ro ? {} : allCols), onSelect: () => deleteColsAt(several ? selCols : range(q.c0, q.c1)) }
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
      items = [...clip, { kind: 'sep', key: 's1' }, commentItem, clearItem, { kind: 'sep', key: 's2' }, ...rowItems, ...colItems, { kind: 'sep', key: 's3' }, delRow, delCol]
    }
    setMenu({ at, items, anchor })
  }

  const model: GridModel<Row> = {
    rows,
    cols: colIds,
    widths,
    rowNoWidth: 46,
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
    isText: (row, col) => { if (col === 'rowNo' || ro) return false; const sh = lk.shown(row.id, col); return !sh?.na && sh?.field !== 'task' },
    textValue: (row, col) => { const sh = lk.shown(row.id, col); return sh ? (sh.na ? '' : sh.text) : value(row.id, col) },
    copyText: (row, col) => { const sh = lk.shown(row.id, col); return sh ? (sh.na ? '' : sh.text) : value(row.id, col) },
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
      const text = <span className="fx-sheet-cell-text" style={showsRed(v, st?.num) ? { color: '#C00000' } : undefined}>{shown}</span>
      return fb ? <>{text}{fb}</> : text
    },
    cellStyle: (row, col) => lookCss(row.id, col),
    copyStyle: (row, col) => styleOf(row.id, col),
    copyShown: (row, col) => { const v = value(row.id, col), st = styleOf(row.id, col); return st?.num ? display(v, st.num, locale) : v },
    marked: (row, col) => marks.has(`${row.id}|${col}`),
    cellSpan: (row, col) => {
      const k = `${row.id}|${col}`
      if (spans.covered.has(k)) return 'covered'
      return spans.anchor.get(k) ?? null
    },
    rowLabel: row => {
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
    },
    isDraft: () => false,
    inputLabel: (row, col) => cellName(rowIndex.get(row.id) ?? 0, colIndex.get(col) ?? 0),
    inputDir: () => undefined,
    readOnlyNote: (row, col) => {
      if (col === 'rowNo') return null
      if (ro) return ro
      const sh = lk.shown(row.id, col)
      if (sh?.na) return tl('naWhy', { field: tl(`fields.${sh.field.startsWith('col:') ? 'none' : sh.field}`) })
      if (sh?.field === 'task') return tf('taskLinkWhy')
      if (sh && !sh.editable) return lk.taskOfRow(row.id)?.dropped ? tl('why.dropped') : tl('why.not_authorized')
      return null
    },
    onCommit: async (row, col, v) => {
      if (ro) return ro
      if (v.length > MAX_CELL) return t('err.too_long')
      const ch = cellChange([{ rowId: row.id, colId: col, value: v }])
      if (ch) applyR('edit', [ch])
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
    onRedo: p.onRedo,
    contextMenu,
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
  const viewNow = (): Partial<SheetView> => ({ frozenRows: view.frozenRows ?? 0, frozenCols: view.frozenCols ?? 0, hiddenRows: view.hiddenRows ?? [], hiddenCols: view.hiddenCols ?? [], filterArea: view.filterArea ?? null, filter: view.filter ?? {}, groupBy: view.groupBy ?? null, look: view.look })
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
  /** Paste Special (FR-041): values only, formats only, or both; optionally transposed. */
  async function pasteSpecial(cmd: Extract<FormatCmd, { kind: 'pasteSpecial' }>) {
    if (ro) { p.onNotice(ro); return }
    if (oneArea()) return
    const q = rectRef.current
    const grid = cmd.transpose ? transpose(cmd.grid, '') : cmd.grid
    const styles = cmd.styles ? (cmd.transpose ? transpose(cmd.styles, null) : cmd.styles) : null
    if (!grid.length) return
    const plan = pastePlan(grid, q)
    const one = grid.length === 1 && grid[0].length === 1
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
        const w: CellWrite = { r: q.r0 + r, c: q.c0 + c, value: plan.value(r, c) }
        if (cmd.mode === 'all' && styles) w.style = (one ? styles[0]?.[0] : styles[r]?.[c]) ?? null
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
    if (rl?.style) st = { ...st, ...rl.style }
    if (rl?.scale) st = { ...st, fill: rl.scale }
    const css = toCss(st)
    if (!rl?.bar) return css
    return { ...css, cell: { ...css.cell, ...barCss(rl.bar, rtl) } }
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
    if (tb) { const b = tableBoxes.find(x => x.tb.id === tb.id)!; return { rows: vRows.filter(r => b.pos.has(r.id)), header: tb.header } }
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
  function formatAsTable(style: string) {
    if (ro) { p.onNotice(ro); return }
    const cur = active ? tableAt(active.key, active.col) : null
    if (cur) { applyR('tableStyle', [{ kind: 'tables', before: tables, after: tables.map(x => (x.id === cur.id ? { ...x, style } : x)) }]); return }
    if (oneArea()) return
    const a = activeAt(), q = multi() ? rectRef.current : region(a.r, a.c)
    const d0 = rowIndex.get(vRows[q.r0].id) ?? 0, d1 = rowIndex.get(vRows[q.r1].id) ?? 0, e0 = colIndex.get(vCols[q.c0].id) ?? 0, e1 = colIndex.get(vCols[q.c1].id) ?? 0
    if (tableBoxes.some(b => b.dr[0] <= d1 && d0 <= b.dr[1] && b.dc[0] <= e1 && e0 <= b.dc[1])) { p.onNotice(sheetT('tableOverlap')); return }
    if (boxes.some(b => b.r0 <= q.r1 && q.r0 <= b.r1 && b.c0 <= q.c1 && q.c0 <= b.c1)) { p.onNotice(sheetT('tableMerged')); return }
    const rec: SheetTableRecord = { id: p.newId(), top: vRows[q.r0].id, bottom: vRows[q.r1].id, left: vCols[q.c0].id, right: vCols[q.c1].id, style, header: true, banded: true }
    applyR('table', [
      { kind: 'tables', before: tables, after: [...tables, rec] },
      { kind: 'view', before: viewNow(), after: { ...viewNow(), filterArea: { header: rec.top, cols: vCols.slice(q.c0, q.c1 + 1).map(c => c.id), last: rec.bottom }, filter: {} } },
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

  function runFormat(cmd: FormatCmd) {
    const q = rectRef.current
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
      <GridCore model={model} active={active} setActive={setActiveCell} editDraft={null} notes={notes} onNote={onNote} selectRect={selectRect} />
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
