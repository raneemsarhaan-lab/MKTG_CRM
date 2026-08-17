'use client'

import { useEffect, useRef, useState } from 'react'
import { COLORS } from '@/lib/tokens'

/**
 * Pill-with-popover — the ClickUp intake pattern.
 *
 * A compact chip that shows its current value and opens a small panel to
 * change it, instead of a permanently visible labelled field. Rendered in
 * Momentum's own tokens rather than ClickUp's.
 *
 * Closes on outside click and on Escape; Escape is stopped from bubbling so
 * it dismisses the popover without also closing the modal behind it.
 */

interface FieldPillProps {
  label:     string
  /** Rendered inside the pill when a value is set; falls back to `label`. */
  value?:    string | null
  icon?:     React.ReactNode
  /** Emphasise the pill to show it carries a non-default value. */
  active?:   boolean
  /**
   * 'field' is the intake modal's compact chip; 'view' is the Pipeline
   * handoff's 44px view toggle (§6). Same popover, different trigger.
   */
  variant?:  'field' | 'view'
  width?:    number
  children:  (close: () => void) => React.ReactNode
}

const PANEL_MAX = 300

export function FieldPill({ label, value, icon, active, variant = 'field', width = 240, children }: FieldPillProps) {
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState<{ top?: number; bottom?: number; left: number }>({ left: 0 })
  const wrapRef = useRef<HTMLDivElement>(null)
  const btnRef  = useRef<HTMLButtonElement>(null)

  // The modal body scrolls, so an absolutely-positioned panel gets clipped by
  // its overflow. Position against the viewport instead, and flip upward when
  // there is not enough room below.
  useEffect(() => {
    if (!open) return

    function place() {
      const r = btnRef.current?.getBoundingClientRect()
      if (!r) return
      const below = window.innerHeight - r.bottom
      const left  = Math.min(r.left, window.innerWidth - width - 12)
      setPos(below < PANEL_MAX && r.top > below
        ? { bottom: window.innerHeight - r.top + 6, left }
        : { top: r.bottom + 6, left })
    }

    place()
    window.addEventListener('resize', place)
    window.addEventListener('scroll', place, true)
    return () => {
      window.removeEventListener('resize', place)
      window.removeEventListener('scroll', place, true)
    }
  }, [open, width])

  useEffect(() => {
    if (!open) return

    function onDown(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false)
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') { e.stopPropagation(); setOpen(false) }
    }
    document.addEventListener('mousedown', onDown)
    // Capture phase so the modal's own Escape handler does not fire first.
    document.addEventListener('keydown', onKey, true)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey, true)
    }
  }, [open])

  return (
    <div ref={wrapRef} style={{ position: 'relative' }}>
      <button
        ref={btnRef}
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-haspopup="dialog"
        aria-expanded={open}
        style={variant === 'view' ? {
          display: 'inline-flex', alignItems: 'center', gap: 9, height: 44,
          padding: '0 20px', borderRadius: 12, fontSize: 13.5,
          border: `1px solid ${active ? '#14133C' : '#E9E9EF'}`,
          background: active ? '#14133C' : '#FFFFFF',
          color: active ? '#FFFFFF' : '#1F2430',
          fontWeight: active ? 700 : 600,
          fontFamily: 'inherit', cursor: 'pointer', whiteSpace: 'nowrap',
          transition: 'border-color 140ms ease-out, background 140ms ease-out',
        } : {
          display: 'inline-flex', alignItems: 'center', gap: 7,
          padding: '8px 13px', borderRadius: 9,
          // The border stays the same hairline whether the field is filled or
          // not. It used to go near-black once filled, which put a row of hard
          // outlines across the intake form and made a set of ordinary
          // dropdowns read as five separate emphases. Filled is said with the
          // text instead: darker and heavier, the way the reference says it.
          border: `1px solid ${COLORS.line}`,
          background: '#fff',
          color: active ? COLORS.ink : COLORS.muted,
          fontSize: 13.5, fontWeight: active ? 600 : 500,
          fontFamily: 'inherit', cursor: 'pointer', whiteSpace: 'nowrap',
          transition: 'border-color 140ms ease-out, background 140ms ease-out',
        }}
      >
        {variant === 'view' && (
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none"
               stroke={active ? '#FFFFFF' : '#1F2430'} strokeWidth="2.2" aria-hidden="true">
            <path d="M3 5h18l-7 8v6l-4-2v-4L3 5z" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
        {icon}
        {value || label}
      </button>

      {open && (
        <div
          role="dialog"
          aria-label={label}
          style={{
            position: 'fixed', top: pos.top, bottom: pos.bottom, left: pos.left,
            zIndex: 60, width,
            background: '#fff', border: `1px solid ${COLORS.line}`,
            borderRadius: 12, boxShadow: '0 12px 32px rgba(23,19,33,.18)',
            padding: 8, maxHeight: PANEL_MAX - 20, overflowY: 'auto',
          }}
        >
          <div style={{
            fontSize: 10, fontWeight: 700, letterSpacing: '.06em',
            textTransform: 'uppercase', color: COLORS.muted, padding: '4px 8px 8px',
          }}>
            {label}
          </div>
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  )
}

/** A single selectable row inside a pill popover. */
export function PillOption({
  selected, onClick, children,
}: { selected: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', gap: 8, width: '100%',
        padding: '8px 10px', borderRadius: 8, border: 'none',
        background: selected ? '#F4F4F2' : 'transparent',
        color: COLORS.ink, fontSize: 13, fontWeight: selected ? 700 : 500,
        fontFamily: 'inherit', cursor: 'pointer', textAlign: 'start',
      }}
    >
      {children}
    </button>
  )
}

/** Text/number/date input inside a pill popover. */
export function PillInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      style={{
        width: '100%', padding: '8px 10px', borderRadius: 8,
        border: `1px solid ${COLORS.line}`, background: '#fff',
        color: COLORS.ink, fontSize: 13, fontFamily: 'inherit',
        outline: 'none', boxSizing: 'border-box',
        ...props.style,
      }}
    />
  )
}
