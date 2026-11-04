'use client'

/**
 * The sheet's menus and popovers (contracts/sheet-ui.md §4): fixed to the cell
 * that opened them, keyboard first. ↑/↓, Home/End and typeahead move; Enter
 * chooses; Esc closes and returns focus to the cell.
 */
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'

export interface MenuItem {
  key: string
  label: ReactNode
  /** Plain text for typeahead and the accessible name. */
  text: string
  hint?: ReactNode
  /** A group heading shown before the first item of each group. */
  group?: string
  dot?: string
  tone?: 'next' | 'danger'
  onSelect(): void
}

function usePlacement(anchor: HTMLElement | null, ref: React.RefObject<HTMLDivElement | null>) {
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null)
  useLayoutEffect(() => {
    const el = ref.current
    if (!anchor || !el) return
    const place = () => {
      const r = anchor.getBoundingClientRect()
      const w = el.offsetWidth, h = el.offsetHeight
      const rtl = getComputedStyle(anchor).direction === 'rtl'
      let left = rtl ? r.right - w : r.left
      left = Math.max(8, Math.min(left, window.innerWidth - w - 8))
      let top = r.bottom + 4
      if (top + h > window.innerHeight - 8) top = Math.max(8, r.top - h - 4)
      setPos({ left, top })
    }
    place()
    window.addEventListener('resize', place)
    return () => window.removeEventListener('resize', place)
  }, [anchor, ref])
  return pos
}

export function SheetMenu({ anchor, label, items, onClose }: {
  anchor: HTMLElement | null
  label: string
  items: MenuItem[]
  onClose(restoreFocus: boolean): void
}) {
  const ref = useRef<HTMLDivElement>(null)
  const pos = usePlacement(anchor, ref)
  const typed = useRef({ text: '', at: 0 })

  useEffect(() => {
    requestAnimationFrame(() => ref.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus())
  }, [])
  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node) && !anchor?.contains(e.target as Node)) onClose(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [anchor, onClose])

  function onKeyDown(e: React.KeyboardEvent) {
    const els = Array.from(ref.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])
    const i = els.indexOf(document.activeElement as HTMLElement)
    const go = (j: number) => { e.preventDefault(); els[(j + els.length) % els.length]?.focus() }
    if (e.key === 'ArrowDown') return go(i + 1)
    if (e.key === 'ArrowUp') return go(i - 1)
    if (e.key === 'Home') return go(0)
    if (e.key === 'End') return go(els.length - 1)
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); onClose(true); return }
    if (e.key === 'Tab') { e.preventDefault(); onClose(true); return }
    if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
      const now = Date.now()
      typed.current = { text: (now - typed.current.at < 700 ? typed.current.text : '') + e.key.toLowerCase(), at: now }
      const j = items.findIndex(it => it.text.toLowerCase().startsWith(typed.current.text))
      if (j >= 0) go(j)
    }
  }

  let lastGroup: string | undefined
  return (
    <div
      ref={ref}
      role="menu"
      aria-label={label}
      className="fx-sheet-menu"
      data-sheet-menu=""
      onKeyDown={onKeyDown}
      style={{ left: pos?.left ?? -9999, top: pos?.top ?? -9999 }}
    >
      {items.map(it => {
        const heading = it.group && it.group !== lastGroup ? it.group : null
        lastGroup = it.group
        return (
          <div key={it.key} role="none">
            {heading && <div className="fx-sheet-menu-group" role="presentation">{heading}</div>}
            <button
              type="button"
              role="menuitem"
              tabIndex={-1}
              data-menu-item={it.key}
              className={`fx-sheet-menu-item${it.tone ? ` is-${it.tone}` : ''}`}
              onClick={() => it.onSelect()}
            >
              {it.dot && <i className="fx-sheet-dot" style={{ background: it.dot }} aria-hidden="true" />}
              <span className="fx-sheet-menu-label">{it.label}</span>
              {it.hint && <small>{it.hint}</small>}
            </button>
          </div>
        )
      })}
    </div>
  )
}

/** A small dialog fixed to a cell: the link prompts and the Drop confirm. */
export function SheetPopover({ anchor, label, children, onClose }: {
  anchor: HTMLElement | null
  label: string
  children: ReactNode
  onClose(restoreFocus: boolean): void
}) {
  const ref = useRef<HTMLDivElement>(null)
  const pos = usePlacement(anchor, ref)
  useEffect(() => {
    requestAnimationFrame(() => ref.current?.querySelector<HTMLElement>('input, [data-autofocus]')?.focus())
  }, [])
  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node) && !anchor?.contains(e.target as Node)) onClose(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [anchor, onClose])
  return (
    <div
      ref={ref}
      role="dialog"
      aria-label={label}
      className="fx-sheet-pop"
      data-sheet-pop=""
      onKeyDown={e => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); onClose(true) } }}
      style={{ left: pos?.left ?? -9999, top: pos?.top ?? -9999 }}
    >
      {children}
    </div>
  )
}
