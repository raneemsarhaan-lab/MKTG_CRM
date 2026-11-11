'use client'

/**
 * Stage 2's windows (spec 015 US4, design: Stage 2 tools):
 * - Find and Replace (Ctrl/Cmd+F, H): a panel beside the sheet that leaves it
 *   usable, so each match shows as it is selected. Match case, whole cell,
 *   next and previous, Replace and Replace all (one undo step).
 * - Paste Special: all, values only, formats only; transpose.
 * Plus the clipboard reader they and the Paste menu share.
 */
import { useEffect, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import type { CellStyle } from '@/types/index'
import { parseClipboard, toGrid, toStyles } from '@/lib/sheet-clipboard'
import { Modal } from '../Dialogs'
import { FIND_RESULT, sendFormat, type FindResult, type FormatSource } from './bus'

/** What's on the clipboard, read on a click (the browser asks the first time). Null when it won't say. */
export async function readClipboard(): Promise<{ grid: string[][]; styles: (CellStyle | null)[][] | null } | null> {
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
  return { grid: toGrid(cells), styles: toStyles(cells) }
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
      <div className="fx-fc-tabs" role="tablist">
        <button type="button" role="tab" aria-selected={tab === 'find'} onClick={() => setTab('find')}>{t('findTab')}</button>
        <button type="button" role="tab" aria-selected={tab === 'replace'} data-find-tab="replace" onClick={() => setTab('replace')}>{t('replaceTab')}</button>
      </div>
      <label className="fx-fc-fld"><span>{t('findWhat')}</span><input ref={input} type="text" value={query} data-find-what="" dir="auto" onChange={e => setQuery(e.target.value)} /></label>
      {tab === 'replace' && <label className="fx-fc-fld"><span>{t('replaceWith')}</span><input type="text" value={by} data-find-with="" dir="auto" onChange={e => setBy(e.target.value)} /></label>}
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
  )
}

export function PasteSpecialDialog({ target, onClose, say }: { target: FormatSource; onClose(): void; say(text: string): void }) {
  const t = useTranslations('sheets.format.edit')
  const [mode, setMode] = useState<'all' | 'values' | 'formats'>('values')
  const [flip, setFlip] = useState(false)
  async function ok() {
    const clip = await readClipboard()
    onClose()
    if (!clip || !clip.grid.length) { say(t('noClip')); return }
    sendFormat(target, { kind: 'pasteSpecial', mode, transpose: flip, grid: clip.grid, styles: clip.styles })
  }
  return (
    <Modal title={t('psTitle')} body={t('psBody')} onCancel={onClose} attr="data-paste-special">
      <div className="fx-fc-lb" role="radiogroup" aria-label={t('psTitle')}>
        {(['all', 'values', 'formats'] as const).map(m => (
          <label key={m} className="fx-fc-chk fx-ps-opt"><input type="radio" name="ps" checked={mode === m} data-ps={m} onChange={() => setMode(m)} />{t(m === 'all' ? 'psAll' : m === 'values' ? 'psValues' : 'psFormats')}</label>
        ))}
        <label className="fx-fc-chk fx-ps-opt is-off" title={t('psCommentsWhy')}><input type="radio" name="ps" disabled />{t('psComments')}</label>
        <small className="fx-fc-hint fx-ps-why">{t('psCommentsWhy')}</small>
      </div>
      <label className="fx-fc-chk"><input type="checkbox" checked={flip} data-ps-transpose="" onChange={e => setFlip(e.target.checked)} />{t('transpose')}</label>
      <div className="fx-sh-dialog-row">
        <button type="button" onClick={onClose}>{t('cancel')}</button>
        <button type="button" className="is-go" data-ok="" onClick={() => void ok()}>{t('ok')}</button>
      </div>
    </Modal>
  )
}
