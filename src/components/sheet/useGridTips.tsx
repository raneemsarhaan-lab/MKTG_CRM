'use client'

/**
 * Spec 020 on the Content and Video sheets (tasks T017, T025, T035): the
 * zoom the workbook sets, the fill handle and Auto Fill Options, Alt+↓ Pick
 * From Drop-down List, and Ctrl+; for today's date. Every fill goes through
 * the sheet's own `writeCells(…, 'fill')`, so each cell keeps the board's
 * rules and refusals are counted, as a paste's are.
 */
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { ZOOM_EVENT, zoomBus, type CellWrite, type FillInfo, type FillRequest, type GridModel, type GridRect, type WriteResult, type WriteWhy } from './GridCore'
import { defaultMode, fillModesFor, planSeries, previewValue, sourceKind, type FillMode } from '@/lib/sheet-fill'
import { PopMenu, type PopItem } from '@/components/sheets/PopMenu'

export function useGridTips<R extends { key: string }>(m: GridModel<R>, p: {
  enabled: boolean
  writeCells?(writes: CellWrite[], why: WriteWhy): Promise<WriteResult>
  onUndo?(): void
  onSkipped?(s: Partial<Record<string, number>>): void
}): { model: Partial<GridModel<R>>; node: ReactNode } {
  const tt = useTranslations('sheets.tips')
  const locale = useLocale()
  const [z, setZ] = useState(zoomBus.z)
  useEffect(() => {
    const on = (e: Event) => setZ((e as CustomEvent<{ z: number }>).detail.z)
    document.addEventListener(ZOOM_EVENT, on)
    setZ(zoomBus.z)
    return () => document.removeEventListener(ZOOM_EVENT, on)
  }, [])
  const [menu, setMenu] = useState<{ at: { x: number; y: number }; anchor: HTMLElement; items: PopItem[]; label: string; attr: string } | null>(null)
  const lastApplied = useRef(false)
  const live = useRef({ m, p })
  live.current = { m, p }

  const vertical = (d: FillRequest['dir']) => d === 'down' || d === 'up'
  const textAt = (r: number, c: number) => { const row = m.rows[r], col = m.cols[c]; return row && col && m.isText(row, col) ? m.textValue(row, col) : '' }
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
      def: defaultMode(src), modes: fillModesFor(src),
      preview: (mode, to) => {
        const d = dirOf(from, to)
        const n = vertical(d) ? (to.r1 - to.r0) - (from.r1 - from.r0) : (to.c1 - to.c0) - (from.c1 - from.c0)
        return previewValue(lineOf(from, d, vertical(d) ? from.c0 : from.r0), n, mode)
      },
    }
  }
  async function onFill(req: FillRequest, again: boolean) {
    const { p: pp } = live.current
    if (!pp.writeCells) return
    if (again && lastApplied.current) pp.onUndo?.()
    const writes: CellWrite[] = []
    if (req.mode === 'clear') {
      for (let r = req.from.r0; r <= req.from.r1; r++) for (let c = req.from.c0; c <= req.from.c1; c++) {
        if (r >= req.to.r0 && r <= req.to.r1 && c >= req.to.c0 && c <= req.to.c1) continue
        writes.push({ r, c, value: '' })
      }
    } else {
      const lines = vertical(req.dir) ? range(req.from.c0, req.from.c1) : range(req.from.r0, req.from.r1)
      const mode: FillMode = req.mode === 'flash' || req.mode === 'formats' ? 'copy' : req.mode
      for (const k of lines) {
        const src = lineOf(req.from, req.dir, k)
        const tg: { r: number; c: number }[] = []
        if (req.dir === 'down') for (let r = req.from.r1 + 1; r <= req.to.r1; r++) tg.push({ r, c: k })
        if (req.dir === 'up') for (let r = req.from.r0 - 1; r >= req.to.r0; r--) tg.push({ r, c: k })
        if (req.dir === 'right') for (let c = req.from.c1 + 1; c <= req.to.c1; c++) tg.push({ r: k, c })
        if (req.dir === 'left') for (let c = req.from.c0 - 1; c >= req.to.c0; c--) tg.push({ r: k, c })
        const vals = planSeries(src, tg.length, mode)
        tg.forEach((x, i) => { const v = vals[i]; if (v !== null && v !== undefined) writes.push({ ...x, value: v }) })
      }
    }
    const res = await pp.writeCells(writes, req.mode === 'clear' ? 'clear' : 'fill')
    lastApplied.current = writes.length > 0
    const n = res ? Object.values(res.skipped).reduce<number>((a, b) => a + (b ?? 0), 0) : 0
    pp.onSkipped?.(n && res ? res.skipped : {})
  }
  function onFillMenu(f: FillRequest, at: { x: number; y: number }, anchor: HTMLElement, kind: 'right' | 'options' | 'flash', run: (mode: FillMode) => void) {
    const src = lineOf(f.from, f.dir, vertical(f.dir) ? f.from.c0 : f.from.r0)
    const can = new Set<FillMode>(fillModesFor(src)), k = sourceKind(src)
    const item = (mode: FillMode, dis = false): PopItem => ({ key: mode, label: tt(`fill.${mode}`), checked: kind === 'options' ? f.mode === mode : undefined, disabled: dis, onSelect: () => run(mode) })
    const dates = (['days', 'weekdays', 'months', 'years'] as FillMode[]).map(x => item(x, !can.has(x)))
    // The board's sheets have no cell formatting to carry: copy and series only, plus the date units.
    const items: PopItem[] = kind === 'right'
      ? [item('copy'), item('series'), { kind: 'sep', key: 's1' }, ...dates, { kind: 'sep', key: 's2' }, item('linear', k !== 'number'), item('growth', k !== 'number')]
      : [item('copy'), item('series'), ...(k === 'date' ? [{ kind: 'sep', key: 's1' } as PopItem, ...dates.filter(x => !('disabled' in x && x.disabled))] : [])]
    setMenu({ at, anchor, items, label: tt(kind === 'right' ? 'fillMenu' : 'fillOptions'), attr: 'data-fill-menu' })
  }
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
      items: values.map(v => ({ key: v, label: v, onSelect: () => { void live.current.p.writeCells?.([{ r: ri, c: ci, value: v }], 'paste').then(res => { if (res) live.current.p.onSkipped?.(res.skipped) }) } })),
    })
    return true
  }
  const model: Partial<GridModel<R>> = p.enabled ? {
    zoom: z,
    onZoom: v => zoomBus.set?.(v),
    fillInfo, onFill: (req, again) => { void onFill(req, again) }, onFillMenu, pickList,
    nowText: kind => { const d = new Date(), p2 = (n: number) => String(n).padStart(2, '0'); return kind === 'date' ? `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}` : `${p2(d.getHours())}:${p2(d.getMinutes())}` },
    controlLabels: { handle: tt('handle'), options: tt('fillOptions'), dropdown: tt('dropdown') },
  } : {}
  const node = menu ? (
    <PopMenu key={`${menu.attr}-${menu.label}`} at={menu.at} items={menu.items} label={menu.label} attr={menu.attr} returnTo={menu.anchor}
             onClose={() => setMenu(null)} />
  ) : null
  return { model, node }
}
const range = (a: number, b: number) => Array.from({ length: b - a + 1 }, (_, i) => a + i)
