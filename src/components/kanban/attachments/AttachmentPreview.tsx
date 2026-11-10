'use client'

import { useEffect, useLayoutEffect, useRef, useState } from 'react'
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
  const rootRef  = useRef<HTMLDivElement>(null)
  const closeRef = useRef<HTMLButtonElement>(null)
  const swipe    = useRef<{ x: number; y: number } | null>(null)

  const bodyRef  = useRef<HTMLDivElement>(null)
  const imgRef   = useRef<HTMLImageElement>(null)
  /** Fitted size: the full height of the preview area, the width following; narrower when the image is too wide for the screen. */
  const [fit, setFit] = useState<{ w: number; h: number } | null>(null)
  /**
   * The zoom, as in ClickUp: 1 (100%) is the fitted image. The zoom bar steps
   * it by 25%, the slider sets it, and a click on the image jumps to the file's
   * real size at the spot clicked.
   */
  const [scale, setScale] = useState(1)
  const zoom = Math.abs(scale - 1) > 0.001
  /** The image point to keep under a screen point after a zoom (fractions of the image; px in the area). */
  const keep = useRef<{ fx: number; fy: number; px: number; py: number } | null>(null)
  /** A drag to look around the zoomed image (mouse). */
  const drag = useRef<{ x: number; y: number; left: number; top: number; moved: boolean } | null>(null)
  const [dragging, setDragging] = useState(false)

  useEffect(() => { setScale(1); setFit(null) }, [index])

  function measure() {
    const i = imgRef.current, body = bodyRef.current
    if (!i || !body || !i.naturalWidth || !i.naturalHeight) return
    const W = body.clientWidth, H = body.clientHeight
    if (!W || !H) return
    const s = Math.min(H / i.naturalHeight, W / i.naturalWidth)
    const w = Math.round(i.naturalWidth * s), h = Math.round(i.naturalHeight * s)
    setFit(f => (f && f.w === w && f.h === h ? f : { w, h }))
  }
  // Refit when the window or the preview area changes size.
  useEffect(() => {
    const body = bodyRef.current
    if (!body) return
    const ro = new ResizeObserver(() => measure())
    ro.observe(body)
    return () => ro.disconnect()
  })

  /** The file's real size, as a zoom level. */
  const realScale = fit && imgRef.current?.naturalWidth ? imgRef.current.naturalWidth / fit.w : 1
  /** Zoom only helps when the file is bigger than the fitted image. */
  const canZoom = realScale > 1.01
  const MIN = 0.25
  const max = Math.max(4, Math.min(8, realScale))
  const clamp = (v: number) => Math.min(max, Math.max(MIN, Math.round(v * 100) / 100))

  /** Zoom to `next`, keeping the image point under (px, py) where it is; the middle of the area by default. */
  function zoomTo(next: number, at?: { x: number; y: number }) {
    const body = bodyRef.current, i = imgRef.current
    if (!body || !i || !fit) return
    const v = clamp(next)
    const r = i.getBoundingClientRect(), b = body.getBoundingClientRect()
    const px = at ? at.x - b.left : body.clientWidth / 2, py = at ? at.y - b.top : body.clientHeight / 2
    keep.current = {
      fx: Math.min(1, Math.max(0, (b.left + px - r.left) / r.width)),
      fy: Math.min(1, Math.max(0, (b.top + py - r.top) / r.height)),
      px, py,
    }
    setScale(v)
  }
  /** Fit to the area's width (a tall image then scrolls), or back to the screen. */
  function fitWidth() {
    const body = bodyRef.current
    if (!body || !fit) return
    const v = body.clientWidth / fit.w
    if (Math.abs(scale - v) < 0.01) { zoomTo(1); return }
    keep.current = { fx: 0.5, fy: 0, px: body.clientWidth / 2, py: 0 }
    setScale(clamp(v))
  }
  useLayoutEffect(() => {
    const body = bodyRef.current, i = imgRef.current, k = keep.current
    if (!body || !i || !k) return
    keep.current = null
    body.scrollLeft = i.offsetLeft + k.fx * i.offsetWidth - k.px
    body.scrollTop = i.offsetTop + k.fy * i.offsetHeight - k.py
  }, [scale])

  function onImageClick(e: React.MouseEvent<HTMLImageElement>) {
    // The end of a drag isn't a click.
    if (drag.current?.moved) { drag.current = null; return }
    drag.current = null
    if (zoom) { zoomTo(1); return }
    if (!canZoom) return
    // Real size, with the clicked spot in the middle of the screen.
    const body = bodyRef.current, r = e.currentTarget.getBoundingClientRect()
    if (!body) return
    keep.current = { fx: (e.clientX - r.left) / r.width, fy: (e.clientY - r.top) / r.height, px: body.clientWidth / 2, py: body.clientHeight / 2 }
    setScale(Math.min(max, realScale))
  }
  const overflows = () => { const b = bodyRef.current; return !!b && (b.scrollWidth > b.clientWidth + 1 || b.scrollHeight > b.clientHeight + 1) }
  function onImagePointerDown(e: React.PointerEvent<HTMLImageElement>) {
    if (!zoom || e.pointerType !== 'mouse' || e.button !== 0 || !overflows()) return
    const body = bodyRef.current
    if (!body) return
    e.preventDefault()
    drag.current = { x: e.clientX, y: e.clientY, left: body.scrollLeft, top: body.scrollTop, moved: false }
    e.currentTarget.setPointerCapture(e.pointerId)
    setDragging(true)
  }
  function onImagePointerMove(e: React.PointerEvent<HTMLImageElement>) {
    const d = drag.current, body = bodyRef.current
    if (!d || !body) return
    const dx = e.clientX - d.x, dy = e.clientY - d.y
    if (Math.abs(dx) + Math.abs(dy) > 4) d.moved = true
    body.scrollLeft = d.left - dx
    body.scrollTop = d.top - dy
  }
  // Ctrl/Cmd + scroll (and a trackpad pinch) zooms at the pointer.
  useEffect(() => {
    const body = bodyRef.current
    if (!body) return
    const onWheel = (e: WheelEvent) => {
      if (!(e.ctrlKey || e.metaKey) || !imgRef.current) return
      e.preventDefault()
      zoomTo(scale * Math.exp(-e.deltaY / 300), { x: e.clientX, y: e.clientY })
    }
    body.addEventListener('wheel', onWheel, { passive: false })
    return () => body.removeEventListener('wheel', onWheel)
  })
  useEffect(() => { closeRef.current?.focus() }, [])

  const image = !!a && isImageAttachment(a)
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
      // The zoom slider keeps its own arrow keys; a text field (none today) would keep all of them.
      const onSlider = e.target instanceof HTMLInputElement && e.target.type === 'range'
      const typing = e.target instanceof HTMLInputElement && !onSlider
      if (onSlider && ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End', 'PageUp', 'PageDown'].includes(e.key)) return
      if (e.key === 'Escape') { if (zoom) zoomTo(1); else onClose(a.id) }
      else if (!typing && image && (e.key === '+' || e.key === '=')) zoomTo(scale + 0.25)
      else if (!typing && image && (e.key === '-' || e.key === '_')) zoomTo(scale - 0.25)
      else if (!typing && image && e.key === '0') zoomTo(1)
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
  const kind  = attachmentKind(a.filename)
  const ext   = extensionOf(a.filename)
  const isPdf = ext === 'pdf'
  const who   = (a.uploaded_by && members.find(m => m.id === a.uploaded_by)?.name) || ownerName
  const age   = ageLabel(a.uploaded_at, new Date())
  const meta  = [firstName(who), t(age.key, 'n' in age ? { n: age.n } : {}), formatBytes(a.size_bytes)].filter(Boolean).join(' · ')

  /** A click on the dark area closes; a click on the file or a control doesn't. */
  function onBackdrop(e: React.MouseEvent) {
    const el = e.target as HTMLElement
    if (el.closest('img, iframe, video, audio, button, a, input, .fx-att-pv-card, .fx-att-pv-top, .fx-att-pv-film, .fx-att-pv-zoom')) return
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
      onPointerDown={e => { if (e.pointerType !== 'mouse' && !zoom && !(e.target as HTMLElement).closest('.fx-att-pv-zoom')) swipe.current = { x: e.clientX, y: e.clientY } }}
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

        <div ref={bodyRef} className={`fx-att-pv-body${zoom && image ? ' is-zoomed' : ''}`}>
          {image ? (
            // Fitted inside the screen, never larger than the file; a click
            // shows it at its real size, centred on the spot clicked.
            // eslint-disable-next-line @next/next/no-img-element
            <img ref={imgRef} src={src ?? ''} alt={a.filename} draggable={false}
                 className={`${zoom ? 'is-zoomed-out' : canZoom ? 'can-zoom' : ''}${dragging ? ' is-dragging' : ''}`}
                 title={zoom ? t('zoomOut') : canZoom ? t('zoomIn') : undefined}
                 style={!fit ? { visibility: 'hidden' }
                   // At real size, the file's own pixels; otherwise the fitted size times the zoom.
                   : Math.abs(scale - realScale) < 0.005 && imgRef.current ? { width: imgRef.current.naturalWidth, height: imgRef.current.naturalHeight }
                   : { width: Math.round(fit.w * scale), height: Math.round(fit.h * scale) }}
                 onLoad={measure}
                 onClick={onImageClick}
                 onPointerDown={onImagePointerDown}
                 onPointerMove={onImagePointerMove}
                 onPointerUp={() => setDragging(false)}
                 onPointerCancel={() => { drag.current = null; setDragging(false) }} />
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

        {image && fit && (
          <div className="fx-att-pv-zoom" role="group" aria-label={t('zoomBar')} data-att-zoom="">
            <button type="button" onClick={() => zoomTo(scale - 0.25)} disabled={scale <= MIN + 0.001}
                    aria-label={t('zoomOutBtn')} title={t('zoomOutBtn')} data-zoom-out="">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true"><path d="M5 12h14" /></svg>
            </button>
            <input type="range" min={MIN * 100} max={Math.round(max * 100)} step={5} value={Math.round(scale * 100)}
                   aria-label={t('zoomBar')} aria-valuetext={`${Math.round(scale * 100)}%`} data-zoom-slider=""
                   style={{ ['--pos' as string]: `${((scale - MIN) / (max - MIN)) * 100}%` }}
                   onChange={e => zoomTo(Number(e.target.value) / 100)} />
            <button type="button" onClick={() => zoomTo(scale + 0.25)} disabled={scale >= max - 0.001}
                    aria-label={t('zoomInBtn')} title={t('zoomInBtn')} data-zoom-in="">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true"><path d="M5 12h14M12 5v14" /></svg>
            </button>
            <button type="button" className="fx-att-pv-pct" onClick={() => zoomTo(1)} title={t('zoomFit')}
                    aria-label={`${Math.round(scale * 100)}%, ${t('zoomFit')}`} data-zoom-pct="">{Math.round(scale * 100)}%</button>
            <button type="button" onClick={fitWidth} aria-label={t('zoomWidth')} title={t('zoomWidth')} data-zoom-width="">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 12h18M7 8l-4 4 4 4M17 8l4 4-4 4" /></svg>
            </button>
          </div>
        )}

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
