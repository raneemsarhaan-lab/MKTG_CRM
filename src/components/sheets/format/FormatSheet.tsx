'use client'

/**
 * Formatting on a phone (spec 015 R9, design: Phone 390): the Format button
 * opens this bottom sheet with tabs, Text · Fill · Borders · Align · Number,
 * with 44 px targets. The same commands as the desktop toolbar.
 */
import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { BORDER_PRESETS, FONTS, FONT_SIZES, DEFAULT_FONT, DEFAULT_SIZE, STANDARD_COLORS, THEME_COLORS } from '@/lib/sheet-format'
import { useFormatActions, DEFAULT_LINE, NUM_MENU, numKey } from './FormatToolbar'
import { PresetIcon } from './BorderPicker'
import type { FormatSource, FormatState } from './bus'

const TABS = ['text', 'fill', 'borders', 'align', 'number'] as const

export function FormatSheet({ state, target, onClose, onFormatCells }: { state: FormatState | null; target: FormatSource; onClose(): void; onFormatCells(): void }) {
  const t = useTranslations('sheets.format')
  const a = useFormatActions(target, state)
  const st = a.st
  const [tab, setTab] = useState<typeof TABS[number]>('text')
  const off = !state || !!state.readOnly
  const b = (key: string, label: string, inner: React.ReactNode, on: () => void, pressed?: boolean, wide?: boolean) => (
    <button key={key} type="button" className={`fx-fmt-b${wide ? ' is-wide' : ''}`} data-fmt={key} title={label} aria-pressed={pressed}
            aria-disabled={off || undefined} onClick={() => { if (!off) on() }}>{inner}{inner !== label && <span className="sr-only">{label}</span>}</button>
  )
  const swatch = (k: 'color' | 'fill', c: string) => (
    <button key={k + c} type="button" className={`fx-fmt-sw is-big${(k === 'fill' ? st.fill : st.color) === c ? ' is-cur' : ''}`} style={{ background: c }}
            aria-label={`${k === 'fill' ? t('ctl.fill') : t('ctl.textColor')} ${c}`} onClick={() => { if (!off) a.patch({ [k]: c }, k) }} />
  )
  return (
    <div className="fx-fmt-sheet" role="dialog" aria-label={t('bar')} data-format-sheet=""
         onKeyDown={e => { if (e.key === 'Escape') { e.stopPropagation(); onClose() } }}>
      <span className="fx-fmt-grab" aria-hidden="true" />
      {off && state?.readOnly && <p className="fx-fmt-why">{state.readOnly}</p>}
      <div className="fx-fmt-stabs" role="tablist">
        {TABS.map(x => <button key={x} type="button" role="tab" aria-selected={tab === x} onClick={() => setTab(x)}>{t(`phone.tabs.${x}`)}</button>)}
      </div>
      <div className="fx-fmt-sbody">
        {tab === 'text' && (
          <>
            <div className="fx-fmt-row">
              {b('b', t('ctl.bold'), <b>B</b>, () => a.toggle('b'), !!st.b)}
              {b('i', t('ctl.italic'), <i>I</i>, () => a.toggle('i'), !!st.i)}
              {b('u', t('ctl.underline'), <u>U</u>, () => a.underline(), !!st.u && st.u !== 'none')}
              {b('s', t('ctl.strike'), <s>S</s>, () => a.toggle('s'), !!st.s)}
            </div>
            <div className="fx-fmt-row">
              <label className="fx-fmt-pick"><span>{t('ctl.font')}</span>
                <select value={st.font ?? DEFAULT_FONT} disabled={off} onChange={e => a.patch({ font: e.target.value === DEFAULT_FONT ? null : e.target.value }, 'font')}>
                  {FONTS.map(f => <option key={f.name} value={f.name}>{f.name}</option>)}
                </select></label>
              <label className="fx-fmt-pick"><span>{t('ctl.size')}</span>
                <select value={st.size ?? DEFAULT_SIZE} disabled={off} onChange={e => { const n = Number(e.target.value); a.patch({ size: n === DEFAULT_SIZE ? null : n }, 'size') }}>
                  {FONT_SIZES.map(n => <option key={n} value={n}>{n}</option>)}
                </select></label>
            </div>
            <span className="fx-fmt-cap">{t('ctl.textColor')}</span>
            <div className="fx-fmt-swrow">{b('auto', t('color.auto'), t('color.auto'), () => a.patch({ color: null }, 'color'), !st.color, true)}{STANDARD_COLORS.map(c => swatch('color', c))}</div>
          </>
        )}
        {tab === 'fill' && (
          <>
            {b('nofill', t('color.noFill'), t('color.noFill'), () => a.patch({ fill: null }, 'fill'), !st.fill, true)}
            <div className="fx-fmt-swrow">{[...THEME_COLORS, ...STANDARD_COLORS].map(c => swatch('fill', c))}</div>
          </>
        )}
        {tab === 'borders' && (
          <div className="fx-fmt-row is-wrap">
            {BORDER_PRESETS.map(p => b(`border-${p}`, t(`border.presets.${p}`), <PresetIcon preset={p} />, () => a.borders(p, DEFAULT_LINE)))}
          </div>
        )}
        {tab === 'align' && (
          <div className="fx-fmt-row is-wrap">
            {(['left', 'center', 'right'] as const).map(x => b(x, t(`ctl.align${x[0].toUpperCase()}${x.slice(1)}`), t(`fc.h.${x}`), () => a.align(x), st.ha === x, true))}
            {(['top', 'middle', 'bottom'] as const).map(x => b(x, t(`ctl.align${x[0].toUpperCase()}${x.slice(1)}`), t(`fc.v.${x}`), () => a.valign(x), (st.va ?? 'bottom') === x, true))}
            {b('wrap', t('ctl.wrap'), t('ctl.wrap'), () => a.toggle('wrap'), !!st.wrap, true)}
            {!state?.mergeOff && b('merge', t('merge.center'), t('merge.center'), () => a.merge(state?.merged ? 'unmerge' : 'center'), !!state?.merged, true)}
          </div>
        )}
        {tab === 'number' && (
          <div className="fx-fmt-row is-wrap">
            {NUM_MENU.filter(n => n.key !== 'accounting' && n.key !== 'scientific').map(n => b(`num-${n.key}`, t(`num.${n.key}`), t(`num.${n.key}`), () => a.num(n.num), numKey(st.num) === n.key, true))}
            {b('decUp', t('ctl.decUp'), '.0→.00', () => a.decimals(1), undefined, true)}
            {b('decDn', t('ctl.decDown'), '.00→.0', () => a.decimals(-1), undefined, true)}
            {b('fmtCells', t('ctl.formatCells'), t('ctl.formatCells'), onFormatCells, undefined, true)}
          </div>
        )}
      </div>
      <button type="button" className="fx-fmt-done" onClick={onClose}>{t('phone.done')}</button>
    </div>
  )
}
