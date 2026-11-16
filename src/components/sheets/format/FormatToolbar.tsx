'use client'

/**
 * The format toolbar (spec 015 FR-001–FR-003, contracts/ui.md §1, design:
 * Formatting): one row under the workbook toolbar in Excel's Home-tab order,
 * Font · Alignment · Number, then New comment. Every control shows the active
 * cell's state, has a label and a tooltip with its shortcut, and acts on the
 * selection through the format bus. Stage 2 and 3 controls arrive with their
 * stages. On a phone the same controls sit in a bottom sheet (FormatSheet).
 */
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import type { BorderSide, CellStyle, NumberFormat, RuleKind } from '@/types/index'
import { CURRENCIES } from '@/types/index'
import { DEFAULT_FONT, DEFAULT_SIZE, FONTS, FONT_SIZES, bumpDecimals, display, type BorderPreset, type StylePatch } from '@/lib/sheet-format'
import { PopMenu, type PopItem } from '../PopMenu'
import { askComment, sendFormat, type ClearWhat, type FormatSource, type FormatState, type MergeMode, type ViewOp } from './bus'
import { ColorPicker } from './ColorPicker'
import { BorderPicker } from './BorderPicker'
import { CellStylesMenu, TableMenu } from './StyleTools'
import { DEFAULT_BAR, DEFAULT_SCALE } from '@/lib/sheet-rules'

const P: Record<string, ReactNode> = {
  left: <path d="M4 6h16M4 10h10M4 14h16M4 18h10" />, center: <path d="M4 6h16M7 10h10M4 14h16M7 18h10" />, right: <path d="M4 6h16M10 10h10M4 14h16M10 18h10" />,
  top: <path d="M5 4h14M12 8v12M8 12l4-4 4 4" />, middle: <path d="M5 12h14M12 3v5M12 16v5M9 6l3 2 3-2M9 18l3-2 3 2" />, bottom: <path d="M5 20h14M12 4v12M8 12l4 4 4-4" />,
  wrap: <path d="M4 6h16M4 12h13a3 3 0 0 1 0 6h-4M15 16l-2 2 2 2M4 18h6" />, outdent: <path d="M10 6h10M10 12h10M10 18h10M7 9l-3 3 3 3" />, indent: <path d="M10 6h10M10 12h10M10 18h10M4 9l3 3-3 3" />,
  rotate: <><path d="M7 18L17 6M14 6h3v3" /><path d="M4 13h5" /></>, merge: <><rect x="3" y="6" width="18" height="12" rx="1" /><path d="M8 12h8M6 12l2-2v4zM18 12l-2-2v4z" /></>,
  borders: <><rect x="4" y="4" width="16" height="16" strokeDasharray="2 2" /><path d="M4 20h16" strokeWidth="2.6" /></>,
  fill: <><path d="M5 13l7-7 6 6-7 7z" /><path d="M19 15s2 2.3 2 3.5a2 2 0 0 1-4 0c0-1.2 2-3.5 2-3.5z" /></>,
  pct: <><path d="M6 18L18 6" /><circle cx="7" cy="7" r="2" /><circle cx="17" cy="17" r="2" /></>,
  fmtCells: <><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M3 9h18M9 9v11" /></>,
  comment: <path d="M4 5h16v11H9l-5 4z" />,
  paste: <><rect x="6" y="5" width="12" height="16" rx="2" /><path d="M9 5V3h6v2" /></>,
  painter: <><rect x="4" y="3" width="13" height="6" rx="1" /><path d="M17 6h3v5h-8v4M12 15v6" /></>,
  fmt: <><rect x="3" y="4" width="18" height="16" rx="1" /><path d="M3 10h18M3 16h18" /></>,
  clear: <><path d="M14 4l6 6-9 9H7l-3-3z" /><path d="M10 8l6 6" /></>,
  fillDn: <><path d="M12 4v14M7 13l5 5 5-5" /><path d="M5 21h14" /></>,
  find: <><circle cx="10" cy="10" r="6" /><path d="M15 15l5 5" /></>,
  freeze: <><rect x="3" y="4" width="18" height="16" rx="1" /><path d="M3 9h18M8 4v16" strokeWidth="2.6" /></>,
  styles: <><rect x="3" y="5" width="8" height="6" rx="1" /><rect x="13" y="5" width="8" height="6" rx="1" /><rect x="3" y="13" width="8" height="6" rx="1" /><rect x="13" y="13" width="8" height="6" rx="1" /></>,
  table: <><rect x="3" y="4" width="18" height="16" rx="1" /><path d="M3 9h18M3 14h18M10 4v16" /></>,
  cond: <><rect x="3" y="4" width="18" height="16" rx="1" /><path d="M6 8h4v8H6zM12 11h6M12 15h4" /></>,
  sort: <path d="M7 4v16M4 17l3 3 3-3M14 6h7M14 11h5M14 16h3" />,
  // Spec 018: the strip.
  undo: <path d="M9 4L4 9l5 5M4 9h10a6 6 0 0 1 0 12h-3" />, redo: <path d="M15 4l5 5-5 5M20 9H10a6 6 0 0 0 0 12h3" />,
  filter: <path d="M4 5h16l-6 7.5V19l-4-2v-4.5z" />,
  more: <><circle cx="12" cy="5" r="1.3" /><circle cx="12" cy="12" r="1.3" /><circle cx="12" cy="19" r="1.3" /></>,
}
const Icon = ({ k }: { k: string }) => (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{P[k]}</svg>
)

export const DEFAULT_LINE: BorderSide = { w: 'thin', c: '#000000' }
const isMac = () => typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform)
export const keyName = (k: string) => (isMac() ? k.replace('Ctrl+', '⌘').replace('Alt+', '⌥') : k)

/** The number formats in the menu, in Excel's order. */
export const NUM_MENU: { key: string; num: NumberFormat | null; sample: string }[] = [
  { key: 'general', num: null, sample: '' },
  { key: 'number', num: { kind: 'number', dp: 2, sep: true }, sample: '12500' },
  { key: 'currency', num: { kind: 'currency', cur: 'EGP', dp: 2 }, sample: '12500' },
  { key: 'accounting', num: { kind: 'accounting', cur: 'EGP', dp: 2, neg: 'paren' }, sample: '12500' },
  { key: 'shortDate', num: { kind: 'date' }, sample: '2026-11-16' },
  { key: 'longDate', num: { kind: 'date', long: true }, sample: '2026-11-16' },
  { key: 'time', num: { kind: 'time' }, sample: '14:30' },
  { key: 'percent', num: { kind: 'percent', dp: 2 }, sample: '0.125' },
  { key: 'scientific', num: { kind: 'scientific', dp: 2 }, sample: '12500' },
  { key: 'text', num: { kind: 'text' }, sample: '' },
]
export function numKey(n: NumberFormat | undefined): string {
  if (!n || n.kind === 'general') return 'general'
  if (n.kind === 'date') return n.pattern ? 'custom' : n.long ? 'longDate' : 'shortDate'
  return n.kind === 'percent' ? 'percent' : n.kind
}

