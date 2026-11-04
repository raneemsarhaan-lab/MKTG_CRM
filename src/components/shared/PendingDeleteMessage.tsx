'use client'

import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { useUIStore } from '@/store/useUIStore'
import { undoDelete } from '@/lib/pending-deletes'
import { ATTACH_UI, BRIEF_UI, COLORS, alpha } from '@/lib/tokens'

/**
 * The bottom "Deleted name · Undo" message for deletes whose panel has closed
 * (spec 007 FR-034). It shows the newest such delete; the delete itself is sent
 * by src/lib/pending-deletes.ts when its window ends.
 *
 * No server action in here, so the attachments lab can mount it as it is.
 */
export function PendingDeleteMessage() {
  const t = useTranslations('attachments')
  const pending = useUIStore(s => s.pendingDeletes)
  const shown = Object.values(pending)
    .filter(e => e.phase === 'after-close')
    .sort((a, b) => b.deadline - a.deadline)[0]

  // Kept for the moment after Undo, so screen readers hear "Restored".
  const [restored, setRestored] = useState<string | null>(null)
  useEffect(() => {
    if (!restored) return
    const id = setTimeout(() => setRestored(null), 2500)
    return () => clearTimeout(id)
  }, [restored])

  if (!shown && !restored) return null
  const name = shown?.attachment.filename ?? restored ?? ''
  const short = name.length > 42 ? `${name.slice(0, 20)}…${name.slice(-19)}` : name

  return (
    <div
      role="status"
      aria-live="polite"
      data-pending-delete-message=""
      style={{
        position: 'fixed', left: '50%', transform: 'translateX(-50%)', zIndex: 90,
        bottom: 'calc(20px + env(safe-area-inset-bottom, 0px))',
        maxWidth: 'calc(100vw - 32px)', display: 'flex', alignItems: 'center', gap: 14,
        padding: '8px 8px 8px 16px', borderRadius: 12, background: BRIEF_UI.ink, color: ATTACH_UI.onDark,
        fontSize: 14, fontWeight: 600, boxShadow: `0 10px 30px ${alpha(BRIEF_UI.ink, 0.28)}`,
      }}
    >
      <span title={name} style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {shown
          ? t(shown.label === 'replaced' ? 'msgReplaced' : 'msgDeleted', { name: short })
          : t('aRestored', { name: short })}
      </span>
      {shown && (
        <button
          type="button"
          data-pending-undo=""
          onClick={() => { const a = undoDelete(shown.attachment.id); if (a) setRestored(a.filename) }}
          style={{
            height: 30, border: 'none', borderRadius: 8, padding: '0 12px', cursor: 'pointer', flexShrink: 0,
            background: COLORS.lime, color: BRIEF_UI.ink, fontWeight: 800, fontFamily: 'inherit', fontSize: 13,
          }}
        >
          {t('undo')}
        </button>
      )}
    </div>
  )
}
