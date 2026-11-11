'use client'

/**
 * Formatting on the Content and Video sheets (spec 015 FR-070–FR-075).
 *
 * - Records are keyed by task id and column key, so a task's look follows it
 *   through regrouping, sorting, dropping and restoring (FR-071).
 * - Any member may format here, and formatting never changes the task (FR-072):
 *   it saves through `applyLinkedFormats`, not the task's fields.
 * - Built-in pills (status, editor, type, choices) keep their own colours; a
 *   fill is the cell's background, so it shows around them (FR-073).
 * - Merge is off, with the reason (FR-074). Number formats apply to the
 *   team's own text columns only; the built-in columns show what they show.
 * - Undo and redo go through the sheet's own stack (useLinkedEditing).
 */
import { useCallback, useContext, useRef, useState, type ReactNode } from 'react'
import { createElement } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import type { CellStyle, ColFilter, ConditionalRule, SheetFormatRecord } from '@/types/index'
import type { LinkedChange } from '@/lib/sheet-undo'
import { barCss, cellStylePatch, columnValues, filterOn, filterRows, type RuleLook } from '@/lib/sheet-rules'
import { FilterMenu } from '@/components/sheets/format/StyleTools'
import type { LinkedStore } from './useLinkedView'
import { LinkedFormatsContext } from '@/components/sheets/format/context'
import { formatKey, indexFormats, planBorders, planRect, resolveStyle, toCss, validateStyle, type FormatItem } from '@/lib/sheet-format'
import { clearPatch, matches, nextMatch, paintPatch, replaceIn, transpose } from '@/lib/sheet-tools'
import { pastePlan } from '@/lib/sheet-clipboard'
import { announceFind, clearComments, useCommentBridge, useFormatBridge, type FormatCmd, type FormatState } from '@/components/sheets/format/bus'
import type { ActiveCell, CellWrite, GridCol, GridRect, WriteResult, WriteWhy } from './GridCore'

export interface LinkedFormatsInput<R extends { key: string }> {
  /** Off outside the Sheets workbook's linked tab and the Content page (no `linked` prop). */
  enabled: boolean
  sheetKey: 'linked_content' | 'linked_video'
  rows: R[]
  cols: GridCol[]
  active: ActiveCell | null
  /** The task a row is, or null for headings and draft rows. */
  taskOf(row: R): string | null
  /** How people name a cell: "Ramadan teaser · Status". */
  cellName(row: R, col: GridCol): string
  textValue(row: R, col: GridCol): string
  recordFormats(label: string, items: FormatItem[]): void
  say(text: string): void
  /** Select a task's cell (the comments panel, a notification's link). */
  select?(taskId: string, col: GridCol): void
  /** Stage 2: cell writes through the sheet's own per-cell saves (Fill, Replace, Clear, Paste Special). */
  writeCells?(writes: CellWrite[], why: WriteWhy): Promise<WriteResult>
  /** Stage 2: select a block after a tool (Find's match). */
  selectBlock?(rect: GridRect): void
  /** Stage 3: the sheet's settings (useLinkedView), the rules' looks, a column's name, and undo for rules and the view. */
  store: LinkedStore
  ruleLooks: Map<string, RuleLook>
  colName(col: GridCol): string
  record?(label: string, changes: LinkedChange[]): void
  /** What a cell shows, for the filter list (a pill's label when the cell has no text). */
  shownText(row: R, col: GridCol): string
  /** The rows before this sheet's filter, and which of them sort and filter (for the filter list). */
  rawRows: R[]
  isItem(row: R): boolean
}