/** What a toolbar control does, as one command to the open sheet. */
export function useFormatActions(target: FormatSource, state: FormatState | null) {
  const st: CellStyle = state?.style ?? {}
  const patch = (p: StylePatch, label: string) => sendFormat(target, { kind: 'patch', patch: p, label })
  return {
    st,
    patch,
    toggle: (k: 'b' | 'i' | 's' | 'wrap') => patch({ [k]: st[k] ? false : true }, k),
    underline: () => patch({ u: st.u && st.u !== 'none' ? 'none' : 'single' }, 'u'),
    align: (ha: 'left' | 'center' | 'right') => patch({ ha: st.ha === ha ? null : ha }, 'align'),
    valign: (va: 'top' | 'middle' | 'bottom') => patch({ va }, 'align'),
    indent: (d: 1 | -1) => patch({ indent: Math.max(0, Math.min(15, (st.indent ?? 0) + d)) || null }, 'indent'),
    num: (n: NumberFormat | null) => patch({ num: n }, 'number'),
    decimals: (d: 1 | -1) => patch({ num: bumpDecimals(st.num, d, state?.value ?? '') }, 'number'),
    borders: (preset: BorderPreset, line: BorderSide) => sendFormat(target, { kind: 'borders', preset, line }),
    merge: (mode: MergeMode) => sendFormat(target, { kind: 'merge', mode }),
    comment: () => askComment(),
  }
}

type MenuKey = 'font' | 'size' | 'color' | 'fill' | 'borders' | 'rotate' | 'merge' | 'num' | 'cur' | 'paste' | 'fmt' | 'clear' | 'fillDn' | 'find' | 'freeze' | 'cellStyles' | 'table' | 'cond' | 'sort'
  // Spec 018: the strip's ▾ menus, ⋮, and the menu bar's menus.
  | 'align' | 'valign' | 'wrapM' | 'text' | 'more' | 'mb-edit' | 'mb-view' | 'mb-insert' | 'mb-format' | 'mb-data' | 'mb-help'
type Open = { k: MenuKey; el: HTMLElement; at?: { x: number; y: number } } | null
const MENUBAR = ['file', 'edit', 'view', 'insert', 'format', 'data', 'help'] as const
type MenuBarKey = typeof MENUBAR[number]
/** The strip's groups, in the familiar order; the lower `p`, the sooner a group moves under ⋮ (FR-003). */
const GROUPS: { id: string; p: number }[] = [
  { id: 'edit', p: 9 }, { id: 'number', p: 3 }, { id: 'font', p: 5 }, { id: 'size', p: 6 }, { id: 'text', p: 8 },
  { id: 'cell', p: 7 }, { id: 'align', p: 4 }, { id: 'extra', p: 1 },
]
const SIZE_MIN = 6, SIZE_MAX = 96
type Leaf = Extract<PopItem, { label: string; onSelect(): void }>

/** One tool on the strip; the same entry feeds the ⋮ menu when its group is hidden. */
interface Tool { key: string; label: string; kbd?: string; inner: ReactNode; run(el: HTMLElement): void; pressed?: boolean; menu?: MenuKey; disabled?: string | null; cls?: string; dbl?(): void; data?: Record<string, string> }

