'use client'

import { useCallback, useEffect, useState } from 'react'
import { COLORS } from '@/lib/tokens'
import { ImageWithFallback } from '@/components/shared/ImageWithFallback'
import {
  attachmentKind, imageAttachments, isImageAttachment, kindIcon, shortName,
} from '@/lib/attachments'
import type { TaskAttachment } from '@/types/index'

/**
 * Attachment previews for the task panel.
 *
 * Images get thumbnails and a lightbox; everything else stays a labelled link,
 * because a .srt or a .psd has nothing to show. An image whose URL will not
 * load — the host is reachable from a browser but not from every network —
 * demotes itself to a file row rather than leaving a broken tile behind.
 */

interface Props {
  attachments: TaskAttachment[]
}

const PaperclipIcon = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor"
       strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
  </svg>
)

function FileRow({ a }: { a: TaskAttachment }) {
  const kind = attachmentKind(a.filename)
  return (
    <li>
      <a
        href={a.url ?? undefined}
        target="_blank"
        rel="noopener noreferrer"
        title={a.filename}
        style={{
          display: 'flex', alignItems: 'center', gap: 7,
          fontSize: '0.78rem', color: a.url ? '#6E5BE6' : COLORS.muted,
          textDecoration: 'none', padding: '5px 7px', borderRadius: 6,
          border: `1px solid ${COLORS.line}`, background: '#FCFCFB',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}
      >
        <span aria-hidden="true" style={{ width: 14, textAlign: 'center' }}>{kindIcon(kind)}</span>
        {shortName(a.filename, 40)}
      </a>
    </li>
  )
}

/**
 * Reports a thumbnail that will not load, so it moves to the file list.
 *
 * Rendering-phase setState is not allowed, hence the effect — and the parent
 * guards on the id already being present so this settles after one pass.
 */
function FailedTile({ id, onFail }: { id: string; onFail: (id: string) => void }) {
  useEffect(() => { onFail(id) }, [id, onFail])
  return null
}

export function AttachmentGallery({ attachments }: Props) {
  const [failed, setFailed] = useState<Set<string>>(new Set())
  const markFailed = useCallback((id: string) => {
    setFailed(prev => (prev.has(id) ? prev : new Set(prev).add(id)))
  }, [])
  const [openIdx, setOpenIdx] = useState<number | null>(null)

  const images = imageAttachments(attachments).filter(a => !failed.has(a.id))
  const files  = attachments.filter(a => !isImageAttachment(a) || failed.has(a.id))

  const open = openIdx !== null ? images[openIdx] ?? null : null

  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        // Capture phase, so this runs before the panel's own Escape handler and
        // the first press closes the lightbox rather than the whole task.
        e.preventDefault()
        e.stopPropagation()
        setOpenIdx(null)
      }
      if (e.key === 'ArrowRight') setOpenIdx(i => (i === null ? null : (i + 1) % images.length))
      if (e.key === 'ArrowLeft')  setOpenIdx(i => (i === null ? null : (i - 1 + images.length) % images.length))
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [open, images.length])

  if (attachments.length === 0) return null

  return (
    <div style={{ marginTop: 18 }}>
      <div style={{
        fontSize: '0.6rem', color: COLORS.muted, marginBottom: 8,
        textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 700,
        display: 'flex', alignItems: 'center', gap: 6,
      }}>
        <PaperclipIcon /> Attachments ({attachments.length})
      </div>

      {images.length > 0 && (
        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(88px, 1fr))',
          gap: 6, marginBottom: files.length > 0 ? 10 : 0,
        }}>
          {images.map((a, i) => (
            <button
              key={a.id}
              type="button"
              onClick={() => setOpenIdx(i)}
              title={a.filename}
              aria-label={`Preview ${a.filename}`}
              style={{
                position: 'relative', aspectRatio: '1 / 1', padding: 0, cursor: 'zoom-in',
                border: `1px solid ${COLORS.line}`, borderRadius: 8, overflow: 'hidden',
                background: '#F4F4F2', display: 'block',
              }}
            >
              <ImageWithFallback
                src={a.url}
                alt={a.filename}
                loading="lazy"
                style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                fallback={<FailedTile id={a.id} onFail={markFailed} />}
              />
            </button>
          ))}
        </div>
      )}

      {files.length > 0 && (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 4 }}>
          {files.map(a => <FileRow key={a.id} a={a} />)}
        </ul>
      )}

      {open && (
        <div
          onClick={() => setOpenIdx(null)}
          role="dialog"
          aria-modal="true"
          aria-label={open.filename}
          style={{
            position: 'fixed', inset: 0, zIndex: 60,
            background: 'rgba(12,14,18,.9)', backdropFilter: 'blur(2px)',
            display: 'flex', flexDirection: 'column', alignItems: 'center',
            justifyContent: 'center', padding: '3.5rem 4rem', gap: 14,
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={open.url ?? ''}
            alt={open.filename}
            onClick={e => e.stopPropagation()}
            style={{
              maxWidth: '100%', maxHeight: 'calc(100vh - 12rem)',
              objectFit: 'contain', borderRadius: 8, background: '#fff',
            }}
          />

          <div
            onClick={e => e.stopPropagation()}
            style={{
              display: 'flex', alignItems: 'center', gap: 14, color: '#fff',
              fontSize: '0.78rem', maxWidth: '100%',
            }}
          >
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {open.filename}
            </span>
            <a
              href={open.url ?? undefined}
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: 'var(--brand-lime)', fontWeight: 700, whiteSpace: 'nowrap' }}
            >
              Open original ↗
            </a>
            {images.length > 1 && (
              <span style={{ color: '#B9BCC2', whiteSpace: 'nowrap' }}>
                {(openIdx ?? 0) + 1} / {images.length}
              </span>
            )}
          </div>

          {images.length > 1 && (
            <>
              <NavButton
                side="left"
                onClick={e => { e.stopPropagation(); setOpenIdx(i => (i === null ? null : (i - 1 + images.length) % images.length)) }}
              />
              <NavButton
                side="right"
                onClick={e => { e.stopPropagation(); setOpenIdx(i => (i === null ? null : (i + 1) % images.length)) }}
              />
            </>
          )}

          <button
            type="button"
            aria-label="Close preview"
            onClick={e => { e.stopPropagation(); setOpenIdx(null) }}
            style={{
              position: 'absolute', top: 18, right: 20, width: 34, height: 34,
              borderRadius: '50%', border: 'none', cursor: 'pointer',
              background: 'rgba(255,255,255,.14)', color: '#fff', fontSize: '0.9rem',
            }}
          >
            ✕
          </button>
        </div>
      )}
    </div>
  )
}

function NavButton({ side, onClick }: {
  side: 'left' | 'right'
  onClick: (e: React.MouseEvent) => void
}) {
  return (
    <button
      type="button"
      aria-label={side === 'left' ? 'Previous image' : 'Next image'}
      onClick={onClick}
      style={{
        position: 'absolute', [side]: 16, top: '50%', transform: 'translateY(-50%)',
        width: 38, height: 38, borderRadius: '50%', border: 'none', cursor: 'pointer',
        background: 'rgba(255,255,255,.14)', color: '#fff', fontSize: '1rem',
      }}
    >
      {side === 'left' ? '‹' : '›'}
    </button>
  )
}
