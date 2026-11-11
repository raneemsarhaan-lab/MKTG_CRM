'use client'

/**
 * A popover under a toolbar button (spec 015 contracts/ui.md §2): the colour
 * and border pickers. Kept on screen, opposite side in Arabic; Esc or a click
 * outside closes it and focus goes back to the button.
 */
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'

export function Pop({ anchor, label, onClose, children, attr, role = 'dialog' }: {
  anchor: HTMLElement
  label: string
  onClose(): void
  children: ReactNode
  attr?: string
  role?: 'dialog' | 'menu'
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null)
  const closeRef = useRef(onClose)
  closeRef.current = onClose

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const r = anchor.getBoundingClientRect(), w = el.offsetWidth, h = el.offsetHeight
    const rtl = getComputedStyle(anchor).direction === 'rtl'
    let left = rtl ? r.right - w : r.left
    left = Math.max(8, Math.min(left, window.innerWidth - w - 8))
    let top = r.bottom + 4
    if (top + h > window.innerHeight - 8) top = Math.max(8, r.top - h - 4)
    setPos({ left, top })
  }, [anchor])

  useEffect(() => {
    requestAnimationFrame(() => ref.current?.querySelector<HTMLElement>('[data-autofocus], button:not(:disabled), input')?.focus())
    const down = (e: PointerEvent) => {
      if (ref.current?.contains(e.target as Node) || anchor.contains(e.target as Node)) return
      closeRef.current()
    }
    document.addEventListener('pointerdown', down, true)
    return () => document.removeEventListener('pointerdown', down, true)
  }, [anchor])

  return (
    <div ref={ref} role={role} aria-label={label} className="fx-fmt-pop" {...(attr ? { [attr]: '' } : {})}
         style={pos ? { left: pos.left, top: pos.top } : { visibility: 'hidden', left: 0, top: 0 }}
         onKeyDown={e => {
           if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closeRef.current(); requestAnimationFrame(() => anchor.focus()) }
         }}>
      {children}
    </div>
  )
}

/** Arrow keys over a grid of buttons (`cols` per row), mirrored in Arabic. */
export function gridKeys(e: React.KeyboardEvent<HTMLElement>, cols: number) {
  const k = e.key
  if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(k)) return
  const box = e.currentTarget
  const list = [...box.querySelectorAll<HTMLButtonElement>('button')]
  const i = list.indexOf(document.activeElement as HTMLButtonElement)
  if (i < 0) return
  const rtl = getComputedStyle(box).direction === 'rtl'
  const step = k === 'ArrowDown' ? cols : k === 'ArrowUp' ? -cols : k === 'Home' ? -i : k === 'End' ? list.length - 1 - i
    : (k === 'ArrowRight') !== rtl ? 1 : -1
  const next = list[Math.max(0, Math.min(list.length - 1, i + step))]
  if (next) { e.preventDefault(); e.stopPropagation(); next.focus() }
}
