'use client'

/**
 * Format Cells (Ctrl/Cmd+1; spec 015 FR-020–FR-022, contracts/ui.md §2,
 * design: Format Cells): every option in one dialog, Number · Alignment ·
 * Font · Border · Fill, with a live preview of the active cell. OK sends the
 * difference from the cell's look as one change, so one undo step.
 */
import { useId, useState } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import type { BorderSide, CellStyle, NumberFormat } from '@/types/index'
import { CURRENCIES } from '@/types/index'
import { DEFAULT_FONT, DEFAULT_SIZE, FONTS, FONT_SIZES, STANDARD_COLORS, THEME_COLORS, diffStyle, display, showsRed, toCss, validateNum, type BorderPreset } from '@/lib/sheet-format'
import { Modal } from '../Dialogs'
import { sendFormat, type FormatSource, type FormatState } from './bus'
import { DEFAULT_LINE, numKey } from './FormatToolbar'
import { PresetIcon } from './BorderPicker'

type Tab = 'number' | 'alignment' | 'font' | 'border' | 'fill'
const TABS: Tab[] = ['number', 'alignment', 'font', 'border', 'fill']
const CATS = ['general', 'number', 'currency', 'accounting', 'shortDate', 'time', 'percent', 'scientific', 'text', 'custom'] as const
const NEG: NonNullable<NumberFormat['neg']>[] = ['minus', 'red', 'paren', 'paren-red']
const DATE_TYPES: NumberFormat[] = [{ kind: 'date' }, { kind: 'date', long: true }, { kind: 'date', pattern: 'dd/mm/yyyy' }, { kind: 'date', pattern: 'ddd d mmm' }, { kind: 'date', pattern: 'd mmmm yyyy' }]
const LINES: BorderSide['w'][] = ['thin', 'medium', 'thick', 'dashed', 'dotted', 'double']

/** An id from a label (Arabic labels have spaces, which would split aria-labelledby). */
const idOf = (s: string) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7).toString(36)

function catNum(cat: typeof CATS[number], prev: NumberFormat | undefined): NumberFormat | undefined {
  const dp = prev?.dp ?? 2
  switch (cat) {
    case 'general': return undefined
    case 'number': return { kind: 'number', dp, sep: prev?.sep ?? true }
    case 'currency': return { kind: 'currency', dp, cur: prev?.cur ?? 'EGP' }
    case 'accounting': return { kind: 'accounting', dp, cur: prev?.cur ?? 'EGP', neg: 'paren' }
    case 'shortDate': return { kind: 'date', long: true }
    case 'time': return { kind: 'time' }
    case 'percent': return { kind: 'percent', dp: prev?.kind === 'percent' ? dp : 0 }
    case 'scientific': return { kind: 'scientific', dp }
    case 'text': return { kind: 'text' }
    case 'custom': return { kind: 'date', pattern: prev?.pattern ?? 'ddd d mmm yyyy' }
  }
}

