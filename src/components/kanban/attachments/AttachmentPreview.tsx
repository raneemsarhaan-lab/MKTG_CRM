'use client'

import { useEffect, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import type { Member, TaskAttachment } from '@/types/index'
import { attachmentKind, attachmentSrc, extensionOf, isImageAttachment } from '@/lib/attachments'
import { FILE_KIND_COLORS } from '@/lib/tokens'
import { AttIcon } from './icons'
import { ageLabel } from './order'
import { formatBytes } from './limits'
import { firstName } from './names'

/** The badge colour for a file that isn't a picture (FR-004). */
export function kindColor(filename: string): string {
  const ext = extensionOf(filename)
  if (ext === 'pdf') return FILE_KIND_COLORS.pdf
  if (['doc', 'docx', 'txt', 'rtf', 'odt'].includes(ext)) return FILE_KIND_COLORS.document
  if (['ppt', 'pptx', 'key'].includes(ext)) return FILE_KIND_COLORS.slides
  if (['xls', 'xlsx', 'csv', 'numbers'].includes(ext)) return FILE_KIND_COLORS.spreadsheet
  if (['srt', 'vtt'].includes(ext)) return FILE_KIND_COLORS.subtitles
  if (['zip', 'rar', '7z', 'tar', 'gz'].includes(ext)) return FILE_KIND_COLORS.archive
  const kind = attachmentKind(filename)
  if (kind === 'video') return FILE_KIND_COLORS.video
  if (kind === 'audio') return FILE_KIND_COLORS.audio
  return FILE_KIND_COLORS.other
}

/** Where a download link points, and how: a data URL downloads in place, a bucket URL opens in a tab. */
export function downloadProps(a: TaskAttachment) {
  const href = attachmentSrc(a) ?? undefined
  return a.data
    ? { href, download: a.filename }
    : { href, target: '_blank', rel: 'noopener noreferrer' }
}

/**
 * The full-screen preview (spec 007 US2, FR-020–FR-025, research R11,
 * contracts/keyboard-and-a11y.md "Preview").
 *
 * `list` is every stored file in grid order, including those behind "Show all"
 * (FR-021). Moving between them keeps the dialog open; a click on the dark area
 * around the file, Esc or Close shut it and hand focus back to the grid.
 */
export function AttachmentPreview({ list, index, onIndex, onClose, members, ownerName }: {
  list: TaskAttachment[]
  index: number
  onIndex: (i: number) => void
  /** With the id of the file showing, so the grid can focus its tile. */
  onClose: (lastId: string) => void
  members: Pick<Member, 'id' | 'name'>[]
  ownerName: string
}) {
  const t = useTranslations('attachments')
  const a = list[Math.min(Math.max(index, 0), list.length - 1)]
  const [zoom, setZoom] = useState(false)
  const rootRef  = useRef<HTMLDivElement>(null)
  const closeRef = useRef<HTMLButtonElement>(null)
  const swipe    = useRef<{ x: number; y: number } | null>(null)

  useEffect(() => { setZoom(false) }, [index])
  useEffect(() => { closeRef.current?.focus() }, [])

  const rtl = typeof document !== 'undefined' && getComputedStyle(document.documentElement).direction === 'rtl'
  const go = (i: number) => { if (i >= 0 && i < list.length) onIndex(i) }

  // On the window, in the capture phase: the task panel also closes on Esc,
  // and must not when this is open (it would close both).
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (!a) return
      const forward = rtl ? 'ArrowLeft' : 'ArrowRight'
      const back    = rtl ? 'ArrowRight' : 'ArrowLeft'
      let handled = true
      if (e.key === 'Escape') onClose(a.id)
      else if (e.key === forward) go(index + 1)
      else if (e.key === back) go(index - 1)
      else if (e.key === 'Home') go(0)
      else if (e.key === 'End') go(list.length - 1)
      else if (e.key === 'Tab') trapFocus(e)
      else handled = false
      if (handled && e.key !== 'Tab') { e.preventDefault(); e.stopPropagation() }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  })

  function trapFocus(e: KeyboardEvent) {
    const focusables = Array.from(rootRef.current?.querySelectorAll<HTMLElement>(
      'button:not([disabled]), a[href], iframe, video, audio, [tabindex="0"]') ?? [])
    if (!focusables.length) return
    const first = focusables[0], last = focusables[focusables.length - 1]
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus() }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() }
  }

  if (!a) return null
  const src   = attachmentSrc(a)
  const image = isImageAttachment(a)
  const kind  = attachmentKind(a.filename)
  const ext   = extensionOf(a.filename)
  const isPdf = ext === 'pdf'
  const who   = (a.uploaded_by && members.find(m => m.id === a.uploaded_by)?.name) || ownerName
  const age   = ageLabel(a.uploaded_at, new Date())
  const meta  = [firstName(who), t(age.key, 'n' in age ? { n: age.n } : {}), formatBytes(a.size_bytes)].filter(Boolean).join(' · ')

  /** A click on the dark area closes; a click on the file or a control doesn't. */
  function onBackdrop(e: React.MouseEvent) {
    const el = e.target as HTMLElement
    if (el.closest('img, iframe, video, audio, button, a, .fx-att-pv-card, .fx-att-pv-top, .fx-att-pv-film')) return
    onClose(a.id)
  }

  return (
    <div
      ref={rootRef}
      role="dialog"
      aria-modal="true"
      aria-label={t('dialogLabel', { name: a.filename })}
      className="fx-att-pv fx-attachment-preview"
      data-att-preview=""
      onClick={onBackdrop}
      onPointerDown={e => { if (e.pointerType !== 'mouse' && !zoom) swipe.current = { x: e.clientX, y: e.clientY } }}
      onPointerUp={e => {
        const s = swipe.current; swipe.current = null
        if (!s) return
        const dx = e.clientX - s.x, dy = e.clientY - s.y
        if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)) go(index + ((dx < 0) !== rtl ? 1 : -1))
      }}
    >
      <div className="fx-att-pv-top">
        <div className="fx-att-pv-title">
          <b title={a.filename}>{a.filename}</b>
          <span>{meta}</span>
        </div>
        <span className="fx-att-pv-count" aria-live="polite">{t('counter', { index: index + 1, total: list.length })}</span>
        {isPdf && src && (
          <a className="fx-att-pv-btn" href={src} target="_blank" rel="noopener noreferrer">
            <AttIcon name="external" size={15} /> {t('openNewTab')}
          </a>
        )}
        {src && (
          <a className="fx-att-pv-btn" {...downloadProps(a)} aria-label={t('downloadName', { name: a.filename })}>
            <AttIcon name="download" size={16} /> {t('download')}
          </a>
        )}
        <button ref={closeRef} type="button" className="fx-att-pv-btn is-icon" onClick={() => onClose(a.id)}
                aria-label={t('close')} title={t('close')}>
          <AttIcon name="close" size={17} />
        </button>
      </div>

      <div className="fx-att-pv-stage">
        <button type="button" className="fx-att-pv-nav is-prev" onClick={() => go(index - 1)}
                disabled={index === 0} aria-label={t('previous')}>
          <AttIcon name="left" size={22} />
        </button>

        <div className={`fx-att-pv-body${zoom && image ? ' is-zoomed' : ''}`}>
          {image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={src ?? ''} alt={a.filename} title={zoom ? t('zoomOut') : t('zoomIn')}
                 onClick={() => setZoom(z => !z)} />
          ) : isPdf && src ? (
            // Chrome's PDF viewer: no fixed-width toolbar, fit to width (see the old preview's notes).
            <iframe src={`${src}#toolbar=0&navpanes=0&view=FitH`} title={a.filename}
                    style={{ width: '100%', height: '100%', border: 'none', borderRadius: 8, background: 'var(--panel)' }} />
          ) : kind === 'video' && src ? (
            <video src={src} controls style={{ maxWidth: '100%', maxHeight: '100%', borderRadius: 8 }} />
          ) : kind === 'audio' && src ? (
            <audio src={src} controls style={{ width: 'min(480px, 90vw)' }} />
          ) : (
            <div className="fx-att-pv-card">
              <span className="fx-att-file">
                <AttIcon name="file" size={44} width={1.5} />
                {ext && <span className="fx-att-badge" style={{ background: kindColor(a.filename) }}>{ext.toUpperCase()}</span>}
              </span>
              <span>{ext ? t('noPreview', { ext }) : t('noPreviewGeneric')}</span>
              {src && (
                <a className="fx-att-btn is-primary" {...downloadProps(a)}
                   style={{ display: 'inline-flex', alignItems: 'center', gap: 6, textDecoration: 'none' }}>
                  <AttIcon name="download" size={15} /> {t('download')}
                </a>
              )}
            </div>
          )}
        </div>

        <button type="button" className="fx-att-pv-nav is-next" onClick={() => go(index + 1)}
                disabled={index >= list.length - 1} aria-label={t('next')}>
          <AttIcon name="right" size={22} />
        </button>
      </div>

      {list.length > 1 && (
        <div className="fx-att-pv-film" role="group" aria-label={t('allFiles')}>
          {list.map((f, i) => (
            <button key={f.id} type="button" aria-current={i === index} aria-label={f.filename} title={f.filename}
                    onClick={() => go(i)}>
              {isImageAttachment(f)
                // eslint-disable-next-line @next/next/no-img-element
                ? <img src={attachmentSrc(f) ?? ''} alt="" />
                : (extensionOf(f.filename) || 'file').toUpperCase().slice(0, 4)}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
