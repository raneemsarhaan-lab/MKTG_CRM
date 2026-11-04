'use client'

import { useEffect, useRef } from 'react'
import { useTranslations } from 'next-intl'
import { BRIEF_UI, COLORS, alpha } from '@/lib/tokens'
import { useOverlay } from './useOverlayStack'

/**
 * "Your last changes aren't saved. Stay · Leave anyway" — shown instead of
 * leaving the brief when a save has failed or an image is still uploading
 * (FR-004, research R1, R5). Never `window.confirm`: the artifact-style
 * in-panel bar keeps the person's place and works on every device.
 */
export function ConfirmLeave({ reason, onStay, onLeave }: {
  reason: 'unsaved' | 'uploading'
  onStay: () => void
  onLeave: () => void
}) {
  const t = useTranslations('briefEditor')
  const ref = useRef<HTMLDivElement>(null)
  const stayRef = useRef<HTMLButtonElement>(null)
  useOverlay('confirm-leave', true, onStay, { root: () => ref.current })
  useEffect(() => { stayRef.current?.focus() }, [])

  return (
    <div
      ref={ref}
      role="alertdialog"
      aria-live="assertive"
      aria-label={t(reason === 'unsaved' ? 'unsaved' : 'uploadingLeave')}
      data-overlay=""
      data-confirm-leave=""
      style={{
        display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
        padding: '9px 14px', background: alpha(BRIEF_UI.error, 0.08), color: BRIEF_UI.ink, fontSize: 13,
      }}
    >
      <b style={{ color: BRIEF_UI.error, fontWeight: 700 }}>
        {t(reason === 'unsaved' ? 'unsaved' : 'uploadingLeave')}
      </b>
      <span style={{ flex: 1 }} />
      <button ref={stayRef} type="button" onClick={onStay}
              style={{ height: 30, padding: '0 14px', border: 'none', borderRadius: 8, background: BRIEF_UI.blue, color: COLORS.panel, fontWeight: 700, fontSize: 12.5, cursor: 'pointer', fontFamily: 'inherit' }}>
        {t('stay')}
      </button>
      <button type="button" onClick={onLeave}
              style={{ height: 30, padding: '0 12px', border: 'none', borderRadius: 8, background: 'transparent', color: BRIEF_UI.ink, fontWeight: 600, fontSize: 12.5, cursor: 'pointer', fontFamily: 'inherit' }}>
        {t('leaveAnyway')}
      </button>
    </div>
  )
}
