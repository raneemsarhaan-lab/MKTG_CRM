'use client'

import { useEffect, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { BRIEF_UI, COLORS } from '@/lib/tokens'
import { normaliseUrl, youtubeId } from '@/lib/links'
import type { TaskAttachment } from '@/types/index'
import { ToolButton } from './Toolbar'
import { useOverlay, useOverlayStack } from './useOverlayStack'

/** Insert items that need a value before they can be inserted. */
export type PromptKind = 'image' | 'youtube' | 'subtask' | 'link'

const IMAGE_TIMEOUT_MS = 8000

/**
 * The strip under the toolbar that asks for a link, image, video or subtask.
 *
 * Nothing goes into the brief until the value has been checked (research R3,
 * R4, R8): a link must be an address (and gains `https://` if it lacked one),
 * an image address must actually load (with a preview first), a video must be
 * a YouTube link. The audit found a mistyped image saved into the brief and
 * then lost on reopening (E4); a typed domain saved as a broken relative link
 * (E3); a YouTube link inserted as loose text (E10).
 */
export function ValuePrompt({ kind, initial = '', images, onConfirm, onPickAttachment, onCancel, returnFocusTo }: {
  kind: PromptKind
  initial?: string
  images: TaskAttachment[]
  /** Receives the checked value: a normalised href for link/image/youtube. */
  onConfirm: (value: string) => Promise<void> | void
  onPickAttachment: (a: TaskAttachment) => void
  onCancel: () => void
  returnFocusTo?: HTMLElement | null
}) {
  const t = useTranslations('briefEditor')
  const stack = useOverlayStack()
  const ref = useRef<HTMLDivElement>(null)
  const [draft, setDraft] = useState(initial)
  const [busy, setBusy] = useState(false)
  const [image, setImage] = useState<{ src: string; state: 'loading' | 'ok' | 'bad' } | null>(null)
  useOverlay(`prompt:${kind}`, true, onCancel, { returnFocusTo, root: () => ref.current })

  const LABEL: Record<PromptKind, [string, string, string]> = {
    link:    [t('linkLabel'),    t('linkPlaceholder'),    initial ? t('updateLink') : t('addLink')],
    image:   [t('imageLabel'),   t('imagePlaceholder'),   t('insertImage')],
    youtube: [t('youtubeLabel'), t('youtubePlaceholder'), t('addVideo')],
    subtask: [t('subtaskLabel'), t('subtaskPlaceholder'), t('createSubtask')],
  }

  // Validate as the person types. An empty box is not an error yet.
  const v = draft.trim()
  let error = ''
  let value = v
  if (v && kind !== 'subtask') {
    const n = normaliseUrl(v)
    if (!n.ok) error = t(n.reason === 'spaces' ? 'urlSpaces' : n.reason === 'empty' ? 'urlEmpty' : 'urlInvalid')
    else value = n.href
    if (!error && kind === 'youtube' && !youtubeId(value)) error = t('notYoutube')
    if (!error && kind === 'image' && value.startsWith('/')) error = t('urlInvalid')
  }

  // An image address has to load before it can be inserted.
  useEffect(() => {
    if (kind !== 'image' || !value || error) { setImage(null); return }
    setImage({ src: value, state: 'loading' })
    const img = new Image()
    let done = false
    const finish = (state: 'ok' | 'bad') => { if (!done) { done = true; setImage(cur => cur && cur.src === value ? { src: value, state } : cur) } }
    const timer = setTimeout(() => finish('bad'), IMAGE_TIMEOUT_MS)
    const delay = setTimeout(() => {
      img.onload = () => { clearTimeout(timer); finish('ok') }
      img.onerror = () => { clearTimeout(timer); finish('bad') }
      img.src = value
    }, 250)
    return () => { done = true; clearTimeout(timer); clearTimeout(delay) }
  }, [kind, value, error])

  if (kind === 'image' && image?.state === 'bad' && image.src === value) error = t('imageWontLoad')
  const ready = !!v && !error && !busy && (kind !== 'image' || image?.state === 'ok')

  async function confirm() {
    if (!ready) return
    setBusy(true)
    try { await onConfirm(kind === 'subtask' ? v : value) } finally { setBusy(false) }
  }

  return (
    <div ref={ref} data-overlay="" style={{
      display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
      padding: '10px 14px', background: BRIEF_UI.blueLight,
    }}>
      <label htmlFor={`brief-prompt-${kind}`} style={{ fontSize: 12.5, fontWeight: 700, color: BRIEF_UI.blue }}>
        {LABEL[kind][0]}
      </label>
      <input
        id={`brief-prompt-${kind}`}
        value={draft}
        autoFocus
        autoComplete="off"
        placeholder={LABEL[kind][1]}
        aria-invalid={!!error}
        aria-describedby={error ? `brief-prompt-${kind}-err` : undefined}
        onChange={e => setDraft(e.target.value)}
        onKeyDown={e => {
          e.stopPropagation()
          if (e.key === 'Enter')  { e.preventDefault(); void confirm() }
          if (e.key === 'Escape') { e.preventDefault(); if (!stack?.closeTop()) onCancel() }
        }}
        style={{
          flex: 1, minWidth: 180, height: 30, padding: '0 10px', borderRadius: 8,
          border: `1px solid ${error ? BRIEF_UI.error : 'transparent'}`, background: COLORS.panel, fontSize: 13,
          fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box', color: BRIEF_UI.ink,
        }}
      />
      <button type="button" onClick={() => void confirm()} disabled={!ready}
              style={{
                height: 30, padding: '0 12px', border: 'none', borderRadius: 8,
                background: BRIEF_UI.blue, color: COLORS.panel, fontWeight: 700, fontSize: 12.5,
                cursor: ready ? 'pointer' : 'default', fontFamily: 'inherit', opacity: ready ? 1 : 0.5,
              }}>
        {busy ? t('working') : LABEL[kind][2]}
      </button>
      <ToolButton title={t('cancel')} onClick={() => { if (!stack?.closeTop()) onCancel() }}>{t('cancel')}</ToolButton>

      {error && (
        <div id={`brief-prompt-${kind}-err`} role="alert" style={{ width: '100%', fontSize: 12, fontWeight: 600, color: BRIEF_UI.error }}>
          {error}
        </div>
      )}
      {kind === 'image' && image?.state === 'loading' && (
        <div style={{ width: '100%', fontSize: 12, color: BRIEF_UI.label }}>{t('imageChecking')}</div>
      )}
      {kind === 'image' && image?.state === 'ok' && (
        // eslint-disable-next-line @next/next/no-img-element -- a preview of an arbitrary address the person typed
        <img src={image.src} alt="" data-preview="" style={{ maxHeight: 120, maxWidth: '100%', borderRadius: 8 }} />
      )}

      {kind === 'image' && images.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, width: '100%', flexWrap: 'wrap' }}>
          <span style={{ fontSize: 12, color: BRIEF_UI.label }}>{t('orAttachment')}</span>
          {images.slice(0, 6).map(a => (
            <button
              key={a.id}
              type="button"
              title={a.filename}
              onClick={() => onPickAttachment(a)}
              style={{
                height: 28, padding: '0 10px', border: 'none', borderRadius: 7,
                background: COLORS.panel, color: BRIEF_UI.ink, fontSize: 12.5, cursor: 'pointer',
                fontFamily: 'inherit', maxWidth: 160, overflow: 'hidden',
                textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}
            >
              {a.filename}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
