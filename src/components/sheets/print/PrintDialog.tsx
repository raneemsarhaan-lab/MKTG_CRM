'use client'

/**
 * File › Print (Ctrl+P) for every sheet (spec 020 tip 99, approved design
 * power-tips-c): Excel's page options (what to print, orientation, scaling,
 * rows to repeat at top, gridlines, row and column headings), a preview of
 * the first pages, then the browser's print window (Save as PDF there).
 *
 * The sheet hands over what's on screen as text with its looks; hidden,
 * collapsed and filtered-out rows aren't in it, as in Excel. Printing renders
 * one table into `#fx-print-root`; rows to repeat go in its `<thead>`, which
 * browsers repeat on every page.
 */
import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import { useTranslations } from 'next-intl'
import { Modal } from '../Dialogs'

export interface PrintCell { text: string; css?: CSSProperties }
export interface PrintData {
  title: string
  /** Columns' names (the letters on team sheets, the headings on the board's sheets) and widths. */
  cols: { name: string; width: number }[]
  /** Rows with their number as shown on the left. */
  rows: { label: string; cells: PrintCell[] }[]
  /** The board's sheets print their column headings as the header row. */
  headings?: boolean
  /** "A1:F121", for the dialog. */
  ref: string
}
type Scale = 'fitCols' | 'none' | 'fitSheet'

/** "$1:$1", "1:2", "1" → the first and last row to repeat (1-based), or null. */
export function repeatRows(text: string): [number, number] | null {
  const m = /^\s*\$?(\d{1,6})\s*(?::\s*\$?(\d{1,6}))?\s*$/.exec(text)
  if (!m) return null
  const a = Number(m[1]), b = m[2] ? Number(m[2]) : a
  return a >= 1 && b >= a ? [a, b] : null
}

