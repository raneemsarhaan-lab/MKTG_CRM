'use client'

/**
 * The Inbox button in the Board header (spec 006 FR-010–FR-014, FR-012a–d).
 *
 * Purple with a count when something needs the member, quiet and outlined
 * ("All clear") when nothing does, so the colour keeps meaning "something is
 * here". The number sits on the icon's corner; it turns orange when anything
 * counted is due today or late. A soft ring pulses three times when something
 * new arrived since the member last opened the Inbox on this device (R9).
 */
import { forwardRef, useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { inboxSummary, type InboxCounts } from '@/lib/inbox'

const SEEN_KEY = 'momentum.inbox.seen'

function readSeen(): Set<string> | null {
  try {
    const raw = window.localStorage.getItem(SEEN_KEY)
    return raw ? new Set(JSON.parse(raw) as string[]) : new Set()
  } catch { return null }
}

/** Remember what was waiting when the member opened the Inbox, so the ring stops. */
export function markInboxSeen(keys: string[]) {
  try { window.localStorage.setItem(SEEN_KEY, JSON.stringify(keys.slice(0, 500))) } catch { /* private mode */ }
}

export function TrayIcon({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
         strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M22 12h-6l-2 3h-4l-2-3H2" />
      <path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" />
    </svg>
  )
}

export const InboxButton = forwardRef<HTMLButtonElement, {
  counts: InboxCounts
  ringKeys: string[]
  open: boolean
  onToggle(): void
}>(function InboxButton({ counts, ringKeys, open, onToggle }, ref) {
  const t = useTranslations('inbox')
  const [ring, setRing] = useState(false)
  const sig = ringKeys.join('|')

  // After mount only: the seen list is a per-device preference (§VI).
  useEffect(() => {
    const seen = readSeen()
    if (!seen) return
    setRing(sig.split('|').some(k => k && !seen.has(k)))
  }, [sig])
  useEffect(() => {
    if (open) { markInboxSeen(sig ? sig.split('|') : []); setRing(false) }
  }, [open, sig])

  const parts = inboxSummary(counts)
  const summary = parts.length
    ? parts.map(p => t(`summary.${p.key}`, { n: p.n })).join(' · ')
    : t('button.allClear')
  const zero = counts.total === 0

  return (
    <button
      ref={ref}
      type="button"
      className={`fx-inbox-btn${zero ? ' is-zero' : ''}${ring && !zero ? ' is-ring' : ''}`}
      aria-expanded={open}
      aria-controls="fx-inbox-panel"
      data-inbox-button=""
      data-count={counts.total}
      onClick={onToggle}
    >
      <span className="fx-inbox-ico">
        <TrayIcon />
        {!zero && (
          <span className={`fx-inbox-badge${counts.urgent ? ' is-urgent' : ''}`} data-inbox-badge="" aria-hidden="true">
            {counts.total > 99 ? '99+' : counts.total}
          </span>
        )}
      </span>
      {/* The visible words start the accessible name; the counts in words
          follow for screen readers (FR-013), e.g. "Inbox, 2 reviews waiting ·
          1 late, 5 to do, 2 unread mentions". */}
      <span className="fx-inbox-txt">
        <b>{t('button.label')}</b>
        <small data-inbox-summary="">{summary}</small>
      </span>
      {!zero && <span className="fx-sheet-sr">{t('button.sr', { todo: counts.todo, unread: counts.unread })}</span>}
    </button>
  )
})
