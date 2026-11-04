'use client'

import { useEffect, useRef } from 'react'
import { BRIEF_UI, COLORS, alpha } from '@/lib/tokens'
import { useOverlay, useOverlayStack } from './useOverlayStack'

/**
 * A dropdown menu that works from the keyboard as well as the mouse.
 * FR-044, FR-047, research R16, contracts/keyboard-and-a11y.md.
 *
 * Opening it moves focus to the checked item (Text style) or the first one.
 * Arrow keys move, Home/End jump, a letter jumps to the next item starting
 * with it, Enter/Space choose, Esc closes and gives focus back to the button
 * that opened it, Tab closes and lets focus move on. It sits on the editor's
 * overlay stack, so Esc never closes the editor while a menu is open (E1).
 */
export function Menu({ id, label, onClose, anchor, children, align = 'start' }: {
  id: string
  label: string
  onClose: () => void
  /** The trigger button: focus returns here on Esc. */
  anchor: HTMLElement | null
  children: React.ReactNode
  align?: 'start' | 'end'
}) {
  const ref = useRef<HTMLDivElement>(null)
  const stack = useOverlayStack()
  useOverlay(`menu:${id}`, true, onClose, { returnFocusTo: anchor, root: () => ref.current })

  useEffect(() => {
    const items = itemsOf(ref.current)
    const first = items.find(b => b.getAttribute('aria-checked') === 'true') ?? items[0]
    first?.focus()
  }, [])

  function onKeyDown(e: React.KeyboardEvent) {
    const items = itemsOf(ref.current)
    const i = items.indexOf(document.activeElement as HTMLButtonElement)
    const go = (n: number) => { e.preventDefault(); items[(n + items.length) % items.length]?.focus() }
    if (e.key === 'ArrowDown') return go(i + 1)
    if (e.key === 'ArrowUp') return go(i - 1)
    if (e.key === 'Home') return go(0)
    if (e.key === 'End') return go(items.length - 1)
    if (e.key === 'Escape') {
      e.preventDefault(); e.stopPropagation()
      if (!stack?.closeTop()) { onClose(); anchor?.focus() }
      return
    }
    if (e.key === 'Tab') { onClose(); return }
    if (e.key.length === 1 && /\S/.test(e.key)) {
      const k = e.key.toLowerCase()
      const n = items.findIndex((b, j) => j > i && (b.textContent ?? '').trim().toLowerCase().startsWith(k))
      const m = n >= 0 ? n : items.findIndex(b => (b.textContent ?? '').trim().toLowerCase().startsWith(k))
      if (m >= 0) go(m)
    }
  }

  return (
    <>
      {/* Click-away layer, so the menu closes without a document listener
          fighting the toolbar's own mousedown suppression. */}
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 70 }} />
      <div
        ref={ref}
        role="menu"
        aria-label={label}
        onKeyDown={onKeyDown}
        data-overlay=""
        style={{
          position: 'absolute', top: '100%', marginTop: 6, zIndex: 71,
          ...(align === 'end' ? { insetInlineEnd: 0 } : { insetInlineStart: 0 }),
          minWidth: 220, background: COLORS.panel, border: 'none',
          borderRadius: 12, boxShadow: `0 12px 32px ${alpha(BRIEF_UI.ink, 0.14)}`, padding: 5,
          maxHeight: 360, overflowY: 'auto',
        }}
      >
        {children}
      </div>
    </>
  )
}

function itemsOf(root: HTMLElement | null): HTMLButtonElement[] {
  return root ? [...root.querySelectorAll<HTMLButtonElement>('[role^="menuitem"]:not([aria-disabled="true"])')] : []
}

export function MenuItem({ icon, children, hint, checked, disabled, onClick }: {
  icon: React.ReactNode; children: React.ReactNode
  /** Right-aligned muted text: a Markdown shortcut (`#`, `-`, `[ ]`) or a note. */
  hint?: string
  /** Set on radio-style items (Text style): announces and shows the current choice. */
  checked?: boolean
  disabled?: boolean
  onClick: () => void
}) {
  const radio = checked !== undefined
  return (
    <button
      type="button"
      role={radio ? 'menuitemradio' : 'menuitem'}
      aria-checked={radio ? checked : undefined}
      aria-disabled={disabled || undefined}
      tabIndex={-1}
      onMouseDown={e => e.preventDefault()}
      onClick={() => { if (!disabled) onClick() }}
      style={{
        display: 'flex', alignItems: 'center', gap: 9, width: '100%',
        padding: '7px 9px', borderRadius: 8, border: 'none', background: 'transparent',
        color: BRIEF_UI.ink, fontSize: 12.5, fontFamily: 'inherit', outline: 'none',
        cursor: disabled ? 'default' : 'pointer', textAlign: 'start', opacity: disabled ? 0.4 : 1,
      }}
      onFocus={e => { if (!disabled) e.currentTarget.style.background = BRIEF_UI.blueLight }}
      onBlur={e => (e.currentTarget.style.background = 'transparent')}
      onMouseEnter={e => { if (!disabled) e.currentTarget.style.background = BRIEF_UI.blueLight }}
      onMouseLeave={e => { if (document.activeElement !== e.currentTarget) e.currentTarget.style.background = 'transparent' }}
    >
      {icon !== null && <span aria-hidden="true" style={{ width: 16, textAlign: 'center', color: BRIEF_UI.label }}>{icon}</span>}
      <span style={{ flex: 1, minWidth: 0 }}>{children}</span>
      {radio && checked
        ? <span aria-hidden="true" style={{ color: BRIEF_UI.blue, fontWeight: 800 }}>✓</span>
        : hint && <span style={{ marginInlineStart: 'auto', fontSize: 11, color: BRIEF_UI.faint, fontFamily: hint.length <= 4 ? 'ui-monospace, Menlo, monospace' : 'inherit' }}>{hint}</span>}
    </button>
  )
}
