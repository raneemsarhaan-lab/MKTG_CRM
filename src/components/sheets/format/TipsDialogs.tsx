'use client'

/**
 * Spec 020 stage A dialogs (approved design power-tips-a): Go To, Go To
 * Special, Series, Data Validation, the validation alert, and Custom Lists.
 * Excel's options and wording, drawn as the app's own dialogs (Modal: Esc
 * cancels, Tab stays inside, focus goes back).
 */
import { useId, useMemo, useState } from 'react'
import { useTranslations } from 'next-intl'
import { ListBox, Modal } from '../Dialogs'
import { tabKeys } from '../a11y'
import type { ValidationAllow, ValidationOp, ValidationRecord, ValidationRule } from '@/types/index'
import type { GoSpecial } from '@/lib/sheet-selection'
import { BUILTIN_LISTS, FILL_LIST_LIMITS, type FillList, type SeriesSpec } from '@/lib/sheet-fill'
import { cleanRule, listItems } from '@/lib/sheet-validate'

const Row = ({ children }: { children: React.ReactNode }) => <div className="fx-sh-dialog-row">{children}</div>
/** Custom Lists' "New list" choice. */
const NEW_LIST = '__new'

/** F5 / Ctrl+G: a cell or range by name, recent ones listed; Special… for Go To Special. */
export function GoToDialog({ recent, onGo, onSpecial, onCancel }: { recent: string[]; onGo(ref: string): void; onSpecial(): void; onCancel(): void }) {
  const t = useTranslations('sheets.tips')
  const tu = useTranslations('sheets.ux')
  const [ref, setRef] = useState(recent[0] ?? '')
  return (
    <Modal title={t('goto.title')} body={t('goto.sub')} onCancel={onCancel} attr="data-goto-dialog">
      {recent.length > 0 && (
        <div className="fx-sh-field">
          <span className="fx-tip-cap" aria-hidden="true">{t('goto.recent')}</span>
          {/* ↑/↓ pick a recent place, Enter goes there (it was mouse-only). */}
          <ListBox label={t('goto.recent')} value={ref} onChange={setRef} onEnter={() => { if (ref.trim()) onGo(ref.trim()) }}
                   options={recent.map(r => ({ id: r, label: r, dir: 'ltr' }))} />
        </div>
      )}
      <label className="fx-sh-field">
        <span>{t('goto.ref')}</span>
        <input value={ref} dir="ltr" data-autofocus="" data-goto-ref="" name="goto-ref" autoComplete="off" spellCheck={false} translate="no" onChange={e => setRef(e.target.value)}
               onKeyDown={e => { if (e.key === 'Enter' && ref.trim()) { e.preventDefault(); onGo(ref.trim()) } }} />
      </label>
      <Row>
        <button type="button" className="is-start" data-goto-special="" onClick={onSpecial}>{t('goto.special')}…</button>
        <button type="button" onClick={onCancel}>{t('cancel')}</button>
        <button type="button" className="is-lime" data-ok="" disabled={!ref.trim()} onClick={() => onGo(ref.trim())}>{tu('ok.go')}</button>
      </Row>
    </Modal>
  )
}

