'use client'

import { useEffect, useRef } from 'react'
import { useTranslations } from 'next-intl'
import { BRIEF_UI, COLORS, alpha } from '@/lib/tokens'
import type { MentionState } from './extensions'
import { useOverlay } from './useOverlayStack'
import { PersonAvatar } from '@/components/sheet/PersonChip'

/**
 * The "@" menu's list (spec 012 R11): people, where the "@" was typed. Like
 * the "/" menu, keys reach it through the editor; this draws the list and
 * takes mouse picks, and sits on the overlay stack so Esc closes it first.
 */
export function MentionMenu({ state, active, onClose }: {
  state: MentionState
  active: number
  onClose: () => void
}) {
  const t = useTranslations('briefEditor')
  const ref = useRef<HTMLDivElement>(null)
  useOverlay('mention', true, onClose, { root: () => ref.current })

  useEffect(() => {
    ref.current?.querySelector<HTMLElement>('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' })
  }, [active])

  const rect = state.rect
  if (!rect) return null
  const rtl = typeof document !== 'undefined' && getComputedStyle(document.documentElement).direction === 'rtl'
  const below = rect.bottom + 6
  const fitsBelow = below + 260 < window.innerHeight

  return (
    <div
      ref={ref}
      id="brief-mention-menu"
      role="listbox"
      aria-label={t('mentionLabel')}
      data-overlay=""
      data-brief-mention=""
      onMouseDown={e => e.preventDefault()}
      style={{
        position: 'fixed', zIndex: 80, width: 240, maxHeight: 260, overflowY: 'auto',
        top: fitsBelow ? below : Math.max(8, rect.top - 266),
        ...(rtl ? { right: Math.max(8, window.innerWidth - rect.right) } : { left: Math.max(8, Math.min(rect.left, window.innerWidth - 248)) }),
        background: COLORS.panel, borderRadius: 12, padding: 5,
        boxShadow: `0 12px 32px ${alpha(BRIEF_UI.ink, 0.16)}`,
      }}
    >
      {state.items.map((p, i) => (
        <div
          key={p.id}
          id={`brief-mention-${p.id}`}
          role="option"
          aria-selected={i === active}
          onClick={() => state.select(p)}
          style={{
            display: 'flex', alignItems: 'center', gap: 9, padding: '7px 9px', borderRadius: 8,
            fontSize: 12.5, color: BRIEF_UI.ink, cursor: 'pointer',
            background: i === active ? BRIEF_UI.blueLight : 'transparent',
          }}
        >
          <PersonAvatar member={p} />
          <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</span>
          {p.role && <span style={{ fontSize: 11, color: BRIEF_UI.faint }}>{p.role}</span>}
        </div>
      ))}
    </div>
  )
}