export function FormatCellsDialog({ state, target, onClose }: { state: FormatState; target: FormatSource; onClose(): void }) {
  const t = useTranslations('sheets.format')
  const locale = useLocale()
  const uid = useId()
  const [tab, setTab] = useState<Tab>('number')
  const [d, setD] = useState<CellStyle>(() => ({ ...(state.style ?? {}) }))
  const [preset, setPreset] = useState<BorderPreset | null>(null)
  const [line, setLine] = useState<BorderSide>(DEFAULT_LINE)
  const set = (patch: Partial<CellStyle>) => setD(x => { const n = { ...x, ...patch } as Record<string, unknown>; for (const k of Object.keys(patch)) if (n[k] === undefined || n[k] === null) delete n[k]; return n as CellStyle })
  const setNum = (num: NumberFormat | undefined) => set({ num })

  const cat = d.num?.pattern ? 'custom' : d.num?.kind === 'date' ? 'shortDate' : (numKey(d.num) === 'longDate' ? 'shortDate' : numKey(d.num)) as typeof CATS[number]
  const raw = state.value || (d.num?.kind === 'date' ? '2026-11-16' : d.num?.kind === 'time' ? '14:30' : '-1234.5')
  const shown = display(raw, d.num, locale)
  const patternOk = !d.num?.pattern || !!validateNum(d.num)?.pattern

  function ok() {
    const patch = diffStyle(state.style, d)
    if (Object.keys(patch).length) sendFormat(target, { kind: 'patch', patch, label: 'formatCells' })
    if (preset) sendFormat(target, { kind: 'borders', preset, line })
    onClose()
  }
  const fld = (label: string, input: React.ReactNode) => <label className="fx-fc-fld"><span>{label}</span>{input}</label>
  const lb = <T extends string | number>(label: string, list: readonly T[], cur: T, name: (x: T) => string, pick: (x: T) => void, style?: (x: T) => React.CSSProperties | undefined) => (
    <div className="fx-fc-fld"><span id={`${uid}-${idOf(label)}`}>{label}</span>
      <div className="fx-fc-lb" role="listbox" aria-labelledby={`${uid}-${idOf(label)}`}>
        {list.map(x => <button key={String(x)} type="button" role="option" aria-selected={cur === x} style={style?.(x)} onClick={() => pick(x)}>{name(x)}</button>)}
      </div>
    </div>
  )

  return (
    <Modal title={t('fc.titleAt', { cell: state.cell })} onCancel={onClose} attr="data-format-dialog">
      <div className="fx-fc">
        <div className="fx-fc-tabs" role="tablist">
          {TABS.map(x => <button key={x} type="button" role="tab" aria-selected={tab === x} data-fc-tab={x} onClick={() => setTab(x)}>{t(`fc.tabs.${x}`)}</button>)}
        </div>
        <div className="fx-fc-body" role="tabpanel">
          {tab === 'number' && (
            <div className="fx-fc-two">
              {lb(t('fc.category'), CATS, cat, c => (c === 'shortDate' ? t('fc.date') : t(`num.${c}`)), c => setNum(catNum(c, d.num)))}
              <div className="fx-fc-stack">
                <div className="fx-fc-sample"><small>{t('fc.sample')}</small>
                  <div className="fx-fc-pv" data-fc-sample="" style={{ ...toCss({ ...d, num: undefined, bt: undefined, bb: undefined, bl: undefined, br: undefined }).cell, ...(showsRed(raw, d.num) ? { color: '#C00000' } : {}) }}>{shown}</div>
                </div>
                {d.num && ['number', 'currency', 'accounting', 'percent', 'scientific'].includes(d.num.kind) && (
                  <div className="fx-fc-row">
                    {fld(t('fc.decimals'), <input type="number" min={0} max={10} value={d.num.dp ?? 2} data-fc-dp="" onChange={e => setNum({ ...d.num!, dp: Math.max(0, Math.min(10, Number(e.target.value) || 0)) })} />)}
                    {(d.num.kind === 'currency' || d.num.kind === 'accounting') && fld(t('fc.symbol'),
                      <select value={d.num.cur ?? 'EGP'} data-fc-cur="" onChange={e => setNum({ ...d.num!, cur: e.target.value as NumberFormat['cur'] })}>
                        {CURRENCIES.map(c => <option key={c} value={c}>{t(`cur.${c}`)}</option>)}
                      </select>)}
                  </div>
                )}
                {d.num?.kind === 'number' && (
                  <label className="fx-fc-chk"><input type="checkbox" checked={d.num.sep !== false} onChange={e => setNum({ ...d.num!, sep: e.target.checked })} />{t('fc.thousands')}</label>
                )}
                {d.num && (d.num.kind === 'number' || d.num.kind === 'currency') && lb(t('fc.negative'), NEG, d.num.neg ?? 'minus', n => display('-1234.1', { ...d.num!, neg: n }, locale), n => setNum({ ...d.num!, neg: n }), n => (n.includes('red') ? { color: '#C00000' } : undefined))}
                {d.num?.kind === 'date' && !d.num.pattern && lb(t('fc.type'), DATE_TYPES.map((_, i) => i), DATE_TYPES.findIndex(x => JSON.stringify(x) === JSON.stringify({ kind: 'date', ...(d.num!.long ? { long: true } : {}) })), i => display('2026-11-16', DATE_TYPES[i], locale), i => setNum(DATE_TYPES[i]))}
                {cat === 'custom' && (
                  <div className="fx-fc-fld">
                    {fld(t('fc.pattern'), <input type="text" value={d.num?.pattern ?? ''} data-fc-pattern="" aria-invalid={!patternOk || undefined} dir="ltr"
                                                 onChange={e => setNum({ kind: 'date', pattern: e.target.value })} />)}
                    <small className={patternOk ? 'fx-fc-hint' : 'fx-fc-bad'} role={patternOk ? undefined : 'alert'}>{patternOk ? t('fc.patternHint') : t('fc.patternBad')}</small>
                  </div>
                )}
                <p className="fx-fc-note">{t('fc.numNote')}</p>
              </div>
            </div>
          )}
          {tab === 'alignment' && (
            <div className="fx-fc-stack">
              <div className="fx-fc-row">
                {fld(t('fc.horizontal'), <select value={d.ha ?? 'general'} data-fc-ha="" onChange={e => set({ ha: e.target.value === 'general' ? undefined : e.target.value as CellStyle['ha'] })}>
                  {(['general', 'left', 'center', 'right', 'justify'] as const).map(x => <option key={x} value={x}>{t(`fc.h.${x}`)}</option>)}</select>)}
                {fld(t('fc.vertical'), <select value={d.va ?? 'bottom'} data-fc-va="" onChange={e => set({ va: e.target.value as CellStyle['va'] })}>
                  {(['top', 'middle', 'bottom'] as const).map(x => <option key={x} value={x}>{t(`fc.v.${x}`)}</option>)}</select>)}
              </div>
              <div className="fx-fc-row">
                {fld(t('fc.indent'), <input type="number" min={0} max={15} value={d.indent ?? 0} onChange={e => set({ indent: Math.max(0, Math.min(15, Number(e.target.value) || 0)) || undefined })} />)}
                {fld(`${t('fc.orientation')} (${t('fc.degrees')})`, <input type="number" min={-90} max={90} value={typeof d.rot === 'number' ? d.rot : 0} onChange={e => set({ rot: Math.max(-90, Math.min(90, Number(e.target.value) || 0)) || undefined })} />)}
              </div>
              <label className="fx-fc-chk"><input type="checkbox" checked={!!d.wrap} data-fc-wrap="" onChange={e => set({ wrap: e.target.checked ? true : undefined })} />{t('fc.wrap')}</label>
              <div className="fx-fc-sample"><small>{t('fc.preview')}</small>
                <div className="fx-fc-pv is-tall" style={toCss({ ...d, num: undefined, bt: undefined, bb: undefined, bl: undefined, br: undefined }).cell}>
                  <span style={toCss(d).text ?? undefined}>{shown}</span>
                </div>
              </div>
            </div>
          )}
          {tab === 'font' && (
            <div className="fx-fc-stack">
              <div className="fx-fc-three">
                {lb(t('fc.font'), FONTS.map(f => f.name), d.font ?? DEFAULT_FONT, x => x, x => set({ font: x === DEFAULT_FONT ? undefined : x }), x => ({ fontFamily: FONTS.find(f => f.name === x)?.stack }))}
                {lb(t('fc.style'), [0, 1, 2, 3], (d.b ? 2 : 0) + (d.i ? 1 : 0), i => t(`fc.styles.${['regular', 'italic', 'bold', 'boldItalic'][i]}`), i => set({ b: i >= 2 ? true : (state.style?.b ? false : undefined), i: i % 2 ? true : (state.style?.i ? false : undefined) }))}
                {lb(t('fc.size'), FONT_SIZES, d.size ?? DEFAULT_SIZE, x => String(x), x => set({ size: x === DEFAULT_SIZE ? undefined : x }))}
              </div>
              <div className="fx-fc-row">
                {fld(t('fc.underline'), <select value={d.u && d.u !== 'none' ? d.u : ''} onChange={e => set({ u: (e.target.value || (state.style?.u ? 'none' : undefined)) as CellStyle['u'] })}>
                  <option value="">{t('fc.ul.none')}</option><option value="single">{t('fc.ul.single')}</option><option value="double">{t('fc.ul.double')}</option></select>)}
                {fld(t('fc.colour'), <input type="color" value={d.color ?? '#14131A'} onChange={e => set({ color: e.target.value.toUpperCase() })} />)}
              </div>
              <label className="fx-fc-chk"><input type="checkbox" checked={!!d.s} onChange={e => set({ s: e.target.checked ? true : undefined })} />{t('fc.strike')}</label>
              <div className="fx-fc-sample"><small>{t('fc.preview')}</small>
                <div className="fx-fc-pv is-center" style={toCss({ ...d, num: undefined, fill: undefined, ha: undefined, bt: undefined, bb: undefined, bl: undefined, br: undefined }).cell}>AaBbYyZz · أبجد هوز</div>
              </div>
            </div>
          )}
          {tab === 'border' && (
            <div className="fx-fc-two">
              <div className="fx-fc-stack">
                <span className="fx-fc-cap">{t('fc.presets')}</span>
                <div className="fx-fc-presets">
                  {(['none', 'outside', 'inside', 'all'] as BorderPreset[]).map(p => (
                    <button key={p} type="button" aria-pressed={preset === p} data-fc-preset={p} onClick={() => setPreset(p)}>
                      <PresetIcon preset={p} />{p === 'none' ? t('fc.none') : p === 'outside' ? t('fc.outline') : p === 'inside' ? t('fc.inside') : t('border.presets.all')}
                    </button>
                  ))}
                </div>
                <span className="fx-fc-cap">{t('fc.sideHint')}</span>
                <div className="fx-fc-bbox" style={toCss({ bt: d.bt, bb: d.bb, bl: d.bl, br: d.br }).border ?? undefined}>
                  {(['bt', 'bb', 'bl', 'br'] as const).map(k => (
                    <button key={k} type="button" className={`is-${k}`} aria-pressed={!!d[k]} aria-label={t(`border.presets.${{ bt: 'top', bb: 'bottom', bl: 'left', br: 'right' }[k]}`)}
                            onClick={() => set({ [k]: d[k] ? undefined : line })} />
                  ))}
                  <span>{state.value || 'Aa'}</span>
                </div>
              </div>
              <div className="fx-fc-stack">
                <span className="fx-fc-cap">{t('border.style')}</span>
                <div className="fx-fc-lines">
                  {LINES.map(w => (
                    <button key={w} type="button" aria-pressed={line.w === w} onClick={() => setLine({ ...line, w })}>
                      <i style={{ borderTop: `${{ thin: 1, medium: 2, thick: 3, dashed: 1, dotted: 1, double: 3 }[w]}px ${{ thin: 'solid', medium: 'solid', thick: 'solid', dashed: 'dashed', dotted: 'dotted', double: 'double' }[w]} currentColor` }} />{t(`border.lines.${w}`)}
                    </button>
                  ))}
                </div>
                {fld(t('border.colour'), <input type="color" value={line.c} onChange={e => setLine({ ...line, c: e.target.value.toUpperCase() })} />)}
              </div>
            </div>
          )}
          {tab === 'fill' && (
            <div className="fx-fc-stack">
              <span className="fx-fc-cap">{t('fc.bg')}</span>
              <button type="button" className="fx-fc-nofill" aria-pressed={!d.fill} onClick={() => set({ fill: undefined })}>{t('color.noFill')}</button>
              <div className="fx-fmt-swg">
                {[...THEME_COLORS, ...STANDARD_COLORS].map(c => (
                  <button key={c} type="button" className={`fx-fmt-sw${d.fill === c ? ' is-cur' : ''}`} style={{ background: c }} aria-label={c} aria-pressed={d.fill === c} onClick={() => set({ fill: c })} />
                ))}
              </div>
              {fld(t('color.more'), <input type="color" value={d.fill ?? '#FFFFFF'} onChange={e => set({ fill: e.target.value.toUpperCase() })} />)}
              <div className="fx-fc-sample"><small>{t('fc.sample')}</small><div className="fx-fc-pv" style={{ background: d.fill ?? 'transparent', height: 44 }} /></div>
            </div>
          )}
        </div>
        <div className="fx-sh-dialog-row">
          <button type="button" onClick={onClose}>{t('fc.cancel')}</button>
          <button type="button" className="is-go" data-ok="" disabled={!patternOk || !!state.readOnly} onClick={ok}>{t('fc.ok')}</button>
        </div>
      </div>
    </Modal>
  )
}
