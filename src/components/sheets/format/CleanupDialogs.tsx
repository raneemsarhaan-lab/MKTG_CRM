'use client'

/**
 * Spec 020 stage B dialogs (approved design power-tips-b): Remove
 * Duplicates, Text to Columns, Create Table, Insert Slicers and Advanced
 * Filter. Excel's options and wording, drawn as the app's own dialogs.
 */
import { useMemo, useState } from 'react'
import { useTranslations } from 'next-intl'
import { Modal } from '../Dialogs'
import { splitPlan, type SplitDelims, type SplitOpts } from '@/lib/sheet-clean'
import type { SplitFormat } from './bus'

const Row = ({ children }: { children: React.ReactNode }) => <div className="fx-sh-dialog-row">{children}</div>

/** Data › Clean up › Remove Duplicates: the columns that make a row a duplicate. */
export function RemoveDuplicatesDialog({ cols, header: header0, range, onOk, onCancel }: {
  cols: { key: string; name: string }[]; header: boolean; range: string; onOk(cols: string[], header: boolean): void; onCancel(): void
}) {
  const t = useTranslations('sheets.tips')
  const tu = useTranslations('sheets.ux')
  const [header, setHeader] = useState(header0)
  const [on, setOn] = useState<Set<string>>(() => new Set(cols.map(c => c.key)))
  const flip = (k: string) => setOn(s => { const n = new Set(s); if (n.has(k)) n.delete(k); else n.add(k); return n })
  return (
    <Modal title={t('clean.dedupe')} body={t('clean.dedupeSub', { range })} onCancel={onCancel} attr="data-dedupe-dialog">
      <div className="fx-tip-btns">
        <button type="button" data-dedupe-all="" onClick={() => setOn(new Set(cols.map(c => c.key)))}>{t('clean.selectAll')}</button>
        <button type="button" data-dedupe-none="" onClick={() => setOn(new Set())}>{t('clean.unselectAll')}</button>
        <label className="fx-sh-check"><input type="checkbox" checked={header} data-dedupe-header="" onChange={e => setHeader(e.target.checked)} />{t('clean.hasHeaders')}</label>
      </div>
      <div className="fx-sh-listbox is-checks" role="group" aria-label={t('clean.columns')}>
        {cols.map(c => (
          <label key={c.key} className="fx-sh-check"><input type="checkbox" checked={on.has(c.key)} data-dedupe-col={c.name} onChange={() => flip(c.key)} />{c.name}</label>
        ))}
      </div>
      <Row>
        <button type="button" onClick={onCancel}>{t('cancel')}</button>
        <button type="button" className="is-lime" data-ok="" disabled={!on.size} onClick={() => onOk(cols.filter(c => on.has(c.key)).map(c => c.key), header)}>{tu('ok.dedupe')}</button>
      </Row>
    </Modal>
  )
}