/** Go To Special: Excel's choices; those that need formulas or objects stay greyed. */
export function GoToSpecialDialog({ supported, onOk, onCancel }: { supported: GoSpecial[]; onOk(what: GoSpecial, numbers: boolean, text: boolean): void; onCancel(): void }) {
  const t = useTranslations('sheets.tips')
  const tu = useTranslations('sheets.ux')
  const [what, setWhat] = useState<GoSpecial | 'formulas' | 'array' | 'objects' | 'precedents' | 'dependents'>('blanks')
  const [numbers, setNumbers] = useState(true), [text, setText] = useState(true)
  const [dvAll, setDvAll] = useState(true)
  const ok = (k: string) => supported.includes(k as GoSpecial)
  const radio = (k: string, label: string, dis = !ok(k)) => (
    <label className={`fx-sh-check${dis ? ' is-dis' : ''}`} key={k}>
      <input type="radio" name="gs" disabled={dis} checked={what === k} data-gs={k} onChange={() => setWhat(k as GoSpecial)} />{label}
    </label>
  )
  const box = (k: string, label: string, v: boolean, set: ((x: boolean) => void) | null) => (
    <label className={`fx-sh-check is-sub${!set || what !== 'constants' ? ' is-dis' : ''}`} key={k}>
      <input type="checkbox" checked={v} disabled={!set || what !== 'constants'} onChange={e => set?.(e.target.checked)} />{label}
    </label>
  )
  const go = () => {
    if (what === 'validation') onOk(dvAll ? 'validation' : 'validationSame', numbers, text)
    else if (ok(what)) onOk(what as GoSpecial, numbers, text)
  }
  return (
    <Modal title={t('gs.title')} body={t('gs.sub')} onCancel={onCancel} attr="data-goto-special-dialog">
      <div className="fx-tip-cap">{t('gs.select')}</div>
      <div className="fx-tip-grid2" role="radiogroup" aria-label={t('gs.select')}>
        <div className="fx-tip-col">
          {radio('notes', t('gs.notes'))}
          {radio('constants', t('gs.constants'))}
          {radio('formulas', t('gs.formulas'), true)}
          {box('numbers', t('gs.numbers'), numbers, setNumbers)}
          {box('text', t('gs.text'), text, setText)}
          {box('logicals', t('gs.logicals'), false, null)}
          {box('errors', t('gs.errors'), false, null)}
          {radio('blanks', t('gs.blanks'))}
          {radio('region', t('gs.region'))}
          {radio('array', t('gs.array'), true)}
          {radio('objects', t('gs.objects'), true)}
        </div>
        <div className="fx-tip-col">
          {radio('rowDiffs', t('gs.rowDiffs'))}
          {radio('colDiffs', t('gs.colDiffs'))}
          {radio('precedents', t('gs.precedents'), true)}
          {radio('dependents', t('gs.dependents'), true)}
          {radio('lastCell', t('gs.lastCell'))}
          {radio('visible', t('gs.visible'))}
          {radio('conditional', t('gs.conditional'))}
          {radio('validation', t('gs.validation'))}
          <label className={`fx-sh-check is-sub${what !== 'validation' ? ' is-dis' : ''}`}><input type="radio" name="gsv" disabled={what !== 'validation'} checked={dvAll} onChange={() => setDvAll(true)} />{t('gs.all')}</label>
          <label className={`fx-sh-check is-sub${what !== 'validation' ? ' is-dis' : ''}`}><input type="radio" name="gsv" disabled={what !== 'validation'} checked={!dvAll} onChange={() => setDvAll(false)} />{t('gs.same')}</label>
        </div>
      </div>
      <Row>
        <button type="button" onClick={onCancel}>{t('cancel')}</button>
        <button type="button" className="is-lime" data-ok="" data-autofocus="" onClick={go}>{tu('ok.select')}</button>
      </Row>
    </Modal>
  )
}

