'use client'

/**
 * Stage 2's windows (spec 015 US4, design: Stage 2 tools):
 * - Find and Replace (Ctrl/Cmd+F, H): a panel beside the sheet that leaves it
 *   usable, so each match shows as it is selected. Match case, whole cell,
 *   next and previous, Replace and Replace all (one undo step).
 * - Paste Special: all, values only, formats only; transpose.
 * Plus the clipboard reader they and the Paste menu share.
 */
import { useEffect, useId, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { tabKeys, useFocusReturn } from '../a11y'
import type { PasteOp } from '@/lib/sheet-clean'
import type { CellStyle } from '@/types/index'
import { parseClipboard, toGrid, toKeys, toStyles } from '@/lib/sheet-clipboard'
import { Modal } from '../Dialogs'
import { FIND_RESULT, sendFormat, type FindResult, type FormatSource, type PasteMode } from './bus'

/** What's on the clipboard, read on a click (the browser asks the first time). Null when it won't say. */
export async function readClipboard(): Promise<{ grid: string[][]; styles: (CellStyle | null)[][] | null; keys: (string | null)[][] | null } | null> {
  let html = '', text = ''
  try {
    const items = await navigator.clipboard.read()
    for (const it of items) {
      if (it.types.includes('text/html')) html = await (await it.getType('text/html')).text()
      if (it.types.includes('text/plain')) text = await (await it.getType('text/plain')).text()
    }
  } catch {
    try { text = await navigator.clipboard.readText() } catch { return null }
  }
  const cells = parseClipboard({ html, text }, new DOMParser())
  return { grid: toGrid(cells), styles: toStyles(cells), keys: toKeys(cells) }
}

export function FindPanel({ target, replace: startReplace, onClose }: { target: FormatSource; replace: boolean; onClose(): void }) {
  const t = useTranslations('sheets.format.edit')
  const [tab, setTab] = useState<'find' | 'replace'>(startReplace ? 'replace' : 'find')
  const [query, setQuery] = useState('')
  const [by, setBy] = useState('')
  const [matchCase, setMatchCase] = useState(false)
  const [whole, setWhole] = useState(false)
  const [result, setResult] = useState<FindResult | null>(null)
  const input = useRef<HTMLInputElement>(null)
  const uid = useId()
  // Closing gives focus back to the grid (or what opened the panel).
  useFocusReturn()
  useEffect(() => { setTab(startReplace ? 'replace' : 'find') }, [startReplace])
  useEffect(() => { requestAnimationFrame(() => { input.current?.focus(); input.current?.select() }) }, [tab])
  useEffect(() => {
    const on = (e: Event) => { const d = (e as CustomEvent<FindResult>).detail; if (d.source === target) setResult(d) }
    document.addEventListener(FIND_RESULT, on)
    return () => document.removeEventListener(FIND_RESULT, on)
  }, [target])
  useEffect(() => { setResult(null) }, [query, matchCase, whole])

  const q = { query, matchCase, whole }
  const find = (dir: 1 | -1) => { if (query) sendFormat(target, { kind: 'find', q, dir }) }
  const replace = (all: boolean) => { if (query) sendFormat(target, { kind: 'replace', q, by, all }) }
  const status = !result ? '' : result.replaced !== undefined
    ? (result.skipped ? t('replacedSkipped', { n: result.replaced, skipped: result.skipped }) : t('replaced', { n: result.replaced }))
    : result.count === 0 ? t('none') : result.cell ? t('count', { at: result.at, n: result.count, cell: result.cell }) : t('countOnly', { n: result.count })

  return (
    <div className="fx-find" role="dialog" aria-modal="false" aria-label={t('findTitle')} data-find-panel=""
         onKeyDown={e => {
           if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); onClose() }
           if (e.key === 'Enter' && (e.target as HTMLElement).tagName === 'INPUT' && (e.target as HTMLInputElement).type === 'text') { e.preventDefault(); find(e.shiftKey ? -1 : 1) }
         }}>
      <header>
        <h2>{t('findTitle')}</h2>
        <button type="button" className="fx-cmt-ico" aria-label={t('close')} title={t('close')} onClick={onClose}>✕</button>
      </header>
      <div className="fx-fc-tabs" role="tablist" aria-label={t('findTitle')} onKeyDown={tabKeys}>
        <button type="button" role="tab" id={`${uid}-find`} aria-selected={tab === 'find'} aria-controls={`${uid}-panel`} tabIndex={tab === 'find' ? 0 : -1} onClick={() => setTab('find')}>{t('findTab')}</button>
        <button type="button" role="tab" id={`${uid}-replace`} aria-selected={tab === 'replace'} aria-controls={`${uid}-panel`} tabIndex={tab === 'replace' ? 0 : -1} data-find-tab="replace" onClick={() => setTab('replace')}>{t('replaceTab')}</button>
      </div>
      <div className="fx-find-body" role="tabpanel" id={`${uid}-panel`} aria-labelledby={`${uid}-${tab}`}>
      <label className="fx-fc-fld"><span>{t('findWhat')}</span><input ref={input} type="text" value={query} data-find-what="" dir="auto" name="find" autoComplete="off" onChange={e => setQuery(e.target.value)} /></label>
      {tab === 'replace' && <label className="fx-fc-fld"><span>{t('replaceWith')}</span><input type="text" value={by} data-find-with="" dir="auto" name="replace" autoComplete="off" onChange={e => setBy(e.target.value)} /></label>}
      <label className="fx-fc-chk"><input type="checkbox" checked={matchCase} onChange={e => setMatchCase(e.target.checked)} />{t('matchCase')}</label>
      <label className="fx-fc-chk"><input type="checkbox" checked={whole} data-find-whole="" onChange={e => setWhole(e.target.checked)} />{t('wholeCell')}</label>
      <p className="fx-find-status" role="status" aria-live="polite" data-find-status="">{status}</p>
      <div className="fx-find-row">
        <button type="button" onClick={() => find(-1)} disabled={!query}>{t('findPrev')}</button>
        <button type="button" data-find-next="" onClick={() => find(1)} disabled={!query}>{t('findNext')}</button>
        {tab === 'replace' && (
          <>
            <button type="button" data-replace-one="" onClick={() => replace(false)} disabled={!query}>{t('replaceOne')}</button>
            <button type="button" className="is-go" data-replace-all="" onClick={() => replace(true)} disabled={!query}>{t('replaceAll')}</button>
          </>
        )}
      </div>
      </div>
    </div>
  )
}

