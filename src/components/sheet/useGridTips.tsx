'use client'

/**
 * Spec 020 on the Content and Video sheets (tasks T017, T025, T035, and the
 * extension asked for in the stage A PR): the zoom the workbook sets, the
 * fill handle and Auto Fill Options (with the workspace's custom lists),
 * Alt+↓ Pick From Drop-down List, Ctrl+;, Go To (by row number) and Go To
 * Special, F4 / Ctrl+Y repeat, Flash Fill (Ctrl+E) and Series…, and the
 * status bar's Average, Count and Sum.
 *
 * Every write goes through the sheet's own `writeCells(…, 'fill')`, so each
 * cell keeps the board's rules and refusals are counted, as a paste's are.
 * Data validation stays a team-sheet tool: these sheets already limit their
 * values to the board's choices.
 */
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { STATUS_EVENT, ZOOM_EVENT, tipsBus, zoomBus, type CellWrite, type FillInfo, type FillRequest, type GridModel, type GridRect, type WriteResult, type WriteWhy } from './GridCore'
import { defaultMode, fillModesFor, learnFlash, planSeries, planSeriesDialog, previewValue, sourceKind, type FillCtx, type FillMode, type SeriesSpec } from '@/lib/sheet-fill'
import { foldCells, type GoSpecial } from '@/lib/sheet-selection'
import { parseNumber } from '@/lib/sheet-format'
import { PopMenu, type PopItem } from '@/components/sheets/PopMenu'
import { FORMAT_CMD, sendFormat, type FormatCmd, type FormatSource } from '@/components/sheets/format/bus'
import { HISTORY_EVENT } from './useLinkedEditing'

/** The Go To Special choices these sheets answer. */
export const LINKED_SPECIAL: GoSpecial[] = ['notes', 'constants', 'blanks', 'region', 'lastCell', 'visible', 'rowDiffs', 'colDiffs']
/** Commands F4 repeats here: formatting, Clear and Fill Down / Right. */
const REPEATABLE = new Set(['patch', 'borders', 'paint', 'clear', 'cellStyle', 'fill'])