export function FormatToolbar({ state, target, onFormatCells, painter, onPainter, onPaste, onPasteSpecial, onFind, onRule, onManageRules, onSortDialog, onUndo, onRedo, canUndo, canRedo, onFileMenu, onBoardMenu }: {
  state: FormatState | null
  target: FormatSource
  onFormatCells(): void
  /** Stage 2: Format Painter is on (sticky after a double-click). */
  painter: boolean
  onPainter(sticky: boolean): void
  onPaste(mode: 'all' | 'values' | 'formats'): void
  onPasteSpecial(): void
  onFind(replace: boolean): void
  /** Stage 3: New rule (a kind picked from the menu), Manage rules, Custom sort. */
  onRule(kind?: RuleKind): void
  onManageRules(): void
  onSortDialog(): void
  /** Spec 018: undo and redo live on the strip; File is the sheet's tab menu; Data › Board is the Board menu (blank sheets). */
  onUndo(): void
  onRedo(): void
  canUndo: boolean
  canRedo: boolean
  onFileMenu(anchor: HTMLElement, at: { x: number; y: number }): void
  onBoardMenu?(anchor: HTMLElement, at: { x: number; y: number }): void
}) {
  const t = useTranslations('sheets.format')
  const tc = useTranslations('sheets.comments')
  const tb = useTranslations('sheets.toolbar2')
  const locale = useLocale()
  const a = useFormatActions(target, state)
  const st = a.st
  const [open, setOpenState] = useState<Open>(null)
  /** The menu-bar button (or strip button) a chain of submenus started from: focus goes back there. */
  const root = useRef<HTMLElement | null>(null)
  const setOpen = (o: Open | ((o: Open) => Open)) => setOpenState(o)
  const [line, setLine] = useState<BorderSide>(DEFAULT_LINE)
  const [help, setHelp] = useState(false)
  const [search, setSearch] = useState<string | null>(null)
  const off = !state || !!state.readOnly
  const why = state?.readOnly ?? undefined
  // Spec 017 FR-014: with several areas selected, tools that need one block say so.
  const ta = useTranslations('sheets.areas')
  const oneOff = (state?.areas ?? 1) > 1 ? ta('oneArea') : null
  const one = (first = false): { disabled?: boolean; why?: string } => (oneOff ? { disabled: true, ...(first ? { why: oneOff } : {}) } : {})
  const rtlOf = (el: HTMLElement) => getComputedStyle(el).direction === 'rtl'

  const at = (o: NonNullable<Open>) => {
    if (o.at) return o.at
    const r = o.el.getBoundingClientRect()
    return { x: rtlOf(o.el) ? r.right : r.left, y: r.bottom }
  }
  const toggleOpen = (k: MenuKey, el: HTMLElement) => { root.current = el; setOpen(o => (o?.k === k ? null : { k, el })) }
  /** A submenu (Edit › Clear ▸): opens beside the item that was chosen. */
  const openSub = (k: MenuKey) => {
    const item = document.activeElement instanceof HTMLElement && document.activeElement.closest('[role="menu"]') ? document.activeElement : null
    const el = root.current ?? item
    if (!el) return
    if (!item) { setOpen({ k, el }); return }
    const r = item.getBoundingClientRect(), rtl = rtlOf(item)
    setOpen({ k, el, at: { x: rtl ? r.left : r.right, y: r.top - 8 } })
  }
  const sub = (key: string, label: string, k: MenuKey, extra: Partial<PopItem> = {}): PopItem => ({ key, label, sub: true, ...extra, onSelect: () => openSub(k) } as PopItem)
  /** Back to the grid after a command, so the keys keep working. */
  const focusGrid = () => requestAnimationFrame(() => document.querySelector<HTMLElement>('.fx-sh-panel .fx-sheet-td.is-active')?.focus({ preventScroll: true }))
  const clip = (kind: 'cut' | 'copy') => {
    const cell = document.querySelector<HTMLElement>('.fx-sh-panel .fx-sheet-td.is-active')
    cell?.focus()
    try { document.execCommand(kind) } catch { /* the browser refused: nothing to do */ }
  }

  const font = st.font ?? DEFAULT_FONT, size = st.size ?? DEFAULT_SIZE
  const nk = numKey(st.num)
  /** The active cell's value in this format when it reads as one, otherwise a sample. */
  const sample = (n: NumberFormat | null, s: string) => {
    const v = state?.value
    if (v) { const d = display(v, n, locale); if (d !== v) return d }
    return display(s, n, locale)
  }
  const mergeOff = state?.mergeOff ?? null
  const e = (k: string) => t(`edit.${k}`)
  const s3 = (k: string, v?: Record<string, string | number>) => t(`st3.${k}`, v)
  const viewOff = state?.viewOff ?? null
  const cmd = (c: Parameters<typeof sendFormat>[1]) => () => sendFormat(target, c)
  const vItem = (key: string, op: ViewOp, checked?: boolean, first = false): PopItem => ({ key, label: e(key), checked, disabled: !!viewOff, why: first ? viewOff ?? undefined : undefined, onSelect: cmd({ kind: 'view', op }) })
  const head = (key: string, text: string): PopItem => ({ kind: 'node', key, node: <div role="presentation" className="fx-st-h">{text}</div> })
  const lock = off ? { disabled: true, why } : {}
  const setSize = (n: number) => { if (!off && n >= SIZE_MIN && n <= SIZE_MAX) a.patch({ size: n === DEFAULT_SIZE ? null : n }, 'size') }
  const stepSize = (d: 1 | -1) => setSize(Math.max(SIZE_MIN, Math.min(SIZE_MAX, size + d)))

  /** Every menu, by key: the strip's ▾ menus, the menu bar's, and their submenus. */
  function menuFor(k: MenuKey): { items: PopItem[]; label: string; attr: string } | null {
    switch (k) {
      case 'font': return { label: t('ctl.font'), attr: 'data-font-menu', items: FONTS.map(f => ({ key: f.name, label: f.name, checked: font === f.name, onSelect: () => a.patch({ font: f.name === DEFAULT_FONT ? null : f.name }, 'font') })) }
      case 'size': return { label: t('ctl.size'), attr: 'data-size-menu', items: FONT_SIZES.map(n => ({ key: String(n), label: String(n), checked: size === n, onSelect: () => a.patch({ size: n === DEFAULT_SIZE ? null : n }, 'size') })) }
      case 'rotate': return { label: t('ctl.rotate'), attr: 'data-rotate-menu', items: ([['none', null], ['ccw', 45], ['cw', -45], ['vertical', 'vertical'], ['up', 90], ['down', -90]] as const).map(([k, v]) => ({ key: k, label: t(`rotate.${k}`), checked: (st.rot ?? null) === v, onSelect: () => a.patch({ rot: v }, 'rotate') })) }
      case 'merge': return { label: t('ctl.merge'), attr: 'data-merge-menu', items: (['center', 'across', 'cells', 'unmerge'] as MergeMode[]).map(m => ({ key: m, label: t(`merge.${m}`), disabled: !!oneOff || !!mergeOff || (m === 'unmerge' && !state?.merged && !state?.multi), why: m === 'center' ? oneOff ?? mergeOff ?? undefined : undefined, onSelect: () => a.merge(m) })) }
      case 'num': return { label: t('ctl.numberFormat'), attr: 'data-num-menu', items: [
        ...NUM_MENU.map(n => { const sm = n.sample ? sample(n.num, n.sample) : ''; return { key: n.key, label: sm ? `${t(`num.${n.key}`)} · ${sm}` : t(`num.${n.key}`), checked: nk === n.key, onSelect: () => a.num(n.num) } }),
        { kind: 'sep', key: 's0' },
        { key: 'comma', label: t('ctl.comma'), checked: st.num?.kind === 'number' && st.num.sep !== false, onSelect: () => a.num({ kind: 'number', dp: 2, sep: true }) },
        { kind: 'sep', key: 's' },
        { key: 'more', label: t('num.more'), kbd: keyName('Ctrl+1'), onSelect: onFormatCells },
      ] }
      case 'cur': return { label: t('ctl.currency'), attr: 'data-cur-menu', items: CURRENCIES.map(c => ({ key: c, label: t(`cur.${c}`), checked: st.num?.cur === c && st.num.kind === 'currency', onSelect: () => a.num({ kind: 'currency', cur: c, dp: st.num?.dp ?? 2 }) })) }
      case 'paste': return { label: tb('pasteSpecial'), attr: 'data-paste-menu', items: [
        { key: 'all', label: e('paste'), kbd: keyName('Ctrl+V'), onSelect: () => onPaste('all') },
        { key: 'values', label: e('pasteValues'), ...one(true), onSelect: () => onPaste('values') },
        { key: 'formats', label: e('pasteFormats'), ...one(), onSelect: () => onPaste('formats') },
        { kind: 'sep', key: 's' },
        { key: 'special', label: e('pasteSpecial'), kbd: keyName('Ctrl+Shift+V'), ...one(), onSelect: onPasteSpecial },
      ] }
      case 'fmt': return { label: t('ctl.format'), attr: 'data-cells-menu', items: [
        { key: 'rowHeight', label: e('rowHeight'), disabled: !!viewOff, why: viewOff ?? undefined, onSelect: cmd({ kind: 'resize', what: 'row' }) },
        { key: 'colWidth', label: e('colWidth'), disabled: !!viewOff, onSelect: cmd({ kind: 'resize', what: 'col' }) },
        { kind: 'sep', key: 's' },
        vItem('hideRows', 'hideRows'), vItem('hideCols', 'hideCols'), vItem('unhideRows', 'unhideRows'), vItem('unhideCols', 'unhideCols'),
      ] }
      case 'clear': return { label: t('ctl.clear'), attr: 'data-clear-menu', items: (['all', 'formats', 'contents', 'comments'] as ClearWhat[]).map(w => ({
        key: w, label: e(`clear${w[0].toUpperCase()}${w.slice(1)}`), ...(w === 'contents' ? { kbd: 'Delete' } : {}), onSelect: cmd({ kind: 'clear', what: w }),
      })) }
      case 'fillDn': return { label: t('ctl.fillDown'), attr: 'data-fill-menu', items: [
        { key: 'down', label: e('fillDown'), kbd: keyName('Ctrl+D'), ...one(true), onSelect: cmd({ kind: 'fill', dir: 'down' }) },
        { key: 'right', label: e('fillRight'), kbd: keyName('Ctrl+R'), ...one(), onSelect: cmd({ kind: 'fill', dir: 'right' }) },
      ] }
      case 'find': return { label: t('ctl.find'), attr: 'data-find-menu', items: [
        { key: 'find', label: e('find'), kbd: keyName('Ctrl+F'), onSelect: () => onFind(false) },
        { key: 'replace', label: e('replace'), kbd: keyName('Ctrl+H'), onSelect: () => onFind(true) },
      ] }
      case 'freeze': {
        const fz = state?.frozen ?? { rows: 0, cols: 0 }
        return { label: t('ctl.freeze'), attr: 'data-freeze-menu', items: [
          vItem('freezeTop', 'freezeTop', fz.rows === 1 && fz.cols === 0, true), vItem('freezeFirst', 'freezeFirst', fz.rows === 0 && fz.cols === 1),
          vItem('freezeHere', 'freezeHere', (fz.rows > 1 || fz.cols > 1) || (fz.rows === 1 && fz.cols === 1)), vItem('unfreeze', 'unfreeze'),
        ] }
      }
      case 'cond': return { label: t('ctl.cond'), attr: 'data-cond-menu', items: [
        head('hHi', s3('highlight')),
        ...(['gt', 'lt', 'between', 'eq', 'contains', 'date', 'dup'] as RuleKind[]).map((k, i) => ({ key: k, label: `${s3(`kinds.${k}`)}…`, ...one(i === 0), onSelect: () => onRule(k) })),
        head('hTop', s3('topBottom')),
        ...(['top', 'bottom'] as RuleKind[]).map(k => ({ key: k, label: `${s3(`kinds.${k}`)}…`, ...one(), onSelect: () => onRule(k) })),
        { kind: 'sep', key: 's1' },
        { key: 'bar', label: s3('kinds.bar'), ...one(), onSelect: cmd({ kind: 'ruleNew', rule: { kind: 'bar', args: { colors: [DEFAULT_BAR] }, style: null } }) },
        { key: 'scale', label: s3('kinds.scale'), ...one(), onSelect: cmd({ kind: 'ruleNew', rule: { kind: 'scale', args: { colors: DEFAULT_SCALE }, style: null } }) },
        { kind: 'sep', key: 's2' },
        { key: 'new', label: `${s3('newRule')}…`, ...one(), onSelect: () => onRule() },
        { key: 'clearSel', label: s3('clearSel'), onSelect: cmd({ kind: 'rulesClear', where: 'selection' }) },
        { key: 'clearAll', label: s3('clearAll'), disabled: !state?.rules?.length, onSelect: cmd({ kind: 'rulesClear', where: 'sheet' }) },
        { key: 'manage', label: `${s3('manage')}…`, onSelect: onManageRules },
      ] }
      case 'sort': {
        const fl = state?.filter ?? { on: false, cols: 0 }
        const col = state?.colKey ?? ''
        return { label: t('ctl.sort'), attr: 'data-sort-menu', items: [
          { key: 'az', label: s3('sortAZ'), ...one(true), onSelect: cmd({ kind: 'sort', keys: [{ col, dir: 'asc' }], header: null }) },
          { key: 'za', label: s3('sortZA'), ...one(), onSelect: cmd({ kind: 'sort', keys: [{ col, dir: 'desc' }], header: null }) },
          { key: 'custom', label: `${s3('customSort')}…`, ...one(), onSelect: onSortDialog },
          { kind: 'sep', key: 's' },
          { key: 'filter', label: s3('filter'), kbd: keyName('Ctrl+Shift+L'), checked: fl.on, ...(fl.on ? {} : one()), onSelect: cmd({ kind: 'filter', op: 'toggle' }) },
          { key: 'clearFilter', label: s3('clearFilter'), disabled: !fl.cols, onSelect: cmd({ kind: 'filter', op: 'clear' }) },
        ] }
      }
      // ── spec 018 ──
      case 'align': return { label: tb('tips.align'), attr: 'data-align-menu', items: [
        ...(['left', 'center', 'right'] as const).map(h => ({ key: h, label: t(`ctl.align${h[0].toUpperCase()}${h.slice(1)}`), checked: (st.ha ?? null) === h, ...lock, onSelect: () => a.align(h) })),
        { kind: 'sep', key: 's' },
        { key: 'indent', label: tb('indent'), ...lock, onSelect: () => a.indent(1) },
        { key: 'outdent', label: tb('outdent'), ...lock, onSelect: () => a.indent(-1) },
      ] }
      case 'valign': return { label: tb('tips.valign'), attr: 'data-valign-menu', items: (['top', 'middle', 'bottom'] as const).map(v => ({ key: v, label: t(`ctl.align${v[0].toUpperCase()}${v.slice(1)}`), checked: (st.va ?? 'bottom') === v, ...lock, onSelect: () => a.valign(v) })) }
      case 'wrapM': return { label: tb('tips.wrapping'), attr: 'data-wrap-menu', items: [
        { key: 'wrap', label: tb('wrap'), checked: !!st.wrap, ...lock, onSelect: () => { if (!st.wrap) a.toggle('wrap') } },
        { key: 'clip', label: tb('clip'), checked: !st.wrap, ...lock, onSelect: () => { if (st.wrap) a.toggle('wrap') } },
      ] }
      case 'text': return { label: tb('text'), attr: 'data-text-menu', items: [
        { key: 'b', label: t('ctl.bold'), kbd: keyName('Ctrl+B'), checked: !!st.b, ...lock, onSelect: () => a.toggle('b') },
        { key: 'i', label: t('ctl.italic'), kbd: keyName('Ctrl+I'), checked: !!st.i, ...lock, onSelect: () => a.toggle('i') },
        { key: 'u', label: t('ctl.underline'), kbd: keyName('Ctrl+U'), checked: !!st.u && st.u !== 'none', ...lock, onSelect: () => a.underline() },
        { key: 's', label: t('ctl.strike'), kbd: keyName('Ctrl+5'), checked: !!st.s, ...lock, onSelect: () => a.toggle('s') },
      ] }
      case 'more': return { label: tb('tips.more'), attr: 'data-more-menu', items: hiddenTools().map(x => ({ key: x.key, label: x.label, kbd: x.kbd ? keyName(x.kbd) : undefined, checked: x.pressed, disabled: x.disabled != null, why: x.disabled || undefined, onSelect: () => x.run(open?.el ?? document.body) })) }
      case 'mb-edit': return { label: tb('menu.edit'), attr: 'data-mb-edit', items: [
        { key: 'undo', label: tb('undo'), kbd: keyName('Ctrl+Z'), disabled: !canUndo, onSelect: onUndo },
        { key: 'redo', label: tb('redo'), kbd: keyName('Ctrl+Y'), disabled: !canRedo, onSelect: onRedo },
        { kind: 'sep', key: 's1' },
        { key: 'cut', label: tb('cut'), kbd: keyName('Ctrl+X'), ...lock, onSelect: () => clip('cut') },
        { key: 'copy', label: tb('copy'), kbd: keyName('Ctrl+C'), onSelect: () => clip('copy') },
        { key: 'paste', label: tb('paste'), kbd: keyName('Ctrl+V'), ...lock, onSelect: () => onPaste('all') },
        sub('pasteSpecial', tb('pasteSpecial'), 'paste', lock),
        { kind: 'sep', key: 's2' },
        { key: 'fillDown', label: e('fillDown'), kbd: keyName('Ctrl+D'), ...lock, ...one(), onSelect: cmd({ kind: 'fill', dir: 'down' }) },
        { key: 'fillRight', label: e('fillRight'), kbd: keyName('Ctrl+R'), ...lock, ...one(), onSelect: cmd({ kind: 'fill', dir: 'right' }) },
        { kind: 'sep', key: 's3' },
        { key: 'find', label: e('find'), kbd: keyName('Ctrl+F'), onSelect: () => onFind(false) },
        { key: 'replace', label: e('replace'), kbd: keyName('Ctrl+H'), onSelect: () => onFind(true) },
        sub('clear', tb('clear'), 'clear', lock),
      ] }
      case 'mb-view': return { label: tb('menu.view'), attr: 'data-mb-view', items: [
        sub('freeze', tb('freeze'), 'freeze'),
        { kind: 'sep', key: 's1' },
        ...(menuFor('fmt')?.items ?? []),
      ] }
      case 'mb-insert': return { label: tb('menu.insert'), attr: 'data-mb-insert', items: [
        ...(['rowAbove', 'rowBelow', 'colLeft', 'colRight'] as const).map(w => ({ key: w, label: tb(w), ...lock, ...one(), onSelect: cmd({ kind: 'insert', what: w }) })),
        { kind: 'sep', key: 's1' },
        { key: 'comment', label: tb('comment'), kbd: keyName('Ctrl+Alt+M'), disabled: !state, onSelect: () => a.comment() },
      ] }
      case 'mb-format': return { label: tb('menu.format'), attr: 'data-mb-format', items: [
        sub('number', tb('number'), 'num', lock), sub('text', tb('text'), 'text', lock), sub('alignment', tb('alignment'), 'align', lock),
        sub('wrapping', tb('wrapping'), 'wrapM', lock), sub('rotation', tb('rotation'), 'rotate', lock), sub('fontSize', tb('fontSize'), 'size', lock),
        sub('merge', tb('mergeCells'), 'merge', lock),
        { kind: 'sep', key: 's1' },
        { key: 'cellStyles', label: tb('cellStyles'), ...lock, onSelect: () => openSub('cellStyles') },
        { key: 'table', label: tb('formatAsTable'), ...(oneOff && !state?.table ? { disabled: true, why: oneOff } : {}), onSelect: () => openSub('table') },
        sub('cond', tb('conditional'), 'cond'),
        { kind: 'sep', key: 's2' },
        { key: 'fmtCells', label: tb('formatCells'), kbd: keyName('Ctrl+1'), ...lock, onSelect: onFormatCells },
        { key: 'clearFormatting', label: tb('clearFormatting'), ...lock, onSelect: cmd({ kind: 'clear', what: 'formats' }) },
      ] }
      case 'mb-data': return { label: tb('menu.data'), attr: 'data-mb-data', items: [
        ...(menuFor('sort')?.items ?? []),
        ...(onBoardMenu ? [{ kind: 'sep', key: 'sb' } as PopItem, { key: 'board', label: tb('board'), sub: true, onSelect: () => { const el = root.current; if (el) { const item = document.activeElement as HTMLElement | null, r = item?.getBoundingClientRect(); onBoardMenu(el, r ? { x: rtlOf(el) ? r.left : r.right, y: r.top - 8 } : at({ k: 'mb-data', el })) } } } as PopItem] : []),
      ] }
      case 'mb-help': return { label: tb('menu.help'), attr: 'data-mb-help', items: [
        { key: 'shortcuts', label: tb('shortcuts'), kbd: keyName('Ctrl+/'), onSelect: () => setHelp(true) },
        { key: 'search', label: tb('searchMenus'), kbd: isMac() ? '⌥/' : 'Alt+/', onSelect: () => setSearch('') },
      ] }
    }
    return null
  }

  // ── the strip (FR-002, FR-006, FR-007) ──
  const alignIcon = st.ha === 'center' ? 'center' : st.ha === 'right' ? 'right' : 'left'
  const valignIcon = st.va === 'top' ? 'top' : st.va === 'middle' ? 'middle' : 'bottom'
  const groups: Record<string, Tool[]> = {
    edit: [
      { key: 'find', label: tb('tips.find'), kbd: 'Ctrl+F', inner: <Icon k="find" />, run: () => onFind(false), disabled: state ? null : '' },
      { key: 'undo', label: tb('tips.undo'), kbd: 'Ctrl+Z', inner: <Icon k="undo" />, run: () => onUndo(), disabled: canUndo ? null : '', data: { 'data-undo': '' } },
      { key: 'redo', label: tb('tips.redo'), kbd: 'Ctrl+Y', inner: <Icon k="redo" />, run: () => onRedo(), disabled: canRedo ? null : '', data: { 'data-redo': '' } },
      { key: 'painter', label: t('ctl.painter'), inner: <Icon k="painter" />, run: () => onPainter(false), dbl: () => { if (!off) onPainter(true) }, pressed: painter },
    ],
    number: [
      { key: 'cur', label: tb('tips.cur'), kbd: 'Ctrl+Shift+$', inner: <span className="fx-fmt-cur">{st.num?.kind === 'currency' ? st.num.cur ?? 'EGP' : 'EGP'}</span>, run: el => toggleOpen('cur', el), menu: 'cur', pressed: st.num?.kind === 'currency' },
      { key: 'pct', label: tb('tips.pct'), kbd: 'Ctrl+Shift+%', inner: <span className="fx-fmt-pct">%</span>, run: () => a.num({ kind: 'percent', dp: 0 }), pressed: st.num?.kind === 'percent' },
      { key: 'decDn', label: tb('tips.decDn'), inner: <span className="fx-fmt-dec">.0<small aria-hidden="true">←</small></span>, run: () => a.decimals(-1) },
      { key: 'decUp', label: tb('tips.decUp'), inner: <span className="fx-fmt-dec">.00<small aria-hidden="true">→</small></span>, run: () => a.decimals(1) },
      { key: 'num', label: tb('tips.num'), inner: <span className="fx-fmt-123">123</span>, run: el => toggleOpen('num', el), menu: 'num' },
    ],
    font: [
      { key: 'font', label: t('ctl.font'), inner: <span className="fx-fmt-sel is-font" style={{ fontFamily: FONTS.find(f => f.name === font)?.stack }}>{font}</span>, run: el => toggleOpen('font', el), menu: 'font', cls: 'is-sel' },
    ],
    size: [
      { key: 'sizeDn', label: tb('tips.sizeDown'), inner: <span aria-hidden="true">−</span>, run: () => stepSize(-1) },
      { key: 'sizeUp', label: tb('tips.sizeUp'), inner: <span aria-hidden="true">+</span>, run: () => stepSize(1) },
    ],
    text: [
      { key: 'b', label: t('ctl.bold'), kbd: 'Ctrl+B', inner: <b>B</b>, run: () => a.toggle('b'), pressed: !!st.b },
      { key: 'i', label: t('ctl.italic'), kbd: 'Ctrl+I', inner: <i>I</i>, run: () => a.toggle('i'), pressed: !!st.i },
      { key: 's', label: t('ctl.strike'), kbd: 'Ctrl+5', inner: <s>S</s>, run: () => a.toggle('s'), pressed: !!st.s },
      { key: 'color', label: t('ctl.textColor'), inner: <><span className="fx-fmt-a">A</span><span className="fx-fmt-barline" style={{ background: st.color ?? '#C00000' }} /></>, run: el => toggleOpen('color', el), menu: 'color' },
    ],
    cell: [
      { key: 'fill', label: t('ctl.fill'), inner: <><Icon k="fill" /><span className="fx-fmt-barline" style={{ background: st.fill ?? '#FFC000' }} /></>, run: el => toggleOpen('fill', el), menu: 'fill' },
      { key: 'borders', label: t('ctl.borders'), inner: <Icon k="borders" />, run: el => toggleOpen('borders', el), menu: 'borders' },
      { key: 'merge', label: t('ctl.merge'), inner: <Icon k="merge" />, run: el => toggleOpen('merge', el), menu: 'merge', pressed: !!state?.merged },
    ],
    align: [
      { key: 'align', label: tb('tips.align'), inner: <Icon k={alignIcon} />, run: el => toggleOpen('align', el), menu: 'align' },
      { key: 'valign', label: tb('tips.valign'), inner: <Icon k={valignIcon} />, run: el => toggleOpen('valign', el), menu: 'valign' },
      { key: 'wrap', label: tb('tips.wrapping'), inner: <Icon k="wrap" />, run: el => toggleOpen('wrapM', el), menu: 'wrapM', pressed: !!st.wrap },
      { key: 'rotate', label: tb('tips.rotate'), inner: <Icon k="rotate" />, run: el => toggleOpen('rotate', el), menu: 'rotate' },
    ],
    extra: [
      { key: 'comment', label: tc('new'), kbd: 'Ctrl+Alt+M', inner: <><Icon k="comment" /><span aria-hidden="true" className="fx-fmt-plus">＋</span></>, run: () => a.comment(), disabled: state ? null : '' },
      { key: 'filter', label: tb('tips.filter'), kbd: 'Ctrl+Shift+L', inner: <Icon k="filter" />, run: () => sendFormat(target, { kind: 'filter', op: 'toggle' }), pressed: !!state?.filter?.on, disabled: state ? (oneOff && !state.filter?.on ? oneOff : null) : '' },
    ],
  }
  // Tools that don't change the sheet stay on with a protected sheet.
  const always = new Set(['find', 'undo', 'redo', 'comment'])

  // ── overflow (FR-003): hide the lowest-priority groups until the strip fits ──
  const stripRef = useRef<HTMLDivElement>(null)
  const groupRefs = useRef(new Map<string, HTMLElement>())
  const widths = useRef(new Map<string, number>())
  const [hidden, setHidden] = useState<string[]>([])
  const hiddenTools = () => GROUPS.filter(g => hidden.includes(g.id)).flatMap(g => groups[g.id])
  useLayoutEffect(() => {
    const strip = stripRef.current
    if (!strip) return
    const fit = () => {
      for (const g of GROUPS) { const el = groupRefs.current.get(g.id); if (el && !el.hidden) widths.current.set(g.id, el.offsetWidth) }
      const cs = getComputedStyle(strip)
      const room = strip.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight) - 2
      let total = GROUPS.reduce((s, g) => s + (widths.current.get(g.id) ?? 0), 0)
      const next: string[] = []
      if (total > room) {
        const avail = room - 40
        for (const g of [...GROUPS].sort((x, y) => x.p - y.p)) {
          if (total <= avail) break
          next.push(g.id); total -= widths.current.get(g.id) ?? 0
        }
      }
      setHidden(h => (h.length === next.length && h.every((x, i) => x === next[i]) ? h : next))
    }
    fit()
    const ro = new ResizeObserver(fit)
    ro.observe(strip)
    return () => ro.disconnect()
  }, [locale, font, target])

  // Alt+/ (Option+/): search the menus (US2).
  useEffect(() => {
    const k = (ev: KeyboardEvent) => {
      if (ev.altKey && !ev.ctrlKey && !ev.metaKey && (ev.code === 'Slash' || ev.key === '/')) { ev.preventDefault(); setOpen(null); setSearch('') }
      if ((ev.ctrlKey || ev.metaKey) && !ev.altKey && (ev.code === 'Slash' || ev.key === '/')) { ev.preventDefault(); setHelp(true) }
    }
    document.addEventListener('keydown', k)
    return () => document.removeEventListener('keydown', k)
  }, [])

  const btn = (x: Tool) => {
    const disabled = x.disabled !== undefined ? x.disabled : (off && !always.has(x.key) ? why ?? '' : null)
    const tip = `${x.label}${x.kbd ? ` (${keyName(x.kbd)})` : ''}${disabled ? ` · ${disabled}` : ''}`
    return (
      <button type="button" key={x.key} className={`fx-fmt-b${x.cls ? ` ${x.cls}` : ''}`} data-fmt={x.key} title={tip}
              {...(x.data ?? {})}
              aria-disabled={disabled !== null ? true : undefined}
              aria-pressed={x.pressed}
              aria-haspopup={x.menu ? (x.menu === 'color' || x.menu === 'fill' || x.menu === 'borders' ? 'dialog' : 'menu') : undefined}
              aria-expanded={x.menu ? open?.k === x.menu : undefined}
              onClick={ev => { if (disabled !== null) return; x.run(ev.currentTarget) }}
              onDoubleClick={x.dbl ? () => { if (disabled === null) x.dbl?.() } : undefined}>
        {x.inner}<span className="sr-only">{x.label}</span>{x.menu && <span className="fx-fmt-car" aria-hidden="true">▾</span>}
      </button>
    )
  }

  // ── the menu bar (US2) ──
  const mbRefs = useRef(new Map<MenuBarKey, HTMLButtonElement>())
  const mbKey = (k: MenuBarKey): MenuKey | null => (k === 'file' ? null : (`mb-${k}` as MenuKey))
  const openBar = (k: MenuBarKey, el: HTMLElement) => {
    root.current = el
    if (k === 'file') { setOpen(null); const r = el.getBoundingClientRect(); onFileMenu(el, { x: rtlOf(el) ? r.right : r.left, y: r.bottom }); return }
    setOpen(o => (o?.k === mbKey(k) ? null : { k: mbKey(k)!, el }))
  }
  const barOpen = open?.k.startsWith('mb-') ? open.k : null
  function onBarKey(ev: React.KeyboardEvent, i: number) {
    const rtl = rtlOf(ev.currentTarget as HTMLElement)
    const go = (n: number) => { ev.preventDefault(); mbRefs.current.get(MENUBAR[(n + MENUBAR.length) % MENUBAR.length])?.focus() }
    if (ev.key === (rtl ? 'ArrowLeft' : 'ArrowRight')) return go(i + 1)
    if (ev.key === (rtl ? 'ArrowRight' : 'ArrowLeft')) return go(i - 1)
    if (ev.key === 'ArrowDown') { ev.preventDefault(); openBar(MENUBAR[i], ev.currentTarget as HTMLElement) }
  }

  // ── the name box and cell bar (US3) ──
  const [nameDraft, setNameDraft] = useState<string | null>(null)
  /** A click into the name box selects its text, as in a spreadsheet; the click's mouseup mustn't undo that. */
  const nameFresh = useRef(false)
  const [cellDraft, setCellDraft] = useState<string | null>(null)
  const areas = state?.areas ?? 1, count = state?.count ?? 1
  const nameShown = state ? (state.range ?? state.cell) : ''
  const countText = areas > 1 ? tb('areasCount', { a: areas, n: count }) : count > 1 ? tb('count', { n: count }) : ''

  // ── Alt+/ search: every leaf of every menu ──
  function allCommands(): { label: string; item: Leaf }[] {
    const out: { label: string; item: Leaf }[] = []
    const walk = (k: MenuKey, path: string, depth: number) => {
      const m = menuFor(k)
      if (!m || depth > 2) return
      for (const it of m.items) {
        if (it.kind === 'sep' || it.kind === 'node') continue
        const subKey = (it as { sub?: boolean }).sub ? subOf(k, it.key) : null
        if (subKey) walk(subKey, `${path} › ${it.label}`, depth + 1)
        else out.push({ label: `${path} › ${it.label}`, item: it as Leaf })
      }
    }
    for (const k of MENUBAR) { const mk = mbKey(k); if (mk) walk(mk, tb(`menu.${k}`), 0) }
    return out
  }
  const subOf = (parent: MenuKey, key: string): MenuKey | null => {
    const map: Record<string, MenuKey> = { pasteSpecial: 'paste', clear: 'clear', freeze: 'freeze', number: 'num', text: 'text', alignment: 'align', wrapping: 'wrapM', rotation: 'rotate', fontSize: 'size', merge: 'merge', cond: 'cond' }
    return parent.startsWith('mb-') ? map[key] ?? null : null
  }

  const menu = open ? menuFor(open.k) : null
  const q = (search ?? '').trim().toLowerCase()
  const found = search !== null ? allCommands().filter(c => q && c.label.toLowerCase().includes(q)).slice(0, 12) : []

  return (
    <div className="fx-fmt-head" data-format-head="">
      <div className="fx-mb" role="menubar" aria-label={tb('menu.bar')} data-menubar="">
        {MENUBAR.map((k, i) => (
          <button type="button" key={k} role="menuitem" aria-haspopup="menu" aria-expanded={(!!barOpen && barOpen === mbKey(k)) || undefined}
                  tabIndex={i === 0 ? 0 : -1} data-mb={k}
                  ref={el => { if (el) mbRefs.current.set(k, el); else mbRefs.current.delete(k) }}
                  onClick={ev => openBar(k, ev.currentTarget)}
                  onPointerEnter={ev => { if (barOpen && barOpen !== mbKey(k) && k !== 'file') openBar(k, ev.currentTarget) }}
                  onKeyDown={ev => onBarKey(ev, i)}>
            {tb(`menu.${k}`)}
          </button>
        ))}
      </div>
      <div className="fx-fmt-bar" role="toolbar" aria-label={tb('tips.strip')} data-format-bar="" ref={stripRef}>
        {GROUPS.map((g, gi) => (
          <div key={g.id} className="fx-fmt-g" role="group" data-group={g.id} hidden={hidden.includes(g.id)}
               ref={el => { if (el) groupRefs.current.set(g.id, el); else groupRefs.current.delete(g.id) }}>
            {g.id === 'size'
              ? <>
                  {btn(groups.size[0])}
                  <input className="fx-fmt-size" data-fmt="size" aria-label={tb('tips.size')} title={tb('tips.size')} inputMode="numeric"
                         disabled={off} value={String(size)}
                         onChange={ev => { const n = Number(ev.target.value); if (Number.isFinite(n)) setSize(Math.round(n)) }}
                         onKeyDown={ev => { if (ev.key === 'Enter') { ev.preventDefault(); focusGrid() } if (ev.key === 'ArrowUp') { ev.preventDefault(); stepSize(1) } if (ev.key === 'ArrowDown') { ev.preventDefault(); stepSize(-1) } }} />
                  {btn(groups.size[1])}
                </>
              : groups[g.id].map(btn)}
            {gi < GROUPS.length - 1 && <span className="fx-fmt-vsep" aria-hidden="true" />}
          </div>
        ))}
        {hidden.length > 0 && (
          <button type="button" className="fx-fmt-b fx-fmt-more" data-fmt="more" title={tb('tips.more')} aria-label={tb('tips.more')} aria-haspopup="menu"
                  aria-expanded={open?.k === 'more'} onClick={ev => toggleOpen('more', ev.currentTarget)}>
            <Icon k="more" />
          </button>
        )}
      </div>
      <div className="fx-fbar" data-cell-row="">
        <input className="fx-namebox" data-namebox="" aria-label={tb('nameBox')} title={tb('nameBox')} dir="ltr"
               readOnly={!state?.canGoto} value={nameDraft ?? nameShown}
               onFocus={ev => { setNameDraft(nameShown); ev.currentTarget.select(); nameFresh.current = true }}
               onMouseUp={ev => { if (nameFresh.current) { ev.preventDefault(); nameFresh.current = false } }}
               onBlur={() => setNameDraft(null)}
               onChange={ev => setNameDraft(ev.target.value)}
               onKeyDown={ev => {
                 if (ev.key === 'Enter') { ev.preventDefault(); const v = (nameDraft ?? '').trim(); setNameDraft(null); if (v && state?.canGoto) sendFormat(target, { kind: 'goto', ref: v }); focusGrid() }
                 if (ev.key === 'Escape') { ev.preventDefault(); setNameDraft(null); focusGrid() }
               }} />
        <span className="fx-fx" aria-hidden="true">fx</span>
        <input className="fx-cellbar" data-cellbar="" aria-label={tb('cellBar')} dir="auto"
               readOnly={off} title={off ? why ?? tb('cellBarRo') : undefined}
               value={cellDraft ?? state?.value ?? ''}
               onFocus={() => setCellDraft(state?.value ?? '')}
               onBlur={() => setCellDraft(null)}
               onChange={ev => setCellDraft(ev.target.value)}
               onKeyDown={ev => {
                 if (ev.key === 'Enter') { ev.preventDefault(); const v = cellDraft; setCellDraft(null); if (v !== null && v !== (state?.value ?? '') && !off) sendFormat(target, { kind: 'setValue', value: v }); focusGrid() }
                 if (ev.key === 'Escape') { ev.preventDefault(); setCellDraft(null); focusGrid() }
               }} />
        <span className="fx-cellcount" data-selection="" aria-live="polite">{countText}{state?.adding && <span className="fx-sh-adding" data-add-mode="">{ta('adding')}</span>}</span>
      </div>

      {menu && open && <PopMenu key={open.k} at={at(open)} label={menu.label} items={menu.items} attr={menu.attr} returnTo={root.current ?? open.el} onClose={() => setOpen(null)} />}
      {open && (open.k === 'color' || open.k === 'fill') && (
        <ColorPicker anchor={open.el} kind={open.k} current={(open.k === 'fill' ? st.fill : st.color) ?? null}
                     onPick={c => a.patch({ [open.k]: c }, open.k)} onClose={() => setOpen(null)} />
      )}
      {open?.k === 'cellStyles' && <CellStylesMenu anchor={open.el} target={target} onClose={() => setOpen(null)} />}
      {open?.k === 'table' && <TableMenu anchor={open.el} target={target} state={state} onClose={() => setOpen(null)} />}
      {open?.k === 'borders' && (
        <BorderPicker anchor={open.el} line={line} onLine={setLine} onPick={p => a.borders(p, line)} onClose={() => setOpen(null)} />
      )}
      {search !== null && (
        <div className="fx-mb-search" role="dialog" aria-label={tb('searchMenus')} data-menu-search="">
          <input autoFocus value={search} placeholder={tb('searchPlaceholder')} aria-label={tb('searchMenus')}
                 onChange={ev => setSearch(ev.target.value)}
                 onKeyDown={ev => {
                   if (ev.key === 'Escape') { ev.preventDefault(); setSearch(null); focusGrid() }
                   if (ev.key === 'Enter') { ev.preventDefault(); const hit = found.find(c => !c.item.disabled); if (hit) { setSearch(null); hit.item.onSelect() } }
                   if (ev.key === 'ArrowDown') { ev.preventDefault(); (ev.currentTarget.parentElement?.querySelector('button') as HTMLElement | null)?.focus() }
                 }}
                 onBlur={ev => { if (!ev.currentTarget.parentElement?.contains(ev.relatedTarget as Node)) setSearch(null) }} />
          {q && (found.length
            ? <ul role="listbox" aria-label={tb('searchMenus')}>
                {found.map(c => {
                  const dis = !!c.item.disabled
                  return (
                    <li key={c.label} role="none">
                      <button type="button" role="option" aria-selected={false} aria-disabled={dis || undefined} data-search-hit={c.label}
                              onClick={() => { if (dis) return; setSearch(null); c.item.onSelect() }}
                              onKeyDown={ev => {
                                const list = [...(ev.currentTarget.closest('ul')?.querySelectorAll('button') ?? [])] as HTMLElement[]
                                const i = list.indexOf(ev.currentTarget)
                                if (ev.key === 'ArrowDown') { ev.preventDefault(); list[i + 1]?.focus() }
                                if (ev.key === 'ArrowUp') { ev.preventDefault(); (list[i - 1] ?? ev.currentTarget.closest('.fx-mb-search')?.querySelector('input'))?.focus() }
                                if (ev.key === 'Escape') { ev.preventDefault(); setSearch(null); focusGrid() }
                              }}>
                        {c.label}{c.item.kbd && <kbd>{c.item.kbd}</kbd>}
                      </button>
                    </li>
                  )
                })}
              </ul>
            : <p className="fx-mb-none">{tb('noMatch', { q: search ?? '' })}</p>)}
        </div>
      )}
      {help && <ShortcutsDialog onClose={() => { setHelp(false); focusGrid() }} />}
    </div>
  )
}