/** Home › Fill › Series…: in rows or columns; linear, growth, date (by unit) or AutoFill; a step and a stop value. */
export function SeriesDialog({ range, by: by0, onOk, onCancel }: { range: string; by: 'rows' | 'cols'; onOk(spec: SeriesSpec, by: 'rows' | 'cols'): void; onCancel(): void }) {
  const t = useTranslations('sheets.tips')
  const tu = useTranslations('sheets.ux')
  const [by, setBy] = useState(by0)
  const [type, setType] = useState<SeriesSpec['type']>('linear')
  const [unit, setUnit] = useState<SeriesSpec['unit']>('day')
  const [step, setStep] = useState('1'), [stop, setStop] = useState('')
  const stepN = Number(step), stopN = stop.trim() === '' ? null : Number(stop)
  const valid = Number.isFinite(stepN) && (stopN === null || Number.isFinite(stopN)) && (type !== 'growth' || stepN > 0)
  const r = (name: string, k: string, label: string, cur: string, set: (v: never) => void, dis = false) => (
    <label className={`fx-sh-check${dis ? ' is-dis' : ''}`} key={k}><input type="radio" name={name} checked={cur === k} disabled={dis} data-series={`${name}-${k}`} onChange={() => set(k as never)} />{label}</label>
  )
  return (
    <Modal title={t('series.title')} body={t('series.sub', { range })} onCancel={onCancel} attr="data-series-dialog">
      <div className="fx-tip-grid3">
        <fieldset className="fx-tip-fs"><legend className="fx-tip-cap">{t('series.in')}</legend>
          {r('in', 'rows', t('series.rows'), by, setBy)}{r('in', 'cols', t('series.cols'), by, setBy)}
        </fieldset>
        <fieldset className="fx-tip-fs"><legend className="fx-tip-cap">{t('series.type')}</legend>
          {r('type', 'linear', t('series.linear'), type, setType)}{r('type', 'growth', t('series.growth'), type, setType)}
          {r('type', 'date', t('series.date'), type, setType)}{r('type', 'autofill', t('series.autofill'), type, setType)}
        </fieldset>
        <fieldset className="fx-tip-fs"><legend className="fx-tip-cap">{t('series.unit')}</legend>
          {(['day', 'weekday', 'month', 'year'] as const).map(u => r('unit', u, t(`series.${u}`), unit, setUnit, type !== 'date'))}
        </fieldset>
      </div>
      <div className="fx-tip-two">
        <label className="fx-sh-field"><span>{t('series.step')}</span><input value={step} inputMode="decimal" dir="ltr" data-series-step="" name="series-step" autoComplete="off" disabled={type === 'autofill'} onChange={e => setStep(e.target.value)} /></label>
        <label className="fx-sh-field"><span>{t('series.stop')}</span><input value={stop} inputMode="decimal" dir="ltr" placeholder={tu('ph.optional')} name="series-stop" autoComplete="off" disabled={type === 'autofill' || type === 'date'} onChange={e => setStop(e.target.value)} /></label>
      </div>
      <Row>
        <button type="button" onClick={onCancel}>{t('cancel')}</button>
        <button type="button" className="is-lime" data-ok="" disabled={!valid} onClick={() => onOk({ type, unit, step: stepN, stop: type === 'date' ? null : stopN, trend: false }, by)}>{tu('ok.fill')}</button>
      </Row>
    </Modal>
  )
}

const ALLOWS: ValidationAllow[] = ['any', 'whole', 'decimal', 'list', 'date', 'time', 'length']
const OPS: ValidationOp[] = ['between', 'notBetween', 'eq', 'ne', 'gt', 'lt', 'ge', 'le']