/** Data › Text to Columns: Excel's three steps, with a live preview. */
export function TextToColumnsDialog({ values, range, onOk, onCancel }: { values: string[]; range: string; onOk(opts: SplitOpts, formats: SplitFormat[]): void; onCancel(): void }) {
  const t = useTranslations('sheets.tips')
  const [step, setStep] = useState(1)
  const [mode, setMode] = useState<'delim' | 'fixed'>('delim')
  const [delims, setDelims] = useState<SplitDelims>({ comma: true })
  const [consecutive, setConsecutive] = useState(false)
  const [qualifier, setQualifier] = useState<'"' | "'" | ''>('"')
  const [breaksText, setBreaksText] = useState('10')
  const breaks = breaksText.split(/[\s,،]+/).map(Number).filter(n => Number.isInteger(n) && n > 0)
  const opts: SplitOpts = mode === 'delim' ? { mode, delims, consecutive, qualifier } : { mode, breaks }
  const plan = useMemo(() => splitPlan(values.slice(0, 8), opts), [values, JSON.stringify(opts)]) // eslint-disable-line react-hooks/exhaustive-deps
  const [formats, setFormats] = useState<SplitFormat[]>([])
  const fmtOf = (i: number) => formats[i] ?? 'general'
  const setFmt = (i: number, f: SplitFormat) => setFormats(x => { const n = [...x]; while (n.length <= i) n.push('general'); n[i] = f; return n })
  const [col, setCol] = useState(0)
  const steps = ['type', 'delims', 'format'] as const
  const box = (k: keyof SplitDelims, label: string) => (
    <label className="fx-sh-check"><input type="checkbox" checked={!!delims[k]} data-split-delim={k}
                                         onChange={e => setDelims(d => ({ ...d, [k]: k === 'other' ? (e.target.checked ? '-' : undefined) : e.target.checked }))} />{label}</label>
  )
  return (
    <Modal title={t('clean.split')} body={t('clean.splitSub', { step, range })} onCancel={onCancel} attr="data-split-dialog">
      <ol className="fx-tip-steps" aria-label={t('clean.split')}>
        {steps.map((s, i) => <li key={s} aria-current={step === i + 1 ? 'step' : undefined} className={step === i + 1 ? 'is-on' : step > i + 1 ? 'is-done' : ''}><b>{i + 1}</b>{t(`clean.steps.${s}`)}</li>)}
      </ol>
      {step === 1 && (
        <div className="fx-tip-col" role="radiogroup" aria-label={t('clean.steps.type')}>
          <label className="fx-sh-check"><input type="radio" name="tt" checked={mode === 'delim'} data-split-mode="delim" onChange={() => setMode('delim')} />{t('clean.delimited')}</label>
          <small className="fx-fc-hint is-sub">{t('clean.delimitedHint')}</small>
          <label className="fx-sh-check"><input type="radio" name="tt" checked={mode === 'fixed'} data-split-mode="fixed" onChange={() => setMode('fixed')} />{t('clean.fixed')}</label>
          <small className="fx-fc-hint is-sub">{t('clean.fixedHint')}</small>
        </div>
      )}
      {step === 2 && mode === 'delim' && (
        <div className="fx-tip-grid2">
          <fieldset className="fx-tip-set"><legend className="fx-tip-cap">{t('clean.delims')}</legend>
            <div className="fx-tip-grid2">
              {box('tab', t('clean.tab'))}{box('semicolon', t('clean.semicolon'))}
              {box('comma', t('clean.comma'))}{box('space', t('clean.space'))}
              <span className="fx-tip-other">{box('other', t('clean.other'))}
                <input type="text" maxLength={1} value={typeof delims.other === 'string' ? delims.other : ''} aria-label={t('clean.other')} data-split-other="" dir="ltr" name="split-other" autoComplete="off" spellCheck={false}
                       onChange={e => setDelims(d => ({ ...d, other: e.target.value || undefined }))} /></span>
            </div>
          </fieldset>
          <div className="fx-tip-col">
            <label className="fx-sh-check"><input type="checkbox" checked={consecutive} onChange={e => setConsecutive(e.target.checked)} />{t('clean.consecutive')}</label>
            <label className="fx-sh-field"><span>{t('clean.qualifier')}</span>
              <select value={qualifier} onChange={e => setQualifier(e.target.value as typeof qualifier)}>
                <option value={'"'}>&quot;</option><option value="'">&apos;</option><option value="">{t('clean.none2')}</option>
              </select></label>
          </div>
        </div>
      )}
      {step === 2 && mode === 'fixed' && (
        <label className="fx-sh-field"><span>{t('clean.breaks')}</span>
          <input type="text" value={breaksText} data-split-breaks="" dir="ltr" name="split-breaks" autoComplete="off" spellCheck={false} onChange={e => setBreaksText(e.target.value)} />
          <small className="fx-fc-hint">{t('clean.breaksHint')}</small></label>
      )}
      {step === 3 && (
        <div className="fx-tip-grid2">
          <div className="fx-tip-col" role="radiogroup" aria-label={t('clean.colFormat')}>
            <span className="fx-tip-cap">{t('clean.colFormat')} · {t('clean.colN', { n: col + 1 })}</span>
            {(['general', 'text', 'date', 'skip'] as SplitFormat[]).map(f => (
              <label key={f} className="fx-sh-check"><input type="radio" name="cf" checked={fmtOf(col) === f} data-split-format={f} onChange={() => setFmt(col, f)} />{t(`clean.fmt.${f}`)}</label>
            ))}
          </div>
          <small className="fx-fc-hint">{t('clean.colFormatHint')}</small>
        </div>
      )}
      <div className="fx-tip-cap">{t('clean.preview')}</div>
      <div className="fx-tip-preview" data-split-preview="" role="table" aria-label={t('clean.preview')}>
        <div role="row" className="is-head">
          {Array.from({ length: plan.width }, (_, i) => (
            <button key={i} type="button" role="columnheader" className={step === 3 && col === i ? 'is-on' : ''} disabled={step !== 3} onClick={() => setCol(i)}>
              {fmtOf(i) === 'skip' ? t('clean.fmt.skip') : t('clean.colN', { n: i + 1 })}</button>
          ))}
        </div>
        {plan.parts.map((r, ri) => (
          <div key={ri} role="row">{Array.from({ length: plan.width }, (_, i) => <span key={i} role="cell" className={fmtOf(i) === 'skip' ? 'is-skip' : ''}>{r[i] ?? ''}</span>)}</div>
        ))}
      </div>
      <Row>
        <button type="button" onClick={onCancel}>{t('cancel')}</button>
        <button type="button" disabled={step === 1} data-split-back="" onClick={() => setStep(s => s - 1)}>‹ {t('clean.back')}</button>
        <button type="button" disabled={step === 3} data-split-next="" onClick={() => setStep(s => s + 1)}>{t('clean.next')} ›</button>
        <button type="button" className="is-lime" data-ok="" onClick={() => onOk(opts, Array.from({ length: plan.width }, (_, i) => fmtOf(i)))}>{t('clean.finish')}</button>
      </Row>
    </Modal>
  )
}

