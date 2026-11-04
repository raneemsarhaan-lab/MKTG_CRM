'use client'

import { useEffect, useRef } from 'react'
import { useTranslations } from 'next-intl'
import { BRIEF_UI, COLORS, alpha } from '@/lib/tokens'
import type { SlashState } from './extensions'
import { ToolIcon } from './Toolbar'
import { useOverlay } from './useOverlayStack'

/**
 * The "/" menu's list (FR-040–043). Keyboard handling lives in the suggestion
 * plugin (arrows and Enter reach it through the editor); this only draws the
 * list where the "/" was typed and takes mouse picks. It sits on the overlay
 * stack so Esc closes it before anything else, leaving the "/" as typed.
 */
export function SlashMenu({ state, active, onClose }: {
  state: SlashState
  active: number
  onClose: () => void
}) {
  const t = useTranslations('briefEditor')
  const ref = useRef<HTMLDivElement>(null)
  useOverlay('slash', true, onClose, { root: () => ref.current })

  useEffect(() => {
    ref.current?.querySelector<HTMLElement>('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' })
  }, [active])

  const rect = state.rect
  if (!rect) return null
  const rtl = typeof document !== 'undefined' && getComputedStyle(document.documentElement).direction === 'rtl'
  const below = rect.bottom + 6
  const fitsBelow = below + 300 < window.innerHeight

  return (
    <div
      ref={ref}
      id="brief-slash-menu"
      role="listbox"
      aria-label={t('insert')}
      data-overlay=""
      onMouseDown={e => e.preventDefault()}
      style={{
        position: 'fixed', zIndex: 80, width: 260, maxHeight: 300, overflowY: 'auto',
        top: fitsBelow ? below : Math.max(8, rect.top - 306),
        ...(rtl ? { right: Math.max(8, window.innerWidth - rect.right) } : { left: Math.max(8, Math.min(rect.left, window.innerWidth - 268)) }),
        background: COLORS.panel, borderRadius: 12, padding: 5,
        boxShadow: `0 12px 32px ${alpha(BRIEF_UI.ink, 0.16)}`,
      }}
    >
      {state.items.length === 0 && (
        <div style={{ padding: '7px 9px', fontSize: 12.5, color: BRIEF_UI.faint }}>{t('noMatches')}</div>
      )}
      {state.items.map((item, i) => (
        <div
          key={item.id}
          id={`brief-slash-${item.id}`}
          role="option"
          aria-selected={i === active}
          onClick={() => state.select(item)}
          style={{
            display: 'flex', alignItems: 'center', gap: 9, padding: '7px 9px', borderRadius: 8,
            fontSize: 12.5, color: BRIEF_UI.ink, cursor: 'pointer',
            background: i === active ? BRIEF_UI.blueLight : 'transparent',
          }}
        >
          <span aria-hidden="true" style={{ width: 16, color: BRIEF_UI.label, display: 'inline-flex' }}><ToolIcon name={item.icon} /></span>
          <span style={{ flex: 1 }}>{t(item.labelKey)}</span>
          {item.mdHint && <span style={{ fontSize: 11, color: BRIEF_UI.faint, fontFamily: 'ui-monospace, Menlo, monospace' }}>{item.mdHint}</span>}
        </div>
      ))}
    </div>
  )
}