/** Data › Data Validation…: Excel's Settings, Input Message and Error Alert tabs. */
export function DataValidationDialog({ range, rule, mixed, inRule, onOk, onCancel }: {
  range: string; rule: ValidationRule | null; mixed: boolean
  /** The active cell already has a rule (for "Apply to all other cells with the same settings"). */
  inRule: boolean
  onOk(rule: ValidationRule | null, all: boolean): void; onCancel(): void
}) {
  const t = useTranslations('sheets.tips')
  const tu = useTranslations('sheets.ux')
  const uid = useId()
  const [tab, setTab] = useState<'settings' | 'input' | 'error'>('settings')
  const start = mixed ? null : rule
  const [allow, setAllow] = useState<ValidationAllow>(start?.allow ?? 'any')
  const [op, setOp] = useState<ValidationOp>(start?.op ?? 'between')
  const [a, setA] = useState(start?.a ?? ''), [b, setB] = useState(start?.b ?? '')
  const [source, setSource] = useState((start?.values ?? []).join(', '))
  const [ignoreBlank, setIgnoreBlank] = useState(start?.ignoreBlank ?? true)
  const [dropdown, setDropdown] = useState(start?.dropdown ?? true)
  const [all, setAll] = useState(false)
  const [showIn, setShowIn] = useState(start ? !!start.input : true)
  const [inTitle, setInTitle] = useState(start?.input?.title ?? ''), [inMsg, setInMsg] = useState(start?.input?.msg ?? '')
  const [showErr, setShowErr] = useState(start ? !!start.error : true)
  const [style, setStyle] = useState<'stop' | 'warning' | 'info'>(start?.error?.style ?? 'stop')
  const [errTitle, setErrTitle] = useState(start?.error?.title ?? ''), [errMsg, setErrMsg] = useState(start?.error?.msg ?? '')
  const two = op === 'between' || op === 'notBetween'
  const built = useMemo<ValidationRule | null>(() => cleanRule({
    allow, op, a, b: two ? b : undefined, values: allow === 'list' ? listItems(source) : undefined, ignoreBlank, dropdown,
    input: showIn && (inTitle.trim() || inMsg.trim()) ? { title: inTitle.trim(), msg: inMsg.trim() } : null,
    error: showErr ? { style, title: errTitle.trim(), msg: errMsg.trim() } : null,
  }), [allow, op, a, b, two, source, ignoreBlank, dropdown, showIn, inTitle, inMsg, showErr, style, errTitle, errMsg])
  const sample = allow === 'date' ? '2026-12-31' : allow === 'time' ? '09:00' : '0'
  const okDisabled = allow !== 'any' && !built
  return (
    <Modal title={t('dv.title')} body={t('dv.sub', { range })} onCancel={onCancel} attr="data-dv-dialog">
      <div className="fx-fc-tabs" role="tablist" aria-label={t('dv.title')} onKeyDown={tabKeys}>
        {(['settings', 'input', 'error'] as const).map(k => (
          <button type="button" role="tab" key={k} id={`${uid}-tab-${k}`} aria-selected={tab === k} aria-controls={`${uid}-panel`} tabIndex={tab === k ? 0 : -1}
                  data-dv-tab={k} onClick={() => setTab(k)}>{t(`dv.tab.${k}`)}</button>
        ))}
      </div>
      {mixed && tab === 'settings' && <p className="fx-tip-note" role="note">{t('dv.mixed')}</p>}
      {tab === 'settings' && (
        <div className="fx-tip-body" role="tabpanel" id={`${uid}-panel`} aria-labelledby={`${uid}-tab-settings`}>
          <div className="fx-tip-cap">{t('dv.criteria')}</div>
          <div className="fx-tip-two">
            <label className="fx-sh-field"><span>{t('dv.allow')}</span>
              <select value={allow} data-dv-allow="" data-autofocus="" onChange={e => setAllow(e.target.value as ValidationAllow)}>
                {ALLOWS.map(x => <option key={x} value={x}>{t(`dv.allows.${x}`)}</option>)}
                <option value="custom" disabled>{t('dv.allows.custom')}</option>
              </select>
            </label>
            <div className="fx-tip-checks">
              <label className="fx-sh-check"><input type="checkbox" checked={ignoreBlank} disabled={allow === 'any'} onChange={e => setIgnoreBlank(e.target.checked)} />{t('dv.ignoreBlank')}</label>
              <label className="fx-sh-check"><input type="checkbox" checked={dropdown} disabled={allow !== 'list'} data-dv-dropdown="" onChange={e => setDropdown(e.target.checked)} />{t('dv.dropdown')}</label>
            </div>
          </div>
          {allow !== 'any' && allow !== 'list' && <>
            <label className="fx-sh-field"><span>{t('dv.data')}</span>
              <select value={op} onChange={e => setOp(e.target.value as ValidationOp)}>{OPS.map(x => <option key={x} value={x}>{t(`dv.ops.${x}`)}</option>)}</select>
            </label>
            <div className="fx-tip-two">
              <label className="fx-sh-field"><span>{two ? t('dv.min') : allow === 'length' ? t('dv.length') : t('dv.value')}</span><input value={a} dir="ltr" placeholder={tu('ph.eg', { ex: sample })} data-dv-a="" name="dv-min" autoComplete="off" onChange={e => setA(e.target.value)} /></label>
              {two && <label className="fx-sh-field"><span>{t('dv.max')}</span><input value={b} dir="ltr" placeholder={tu('ph.eg', { ex: sample })} data-dv-b="" name="dv-max" autoComplete="off" onChange={e => setB(e.target.value)} /></label>}
            </div>
          </>}
          {allow === 'list' && (
            <label className="fx-sh-field"><span>{t('dv.source')}</span>
              <input value={source} placeholder={tu('ph.source')} data-dv-source="" name="dv-source" autoComplete="off" onChange={e => setSource(e.target.value)} />
            </label>
          )}
          {inRule && <label className="fx-sh-check"><input type="checkbox" checked={all} data-dv-all="" onChange={e => setAll(e.target.checked)} />{t('dv.applyAll')}</label>}
        </div>
      )}
      {tab === 'input' && (
        <div className="fx-tip-body" role="tabpanel" id={`${uid}-panel`} aria-labelledby={`${uid}-tab-input`}>
          <label className="fx-sh-check"><input type="checkbox" checked={showIn} onChange={e => setShowIn(e.target.checked)} />{t('dv.showInput')}</label>
          <label className="fx-sh-field"><span>{t('dv.inTitle')}</span><input value={inTitle} maxLength={32} disabled={!showIn} data-dv-in-title="" name="dv-input-title" autoComplete="off" onChange={e => setInTitle(e.target.value)} /></label>
          <label className="fx-sh-field"><span>{t('dv.inMsg')}</span><textarea className="fx-tip-ta" value={inMsg} name="dv-input-message" maxLength={255} rows={3} disabled={!showIn} data-dv-in-msg="" onChange={e => setInMsg(e.target.value)} /></label>
        </div>
      )}
      {tab === 'error' && (
        <div className="fx-tip-body" role="tabpanel" id={`${uid}-panel`} aria-labelledby={`${uid}-tab-error`}>
          <label className="fx-sh-check"><input type="checkbox" checked={showErr} onChange={e => setShowErr(e.target.checked)} />{t('dv.showError')}</label>
          <label className="fx-sh-field"><span>{t('dv.style')}</span>
            <select value={style} disabled={!showErr} data-dv-style="" onChange={e => setStyle(e.target.value as 'stop' | 'warning' | 'info')}>
              {(['stop', 'warning', 'info'] as const).map(x => <option key={x} value={x}>{t(`dv.styles.${x}`)}</option>)}
            </select>
          </label>
          <label className="fx-sh-field"><span>{t('dv.errTitle')}</span><input value={errTitle} maxLength={32} disabled={!showErr} data-dv-err-title="" name="dv-error-title" autoComplete="off" onChange={e => setErrTitle(e.target.value)} /></label>
          <label className="fx-sh-field"><span>{t('dv.errMsg')}</span><textarea className="fx-tip-ta" value={errMsg} name="dv-error-message" maxLength={255} rows={3} disabled={!showErr} data-dv-err-msg="" onChange={e => setErrMsg(e.target.value)} /></label>
        </div>
      )}
      <Row>
        <button type="button" className="is-start" data-dv-clear="" onClick={() => onOk(null, all)}>{t('dv.clearAll')}</button>
        <button type="button" onClick={onCancel}>{t('cancel')}</button>
        <button type="button" className="is-lime" data-ok="" disabled={okDisabled}
                onClick={() => onOk(allow === 'any' && !built?.input ? null : built, all)}>{tu('ok.apply')}</button>
      </Row>
    </Modal>
  )
}