/** Ctrl+T: Create Table, the block around the cell. */
export function CreateTableDialog({ range, onOk, onCancel }: { range: string; onOk(ref: string, header: boolean): void; onCancel(): void }) {
  const t = useTranslations('sheets.tips')
  const tu = useTranslations('sheets.ux')
  const [ref, setRef] = useState(`=$${range.replace(/([A-Z]+)(\d+)/g, '$1$$$2').replace(':', ':$')}`)
  const [header, setHeader] = useState(true)
  return (
    <Modal title={t('table.create')} onCancel={onCancel} attr="data-create-table">
      <label className="fx-sh-field"><span>{t('table.where')}</span>
        <input type="text" value={ref} dir="ltr" data-table-ref="" name="table-range" autoComplete="off" spellCheck={false} translate="no" onChange={e => setRef(e.target.value)} /></label>
      <label className="fx-sh-check"><input type="checkbox" checked={header} data-table-header="" onChange={e => setHeader(e.target.checked)} />{t('table.hasHeaders')}</label>
      <Row>
        <button type="button" onClick={onCancel}>{t('cancel')}</button>
        <button type="button" className="is-lime" data-ok="" disabled={!ref.trim()} onClick={() => onOk(ref.replace(/\$/g, '').replace(/^=/, ''), header)}>{tu('ok.createTable')}</button>
      </Row>
    </Modal>
  )
}

/** Table › Insert Slicer: a box of buttons for each column picked. */
export function InsertSlicersDialog({ cols, onOk, onCancel }: { cols: { key: string; name: string }[]; onOk(cols: string[]): void; onCancel(): void }) {
  const t = useTranslations('sheets.tips')
  const tu = useTranslations('sheets.ux')
  const [on, setOn] = useState<Set<string>>(() => new Set())
  return (
    <Modal title={t('table.slicers')} body={t('table.slicersSub')} onCancel={onCancel} attr="data-insert-slicers">
      <div className="fx-sh-listbox is-checks" role="group" aria-label={t('table.slicers')}>
        {cols.map(c => (
          <label key={c.key} className="fx-sh-check"><input type="checkbox" checked={on.has(c.key)} data-slicer-col={c.name}
                                                            onChange={() => setOn(s => { const n = new Set(s); if (n.has(c.key)) n.delete(c.key); else n.add(c.key); return n })} />{c.name}</label>
        ))}
      </div>
      <Row>
        <button type="button" onClick={onCancel}>{t('cancel')}</button>
        <button type="button" className="is-lime" data-ok="" disabled={!on.size} onClick={() => onOk(cols.filter(c => on.has(c.key)).map(c => c.key))}>{tu('ok.insert')}</button>
      </Row>
    </Modal>
  )
}

