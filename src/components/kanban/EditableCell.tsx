'use client'

import { useTranslations } from 'next-intl'
import { useEffect, useId, useRef, useState } from 'react'
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
  fontSize: '0.94rem',
  fontWeight: 600,
}

/**
 * What a blank value shows. A bare dash says "nothing here" to the eye but
 * reads as "dash" (or as nothing) to a screen reader, so a punctuation-only
 * placeholder is hidden from it and the reader hears "Not set" instead.
 */
function Empty({ label }: { label: string }) {
  const muted = { color: COLORS.muted, fontWeight: 400 }
  if (!/^\p{P}+$/u.test(label)) return <span style={muted}>{label}</span>
  return (
    <span style={muted}>
      <span aria-hidden="true">{label}</span>
      <span className="sr-only">Not set</span>
    </span>
  )
}

/** A form-safe `name` from a field's label: "Due date" → "due-date". */
const fieldName = (label?: string) =>
  label ? label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || undefined : undefined

const CONTROL: React.CSSProperties = {
  ...VALUE,
  width: '100%',
  background: '#fff',
  border: `1px solid ${COLORS.line}`,
  borderRadius: 6,
  padding: '2px 4px',
  fontFamily: 'inherit',
  boxSizing: 'border-box',
}

/**
 * Borderless inline value for the two-pane attribute list (wireframe 1d).
 *
 * Same commit rules as EditableCell, but no card shell — it sits in a
 * label/value row and only reveals a control while being edited, so a
 * populated task reads as text rather than as a form.
 */
export function InlineValue({
  canEdit, type, value, display, options, min, step, placeholder, emptyLabel, ariaLabel, onCommit,
}: {
  canEdit:  boolean
  type:     'text' | 'number' | 'date' | 'select'
  value:    string | number
  display:  React.ReactNode
  options?: { value: string; label: string }[]
  min?:     string | number
  step?:    number
  placeholder?: string
  /** What a blank looks like. The task panel's Fields block uses "–"; the
   *  property grid above it, and every other caller, keeps "Empty". */
  emptyLabel?: string
  /** The field's name, e.g. "Due date". The label beside the value is drawn
   *  by the caller and isn't tied to the control, so this names the control
   *  itself — and prefixes the value button, so Tab lands on "Due date: 3 Dec"
   *  rather than on a bare date or a dash. */
  ariaLabel?: string
  onCommit: (next: string) => void
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft]     = useState(String(value ?? ''))
  const ref = useRef<HTMLInputElement | HTMLSelectElement>(null)

  useEffect(() => { if (!editing) setDraft(String(value ?? '')) }, [value, editing])
  useEffect(() => { if (editing) ref.current?.focus() }, [editing])

  // QA 26 Nov 2026 (QF-14): "Empty" in the reader's language.
  const tEmpty = useTranslations('panel')('empty')
  const EMPTY = <Empty label={emptyLabel ?? tEmpty} />

  if (!canEdit) {
    return <div style={{ ...VALUE, padding: '3px 6px' }}>{display || EMPTY}</div>
  }

  function commit() {
    setEditing(false)
    if (draft !== String(value ?? '')) onCommit(draft)
  }

  if (editing) {
    return type === 'select' ? (
      <select
        ref={ref as React.RefObject<HTMLSelectElement>}
        value={draft}
        onChange={e => { setDraft(e.target.value); onCommit(e.target.value); setEditing(false) }}
        onBlur={() => setEditing(false)}
        onKeyDown={e => { if (e.key === 'Escape') { setDraft(String(value ?? '')); setEditing(false) } }}
        aria-label={ariaLabel}
        name={fieldName(ariaLabel)}
        className="fx-focus"
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
        aria-label={ariaLabel}
        name={fieldName(ariaLabel)}
        autoComplete="off"
        className="fx-focus"
        style={CONTROL}
      />
    )
  }

  return (
    <button
      onClick={() => setEditing(true)}
      style={{
        ...VALUE, background: 'none', border: '1px solid transparent',
        borderRadius: 6, padding: '3px 6px', cursor: 'pointer',
        fontFamily: 'inherit', textAlign: 'start', width: '100%',
      }}
      onMouseEnter={e => (e.currentTarget.style.background = '#F4F4F2')}
      onMouseLeave={e => (e.currentTarget.style.background = 'none')}
    >
      {ariaLabel && <span className="sr-only">{ariaLabel}: </span>}
      {display || EMPTY}
    </button>
  )
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
  // One id for whichever control is showing, so the label always points at it.
  const id = useId()
  const labelId = `${id}-label`

  useEffect(() => { if (!editing) setDraft(String(value ?? '')) }, [value, editing])
  useEffect(() => { if (editing) ref.current?.focus() }, [editing])

  if (!canEdit || disabled) return <ReadOnlyCell label={label} value={display} />

  function commit() {
    setEditing(false)
    if (draft !== String(value ?? '')) onCommit(draft)
  }

  return (
    <div style={SHELL}>
      <label id={labelId} htmlFor={id} style={{ ...LABEL, display: 'block' }}>{label}</label>

      {editing ? (
        type === 'select' ? (
          <select
            ref={ref as React.RefObject<HTMLSelectElement>}
            value={draft}
            onChange={e => { setDraft(e.target.value); onCommit(e.target.value); setEditing(false) }}
            onBlur={() => setEditing(false)}
            onKeyDown={e => { if (e.key === 'Escape') { setDraft(String(value ?? '')); setEditing(false) } }}
            id={id}
            name={fieldName(label)}
            className="fx-focus"
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
            id={id}
            name={fieldName(label)}
            autoComplete="off"
            className="fx-focus"
            style={CONTROL}
          />
        )
      ) : (
        // Named by the label and its own value ("Brand Acme"): a <label> alone
        // would replace the value in the button's name.
        <button
          type="button"
          id={id}
          aria-labelledby={`${labelId} ${id}`}
          onClick={() => setEditing(true)}
          title={`Edit ${label.toLowerCase()}`}
          className="fx-focus fx-hov-tint"
          style={{
            ...VALUE,
            background: 'none', border: 'none', padding: 0, cursor: 'pointer',
            fontFamily: 'inherit', textAlign: 'start', width: '100%',
          }}
        >
          {display || <Empty label="—" />}
        </button>
      )}
    </div>
  )
}