export function PrintDialog({ data, selection, onClose }: { data: (selectionOnly: boolean) => PrintData; selection: boolean; onClose(): void }) {
  const t = useTranslations('sheets.tips.print')
  const [what, setWhat] = useState<'sheet' | 'selection'>('sheet')
  const [land, setLand] = useState(false)
  const [scale, setScale] = useState<Scale>('fitCols')
  const d = useMemo(() => data(what === 'selection'), [what]) // eslint-disable-line react-hooks/exhaustive-deps
  const [rep, setRep] = useState(d.headings ? '' : '$1:$1')
  const [grid, setGrid] = useState(true)
  const [heads, setHeads] = useState(false)
  const [printing, setPrinting] = useState(false)
  const repeat = d.headings ? null : repeatRows(rep)
  // About how many rows a page holds (24 px rows on A4 at 96 dpi, less the margins and the repeated rows).
  const perPage = Math.max(5, Math.floor((land ? 640 : 960) / 24) - (repeat ? repeat[1] - repeat[0] + 1 : d.headings ? 1 : 0))
  const head = repeat ? d.rows.slice(repeat[0] - 1, repeat[1]) : []
  const body = repeat ? [...d.rows.slice(0, repeat[0] - 1), ...d.rows.slice(repeat[1])] : d.rows
  const pages = scale === 'fitSheet' ? 1 : Math.max(1, Math.ceil(body.length / perPage))

  useEffect(() => {
    if (!printing) return
    const done = () => { setPrinting(false); onClose() }
    window.addEventListener('afterprint', done)
    const t0 = window.setTimeout(() => window.print(), 50)
    return () => { window.removeEventListener('afterprint', done); window.clearTimeout(t0) }
  }, [printing]) // eslint-disable-line react-hooks/exhaustive-deps

  const table = (rows: PrintData['rows'], headRows: PrintData['rows'], preview: boolean) => (
    <table className={`fx-print-table${grid ? '' : ' is-nogrid'}`} data-print-table={preview ? 'preview' : 'page'}>
      <thead>
        {heads && <tr className="is-letters">{<th />}{d.cols.map((c, i) => <th key={i}>{c.name}</th>)}</tr>}
        {d.headings && <tr className="is-headings">{heads && <th />}{d.cols.map((c, i) => <th key={i}>{c.name}</th>)}</tr>}
        {headRows.map((r, i) => <tr key={`h${i}`} data-print-repeat="">{heads && <th>{r.label}</th>}{r.cells.map((c, j) => <td key={j} style={c.css}>{c.text}</td>)}</tr>)}
      </thead>
      <tbody>
        {rows.map((r, i) => <tr key={i}>{heads && <th>{r.label}</th>}{r.cells.map((c, j) => <td key={j} style={c.css}>{c.text}</td>)}</tr>)}
      </tbody>
    </table>
  )
  const totalW = d.cols.reduce((n, c) => n + c.width, 0)
  return (
    <>
      <Modal title={t('title')} body={t('sub', { name: d.title, rows: d.rows.length, pages })} onCancel={onClose} attr="data-print-dialog">
        <div className="fx-print-opts">
          <div className="fx-tip-col">
            <fieldset className="fx-tip-set"><legend className="fx-tip-cap">{t('what')}</legend>
              <label className="fx-sh-check"><input type="radio" name="pw" checked={what === 'sheet'} data-print-what="sheet" onChange={() => setWhat('sheet')} />{t('sheet', { ref: data(false).ref })}</label>
              <label className={`fx-sh-check${selection ? '' : ' is-dis'}`}><input type="radio" name="pw" disabled={!selection} checked={what === 'selection'} data-print-what="selection" onChange={() => setWhat('selection')} />{t('selection')}</label>
            </fieldset>
            <fieldset className="fx-tip-set"><legend className="fx-tip-cap">{t('orientation')}</legend>
              <label className="fx-sh-check"><input type="radio" name="po" checked={!land} data-print-portrait="" onChange={() => setLand(false)} />{t('portrait')}</label>
              <label className="fx-sh-check"><input type="radio" name="po" checked={land} data-print-landscape="" onChange={() => setLand(true)} />{t('landscape')}</label>
            </fieldset>
            <label className="fx-sh-field"><span>{t('scaling')}</span>
              <select value={scale} data-print-scale="" onChange={e => setScale(e.target.value as Scale)}>
                <option value="fitCols">{t('fitCols')}</option><option value="none">{t('noScale')}</option><option value="fitSheet">{t('fitSheet')}</option>
              </select></label>
            {!d.headings && (
              <label className="fx-sh-field"><span>{t('repeat')}</span>
                <input type="text" value={rep} dir="ltr" data-print-repeat-rows="" aria-invalid={!!rep.trim() && !repeat} onChange={e => setRep(e.target.value)} placeholder="$1:$1" /></label>
            )}
            <fieldset className="fx-tip-set"><legend className="fx-tip-cap">{t('print')}</legend>
              <label className="fx-sh-check"><input type="checkbox" checked={grid} data-print-grid="" onChange={e => setGrid(e.target.checked)} />{t('gridlines')}</label>
              <label className="fx-sh-check"><input type="checkbox" checked={heads} data-print-heads="" onChange={e => setHeads(e.target.checked)} />{t('headings')}</label>
            </fieldset>
          </div>
          <div className="fx-print-pv" aria-label={t('preview')}>
            {Array.from({ length: Math.min(2, pages) }, (_, p) => (
              <figure key={p} className={`fx-print-page${land ? ' is-land' : ''}`}>
                <div className="fx-print-paper" data-print-page={p + 1}>
                  {table(body.slice(p * perPage, p * perPage + Math.min(perPage, 12)), head, true)}
                </div>
                <figcaption>{p === 0 ? t('page', { n: 1, of: pages }) : t('pageRepeat', { n: 2, of: pages })}</figcaption>
              </figure>
            ))}
          </div>
        </div>
        <div className="fx-sh-dialog-row">
          <span className="fx-sh-dialog-sp fx-print-hint">{t('hint')}</span>
          <button type="button" onClick={onClose}>{t('cancel')}</button>
          <button type="button" className="is-lime" data-ok="" onClick={() => setPrinting(true)}>{t('go')}</button>
        </div>
      </Modal>
      {printing && createPortal(
        <div id="fx-print-root" data-print-root="" data-landscape={land || undefined}>
          <style>{`@page { size: A4 ${land ? 'landscape' : 'portrait'}; margin: 12mm; }`}</style>
          <h1 className="fx-print-title">{d.title}</h1>
          <div style={scale === 'none' ? undefined : { width: '100%', zoom: scale === 'fitSheet' ? Math.min(1, (land ? 1060 : 720) / Math.max(1, totalW), (land ? 640 : 960) / Math.max(1, (d.rows.length + 1) * 22)) : Math.min(1, (land ? 1060 : 720) / Math.max(1, totalW)) }}>
            {table(body, head, false)}
          </div>
        </div>, document.body)}
    </>
  )
}
