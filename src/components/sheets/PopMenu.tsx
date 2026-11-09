'use client'

/**
 * The Sheets menus (contracts/ui.md §4, §5): the cell, row and heading menus,
 * the tab menu in Excel's order, and the folder menus. Opened at a point (a
 * right-click) or under an element, kept on screen, keyboard first: ↑/↓,
 * Home/End and a typed letter move; Enter or Space chooses; Esc or Tab closes
 * and focus goes back to where it was.
 *
 * A disabled item stays focusable so its reason is read aloud (FR-059d), and
 * the reason shows under it.
 */
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'

export type PopItem =
  | { kind?: 'item'; key: string; label: string; kbd?: string; disabled?: boolean; why?: string; danger?: boolean; checked?: boolean; onSelect(): void }
  | { kind: 'sep'; key: string }
  /** Anything else in the menu: the tab colour swatches. Its buttons join the arrow keys. */
  | { kind: 'node'; key: string; node: ReactNode }

export function PopMenu({ at, label, items, onClose, returnTo, attr }: {
  at: { x: number; y: number }
  label: string
  items: PopItem[]
  onClose(): void
  /** Focus goes back here on close. */
  returnTo?: HTMLElement | null
  /** A data attribute for the labs (`data-tab-menu`, `data-cell-menu`…). */
  attr?: string
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null)
  const typed = useRef({ text: '', at: 0 })
  const closeRef = useRef(onClose)
  closeRef.current = onClose

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const w = el.offsetWidth, h = el.offsetHeight
    const rtl = getComputedStyle(el).direction === 'rtl'
    let left = rtl ? at.x - w : at.x
    left = Math.max(8, Math.min(left, window.innerWidth - w - 8))
    let top = at.y + 2
    if (top + h > window.innerHeight - 8) top = Math.max(8, at.y - h - 2)
    setPos({ left, top })
  }, [at.x, at.y])

  const focusables = () => [...(ref.current?.querySelectorAll<HTMLElement>('[role="menuitem"], [role="menuitemradio"]') ?? [])]

  useEffect(() => {
    requestAnimationFrame(() => {
      const list = focusables()
      ;(list.find(b => b.getAttribute('aria-disabled') !== 'true') ?? list[0])?.focus()
    })
  }, [])

  const close = (restore: boolean) => {
    closeRef.current()
    if (restore && returnTo?.isConnected) requestAnimationFrame(() => returnTo.focus())
  }

  useEffect(() => {
    const down = (e: PointerEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) close(false) }
    // Opening can scroll the grid (selecting a whole column brings its cell into view): ignore that.
    const opened = Date.now()
    const scroll = (e: Event) => { if (Date.now() - opened > 400 && ref.current && !ref.current.contains(e.target as Node)) close(false) }
    document.addEventListener('pointerdown', down, true)
    window.addEventListener('resize', () => close(false))
    document.addEventListener('scroll', scroll, true)
    return () => { document.removeEventListener('pointerdown', down, true); document.removeEventListener('scroll', scroll, true) }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  function onKeyDown(e: React.KeyboardEvent) {
    const list = focusables()
    const i = list.indexOf(document.activeElement as HTMLElement)
    const go = (n: number) => { e.preventDefault(); list[(n + list.length) % list.length]?.focus() }
    switch (e.key) {
      case 'ArrowDown': return go(i + 1)
      case 'ArrowUp': return go(i - 1)
      case 'Home': return go(0)
      case 'End': return go(list.length - 1)
      case 'Escape': e.preventDefault(); e.stopPropagation(); return close(true)
      case 'Tab': e.preventDefault(); return close(true)
    }
    if (e.key.length === 1 && /\S/.test(e.key) && !e.ctrlKey && !e.metaKey) {
      const now = Date.now()
      typed.current = { text: (now - typed.current.at < 700 ? typed.current.text : '') + e.key.toLowerCase(), at: now }
      const hit = list.find(b => (b.textContent ?? '').trim().toLowerCase().startsWith(typed.current.text))
      if (hit) { e.preventDefault(); hit.focus() }
    }
  }

  return (
    <div
      ref={ref}
      role="menu"
      aria-label={label}
      className="fx-sh-menu"
      {...(attr ? { [attr]: '' } : {})}
      style={pos ? { left: pos.left, top: pos.top } : { left: -9999, top: -9999 }}
      onKeyDown={onKeyDown}
      onContextMenu={e => e.preventDefault()}
    >
      {items.map(it => {
        if (it.kind === 'sep') return <hr key={it.key} />
        if (it.kind === 'node') return <div key={it.key} role="none">{it.node}</div>
        const whyId = it.disabled && it.why ? `fx-sh-why-${it.key}` : undefined
        return (
          <div key={it.key} role="none">
            <button
              type="button"
              role="menuitem"
              tabIndex={-1}
              data-item={it.key}
              aria-disabled={it.disabled || undefined}
              aria-describedby={whyId}
              className={`${it.danger ? 'is-danger' : ''}${it.disabled ? ' is-disabled' : ''}`}
              onClick={() => { if (it.disabled) return; close(false); it.onSelect() }}
              onKeyDown={e => { if ((e.key === 'Enter' || e.key === ' ') && !it.disabled) { e.preventDefault(); close(false); it.onSelect() } }}
            >
              <span>{it.checked ? '✓ ' : ''}{it.label}</span>
              {it.kbd && <kbd>{it.kbd}</kbd>}
            </button>
            {whyId && <span className="fx-sh-why" id={whyId}>{it.why}</span>}
          </div>
        )
      })}
    </div>
  )
}