/** Help › Keyboard shortcuts (US2). */
function ShortcutsDialog({ onClose }: { onClose(): void }) {
  const tb = useTranslations('sheets.toolbar2')
  const k = (s: string) => keyName(s)
  const rows: [string, string][] = [
    ['copy', `${k('Ctrl+C')} · ${k('Ctrl+X')} · ${k('Ctrl+V')}`], ['undo', `${k('Ctrl+Z')} · ${k('Ctrl+Y')}`], ['selectAll', k('Ctrl+A')],
    ['addArea', `${k('Ctrl+')}click · ${k('Ctrl+')}drag`], ['addMode', 'Shift+F8'], ['fillAll', k('Ctrl+Enter')], ['edit', 'F2 · Enter'], ['lineBreak', k('Alt+Enter')],
    ['bold', `${k('Ctrl+B')} · ${k('Ctrl+I')} · ${k('Ctrl+U')}`], ['strike', k('Ctrl+5')], ['formatCells', k('Ctrl+1')], ['currency', `${k('Ctrl+Shift+$')} · ${k('Ctrl+Shift+%')}`],
    ['pasteSpecial', k('Ctrl+Shift+V')], ['fill', `${k('Ctrl+D')} · ${k('Ctrl+R')}`], ['find', `${k('Ctrl+F')} · ${k('Ctrl+H')}`], ['filter', k('Ctrl+Shift+L')],
    ['comment', k('Ctrl+Alt+M')], ['sheets', `${k('Ctrl+')}PgUp · ${k('Ctrl+')}PgDn`], ['newSheet', 'Shift+F11'], ['menus', isMac() ? '⌥/' : 'Alt+/'],
  ]
  const ref = useRef<HTMLDivElement>(null)
  const close = useRef(onClose)
  close.current = onClose
  useEffect(() => {
    ref.current?.querySelector<HTMLElement>('button')?.focus()
    const k = (ev: KeyboardEvent) => { if (ev.key === 'Escape') { ev.preventDefault(); ev.stopPropagation(); close.current() } }
    document.addEventListener('keydown', k, true)
    return () => document.removeEventListener('keydown', k, true)
  }, [])
  return (
    <div className="fx-sh-scrim" onPointerDown={ev => { if (ev.target === ev.currentTarget) onClose() }}>
      <div className="fx-sh-dialog fx-sc-dialog" role="dialog" aria-modal="true" aria-labelledby="fx-sc-title" data-shortcuts="" ref={ref}
           onKeyDown={ev => { if (ev.key === 'Escape') { ev.preventDefault(); onClose() } }}>
        <h2 id="fx-sc-title">{tb('sc.title')}</h2>
        <table className="fx-sc-table">
          <tbody>{rows.map(([key, keys]) => <tr key={key}><td>{tb(`sc.${key}`)}</td><td><kbd dir="ltr">{keys}</kbd></td></tr>)}</tbody>
        </table>
        <div className="fx-sh-dialog-row"><button type="button" className="fx-sh-btn is-go" onClick={onClose}>{tb('close')}</button></div>
      </div>
    </div>
  )
}