export function useLinkedFormats<R extends { key: string }>(p: LinkedFormatsInput<R>) {
  const t = useTranslations('sheets.format')
  const api = useContext(LinkedFormatsContext)
  p = { ...p, enabled: p.enabled && !!api }
  const apiRef = useRef(api)
  apiRef.current = api
  const ref = useRef(p)
  ref.current = p
  const { formats, setFormats, index } = p.store
  const formatsRef = useRef(formats)
  formatsRef.current = formats
  const rect = useRef<GridRect>({ r0: 0, c0: 0, r1: 0, c1: 0 })
  const [, setTick] = useState(0)
  const locale = useLocale()
  const [filterUi, setFilterUi] = useState<{ col: GridCol; anchor: HTMLElement } | null>(null)

  /** Show the new looks at once, then save; on a refusal, put the old ones back. */
  const put = useCallback(async (items: FormatItem[], look: 'after' | 'before' = 'after') => {
    const apply = (list: SheetFormatRecord[], which: 'after' | 'before') => {
      const map = new Map(list.map(f => [formatKey(f.rowKey, f.colKey), f]))
      for (const it of items) {
        const st = it[which], k = formatKey(it.rowKey, it.colKey)
        if (st) map.set(k, { rowKey: it.rowKey, colKey: it.colKey, style: st }); else map.delete(k)
      }
      return [...map.values()]
    }
    setFormats(f => apply(f, look))
    const res = apiRef.current
      ? await apiRef.current.applyLinkedFormats(ref.current.sheetKey, { formats: items.map(it => ({ rowKey: it.rowKey, colKey: it.colKey, style: it[look], mode: 'set' as const })) })
      : { success: false as const, error: 'generic' }
    if (!res.success) {
      setFormats(f => apply(f, look === 'after' ? 'before' : 'after'))
      ref.current.say(t('err.generic'))
      return false
    }
    return true
  }, [t])

  const size = { rows: p.rows.length, cols: p.cols.length }
  const rk = (r: number) => { const row = p.rows[r]; return row ? p.taskOf(row) : null }
  const ck = (c: number) => p.cols[c] ?? null

  const commit = (label: string, items: FormatItem[] | null) => {
    if (!items) { p.say(t('err.too_many_formats')); return }
    if (!items.length) return
    void put(items).then(ok => { if (ok) ref.current.recordFormats(label, items) })
  }
  const skippedNote = (res: WriteResult) => {
    const n = Object.values(res?.skipped ?? {}).reduce<number>((a, b) => a + (b ?? 0), 0)
    if (n) p.say(t('edit.skipped', { n }))
  }
  /** The task cells' text, in reading order, for Find (FR-075: through the same rules as typing). */
  const texts = () => {
    const out: { r: number; c: number; text: string }[] = []
    p.rows.forEach((row, r) => { if (!p.taskOf(row)) return; p.cols.forEach((col, c) => { const v = p.textValue(row, col); if (v) out.push({ r, c, text: v }) }) })
    return out
  }
  const at = () => {
    const a = p.active
    if (!a) return null
    const r = p.rows.findIndex(x => x.key === a.key), c = p.cols.indexOf(a.col)
    return r >= 0 && c >= 0 ? { r, c } : null
  }

  const run = (cmd: FormatCmd) => {
    const q = rect.current
    switch (cmd.kind) {
      case 'merge': p.say(t('merge.why')); return
      case 'comment': return
      case 'view': case 'resize': p.say(t('edit.viewOff')); return
      case 'patch': commit(cmd.label, planRect(index, q, size, rk, ck, cmd.patch)); return
      case 'borders': commit('borders', planBorders(index, q, size, rk, ck, cmd.preset, cmd.line)); return
      case 'paint': commit('paint', planRect(index, q, size, rk, ck, paintPatch(cmd.style))); return
      case 'clear': {
        if (cmd.what === 'all' || cmd.what === 'formats') commit('clearFormats', planRect(index, q, size, rk, ck, clearPatch()))
        if (cmd.what === 'all' || cmd.what === 'contents') {
          const writes: CellWrite[] = []
          for (let r = q.r0; r <= q.r1; r++) for (let c = q.c0; c <= q.c1; c++) writes.push({ r, c, value: '' })
          void ref.current.writeCells?.(writes, 'clear').then(skippedNote)
        }
        if (cmd.what === 'all' || cmd.what === 'comments') {
          const keys: string[] = []
          for (let r = q.r0; r <= q.r1; r++) { const task = rk(r); if (task) for (let c = q.c0; c <= q.c1; c++) keys.push(`${task}|${p.cols[c]}`) }
          clearComments('linked', keys)
        }
        return
      }
      case 'fill': {
        // Values through the sheet's own saves; looks copied record by record.
        const writes: CellWrite[] = [], items: FormatItem[] = []
        for (let r = q.r0; r <= q.r1; r++) for (let c = q.c0; c <= q.c1; c++) {
          if ((cmd.dir === 'down' && r === q.r0) || (cmd.dir === 'right' && c === q.c0)) continue
          const sr = cmd.dir === 'down' ? q.r0 : r, sc = cmd.dir === 'down' ? c : q.c0
          const src = p.rows[sr], row = p.rows[r]
          if (!src || !row || !p.taskOf(src) || !p.taskOf(row)) continue
          writes.push({ r, c, value: p.textValue(src, p.cols[sc]) })
          const before = index.get(formatKey(rk(r)!, p.cols[c])) ?? null, after = index.get(formatKey(rk(sr)!, p.cols[sc])) ?? null
          if (JSON.stringify(before) !== JSON.stringify(after)) items.push({ rowKey: rk(r)!, colKey: p.cols[c], before, after })
        }
        if (writes.length) void ref.current.writeCells?.(writes, 'paste').then(skippedNote)
        commit(`fill-${cmd.dir}`, items)
        return
      }
      case 'pasteSpecial': {
        const grid = cmd.transpose ? transpose(cmd.grid, '') : cmd.grid
        const styles = cmd.styles ? (cmd.transpose ? transpose(cmd.styles, null) : cmd.styles) : null
        if (!grid.length) return
        const plan = pastePlan(grid, q), one = grid.length === 1 && grid[0].length === 1
        if (cmd.mode !== 'formats') {
          const writes: CellWrite[] = []
          for (let r = 0; r < plan.rows; r++) for (let c = 0; c < plan.cols; c++) writes.push({ r: q.r0 + r, c: q.c0 + c, value: plan.value(r, c) })
          void ref.current.writeCells?.(writes, 'paste').then(skippedNote)
        }
        if (cmd.mode !== 'values') {
          if (!styles) { if (cmd.mode === 'formats') p.say(t('edit.noFormats')); return }
          const items: FormatItem[] = []
          for (let r = 0; r < plan.rows; r++) for (let c = 0; c < plan.cols; c++) {
            const task = rk(q.r0 + r), col = p.cols[q.c0 + c]
            if (!task || !col) continue
            const before = index.get(formatKey(task, col)) ?? null, after = validateStyle((one ? styles[0]?.[0] : styles[r]?.[c]) ?? null)
            if (JSON.stringify(before) !== JSON.stringify(after)) items.push({ rowKey: task, colKey: col, before, after })
          }
          commit('pasteFormats', items)
        }
        return
      }
      // Stage 3 (FR-030–FR-032, FR-045, FR-046, FR-075): cell styles and rules by task and column;
      // sort and filter inside each group, saved with the sheet and never on the board; no tables.
      case 'cellStyle': { const patch = cellStylePatch(cmd.key); if (patch) commit('cellStyle', planRect(index, q, size, rk, ck, patch)); return }
      case 'table': case 'tableOff': p.say(t('st3.tablesLinked')); return
      case 'sort': {
        const keys = cmd.keys.filter(k => p.cols.includes(k.col) && k.col !== 'rowNo')
        if (!keys.length) return
        setLinkedView('sort', { ...p.store.view, sort: keys })
        p.say(t('st3.sortedLinked'))
        return
      }
      case 'filter': {
        const v = p.store.view
        if (cmd.op === 'clear') { if (Object.keys(v.filter ?? {}).length) setLinkedView('filterClear', { ...v, filter: {} }); return }
        if (cmd.op === 'toggle') setLinkedView(v.filterArea ? 'filterOff' : 'filterOn', v.filterArea ? { ...v, filterArea: null, filter: {} } : { ...v, filterArea: { header: null, cols: [] } })
        return
      }
      case 'filterCol': setFilter(cmd.col, cmd.f); return
      case 'ruleNew': {
        const cols = p.cols.slice(q.c0, q.c1 + 1).filter(c => c !== 'rowNo')
        if (!cols.length) return
        const id = crypto.randomUUID()
        setLinkedRules('rule', [{ id, range: { rows: 'all', cols }, ...cmd.rule, priority: 0 }, ...sortedRules().map((r, i) => ({ ...r, priority: i + 1 }))])
        return
      }
      case 'rulesSet': setLinkedRules('rules', cmd.rules); return
      case 'rulesClear': {
        const rules = p.store.rules
        if (cmd.where === 'sheet') { if (rules.length) setLinkedRules('rulesClear', []); return }
        const cs = new Set(p.cols.slice(q.c0, q.c1 + 1))
        const kept = rules.filter(r => !r.range.cols.some(c => cs.has(c)))
        if (kept.length !== rules.length) setLinkedRules('rulesClear', kept)
        return
      }
      case 'find': {
        const all = texts(), count = all.filter(x => matches(x.text, cmd.q.query, cmd.q)).length
        const i = nextMatch(all, at(), cmd.q.query, cmd.q, cmd.dir)
        if (i < 0) { announceFind({ source: 'linked', count: 0, at: 0, cell: null }); return }
        const hit = all[i], row = p.rows[hit.r]
        const order = all.filter(x => matches(x.text, cmd.q.query, cmd.q)).sort((a, b) => a.r - b.r || a.c - b.c)
        p.select?.(p.taskOf(row)!, p.cols[hit.c])
        announceFind({ source: 'linked', count, at: order.findIndex(x => x.r === hit.r && x.c === hit.c) + 1, cell: p.cellName(row, p.cols[hit.c]) })
        return
      }
      case 'replace': {
        const all = texts(), here = at()
        let targets = all.filter(x => matches(x.text, cmd.q.query, cmd.q))
        if (!cmd.all) {
          const cur = targets.find(x => here && x.r === here.r && x.c === here.c)
          if (!cur) { run({ kind: 'find', q: cmd.q, dir: 1 }); return }
          targets = [cur]
        }
        const writes = targets.map(x => ({ r: x.r, c: x.c, value: replaceIn(x.text, cmd.q.query, cmd.by, cmd.q) }))
        const total = all.filter(x => matches(x.text, cmd.q.query, cmd.q)).length
        void (ref.current.writeCells?.(writes, 'paste') ?? Promise.resolve(null)).then(res => {
          const skipped = Object.values(res?.skipped ?? {}).reduce<number>((a, b) => a + (b ?? 0), 0)
          announceFind({ source: 'linked', count: Math.max(0, total - (writes.length - skipped)), at: 0, cell: null, replaced: writes.length - skipped, skipped })
          if (!cmd.all) requestAnimationFrame(() => run({ kind: 'find', q: cmd.q, dir: 1 }))
        })
        return
      }
    }
  }

  // ── stage 3 helpers ──
  const sortedRules = () => [...p.store.rules].sort((a, b) => a.priority - b.priority)
  function setLinkedView(label: string, after: typeof p.store.view) {
    const before = p.store.view
    void p.store.saveView(after).then(ok => { if (ok) ref.current.record?.(label, [{ kind: 'view', before: before as never, after: after as never }]) })
  }
  function setLinkedRules(label: string, after: ConditionalRule[]) {
    const before = p.store.rules
    void p.store.saveRules(after).then(ok => { if (ok) ref.current.record?.(label, [{ kind: 'rules', before, after }]) })
  }
  function setFilter(col: GridCol, f: ColFilter | null) {
    const next = { ...(p.store.view.filter ?? {}) }
    if (f && filterOn(f)) next[col] = f; else delete next[col]
    setLinkedView('filter', { ...p.store.view, filter: next })
  }
  /** "Status, Due" or "Status": where a rule applies on this sheet (whole columns). */
  const whereOf = (r: ConditionalRule) => r.range.cols.map(c => p.colName(c)).join(', ')
  const filterBtn = (col: GridCol): ReactNode => {
    if (!p.enabled || !p.store.view.filterArea || col === 'rowNo') return null
    const on = filterOn(p.store.view.filter?.[col])
    return createElement('button', {
      type: 'button', className: `fx-flt-btn${on ? ' is-on' : ''}`, 'data-filter-btn': col, tabIndex: -1, 'aria-haspopup': 'dialog',
      'aria-label': t('st3.filterOf', { col: p.colName(col) }),
      onPointerDown: (e: React.PointerEvent) => e.stopPropagation(),
      onClick: (e: React.MouseEvent<HTMLButtonElement>) => { e.stopPropagation(); setFilterUi({ col, anchor: e.currentTarget }) },
    }, on ? '▼' : '▾')
  }
  let filterNode: ReactNode = null
  if (filterUi && p.enabled) {
    const all = p.store.view.filter ?? {}
    const others = { ...all }
    delete others[filterUi.col]
    const items = p.rawRows.filter(r => p.isItem(r))
    const rowsIn = filterRows(items, others, (r, c) => ({ text: p.shownText(r, c), style: (() => { const task = p.taskOf(r); return task ? resolveStyle(index, task, c) : null })() }))
    const cv = columnValues(rowsIn, filterUi.col, (r, c) => ({ text: p.shownText(r, c), style: (() => { const task = p.taskOf(r); return task ? resolveStyle(index, task, c) : null })() }))
    const close = () => setFilterUi(null)
    filterNode = createElement(FilterMenu, {
      anchor: filterUi.anchor, title: p.colName(filterUi.col), values: cv.values, fills: cv.fills, current: all[filterUi.col],
      onSort: dir => { run({ kind: 'sort', keys: [{ col: filterUi.col, dir }], header: false }); close() },
      onApply: f => { setFilter(filterUi.col, f); close() },
      onClose: close,
    })
  }
  const rtl = locale.startsWith('ar')

  const activeRow = p.enabled && p.active && p.active.col !== 'rowNo' ? p.rows.find(r => r.key === p.active!.key) : undefined
  const activeTask = activeRow ? p.taskOf(activeRow) : null
  const state: FormatState | null = p.active && activeRow ? {
    source: 'linked',
    style: activeTask ? resolveStyle(index, activeTask, p.active.col) : null,
    value: p.textValue(activeRow, p.active.col),
    cell: p.cellName(activeRow, p.active.col),
    rowKey: activeTask ?? '',
    colKey: p.active.col,
    readOnly: activeTask ? null : t('merge.why'),
    mergeOff: t('merge.why'),
    merged: false,
    multi: rect.current.r0 !== rect.current.r1 || rect.current.c0 !== rect.current.c1,
    viewOff: t('edit.viewOff'),
    table: null,
    tableOff: t('st3.tablesLinked'),
    filter: { on: !!p.store.view.filterArea, cols: Object.values(p.store.view.filter ?? {}).filter(filterOn).length },
    sortCols: p.cols.filter(c => c !== 'rowNo').map(c => ({ key: c, name: p.colName(c) })),
    sortHeader: false,
    rules: sortedRules().map(r => ({ ...r, where: whereOf(r) })),
  } : null
  useFormatBridge('linked', p.enabled, state, run)
  const marks = useCommentBridge('linked', p.enabled, (taskId, col) => ref.current.select?.(taskId, col))

  return {
    /** For the grid: a task cell's look. */
    cellStyle: (row: R, col: GridCol) => {
      if (!p.enabled || col === 'rowNo') return null
      const task = p.taskOf(row)
      const st = task ? resolveStyle(index, task, col) : null
      const rl = task && p.ruleLooks.size ? p.ruleLooks.get(`${task}|${col}`) : undefined
      if (!rl) return st ? toCss(st) : null
      let look: CellStyle = { ...(st ?? {}), ...(rl.style ?? {}) }
      if (rl.scale) look = { ...look, fill: rl.scale }
      const css = toCss(look)
      if (!rl.bar) return css
      return { ...css, cell: { ...css.cell, ...barCss(rl.bar, rtl) } }
    },
    /** Stage 3: the filter buttons on the headings, and the open filter menu. */
    headerExtra: filterBtn,
    node: filterNode,
    marked: (row: R, col: GridCol) => { const task = p.enabled ? p.taskOf(row) : null; return !!task && marks.has(`${task}|${col}`) },
    styleOf: (row: R, col: GridCol): CellStyle | null => { const task = p.taskOf(row); return task ? resolveStyle(index, task, col) : null },
    onSelect: (q: GridRect) => { rect.current = q; setTick(x => x + 1) },
    /** For undo and redo (useLinkedEditing): put records to the given looks. */
    applyFormats: (items: FormatItem[]) => put(items),
  }
}