export function PasteSpecialDialog({ target, onClose, say }: { target: FormatSource; onClose(): void; say(text: string): void }) {
  const t = useTranslations('sheets.format.edit')
  const tt = useTranslations('sheets.tips')
  const tu = useTranslations('sheets.ux')
  const [mode, setMode] = useState<PasteMode>('values')
  const [op, setOp] = useState<PasteOp | null>(null)
  const [flip, setFlip] = useState(false)
  const [skip, setSkip] = useState(false)
  /** Reading the clipboard can take a moment (the browser may ask): one paste per OK. */
  const [busy, setBusy] = useState(false)
  // Spec 020 (approved design power-tips-b): Excel's whole list; the new choices are team-sheet tools.
  const linked = target === 'linked'
  async function ok() {
    if (busy) return
    setBusy(true)
    const clip = await readClipboard()
    onClose()
    if (!clip || !clip.grid.length) { say(t('noClip')); return }
    sendFormat(target, { kind: 'pasteSpecial', mode, transpose: flip, grid: clip.grid, styles: clip.styles, op, skipBlanks: skip, keys: clip.keys })
  }
  // Spec 020 stage C: Excel's letters (Ctrl+Alt+V, then V for values, T for formats, …, and Enter).
  const AK: Record<string, string> = { all: 'A', formulas: 'F', values: 'V', formats: 'T', comments: 'C', validation: 'N', noBorders: 'X', widths: 'W', none: 'O', add: 'D', sub: 'S', mul: 'M', div: 'I', skip: 'B', transpose: 'E' }
  const ak = (k: string, label: string) => {
    const letter = AK[k], i = label.toLowerCase().indexOf(letter.toLowerCase())
    if (i < 0 || !/^[\x00-\x7F]*$/.test(label)) return <>{label} <span className="fx-ak-hint">({letter})</span></>
    return <>{label.slice(0, i)}<u className="fx-ak">{label[i]}</u>{label.slice(i + 1)}</>
  }
  function onKeys(e: React.KeyboardEvent) {
    if (e.ctrlKey || e.metaKey || e.altKey || (e.target as HTMLElement).tagName === 'SELECT') return
    if (e.key === 'Enter') { e.preventDefault(); void ok(); return }
    const k = Object.keys(AK).find(x => e.code === `Key${AK[x]}` || e.key.toLowerCase() === AK[x].toLowerCase())
    if (!k) return
    e.preventDefault()
    const off = linked && ['validation', 'noBorders', 'widths', 'add', 'sub', 'mul', 'div', 'skip'].includes(k)
    if (off || k === 'formulas') return
    if (k === 'skip') setSkip(v => !v)
    else if (k === 'transpose') setFlip(v => !v)
    else if (k === 'none') setOp(null)
    else if (['add', 'sub', 'mul', 'div'].includes(k)) setOp(k as PasteOp)
    else setMode(k as PasteMode)
  }
  const radio = (m: PasteMode | 'comments' | 'formulas', label: string, off = false, why?: string) => (
    <label key={m} className={`fx-sh-check${off ? ' is-dis' : ''}`} title={off ? why : undefined}>
      <input type="radio" name="ps" disabled={off} checked={mode === m} data-ps={m} onChange={() => setMode(m as PasteMode)} />{ak(m, label)}
    </label>
  )
  const opRadio = (o: PasteOp | null, label: string) => (
    <label key={o ?? 'none'} className={`fx-sh-check${linked && o ? ' is-dis' : ''}`} title={linked && o ? tt('blankOnly') : undefined}>
      <input type="radio" name="psop" disabled={linked && !!o} checked={op === o} data-ps-op={o ?? 'none'} onChange={() => setOp(o)} />{ak(o ?? 'none', label)}
    </label>
  )
  return (
    <Modal title={t('psTitle')} body={t('psBody')} onCancel={onClose} attr="data-paste-special">
      <div onKeyDown={onKeys} className="fx-ps-keys">
      <div className="fx-tip-cap">{tt('ps.paste')}</div>
      <div className="fx-tip-grid2" role="radiogroup" aria-label={tt('ps.paste')}>
        <div className="fx-tip-col">
          {radio('all', t('psAll'))}
          {radio('formulas', tt('ps.formulas'), true, tt('ps.formulasWhy'))}
          {radio('values', t('psValues'))}
          {radio('formats', t('psFormats'))}
        </div>
        <div className="fx-tip-col">
          {radio('comments', t('psComments'))}
          {radio('validation', tt('ps.validation'), linked, tt('blankOnly'))}
          {radio('noBorders', tt('ps.noBorders'), linked, tt('blankOnly'))}
          {radio('widths', tt('ps.widths'), linked, tt('blankOnly'))}
        </div>
      </div>
      <div className="fx-tip-cap">{tt('ps.operation')}</div>
      <div className="fx-tip-grid2" role="radiogroup" aria-label={tt('ps.operation')}>
        <div className="fx-tip-col">{opRadio(null, tt('ps.none'))}{opRadio('add', tt('ps.add'))}{opRadio('sub', tt('ps.sub'))}</div>
        <div className="fx-tip-col">{opRadio('mul', tt('ps.mul'))}{opRadio('div', tt('ps.div'))}</div>
      </div>
      <div className="fx-tip-grid2">
        <label className={`fx-sh-check${linked ? ' is-dis' : ''}`}><input type="checkbox" checked={skip} disabled={linked} data-ps-skip="" onChange={e => setSkip(e.target.checked)} />{ak('skip', tt('ps.skipBlanks'))}</label>
        <label className="fx-sh-check"><input type="checkbox" checked={flip} data-ps-transpose="" onChange={e => setFlip(e.target.checked)} />{ak('transpose', t('transpose'))}</label>
      </div>
      </div>
      <div className="fx-sh-dialog-row">
        <button type="button" disabled title={tt('ps.formulasWhy')}>{tt('ps.link')}</button>
        <span className="fx-sh-dialog-sp" />
        <button type="button" onClick={onClose}>{t('cancel')}</button>
        <button type="button" className="is-go" data-ok="" disabled={busy} aria-busy={busy || undefined} onClick={() => void ok()}>{busy ? tu('pasting') : tu('ok.paste')}</button>
      </div>
    </Modal>
  )
}
