'use client'

/**
 * Paste clips (spec 008 FR-032–FR-034, contracts/paste-format.md): rows copied
 * from Google Sheets become a preview of new clips, clips already in the sheet,
 * and rows without a clip file name, which can be fixed in place or left out.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { parseClipFileName } from '@/lib/clip-file-name'
import {
  cellsFromHtml, cellsFromText, parseClipRows, type PastedCell, type ParsedClip,
} from './parse-clips'
import { formatClipTime } from './time'
import { hostOf } from './FilesCell'
import type { AddClipsResult, SheetClipRow } from './types'

interface Fix { title: string; file_name: string; leftOut: boolean }

export function PastePreview({ videoName, existingFileNames, initialCells, onAdd, onClose }: {
  videoName: string
  existingFileNames: string[]
  /** Rows already pasted into the grid, or null to start with an empty box. */
  initialCells: PastedCell[][] | null
  onAdd(rows: SheetClipRow[]): Promise<AddClipsResult>
  onClose(message?: string): void
}) {
  const t = useTranslations('sheet')
  const [cells, setCells] = useState<PastedCell[][]>(initialCells ?? [])
  const [text, setText] = useState('')
  const [fixes, setFixes] = useState<Fix[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const boxRef = useRef<HTMLTextAreaElement>(null)
  const dialogRef = useRef<HTMLDivElement>(null)

  const preview = useMemo(() => parseClipRows(cells, existingFileNames), [cells, existingFileNames])
  // Unmatched rows start as they were pasted; a fixed file name moves the row to New.
  useEffect(() => {
    setFixes(preview.unmatched.map(u => ({ title: u.title, file_name: u.file_name, leftOut: false })))
  }, [preview])

  useEffect(() => { (initialCells ? dialogRef.current?.querySelector<HTMLElement>('[data-add]') : boxRef.current)?.focus() }, [initialCells])

  // A row without a clip file name is added only once it is fixed in place
  // (FR-034); until then it is listed, and can be left out of the list.
  const fixedClips: (ParsedClip & { fixed: true })[] = []
  preview.unmatched.forEach((u, i) => {
    const f = fixes[i]
    if (!f || f.leftOut) return
    const p = parseClipFileName(f.file_name)
    if (p) fixedClips.push({ ...p, file_name: f.file_name.trim(), title: f.title.trim() || f.file_name.trim(), link: u.link, fixed: true })
  })
  const fresh = [...preview.fresh, ...fixedClips]
  const unmatchedLeft = preview.unmatched.filter((_, i) => !fixes[i]?.leftOut && !parseClipFileName(fixes[i]?.file_name)).length
  const count = fresh.length

  function onPaste(e: React.ClipboardEvent<HTMLTextAreaElement>) {
    const html = e.clipboardData.getData('text/html')
    const plain = e.clipboardData.getData('text/plain')
    if (html && /<t[rd][\s>]/i.test(html)) {
      e.preventDefault()
      setText(plain)
      setCells(cellsFromHtml(html, new DOMParser()))
    }
  }

  async function add() {
    if (!count || busy) return
    setBusy(true); setError(null)
    const rows: SheetClipRow[] = fresh.map(c => ({ title: c.title, file_name: c.file_name, link: c.link }))
    const res = await onAdd(rows)
    setBusy(false)
    if (!res.success) { setError(res.error ?? t('err.generic')); return }
    const created = res.created?.length ?? 0
    const skipped = res.skipped?.length ?? 0
    onClose([t('paste.added', { count: created }), skipped ? t('paste.skippedOthers', { count: skipped }) : ''].filter(Boolean).join(' · '))
  }

  return (
    <div className="fx-sheet-dlg" onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}>
      <div
        ref={dialogRef}
        className="fx-sheet-dlg-in"
        role="dialog"
        aria-modal="true"
        aria-labelledby="fx-sheet-paste-title"
        data-paste-preview=""
        onKeyDown={e => {
          if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); onClose() }
          if (e.key === 'Tab') {
            // Keep focus inside the dialog.
            const els = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>('textarea, input, button:not([disabled])') ?? [])
            const i = els.indexOf(document.activeElement as HTMLElement)
            if (e.shiftKey && i <= 0) { e.preventDefault(); els[els.length - 1]?.focus() }
            else if (!e.shiftKey && i === els.length - 1) { e.preventDefault(); els[0]?.focus() }
          }
        }}
      >
        <div className="fx-sheet-dlg-head">
          <h2 id="fx-sheet-paste-title">{t('paste.title')}</h2>
          <p>{t('paste.forVideo', { name: videoName })}</p>
          <p>{t('paste.intro')}</p>
        </div>
        <div className="fx-sheet-dlg-body">
          <textarea
            ref={boxRef}
            value={text}
            aria-label={t('paste.box')}
            placeholder={t('paste.placeholder')}
            onPaste={onPaste}
            onChange={e => { setText(e.target.value); setCells(cellsFromText(e.target.value)) }}
          />
          {(preview.fresh.length + preview.existing.length + preview.unmatched.length > 0) && (
            <p className="fx-sheet-counts" role="status" data-paste-counts="">
              {t('paste.counts', { fresh: fresh.length, existing: preview.existing.length, unmatched: unmatchedLeft })}
              {preview.overflow > 0 && <> · {t('paste.overflow', { count: preview.overflow })}</>}
            </p>
          )}
          {cells.length > 0 && !preview.fresh.length && !preview.existing.length && !preview.unmatched.length && (
            <p className="fx-sheet-counts">{t('paste.noneFound')}</p>
          )}

          {fresh.length > 0 && (
            <section aria-label={t('paste.newSection')}>
              <div className="fx-sheet-sect">{t('paste.newSection')}</div>
              <div className="fx-sheet-ptab-wrap">
                <table className="fx-sheet-ptab" data-paste-new="">
                  <thead><tr>
                    <th>{t('col.clipNo')}</th><th>{t('col.title')}</th><th>{t('col.source')}</th>
                    <th>{t('paste.inOut')}</th><th>{t('col.length')}</th><th>{t('paste.link')}</th>
                  </tr></thead>
                  <tbody>
                    {fresh.map(c => (
                      <tr key={c.file_name} className={'fixed' in c ? 'is-fixed' : undefined}>
                        <td className="fx-sheet-num">{String(c.clip_no).padStart(2, '0')}</td>
                        <td>{c.title}</td>
                        <td className="fx-sheet-mono">{c.source}</td>
                        <td className="fx-sheet-num">{formatClipTime(c.in_ms)} → {formatClipTime(c.out_ms)}</td>
                        <td className="fx-sheet-num">{formatClipTime(c.out_ms - c.in_ms)}</td>
                        <td>{c.link ? hostOf(c.link) : <span className="fx-sheet-muted">{t('paste.noLink')}</span>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {preview.unmatched.length > 0 && (
            <section aria-label={t('paste.unmatchedSection')}>
              <div className="fx-sheet-sect">{t('paste.unmatchedSection')}</div>
              <div className="fx-sheet-ptab-wrap">
                <table className="fx-sheet-ptab" data-paste-unmatched="">
                  <thead><tr><th>{t('paste.pasted')}</th><th>{t('col.title')}</th><th>{t('col.fileName')}</th><th /></tr></thead>
                  <tbody>
                    {preview.unmatched.map((u, i) => {
                      const f = fixes[i] ?? { title: u.title, file_name: '', leftOut: false }
                      const set = (patch: Partial<Fix>) => setFixes(prev => prev.map((x, j) => (j === i ? { ...x, ...patch } : x)))
                      return (
                        <tr key={i} className={f.leftOut ? 'is-out' : parseClipFileName(f.file_name) ? 'is-fixed' : undefined}>
                          <td className="fx-sheet-muted fx-sheet-pasted" title={u.cells.join(' · ')}>{u.cells.join(' · ')}</td>
                          <td><input value={f.title} disabled={f.leftOut} aria-label={t('col.title')}
                                     onChange={e => set({ title: e.target.value })} /></td>
                          <td><input value={f.file_name} disabled={f.leftOut} aria-label={t('col.fileName')}
                                     placeholder={t('paste.fileHint')} className="fx-sheet-mono"
                                     onChange={e => set({ file_name: e.target.value })} /></td>
                          <td><button type="button" className="fx-sheet-btn" onClick={() => set({ leftOut: !f.leftOut })}>
                            {f.leftOut ? t('paste.keep') : t('paste.leaveOut')}
                          </button></td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          )}
        </div>
        <div className="fx-sheet-dlg-foot">
          {error && <span className="fx-sheet-note" role="alert">{error}</span>}
          <button type="button" className="fx-sheet-btn" onClick={() => onClose()}>{t('paste.close')}</button>
          <button type="button" className="fx-sheet-btn is-primary" data-add="" disabled={!count || busy} onClick={() => void add()}>
            {busy ? t('paste.adding') : t('paste.add', { count })}
          </button>
        </div>
      </div>
    </div>
  )
}
