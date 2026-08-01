'use client'

import { useEffect, useRef, useState } from 'react'
import { COLORS } from '@/lib/tokens'

/**
 * Inline-editable attribute cell for the task detail panel.
 *
 * Wireframe 1d: "Every attribute row is an inline editor — no separate edit
 * mode, no save button." Click the value, change it, and it commits on blur,
 * on Enter, or on picking an option. Escape reverts.
 *
 * Read-only cells use the same shell so the grid stays visually uniform
 * whether or not a given row can be changed.
 */

const SHELL: React.CSSProperties = {
  background: '#F7F7F7',
  border: `1px solid ${COLORS.line}`,
  borderRadius: 10,
  padding: '0.55rem 0.75rem',
}

const LABEL: React.CSSProperties = {
  fontSize: '0.6rem',
  color: COLORS.muted,
  marginBottom: 2,
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
}

const VALUE: React.CSSProperties = {
  color: COLORS.ink,
  fontSize: '0.82rem',
  fontWeight: 600,
}

const CONTROL: React.CSSProperties = {
  ...VALUE,
  width: '100%',
  background: '#fff',
  border: `1px solid ${COLORS.line}`,
  borderRadius: 6,
  padding: '2px 4px',
  fontFamily: 'inherit',
  outline: 'none',
  boxSizing: 'border-box',
}

/** Non-editable cell — same shell, no affordance. */
export function ReadOnlyCell({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div style={SHELL}>
      <div style={LABEL}>{label}</div>
      <div style={VALUE}>{value}</div>
    </div>
  )
}

interface EditableCellProps {
  label:     string
  /** What to show when not editing. */
  display:   React.ReactNode
  /** Whether this user may edit. Falls back to a read-only cell when false. */
  canEdit:   boolean
  disabled?: boolean
  /** 'text' | 'number' | 'date' | 'select' */
  type:      'text' | 'number' | 'date' | 'select'
  value:     string | number
  options?:  { value: string; label: string }[]
  min?:      string | number
  step?:     number
  placeholder?: string
  onCommit:  (next: string) => void
}

export function EditableCell({
  label, display, canEdit, disabled, type, value, options,
  min, step, placeholder, onCommit,
}: EditableCellProps) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft]     = useState(String(value ?? ''))
  const ref = useRef<HTMLInputElement | HTMLSelectElement>(null)

  useEffect(() => { if (!editing) setDraft(String(value ?? '')) }, [value, editing])
  useEffect(() => { if (editing) ref.current?.focus() }, [editing])

  if (!canEdit || disabled) return <ReadOnlyCell label={label} value={display} />

  function commit() {
    setEditing(false)
    if (draft !== String(value ?? '')) onCommit(draft)
  }

  return (
    <div style={SHELL}>
      <div style={LABEL}>{label}</div>

      {editing ? (
        type === 'select' ? (
          <select
            ref={ref as React.RefObject<HTMLSelectElement>}
            value={draft}
            onChange={e => { setDraft(e.target.value); onCommit(e.target.value); setEditing(false) }}
            onBlur={() => setEditing(false)}
            onKeyDown={e => { if (e.key === 'Escape') { setDraft(String(value ?? '')); setEditing(false) } }}
            style={{ ...CONTROL, cursor: 'pointer' }}
          >
            {options?.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        ) : (
          <input
            ref={ref as React.RefObject<HTMLInputElement>}
            type={type}
            value={draft}
            min={min}
            step={step}
            placeholder={placeholder}
            onChange={e => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={e => {
              if (e.key === 'Enter')  { e.preventDefault(); commit() }
              if (e.key === 'Escape') { setDraft(String(value ?? '')); setEditing(false) }
            }}
            style={CONTROL}
          />
        )
      ) : (
        <button
          onClick={() => setEditing(true)}
          title={`Edit ${label.toLowerCase()}`}
          style={{
            ...VALUE,
            background: 'none', border: 'none', padding: 0, cursor: 'pointer',
            fontFamily: 'inherit', textAlign: 'start', width: '100%',
          }}
        >
          {display || <span style={{ color: COLORS.muted, fontWeight: 400 }}>—</span>}
        </button>
      )}
    </div>
  )
}