/**
 * The toolbar's shortcuts (FR-003), for the workbook's key handler. True when
 * the key was a formatting shortcut and was sent.
 */
export function formatShortcut(e: KeyboardEvent | React.KeyboardEvent, target: FormatSource, state: FormatState | null, openFormatCells: () => void): boolean {
  const mod = e.ctrlKey || e.metaKey
  if (!mod || !state) return false
  const k = e.key.toLowerCase()
  const st = state.style ?? {}
  const send = (patch: StylePatch, label: string) => {
    if (state.readOnly) return
    sendFormat(target, { kind: 'patch', patch, label })
  }
  if (e.altKey && (k === 'm' || e.code === 'KeyM' || k === 'µ')) { askComment(); return true }
  if (e.altKey) return false
  if (!e.shiftKey && (k === 'b' || k === 'i')) { send({ [k]: st[k] ? false : true }, k); return true }
  if (!e.shiftKey && k === 'u') { send({ u: st.u && st.u !== 'none' ? 'none' : 'single' }, 'u'); return true }
  if (!e.shiftKey && (k === '5' || e.code === 'Digit5')) { send({ s: st.s ? false : true }, 's'); return true }
  if (!e.shiftKey && (k === '1' || e.code === 'Digit1')) { openFormatCells(); return true }
  if (e.shiftKey) {
    if (k === '$' || e.code === 'Digit4') { send({ num: { kind: 'currency', cur: st.num?.cur ?? 'EGP', dp: 2 } }, 'number'); return true }
    if (k === '%' || e.code === 'Digit5') { send({ num: { kind: 'percent', dp: 0 } }, 'number'); return true }
    if (k === '#' || e.code === 'Digit3') { send({ num: { kind: 'date', long: true } }, 'number'); return true }
    if (k === '!' || e.code === 'Digit1') { send({ num: { kind: 'number', dp: 2, sep: true } }, 'number'); return true }
  }
  return false
}