/** Data › Advanced Filter: Excel's dialog over a criteria range (no formulas). */
export function AdvancedFilterDialog({ range, active, onOk, onClear, onCancel }: {
  range: string; active: boolean
  onOk(v: { list: string; criteria: string; copy: 'none' | 'sheet' | 'cell'; to?: string; unique: boolean }): void
  onClear(): void; onCancel(): void
}) {
  const t = useTranslations('sheets.tips')
  const tu = useTranslations('sheets.ux')
  const [action, setAction] = useState<'inPlace' | 'copy'>('inPlace')
  const [list, setList] = useState(range)
  const [criteria, setCriteria] = useState('')
  const [dest, setDest] = useState<'sheet' | 'cell'>('sheet')
  const [to, setTo] = useState('')
  const [unique, setUnique] = useState(false)
  const ok = !!list.trim() && !!criteria.trim() && (action === 'inPlace' || dest === 'sheet' || !!to.trim())
  const strip = (s: string) => s.replace(/\$/g, '').replace(/^=/, '').trim()
  return (
    <Modal title={t('adv.title')} body={t('adv.sub')} onCancel={onCancel} attr="data-advanced-filter">
      <div className="fx-tip-cap">{t('adv.action')}</div>
      <div className="fx-tip-col" role="radiogroup" aria-label={t('adv.action')}>
        <label className="fx-sh-check"><input type="radio" name="af" checked={action === 'inPlace'} data-adv-action="inPlace" onChange={() => setAction('inPlace')} />{t('adv.inPlace')}</label>
        <label className="fx-sh-check"><input type="radio" name="af" checked={action === 'copy'} data-adv-action="copy" onChange={() => setAction('copy')} />{t('adv.copy')}</label>
      </div>
      <label className="fx-sh-field"><span>{t('adv.list')}</span><input type="text" value={list} dir="ltr" data-adv-list="" name="filter-range" autoComplete="off" spellCheck={false} translate="no" onChange={e => setList(e.target.value)} /></label>
      <label className="fx-sh-field"><span>{t('adv.criteria')}</span><input type="text" value={criteria} dir="ltr" data-adv-criteria="" placeholder={tu('ph.eg', { ex: 'F1:G3' })} name="criteria-range" autoComplete="off" spellCheck={false} translate="no" onChange={e => setCriteria(e.target.value)} /></label>
      {action === 'copy' && (
        <div className="fx-tip-grid2">
          <label className="fx-sh-field"><span>{t('adv.copyTo')}</span>
            <select value={dest} data-adv-dest="" onChange={e => setDest(e.target.value as 'sheet' | 'cell')}>
              <option value="sheet">{t('adv.newSheet')}</option><option value="cell">{t('adv.cellHere')}</option>
            </select></label>
          {dest === 'cell' && <label className="fx-sh-field"><span>{t('adv.cell')}</span><input type="text" value={to} dir="ltr" data-adv-to="" placeholder={tu('ph.eg', { ex: 'I1' })} name="copy-to" autoComplete="off" spellCheck={false} translate="no" onChange={e => setTo(e.target.value)} /></label>}
        </div>
      )}
      <label className="fx-sh-check"><input type="checkbox" checked={unique} data-adv-unique="" onChange={e => setUnique(e.target.checked)} />{t('adv.unique')}</label>
      <Row>
        {active && <button type="button" data-adv-clear="" onClick={onClear}>{t('adv.clear')}</button>}
        <button type="button" onClick={onCancel}>{t('cancel')}</button>
        <button type="button" className="is-lime" data-ok="" disabled={!ok}
                onClick={() => onOk({ list: strip(list), criteria: strip(criteria), copy: action === 'inPlace' ? 'none' : dest, to: dest === 'cell' ? strip(to) : undefined, unique })}>{tu('ok.filter')}</button>
      </Row>
    </Modal>
  )
}