export function useGridTips<R extends { key: string }>(m: GridModel<R>, p: {
  enabled: boolean
  writeCells?(writes: CellWrite[], why: WriteWhy): Promise<WriteResult>
  onUndo?(): void
  onSkipped?(s: Partial<Record<string, number>>): void
  say?(text: string): void
  source?: FormatSource
}): { model: Partial<GridModel<R>>; node: ReactNode; grid: { selectAreas: GridRect[] | null; optionsAt: { to: GridRect; n: number } | null } } {
  const tt = useTranslations('sheets.tips')
  const locale = useLocale()
  const source = p.source ?? 'linked'
  const [z, setZ] = useState(zoomBus.z)
  useEffect(() => {
    const on = (e: Event) => setZ((e as CustomEvent<{ z: number }>).detail.z)
    document.addEventListener(ZOOM_EVENT, on)
    setZ(zoomBus.z)
    return () => document.removeEventListener(ZOOM_EVENT, on)
  }, [])
  const [menu, setMenu] = useState<{ at: { x: number; y: number }; anchor: HTMLElement; items: PopItem[]; label: string; attr: string } | null>(null)
  const [selectAreas, setSelectAreas] = useState<GridRect[] | null>(null)
  const [optionsAt, setOptionsAt] = useState<{ to: GridRect; n: number } | null>(null)
  const lastApplied = useRef(false)
  const flashDone = useRef<{ n: number; rect: GridRect } | null>(null)
  const rect = useRef<GridRect>({ r0: 0, c0: 0, r1: 0, c1: 0 })
  const areas = useRef<GridRect[]>([rect.current])
  const live = useRef({ m, p })
  live.current = { m, p }
  const ctx = (): FillCtx => ({ lists: tipsBus.lists, weekend: [5, 6] })
  const say = (text: string) => live.current.p.say?.(text)
  const skipped = (res: WriteResult) => { const n = res ? Object.values(res.skipped).reduce<number>((a, b) => a + (b ?? 0), 0) : 0; live.current.p.onSkipped?.(n && res ? res.skipped : {}) }

  // ── cells ──
  const vertical = (d: FillRequest['dir']) => d === 'down' || d === 'up'
  /** A row with a cell per column (not a theme, pillar or video band). */
  const cellRow = (r: number) => { const row = m.rows[r]; return !!row && !m.colsOf?.(row) }
  const textAt = (r: number, c: number) => { const row = m.rows[r], col = m.cols[c]; return row && col && m.isText(row, col) ? m.textValue(row, col) : '' }
  /** What a cell holds as its text (choices as shown), for Go To Special and the status bar. */
  const shownAt = (r: number, c: number) => {
    const row = m.rows[r], col = m.cols[c]
    if (!row || !col || !cellRow(r)) return ''
    if (m.copyText) return m.copyText(row, col)
    return m.isText(row, col) ? m.textValue(row, col) : ''
  }

  // ── the fill handle ──
  function lineOf(from: GridRect, dir: FillRequest['dir'], k: number): string[] {
    const out: string[] = []
    if (vertical(dir)) for (let r = from.r0; r <= from.r1; r++) out.push(textAt(r, k))
    else for (let c = from.c0; c <= from.c1; c++) out.push(textAt(k, c))
    return dir === 'up' || dir === 'left' ? out.reverse() : out
  }
  const dirOf = (from: GridRect, to: GridRect): FillRequest['dir'] => (to.r1 > from.r1 ? 'down' : to.r0 < from.r0 ? 'up' : to.c1 > from.c1 ? 'right' : 'left')
  function fillInfo(from: GridRect): FillInfo | null {
    if (!p.enabled || !p.writeCells) return null
    const src = lineOf(from, 'down', from.c0)
    return {
      def: defaultMode(src, ctx()), modes: fillModesFor(src, ctx()),
      preview: (mode, to) => {
        const d = dirOf(from, to)
        const n = vertical(d) ? (to.r1 - to.r0) - (from.r1 - from.r0) : (to.c1 - to.c0) - (from.c1 - from.c0)
        return previewValue(lineOf(from, d, vertical(d) ? from.c0 : from.r0), n, mode, ctx())
      },
    }
  }
  async function onFill(req: FillRequest, again: boolean) {
    const { p: pp } = live.current
    if (!pp.writeCells) return
    if (req.mode === 'flash') { if (again && lastApplied.current) pp.onUndo?.(); await flashFill(vertical(req.dir) ? req.to.c0 : rect.current.c0); return }
    if (again && lastApplied.current) pp.onUndo?.()
    const writes: CellWrite[] = []
    if (req.mode === 'clear') {
      for (let r = req.from.r0; r <= req.from.r1; r++) for (let c = req.from.c0; c <= req.from.c1; c++) {
        if (r >= req.to.r0 && r <= req.to.r1 && c >= req.to.c0 && c <= req.to.c1) continue
        writes.push({ r, c, value: '' })
      }
    } else {
      const lines = vertical(req.dir) ? range(req.from.c0, req.from.c1) : range(req.from.r0, req.from.r1)
      const mode: FillMode = req.mode === 'formats' ? 'copy' : req.mode
      for (const k of lines) {
        const src = lineOf(req.from, req.dir, k)
        const tg: { r: number; c: number }[] = []
        if (req.dir === 'down') for (let r = req.from.r1 + 1; r <= req.to.r1; r++) tg.push({ r, c: k })
        if (req.dir === 'up') for (let r = req.from.r0 - 1; r >= req.to.r0; r--) tg.push({ r, c: k })
        if (req.dir === 'right') for (let c = req.from.c1 + 1; c <= req.to.c1; c++) tg.push({ r: k, c })
        if (req.dir === 'left') for (let c = req.from.c0 - 1; c >= req.to.c0; c--) tg.push({ r: k, c })
        const vals = planSeries(src, tg.length, mode, ctx())
        tg.forEach((x, i) => { const v = vals[i]; if (v !== null && v !== undefined) writes.push({ ...x, value: v }) })
      }
    }
    const res = await pp.writeCells(writes, req.mode === 'clear' ? 'clear' : 'fill')
    lastApplied.current = writes.length > 0
    skipped(res)
  }
  function onFillMenu(f: FillRequest, at: { x: number; y: number }, anchor: HTMLElement, kind: 'right' | 'options' | 'flash', run: (mode: FillMode) => void) {
    if (kind === 'flash') {
      setMenu({ at, anchor, label: tt('flashOptions'), attr: 'data-fill-menu', items: [
        { key: 'undo', label: tt('flashUndo'), onSelect: () => { live.current.p.onUndo?.(); flashDone.current = null } },
        { key: 'accept', label: tt('flashAccept'), onSelect: () => { flashDone.current = null } },
        { key: 'select', label: tt('flashSelect', { n: flashDone.current?.n ?? 0 }), onSelect: () => { const q = flashDone.current?.rect; if (q) setSelectAreas([{ ...q }]) } },
      ] })
      return
    }
    const src = lineOf(f.from, f.dir, vertical(f.dir) ? f.from.c0 : f.from.r0)
    const can = new Set<FillMode>(fillModesFor(src, ctx())), k = sourceKind(src, ctx())
    const item = (mode: FillMode, dis = false): PopItem => ({ key: mode, label: tt(`fill.${mode}`), checked: kind === 'options' ? f.mode === mode : undefined, disabled: dis, onSelect: () => run(mode) })
    const dates = (['days', 'weekdays', 'months', 'years'] as FillMode[]).map(x => item(x, !can.has(x)))
    const flash: PopItem = { ...item('flash'), kbd: 'Ctrl+E' } as PopItem
    // The board's sheets carry no cell formatting in a fill: copy, series and the date units.
    const items: PopItem[] = kind === 'right'
      ? [item('copy'), item('series'), { kind: 'sep', key: 's1' }, ...dates, { kind: 'sep', key: 's2' }, item('linear', k !== 'number'), item('growth', k !== 'number'), flash,
          { kind: 'sep', key: 's3' }, { key: 'seriesDlg', label: `${tt('fill.seriesDlg')}…`, onSelect: () => { setSelectAreas([{ ...f.to }]); requestAnimationFrame(() => document.dispatchEvent(new CustomEvent('momentum:series-open'))) } }]
      : [item('copy'), item('series'), ...(k === 'date' ? [{ kind: 'sep', key: 's1' } as PopItem, ...dates.filter(x => !('disabled' in x && x.disabled))] : []), { kind: 'sep', key: 's2' }, flash]
    setMenu({ at, anchor, items, label: tt(kind === 'right' ? 'fillMenu' : 'fillOptions'), attr: 'data-fill-menu' })
  }

  // ── Alt+↓ ──
  function pickList(row: R, col: string, anchor: HTMLElement, from: 'keys' | 'button'): boolean {
    if (from === 'button' || !p.writeCells) return false
    const seen = new Map<string, string>()
    for (const r of m.rows) {
      if (r.key === row.key || !m.isText(r, col)) continue
      const v = m.textValue(r, col).trim()
      if (v && !seen.has(v.toLowerCase())) seen.set(v.toLowerCase(), v)
    }
    const values = [...seen.values()].sort((a, b) => a.localeCompare(b, locale, { numeric: true, sensitivity: 'base' })).slice(0, 500)
    if (!values.length) return false
    const ri = m.rows.indexOf(row), ci = m.cols.indexOf(col)
    const b = anchor.closest('[data-cell]')?.getBoundingClientRect() ?? anchor.getBoundingClientRect()
    setMenu({
      at: { x: getComputedStyle(anchor).direction === 'rtl' ? b.right : b.left, y: b.bottom + 2 }, anchor, label: tt('pickLabel'), attr: 'data-pick-list',
      items: values.map(v => ({ key: v, label: v, onSelect: () => { void live.current.p.writeCells?.([{ r: ri, c: ci, value: v }], 'paste').then(skipped) } })),
    })
    return true
  }

  // ── Flash Fill (Ctrl+E) ──
  /** Rows around `r` with a cell per column and a text cell in column `c`: the block Flash Fill works on. */
  function block(r: number, c: number): [number, number] {
    const ok = (i: number) => cellRow(i) && m.isText(m.rows[i], m.cols[c])
    let r0 = r, r1 = r
    while (r0 > 0 && ok(r0 - 1)) r0--
    while (r1 < m.rows.length - 1 && ok(r1 + 1)) r1++
    return [r0, r1]
  }
  async function flashFill(targetC?: number) {
    const { p: pp } = live.current
    if (!pp.writeCells) return
    const c = targetC ?? rect.current.c0, ar = rect.current.r0
    if (!m.rows[ar] || !m.cols[c] || !cellRow(ar) || !m.isText(m.rows[ar], m.cols[c])) { say(tt('flashNone')); return }
    const [r0, r1] = block(ar, c)
    const srcCols = m.cols.map((_, i) => i).filter(i => i !== c)
    const srcOf = (r: number) => srcCols.map(x => shownAt(r, x))
    const examples: { row: string[]; out: string }[] = [], todo: number[] = []
    for (let r = r0; r <= r1; r++) {
      const v = textAt(r, c)
      if (v) examples.push({ row: srcOf(r), out: v })
      else if (srcOf(r).some(Boolean)) todo.push(r)
    }
    const usable = examples.filter(ex => learnFlash([ex], [ex.row])?.[0] === ex.out)
    const outs = usable.length && todo.length ? learnFlash(usable, todo.map(srcOf)) : null
    if (!outs) { say(tt('flashNone')); return }
    const writes = todo.map((r, i) => ({ r, c, value: outs[i] })).filter(w => w.value)
    if (!writes.length) { say(tt('flashNone')); return }
    const res = await pp.writeCells(writes, 'fill')
    lastApplied.current = true
    skipped(res)
    const q = { r0: Math.min(...todo), c0: c, r1: Math.max(...todo), c1: c }
    flashDone.current = { n: writes.length, rect: q }
    setSelectAreas([q])
    setOptionsAt({ to: q, n: Date.now() })
    status(tt('flashChanged', { n: writes.length }))
  }

  // ── Go To and Go To Special ──
  function goTo(ref: string) {
    const want = ref.trim()
    const label = (r: number) => { const l = m.rowLabel?.(m.rows[r], r); return typeof l === 'string' || typeof l === 'number' ? String(l) : String(r + 1) }
    let r = m.rows.findIndex((_, i) => cellRow(i) && label(i) === want)
    if (r < 0 && /^\d+$/.test(want)) r = Math.min(m.rows.length - 1, Number(want) - 1)
    if (r < 0 || !m.rows[r]) { say(tt('goLinkedBad', { ref: want })); return }
    const c = Math.max(0, rect.current.c0)
    setSelectAreas([{ r0: r, c0: c, r1: r, c1: c }])
  }
  function goSpecial(what: GoSpecial, numbers = true, text = true) {
    const q = rect.current
    const multiCell = areas.current.length > 1 || q.r0 !== q.r1 || q.c0 !== q.c1
    let used: GridRect | null = null
    for (let r = 0; r < m.rows.length; r++) for (let c = 0; c < m.cols.length; c++) {
      if (!shownAt(r, c)) continue
      used = used ? { r0: Math.min(used.r0, r), c0: Math.min(used.c0, c), r1: Math.max(used.r1, r), c1: Math.max(used.c1, c) } : { r0: r, c0: c, r1: r, c1: c }
    }
    const scope = multiCell ? areas.current : used ? [used] : []
    const pick: { r: number; c: number }[] = []
    const each = (f: (r: number, c: number) => boolean) => {
      const seen = new Set<string>()
      for (const a of scope) for (let r = a.r0; r <= a.r1; r++) for (let c = a.c0; c <= a.c1; c++) {
        const k = `${r},${c}`
        if (seen.has(k) || !cellRow(r)) continue
        seen.add(k)
        if (f(r, c)) pick.push({ r, c })
      }
    }
    const a = { r: q.r0, c: q.c0 }
    switch (what) {
      // Blanks are the empty cells you can type into (the board's choices aren't blanks).
      case 'blanks': each((r, c) => m.isText(m.rows[r], m.cols[c]) && !shownAt(r, c)); break
      case 'constants': each((r, c) => { const v = shownAt(r, c); return !!v && (parseNumber(v) !== null ? numbers : text) }); break
      case 'notes': each((r, c) => !!m.marked?.(m.rows[r], m.cols[c])); break
      case 'rowDiffs': for (const ar of areas.current) for (let r = ar.r0; r <= ar.r1; r++) for (let c = ar.c0; c <= ar.c1; c++) if (cellRow(r) && shownAt(r, c) !== shownAt(r, a.c)) pick.push({ r, c }); break
      case 'colDiffs': for (const ar of areas.current) for (let r = ar.r0; r <= ar.r1; r++) for (let c = ar.c0; c <= ar.c1; c++) if (cellRow(r) && shownAt(r, c) !== shownAt(a.r, c)) pick.push({ r, c }); break
      case 'region': {
        let r0 = a.r, r1 = a.r, c0 = a.c, c1 = a.c, grew = true
        const rowHas = (rr: number, x: number, y: number) => { for (let i = x; i <= y; i++) if (shownAt(rr, i)) return true; return false }
        const colHas = (cc: number, x: number, y: number) => { for (let i = x; i <= y; i++) if (shownAt(i, cc)) return true; return false }
        while (grew) {
          grew = false
          if (r0 > 0 && rowHas(r0 - 1, c0, c1)) { r0--; grew = true }
          if (r1 < m.rows.length - 1 && rowHas(r1 + 1, c0, c1)) { r1++; grew = true }
          if (c0 > 0 && colHas(c0 - 1, r0, r1)) { c0--; grew = true }
          if (c1 < m.cols.length - 1 && colHas(c1 + 1, r0, r1)) { c1++; grew = true }
        }
        setSelectAreas([{ r0, c0, r1, c1 }]); return
      }
      case 'lastCell': if (used) setSelectAreas([{ r0: used.r1, c0: used.c1, r1: used.r1, c1: used.c1 }]); return
      case 'visible': setSelectAreas([...areas.current]); return
      default: say(tt('blankOnly')); return
    }
    if (!pick.length) { say(tt('goNone')); return }
    const folded = foldCells(pick)
    if (!folded) { say(tt('goTooMany')); return }
    setSelectAreas(folded)
  }

  // ── Series… ──
  async function series(spec: SeriesSpec, by: 'rows' | 'cols') {
    const { p: pp } = live.current
    if (!pp.writeCells) return
    if (areas.current.length > 1) { say(tt('oneArea')); return }
    const q = rect.current
    const writes: CellWrite[] = []
    for (const k of by === 'cols' ? range(q.c0, q.c1) : range(q.r0, q.r1)) {
      const cells = by === 'cols' ? range(q.r0, q.r1).map(r => ({ r, c: k })) : range(q.c0, q.c1).map(c => ({ r: k, c }))
      const first = textAt(cells[0].r, cells[0].c)
      if (!first) continue
      planSeriesDialog(first, cells.length - 1, spec, ctx()).forEach((v, i) => writes.push({ ...cells[i + 1], value: v }))
    }
    if (!writes.length) { say(tt('seriesNone')); return }
    skipped(await pp.writeCells(writes, 'fill'))
  }

  // ── F4 and Ctrl+Y: repeat the last formatting command sent to this sheet ──
  const lastCmd = useRef<FormatCmd | null>(null)
  const replaying = useRef(false)
  const canRedo = useRef(false)
  useEffect(() => {
    const on = (e: Event) => { canRedo.current = !!(e as CustomEvent<{ canRedo: boolean }>).detail.canRedo }
    document.addEventListener(HISTORY_EVENT, on)
    return () => document.removeEventListener(HISTORY_EVENT, on)
  }, [])
  function repeat() {
    const c = lastCmd.current
    if (!c) { say(tt('repeatNone')); return }
    replaying.current = true
    sendFormat(source, c)
    replaying.current = false
  }

  // ── the status bar: the mode text and Average, Count, Sum ──
  const statusAt = useRef(0)
  /** `text` undefined leaves the mode as it is; null puts it back to Ready. */
  function status(text: string | null | undefined, stats?: { count: number; nums: number; sum: number; avg: number | null; cells: number }) {
    if (text) statusAt.current = Date.now()
    document.dispatchEvent(new CustomEvent(STATUS_EVENT, { detail: { source, text, stats } }))
  }
  function onSelect(q: GridRect, list?: GridRect[]) {
    rect.current = q
    areas.current = list?.length ? list : [q]
    let count = 0, nums = 0, sum = 0, cells = 0
    const seen = new Set<string>()
    outer: for (const a of areas.current) for (let r = a.r0; r <= a.r1; r++) for (let c = a.c0; c <= a.c1; c++) {
      const k = `${r},${c}`
      if (seen.has(k)) continue
      seen.add(k); cells++
      if (cells > 50_000) break outer
      const v = shownAt(r, c)
      if (!v) continue
      count++
      const n = parseNumber(v)
      if (n !== null) { nums++; sum += n }
    }
    status(Date.now() - statusAt.current > 800 ? null : undefined, { count, nums, sum, avg: nums ? sum / nums : null, cells })
  }

  // ── the workbook's commands for this sheet ──
  useEffect(() => {
    if (!p.enabled) return
    const on = (e: Event) => {
      const d = (e as CustomEvent<{ target: FormatSource; cmd: FormatCmd }>).detail
      if (d.target !== source) return
      const cmd = d.cmd
      if (REPEATABLE.has(cmd.kind) && !replaying.current && !(cmd.kind === 'clear' && cmd.what === 'comments')) lastCmd.current = cmd
      if (cmd.kind === 'goto') goTo(cmd.ref)
      else if (cmd.kind === 'goSpecial') goSpecial(cmd.what, cmd.numbers, cmd.text)
      else if (cmd.kind === 'series') void series(cmd.spec, cmd.by)
      else if (cmd.kind === 'flashFill') void flashFill()
      else if (cmd.kind === 'repeat') repeat()
      else if (cmd.kind === 'pickList') {
        const el = document.querySelector<HTMLElement>('[data-linked-pane] .fx-sheet-td.is-active')
        const row = el ? live.current.m.rows.find(r => r.key === el.dataset.rowKey) : undefined
        if (el && row && el.dataset.col && !pickList(row, el.dataset.col, el, 'keys')) say(tt('pickNone'))
      }
    }
    document.addEventListener(FORMAT_CMD, on)
    return () => document.removeEventListener(FORMAT_CMD, on)
  }, [p.enabled, source]) // eslint-disable-line react-hooks/exhaustive-deps

  const prevSelect = m.onSelect, prevRedo = m.onRedo
  const model: Partial<GridModel<R>> = p.enabled ? {
    zoom: z,
    onZoom: v => zoomBus.set?.(v),
    fillInfo, onFill: (req, again) => { void onFill(req, again) }, onFillMenu, pickList,
    nowText: kind => { const d = new Date(), p2 = (n: number) => String(n).padStart(2, '0'); return kind === 'date' ? `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}` : `${p2(d.getHours())}:${p2(d.getMinutes())}` },
    controlLabels: { handle: tt('handle'), options: tt('fillOptions'), dropdown: tt('dropdown') },
    onRepeat: repeat,
    onFlashFill: () => { void flashFill() },
    // Ctrl+Y with nothing to redo repeats, as Excel.
    onRedo: () => { if (canRedo.current || !lastCmd.current) prevRedo?.(); else repeat() },
    onSelect: (q, list) => { prevSelect?.(q, list); onSelect(q, list) },
  } : {}
  const node = menu ? (
    <PopMenu key={`${menu.attr}-${menu.label}`} at={menu.at} items={menu.items} label={menu.label} attr={menu.attr} returnTo={menu.anchor}
             onClose={() => setMenu(null)} />
  ) : null
  return { model, node, grid: { selectAreas, optionsAt } }
}
const range = (a: number, b: number) => Array.from({ length: b - a + 1 }, (_, i) => a + i)
