'use client'

/**
 * The format toolbar (spec 015 FR-001–FR-003, contracts/ui.md §1, design:
 * Formatting): one row under the workbook toolbar in Excel's Home-tab order,
 * Font · Alignment · Number, then New comment. Every control shows the active
 * cell's state, has a label and a tooltip with its shortcut, and acts on the
 * selection through the format bus. Stage 2 and 3 controls arrive with their
 * stages. On a phone the same controls sit in a bottom sheet (FormatSheet).
 */
import { useState, type ReactNode } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import type { BorderSide, CellStyle, NumberFormat } from '@/types/index'
import { CURRENCIES } from '@/types/index'
import { DEFAULT_FONT, DEFAULT_SIZE, FONTS, FONT_SIZES, bumpDecimals, display, type BorderPreset, type StylePatch } from '@/lib/sheet-format'
import { PopMenu, type PopItem } from '../PopMenu'
import { askComment, sendFormat, type FormatSource, type FormatState, type MergeMode } from './bus'
import { ColorPicker } from './ColorPicker'
import { BorderPicker } from './BorderPicker'

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

type Open = { k: 'font' | 'size' | 'color' | 'fill' | 'borders' | 'rotate' | 'merge' | 'num' | 'cur'; el: HTMLElement } | null

export function FormatToolbar({ state, target, onFormatCells }: {
  state: FormatState | null
  target: FormatSource
  onFormatCells(): void
}) {
  const t = useTranslations('sheets.format')
  const tc = useTranslations('sheets.comments')
  const locale = useLocale()
  const a = useFormatActions(target, state)
  const st = a.st
  const [open, setOpen] = useState<Open>(null)
  const [line, setLine] = useState<BorderSide>(DEFAULT_LINE)
  const off = !state || !!state.readOnly
  const why = state?.readOnly ?? undefined

  const at = (el: HTMLElement) => {
    const r = el.getBoundingClientRect(), rtl = getComputedStyle(el).direction === 'rtl'
    return { x: rtl ? r.right : r.left, y: r.bottom }
  }
  const toggleOpen = (k: NonNullable<Open>['k'], el: HTMLElement) => setOpen(o => (o?.k === k ? null : { k, el }))

  const btn = (key: string, label: string, inner: ReactNode, onClick: (e: React.MouseEvent<HTMLButtonElement>) => void,
    opts: { pressed?: boolean; menu?: NonNullable<Open>['k']; kbd?: string; disabled?: string | null; cls?: string } = {}) => {
    const disabled = opts.disabled ?? (off ? why ?? '' : null)
    const tip = `${label}${opts.kbd ? ` (${keyName(opts.kbd)})` : ''}${disabled ? ` · ${disabled}` : ''}`
    return (
      <button type="button" key={key} className={`fx-fmt-b${opts.cls ? ` ${opts.cls}` : ''}`} data-fmt={key} aria-label={label} title={tip}
              aria-disabled={disabled !== null ? true : undefined}
              aria-pressed={opts.pressed}
              aria-haspopup={opts.menu ? (opts.menu === 'color' || opts.menu === 'fill' || opts.menu === 'borders' ? 'dialog' : 'menu') : undefined}
              aria-expanded={opts.menu ? open?.k === opts.menu : undefined}
              onClick={e => { if (disabled !== null) return; onClick(e) }}>
        {inner}{opts.menu && <span className="fx-fmt-car" aria-hidden="true">▾</span>}
      </button>
    )
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

  let menu: { items: PopItem[]; label: string; attr: string } | null = null
  if (open?.k === 'font') menu = { label: t('ctl.font'), attr: 'data-font-menu', items: FONTS.map(f => ({ key: f.name, label: f.name, checked: font === f.name, onSelect: () => a.patch({ font: f.name === DEFAULT_FONT ? null : f.name }, 'font') })) }
  if (open?.k === 'size') menu = { label: t('ctl.size'), attr: 'data-size-menu', items: FONT_SIZES.map(n => ({ key: String(n), label: String(n), checked: size === n, onSelect: () => a.patch({ size: n === DEFAULT_SIZE ? null : n }, 'size') })) }
  if (open?.k === 'rotate') menu = { label: t('ctl.rotate'), attr: 'data-rotate-menu', items: ([['none', null], ['ccw', 45], ['cw', -45], ['vertical', 'vertical'], ['up', 90], ['down', -90]] as const).map(([k, v]) => ({ key: k, label: t(`rotate.${k}`), checked: (st.rot ?? null) === v, onSelect: () => a.patch({ rot: v }, 'rotate') })) }
  if (open?.k === 'merge') menu = { label: t('ctl.merge'), attr: 'data-merge-menu', items: (['center', 'across', 'cells', 'unmerge'] as MergeMode[]).map(m => ({ key: m, label: t(`merge.${m}`), disabled: !!mergeOff || (m === 'unmerge' && !state?.merged && !state?.multi), why: m === 'center' ? mergeOff ?? undefined : undefined, onSelect: () => a.merge(m) })) }
  if (open?.k === 'num') menu = { label: t('ctl.numberFormat'), attr: 'data-num-menu', items: [
    ...NUM_MENU.map(n => { const sm = n.sample ? sample(n.num, n.sample) : ''; return { key: n.key, label: sm ? `${t(`num.${n.key}`)} · ${sm}` : t(`num.${n.key}`), checked: nk === n.key, onSelect: () => a.num(n.num) } }),
    { kind: 'sep', key: 's' },
    { key: 'more', label: t('num.more'), kbd: keyName('Ctrl+1'), onSelect: onFormatCells },
  ] }
  if (open?.k === 'cur') menu = { label: t('ctl.currency'), attr: 'data-cur-menu', items: CURRENCIES.map(c => ({ key: c, label: t(`cur.${c}`), checked: st.num?.cur === c && st.num.kind === 'currency', onSelect: () => a.num({ kind: 'currency', cur: c, dp: st.num?.dp ?? 2 }) })) }

  return (
    <div className="fx-fmt-bar" role="toolbar" aria-label={t('bar')} data-format-bar="">
      <div className="fx-fmt-g" role="group" aria-label={t('groups.font')}>
        {btn('font', t('ctl.font'), <span className="fx-fmt-sel is-font" style={{ fontFamily: FONTS.find(f => f.name === font)?.stack }}>{font}</span>, e => toggleOpen('font', e.currentTarget), { menu: 'font', cls: 'is-sel' })}
        {btn('size', t('ctl.size'), <span className="fx-fmt-sel is-size">{size}</span>, e => toggleOpen('size', e.currentTarget), { menu: 'size', cls: 'is-sel' })}
        {btn('b', t('ctl.bold'), <b>B</b>, () => a.toggle('b'), { pressed: !!st.b, kbd: 'Ctrl+B' })}
        {btn('i', t('ctl.italic'), <i>I</i>, () => a.toggle('i'), { pressed: !!st.i, kbd: 'Ctrl+I' })}
        {btn('u', t('ctl.underline'), <u>U</u>, () => a.underline(), { pressed: !!st.u && st.u !== 'none', kbd: 'Ctrl+U' })}
        {btn('s', t('ctl.strike'), <s>S</s>, () => a.toggle('s'), { pressed: !!st.s, kbd: 'Ctrl+5' })}
        {btn('color', t('ctl.textColor'), <><span className="fx-fmt-a">A</span><span className="fx-fmt-barline" style={{ background: st.color ?? '#C00000' }} /></>, e => toggleOpen('color', e.currentTarget), { menu: 'color' })}
        {btn('fill', t('ctl.fill'), <><Icon k="fill" /><span className="fx-fmt-barline" style={{ background: st.fill ?? '#FFC000' }} /></>, e => toggleOpen('fill', e.currentTarget), { menu: 'fill' })}
        {btn('borders', t('ctl.borders'), <Icon k="borders" />, e => toggleOpen('borders', e.currentTarget), { menu: 'borders' })}
      </div>
      <div className="fx-fmt-g" role="group" aria-label={t('groups.alignment')}>
        {btn('left', t('ctl.alignLeft'), <Icon k="left" />, () => a.align('left'), { pressed: st.ha === 'left' })}
        {btn('center', t('ctl.alignCenter'), <Icon k="center" />, () => a.align('center'), { pressed: st.ha === 'center' })}
        {btn('right', t('ctl.alignRight'), <Icon k="right" />, () => a.align('right'), { pressed: st.ha === 'right' })}
        {btn('top', t('ctl.alignTop'), <Icon k="top" />, () => a.valign('top'), { pressed: st.va === 'top' })}
        {btn('middle', t('ctl.alignMiddle'), <Icon k="middle" />, () => a.valign('middle'), { pressed: st.va === 'middle' })}
        {btn('bottom', t('ctl.alignBottom'), <Icon k="bottom" />, () => a.valign('bottom'), { pressed: !st.va || st.va === 'bottom' })}
        {btn('wrap', t('ctl.wrap'), <Icon k="wrap" />, () => a.toggle('wrap'), { pressed: !!st.wrap })}
        {btn('outdent', t('ctl.outdent'), <Icon k="outdent" />, () => a.indent(-1))}
        {btn('indent', t('ctl.indent'), <Icon k="indent" />, () => a.indent(1))}
        {btn('rotate', t('ctl.rotate'), <Icon k="rotate" />, e => toggleOpen('rotate', e.currentTarget), { menu: 'rotate' })}
        {btn('merge', t('ctl.merge'), <Icon k="merge" />, e => toggleOpen('merge', e.currentTarget), { menu: 'merge', pressed: !!state?.merged, disabled: off ? why ?? '' : null })}
      </div>
      <div className="fx-fmt-g" role="group" aria-label={t('groups.number')}>
        {btn('num', t('ctl.numberFormat'), <span className="fx-fmt-sel is-num">{t(`num.${nk}`)}</span>, e => toggleOpen('num', e.currentTarget), { menu: 'num', cls: 'is-sel' })}
        {btn('cur', t('ctl.currency'), <span className="fx-fmt-cur">{st.num?.kind === 'currency' ? st.num.cur ?? 'EGP' : 'EGP'}</span>, e => toggleOpen('cur', e.currentTarget), { menu: 'cur', kbd: 'Ctrl+Shift+$' })}
        {btn('pct', t('ctl.percent'), <Icon k="pct" />, () => a.num({ kind: 'percent', dp: 0 }), { pressed: st.num?.kind === 'percent', kbd: 'Ctrl+Shift+%' })}
        {btn('sep', t('ctl.comma'), <b className="fx-fmt-comma">,</b>, () => a.num({ kind: 'number', dp: 2, sep: true }), { pressed: st.num?.kind === 'number' && st.num.sep !== false })}
        {btn('decUp', t('ctl.decUp'), <span className="fx-fmt-dec">.0<small>→.00</small></span>, () => a.decimals(1))}
        {btn('decDn', t('ctl.decDown'), <span className="fx-fmt-dec">.00<small>→.0</small></span>, () => a.decimals(-1))}
        {btn('fmtCells', t('ctl.formatCells'), <Icon k="fmtCells" />, () => onFormatCells(), { kbd: 'Ctrl+1' })}
      </div>
      <div className="fx-fmt-g" role="group" aria-label={tc('title')}>
        {btn('comment', tc('new'), <><Icon k="comment" /><span aria-hidden="true">＋</span></>, () => a.comment(), { kbd: 'Ctrl+Alt+M', disabled: state ? null : '' })}
      </div>

      {menu && open && <PopMenu at={at(open.el)} label={menu.label} items={menu.items} attr={menu.attr} returnTo={open.el} onClose={() => setOpen(null)} />}
      {open && (open.k === 'color' || open.k === 'fill') && (
        <ColorPicker anchor={open.el} kind={open.k} current={(open.k === 'fill' ? st.fill : st.color) ?? null}
                     onPick={c => a.patch({ [open.k]: c }, open.k)} onClose={() => setOpen(null)} />
      )}
      {open?.k === 'borders' && (
        <BorderPicker anchor={open.el} line={line} onLine={setLine} onPick={p => a.borders(p, line)} onClose={() => setOpen(null)} />
      )}
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