/** A typed value outside the rule: Stop (Retry / Cancel), Warning (Continue? Yes / No / Cancel), Information (OK / Cancel). */
export function ValidationAlert({ rule, value, onAnswer }: { rule: ValidationRecord; value: string; onAnswer(a: 'retry' | 'accept' | 'cancel'): void }) {
  const t = useTranslations('sheets.tips')
  const style = rule.error?.style ?? 'stop'
  const msg = rule.error?.msg || t('alert.default', { value })
  const title = rule.error?.title || t('alert.title')
  return (
    <Modal title={title} onCancel={() => onAnswer('cancel')} attr="data-dv-alert">
      <div className={`fx-tip-alert is-${style}`} role="alert">
        <span className="fx-tip-alert-ic" aria-hidden="true">{style === 'stop' ? '!' : style === 'warning' ? '!' : 'i'}</span>
        <p>{msg}{style === 'warning' && <><br /><b>{t('alert.continue')}</b></>}</p>
      </div>
      <Row>
        <button type="button" className="is-start fx-tip-help" onClick={() => onAnswer('cancel')} title={t('alert.helpTip')}>{t('alert.help')}</button>
        {style === 'stop' && <>
          <button type="button" data-dv-cancel="" onClick={() => onAnswer('cancel')}>{t('cancel')}</button>
          <button type="button" className="is-lime" data-autofocus="" data-dv-retry="" onClick={() => onAnswer('retry')}>{t('alert.retry')}</button>
        </>}
        {style === 'warning' && <>
          <button type="button" onClick={() => onAnswer('cancel')}>{t('cancel')}</button>
          <button type="button" data-dv-no="" onClick={() => onAnswer('retry')}>{t('alert.no')}</button>
          <button type="button" className="is-lime" data-autofocus="" data-dv-yes="" onClick={() => onAnswer('accept')}>{t('alert.yes')}</button>
        </>}
        {style === 'info' && <>
          <button type="button" onClick={() => onAnswer('cancel')}>{t('cancel')}</button>
          <button type="button" className="is-lime" data-autofocus="" data-dv-okinfo="" onClick={() => onAnswer('accept')}>{t('ok')}</button>
        </>}
      </Row>
    </Modal>
  )
}

