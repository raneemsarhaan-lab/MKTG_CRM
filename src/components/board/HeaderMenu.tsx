'use client'

/**
 * A toolbar button with a menu under it (spec 011 contract §3): the brand
 * dropdown and Filters.
 *
 * Enter, Space or ↓ opens it and moves focus to the first item; ↑↓ move
 * between items; Esc closes and returns focus to the button; Tab leaves and
 * closes. The panel opens under the button from its start side, so it
 * mirrors in Arabic. Clicking an item keeps the menu open, so several can be
 * ticked; clicking outside closes it.
 */
import { useEffect, useRef, useState, type ReactNode } from 'react'

const ITEMS = 'button:not([disabled]), input:not([disabled]), select:not([disabled])'

export function HeaderMenu({ trigger, label, width = 280, align = 'start', className = '', data, children }: {
  trigger: ReactNode
  /** The panel's accessible name. */
  label: string
  width?: number
  align?: 'start' | 'end'
  className?: string
  /** A data attribute name for the button, e.g. "data-brand-menu". */
  data?: string
  children: ReactNode
}) {
  const [open, setOpen] = useState(false)
  const wrap = useRef<HTMLDivElement>(null)
  const btn = useRef<HTMLButtonElement>(null)
  const panel = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    requestAnimationFrame(() => panel.current?.querySelector<HTMLElement>(ITEMS)?.focus())
    function onDown(e: MouseEvent) { if (!wrap.current?.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  function onKey(e: React.KeyboardEvent) {
    if (e.key === 'Escape' && open) { e.preventDefault(); e.stopPropagation(); setOpen(false); btn.current?.focus(); return }
    if (e.key === 'Tab' && open) { setOpen(false); return }
    if (!open && e.target === btn.current && e.key === 'ArrowDown') { e.preventDefault(); setOpen(true); return }
    if (!open || (e.key !== 'ArrowDown' && e.key !== 'ArrowUp')) return
    // Typing in a text field keeps its own arrows.
    if ((e.target as HTMLElement).tagName === 'INPUT' && (e.target as HTMLInputElement).type !== 'checkbox') return
    const items = Array.from(panel.current?.querySelectorAll<HTMLElement>(ITEMS) ?? [])
    if (!items.length) return
    e.preventDefault()
    const i = items.indexOf(document.activeElement as HTMLElement)
    const next = e.key === 'ArrowDown' ? (i + 1) % items.length : (i - 1 + items.length) % items.length
    items[next].focus()
  }

  const dataAttr = data ? { [data]: '' } : {}
  return (
    <div ref={wrap} className={`fx-hd-menu ${className}`} onKeyDown={onKey}>
      <button ref={btn} type="button" className="fx-hd-btn" aria-haspopup="true" aria-expanded={open}
              onClick={() => setOpen(v => !v)} {...dataAttr}>
        {trigger}
      </button>
      {open && (
        <div ref={panel} className={`fx-hd-pop${align === 'end' ? ' is-end' : ''}`} role="dialog" aria-label={label} style={{ width }}>
          {children}
        </div>
      )}
    </div>
  )
}

export function ChevronIcon() {
  return (
    <svg className="fx-hd-chev" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
      <path d="m6 9 6 6 6-6" />
    </svg>
  )
}