/** Custom Lists: the built-in lists (fixed) and the workspace's own (admins add, change, delete, or import from cells). */
export function CustomListsDialog({ lists, canEdit, fromCells, onSave, onCancel }: {
  lists: FillList[]; canEdit: boolean; fromCells: string[]
  onSave(lists: FillList[]): void; onCancel(): void
}) {
  const t = useTranslations('sheets.tips')
  const tu = useTranslations('sheets.ux')
  const [mine, setMine] = useState<FillList[]>(lists)
  const [sel, setSel] = useState<string | null>(null)
  const [text, setText] = useState('')
  const cur = mine.find(l => l.id === sel) ?? null
  const builtinSel = sel?.startsWith('b:') ? BUILTIN_LISTS[Number(sel.slice(2))] : null
  const items = (v: string) => v.split(/[\n,،]/).map(x => x.trim()).filter(Boolean)
  const pickList = (id: string | null) => {
    setSel(id)
    const l = id?.startsWith('b:') ? BUILTIN_LISTS[Number(id.slice(2))] : mine.find(x => x.id === id)?.items
    setText(l ? l.join('\n') : '')
  }
  const add = () => {
    const it = items(text)
    if (it.length < FILL_LIST_LIMITS.minItems || mine.length >= FILL_LIST_LIMITS.lists) return
    if (cur) setMine(m => m.map(l => (l.id === cur.id ? { ...l, items: it, name: it.slice(0, 3).join(', ') } : l)))
    else { const id = `l${Date.now().toString(36)}`; setMine(m => [...m, { id, name: it.slice(0, 3).join(', '), items: it }]); setSel(id) }
  }
  const short = (l: string[]) => `${l.slice(0, 4).join(', ')}${l.length > 4 ? ', …' : ''}`
  return (
    <Modal title={t('lists.title')} body={t('lists.sub')} onCancel={onCancel} attr="data-custom-lists">
      <div className="fx-tip-lists">
        <div className="fx-sh-field">
          <span className="fx-tip-cap" aria-hidden="true">{t('lists.lists')}</span>
          {/* ↑/↓ pick a list (it was mouse-only). */}
          <ListBox label={t('lists.lists')} className="fx-tip-lb" value={sel ?? NEW_LIST} onChange={id => pickList(id === NEW_LIST ? null : id)}
                   options={[
                     { id: NEW_LIST, className: 'fx-tip-new', label: <><span aria-hidden="true">＋ </span>{t('lists.newList')}</> },
                     ...BUILTIN_LISTS.map((l, i) => ({ id: `b:${i}`, className: 'is-fixed', label: <><span dir="auto">{short(l)}</span><small>{t('lists.builtin')}</small></> })),
                     ...mine.map(l => ({ id: l.id, data: { 'data-list': l.id }, label: <span dir="auto">{short(l.items)}</span> })),
                   ]} />
        </div>
        <label className="fx-sh-field">
          <span className="fx-tip-cap">{t('lists.entries')}</span>
          <textarea className="fx-tip-ta is-tall" value={text} dir="auto" readOnly={!canEdit || !!builtinSel} data-list-entries=""
                    placeholder={tu('ph.entries')} name="list-entries" onChange={e => setText(e.target.value)} />
        </label>
        <div className="fx-tip-side">
          <button type="button" className="fx-tip-btn" data-list-add="" disabled={!canEdit || !!builtinSel || items(text).length < FILL_LIST_LIMITS.minItems} onClick={add}>{cur ? t('lists.update') : t('lists.add')}</button>
          <button type="button" className="fx-tip-btn is-danger" data-list-delete="" disabled={!canEdit || !cur} onClick={() => { setMine(m => m.filter(l => l.id !== cur?.id)); pickList(null) }}>{t('lists.delete')}</button>
        </div>
      </div>
      {canEdit && (
        <div className="fx-tip-import">
          <span>{t('lists.import')}</span>
          <button type="button" className="fx-tip-btn" data-list-import="" disabled={fromCells.length < FILL_LIST_LIMITS.minItems} onClick={() => { setSel(null); setText(fromCells.join('\n')) }}>{t('lists.importBtn', { n: fromCells.length })}</button>
        </div>
      )}
      {!canEdit && <p className="fx-tip-note">{t('lists.adminsOnly')}</p>}
      <Row>
        <button type="button" onClick={onCancel}>{t('cancel')}</button>
        <button type="button" className="is-lime" data-ok="" disabled={!canEdit} onClick={() => onSave(mine)}>{tu('save')}</button>
      </Row>
    </Modal>
  )
}

/**
 * Spec 020 stage C: Excel's Stop alert for a move or copy that would put a
 * value where it doesn't fit (a board field that can't take it, or a cell's
 * data validation). Nothing has changed when it shows.
 */
export function MoveAlert({ text, onClose }: { text: string; onClose(): void }) {
  const t = useTranslations('sheets.tips')
  return (
    <Modal title={t('move.alertTitle')} onCancel={onClose} attr="data-move-alert">
      <div className="fx-tip-alert is-stop" role="alert">
        <span className="fx-tip-alert-ic" aria-hidden="true">!</span>
        <p>{t('move.alertLead')}<br /><b>{text}</b><br />{t('move.alertNothing')}</p>
      </div>
      <Row>
        <button type="button" className="is-lime" data-autofocus="" data-ok="" onClick={onClose}>{t('ok')}</button>
      </Row>
    </Modal>
  )
}
