'use client'

import { useEffect, useRef, useState } from 'react'
import { PIPE } from '@/lib/pipeline-tokens'
import { ALL_STAGES, STAGE_META } from '@/lib/stage-meta'
import type { Brand, BrandFeatureKey, BrandFeatures, ContentType, Member, StageId } from '@/types/index'
import { featureOnAny } from '@/lib/brand-features'
import { PRIORITIES, PRIORITY_COLOR } from '@/lib/priorities'

/**
 * Bulk action bar — ClickUp's pattern.
 *
 * Appears only while something is selected, floats above the board, and every
 * action applies to the whole selection at once. Each one is a single server
 * round trip that authorises task by task, so a selection containing work you
 * do not own changes what it can and reports the rest rather than failing.
 */

export interface BulkPatch {
  status?:             StageId
  task_owner_id?:      string
  assignee_id?:        string | null
  brand_id?:           string
  content_type_label?: string
  priority?:           import('@/types/index').Priority
  due_date?:           string
  /** The Content sheet's Date: the publishing date (its due date follows unless set by hand). */
  publish_date?:       string
}

/** The choices the bar can offer. The board shows its six; the Video sheet picks its own (design/video-sheet-bulk-bar.html). */
export type BulkField = 'stage' | 'assignee' | 'owner' | 'brand' | 'type' | 'priority' | 'due' | 'pillar'

interface BulkBarProps {
  count:     number
  /** Which choices, in order (default: the board's). */
  fields?:   BulkField[]
  /** Words for the count, each choice and the remove button (default: the board's English). */
  labels?:   Partial<Record<BulkField | 'count' | 'remove' | 'confirm' | 'cancel' | 'clear' | 'noBrand' | 'setDue' | 'noPillar' | 'pillarOff' | 'saving', string>>
  members:   Member[]
  brands:    Brand[]
  types:     ContentType[]
  busy:      boolean
  note:      string
  onApply:   (patch: BulkPatch) => void
  onDelete:  () => void
  onClear:   () => void
  /** What each stage is called in the list (the Video sheet's words); the board's name is shown beside it as a hint. Default: the board's names. */
  stageName?: (id: StageId) => string
  /** The Content sheet's Pillar choice: the pillars of the pieces' theme, or null when the pieces span themes (the button is greyed out, with labels.pillarOff as its tip). */
  pillars?: { id: string; name: string }[] | null
  /** Spec 021 (US4): the selected tasks' brands, so switched-off fields are left out. */
  selectedBrands?: ({ features?: BrandFeatures | null } | null | undefined)[]
  onPillar?: (id: string | null) => void
}

type MenuKind = BulkField | null
const FIELD_FEATURE: Partial<Record<BulkField, BrandFeatureKey>> = { type: 'type', priority: 'priorities', pillar: 'pillars' }
const BOARD_FIELDS: BulkField[] = ['stage', 'assignee', 'brand', 'type', 'priority', 'due']

const BTN: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 7, height: 36,
  padding: '0 14px', borderRadius: 10, border: '1px solid rgba(255,255,255,.18)',
  background: 'rgba(255,255,255,.08)', color: '#FFFFFF',
  fontSize: 13, fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer',
  whiteSpace: 'nowrap',
}

const ITEMS = '[role="menuitem"]:not([disabled])'

/**
 * A choice's list, opened above its button.
 *
 * Focus moves to the first item on open; ↑ ↓ Home End move between items;
 * Esc and Tab close it (the bar puts focus back on the button). The due date
 * is a small form rather than a list, so it is a dialog and keeps its own
 * keys — arrows belong to the date field there, and Tab has to reach its
 * button.
 */
function Menu({ children, onClose, label, kind = 'menu' }: {
  children: React.ReactNode; onClose: () => void; label: string; kind?: 'menu' | 'dialog'
}) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    ref.current?.querySelector<HTMLElement>(kind === 'menu' ? ITEMS : 'input, button:not([disabled])')?.focus()
  }, [kind])

  function onKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (kind !== 'menu') return
    if (e.key === 'Tab') { onClose(); return }
    const items = Array.from(ref.current?.querySelectorAll<HTMLElement>(ITEMS) ?? [])
    if (!items.length) return
    const i = items.indexOf(document.activeElement as HTMLElement)
    const next =
      e.key === 'ArrowDown' ? (i + 1) % items.length
      : e.key === 'ArrowUp' ? (i - 1 + items.length) % items.length
      : e.key === 'Home' ? 0
      : e.key === 'End' ? items.length - 1
      : -1
    if (next === -1) return
    e.preventDefault()
    items[next].focus()
  }

  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 80 }} />
      <div
        ref={ref}
        role={kind}
        aria-label={label}
        onKeyDown={onKeyDown}
        style={{
          position: 'absolute', bottom: '100%', insetInlineStart: 0, marginBottom: 8, zIndex: 81,
          minWidth: 210, maxHeight: 320, overflowY: 'auto',
          background: '#FFFFFF', border: `1px solid ${PIPE.border}`, borderRadius: 12,
          boxShadow: '0 16px 40px rgba(20,19,26,.28)', padding: 5,
        }}
      >
        {children}
      </div>
    </>
  )
}

function Item({ onClick, children, stage }: { onClick: () => void; children: React.ReactNode; stage?: string }) {
  return (
    <button
      type="button"
      role="menuitem"
      tabIndex={-1}
      data-bulk-stage={stage}
      onClick={onClick}
      className="fx-focus"
      style={{
        display: 'flex', alignItems: 'center', gap: 8, width: '100%',
        padding: '8px 10px', borderRadius: 8, border: 'none', background: 'transparent',
        color: PIPE.textPrimary, fontSize: 13, fontFamily: 'inherit',
        cursor: 'pointer', textAlign: 'start', whiteSpace: 'nowrap',
      }}
      onMouseEnter={e => (e.currentTarget.style.background = '#F4F4F2')}
      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
      onFocus={e => (e.currentTarget.style.background = '#F4F4F2')}
      onBlur={e => (e.currentTarget.style.background = 'transparent')}
    >
      {children}
    </button>
  )
}

export function BulkBar({
  count, members, brands, types, busy, note, onApply, onDelete, onClear, fields: allFields = BOARD_FIELDS, labels = {}, stageName, pillars, onPillar, selectedBrands,
}: BulkBarProps) {
  // Spec 021 (US4): a field every selected task's brand has switched off isn't offered.
  const fields = selectedBrands ? allFields.filter(f => !FIELD_FEATURE[f] || featureOnAny(selectedBrands, FIELD_FEATURE[f]!)) : allFields
  const L = {
    count: `${count} selected`, stage: 'Stage', assignee: 'Assignee', owner: 'Owner', brand: 'Brand', type: 'Type', priority: 'Priority',
    due: 'Due date', remove: 'Delete', confirm: `Delete ${count}? Yes`, cancel: 'Cancel', clear: 'Clear selection', noBrand: 'No brand', setDue: 'Set due date', pillar: 'Pillar', noPillar: 'No pillar', pillarOff: 'Pick pieces from one theme', saving: 'Saving…', ...labels,
  }
  const [menu, setMenu]       = useState<MenuKind>(null)
  const [dueDraft, setDue]    = useState('')
  const [confirming, setConf] = useState(false)
  const triggers = useRef<Partial<Record<BulkField, HTMLButtonElement | null>>>({})

  if (count === 0) return null

  /** Closing a list hands focus back to the button that opened it. */
  const close = () => {
    const k = menu
    setMenu(null)
    if (k) triggers.current[k]?.focus()
  }
  const apply = (patch: BulkPatch) => { close(); onApply(patch) }
  const toggle = (k: BulkField) => setMenu(m => (m === k ? null : k))

  /** One choice's button and its list. */
  function field(k: BulkField) {
    const list = (() => {
      switch (k) {
        case 'stage': return ALL_STAGES.map(id => (
          <Item key={id} stage={id} onClick={() => apply({ status: id })}>
            <span aria-hidden="true" style={{ width: 8, height: 8, borderRadius: '50%', background: STAGE_META[id].color, flexShrink: 0 }} />
            {stageName ? stageName(id) : STAGE_META[id].label_en}
            {stageName && stageName(id).toLowerCase() !== STAGE_META[id].label_en.toLowerCase() && (
              <small style={{ marginInlineStart: 'auto', paddingInlineStart: 12, color: PIPE.textMuted, fontSize: 11.5 }}>{STAGE_META[id].label_en}</small>
            )}
          </Item>
        ))
        case 'assignee': return members.map(m => <Item key={m.id} onClick={() => apply({ assignee_id: m.id })}>{m.name}</Item>)
        case 'owner': return members.map(m => <Item key={m.id} onClick={() => apply({ task_owner_id: m.id })}>{m.name}</Item>)
        case 'brand': return [
          <Item key="" onClick={() => apply({ brand_id: '' })}>{L.noBrand}</Item>,
          ...brands.map(b => (
            <Item key={b.id} onClick={() => apply({ brand_id: b.id })}>
              <span aria-hidden="true" style={{ width: 10, height: 10, borderRadius: 3, background: b.color, flexShrink: 0 }} />
              {b.name}
            </Item>
          )),
        ]
        case 'type': return types.map(t => <Item key={t.id} onClick={() => apply({ content_type_label: t.label })}>{t.label}</Item>)
        case 'pillar': return [
          ...(pillars ?? []).map(pl => <Item key={pl.id} onClick={() => { close(); onPillar?.(pl.id) }}>{pl.name}</Item>),
          <Item key="" onClick={() => { close(); onPillar?.(null) }}>{L.noPillar}</Item>,
        ]
        case 'priority': return PRIORITIES.map(p => <Item key={p} onClick={() => apply({ priority: p })}><span style={{ color: PRIORITY_COLOR[p] }}>⚑</span> {p === 'None' ? '–' : p}</Item>)
        case 'due': return (
          <div style={{ padding: 6, display: 'grid', gap: 6 }}>
            <input
              type="date" value={dueDraft} onChange={e => setDue(e.target.value)} data-bulk-due=""
              name="due_date" aria-label={L.due}
              className="fx-focus"
              style={{
                width: '100%', padding: '8px 10px', borderRadius: 8,
                border: `1px solid ${PIPE.borderInput}`, fontSize: 13,
                fontFamily: 'inherit', boxSizing: 'border-box',
              }}
            />
            <button
              type="button" disabled={!dueDraft} onClick={() => apply({ due_date: dueDraft })}
              className="fx-hov fx-focus"
              style={{
                padding: '8px 10px', borderRadius: 8, border: 'none',
                background: PIPE.ink, color: PIPE.limePrimary, fontWeight: 700,
                fontSize: 12.5, cursor: 'pointer', fontFamily: 'inherit', opacity: dueDraft ? 1 : 0.5,
              }}
            >
              {L.setDue}
            </button>
          </div>
        )
      }
    })()
    // Pillar spans one theme only: across themes the button is greyed out and says why.
    const off = k === 'pillar' && !pillars
    // Held, not disabled, while a change is saving: a disabled button drops
    // focus, and focus has just been handed back to this one.
    const held = off || busy
    return (
      <div key={k} style={{ position: 'relative' }}>
        <button type="button" ref={el => { triggers.current[k] = el }}
                style={off ? { ...BTN, opacity: 0.45, cursor: 'not-allowed' } : busy ? { ...BTN, cursor: 'progress' } : BTN}
                className={held ? 'fx-focus' : 'fx-hov-light fx-focus'} aria-disabled={held || undefined}
                aria-haspopup={k === 'due' ? 'dialog' : 'menu'}
                title={off ? L.pillarOff : undefined} data-bulk={k} aria-expanded={menu === k} onClick={() => { if (!held) toggle(k) }}>
          {L[k]} <span aria-hidden="true">▾</span>
        </button>
        {menu === k && <Menu onClose={close} label={L[k]} kind={k === 'due' ? 'dialog' : 'menu'}>{list}</Menu>}
      </div>
    )
  }

  return (
    <div style={{
      // Clear of the home indicator on a notched phone.
      position: 'fixed', insetInline: 0, bottom: 'calc(22px + env(safe-area-inset-bottom, 0px))', zIndex: 70,
      display: 'flex', justifyContent: 'center', pointerEvents: 'none',
    }}>
      <div data-bulk-bar="" role="toolbar" aria-label={L.count}
           // Esc with a list open closes the list and nothing else — the
           // board's own Esc would otherwise clear the whole selection.
           onKeyDown={e => {
             if (e.key === 'Escape' && menu) { e.preventDefault(); e.stopPropagation(); close() }
           }}
           style={{
        pointerEvents: 'auto', display: 'flex', alignItems: 'center', gap: 10,
        background: PIPE.navy, borderRadius: 14, padding: '10px 12px',
        boxShadow: '0 18px 44px rgba(20,19,60,.34)', flexWrap: 'wrap',
        maxWidth: 'calc(100vw - 60px)',
      }}>
        <span data-bulk-count="" style={{
          display: 'inline-flex', alignItems: 'center', height: 36, padding: '0 12px',
          borderRadius: 10, background: PIPE.limePrimary, color: PIPE.ink,
          fontSize: 13, fontWeight: 800, whiteSpace: 'nowrap', gap: 7,
        }}>
          {busy && (
            <span aria-hidden="true" style={{
              width: 11, height: 11, borderRadius: '50%', flexShrink: 0,
              border: '2px solid rgba(20,19,26,.25)', borderTopColor: PIPE.ink,
              animation: 'fx-spin .8s linear infinite',
            }} />
          )}
          {L.count}
        </span>

        {fields.map(f => field(f))}

        {/* The remove action asks once. */}
        {confirming ? (
          <>
            <button
              type="button" disabled={busy} data-bulk-confirm=""
              onClick={() => { setConf(false); onDelete() }}
              className="fx-hov fx-focus"
              style={{ ...BTN, background: '#D22040', border: '1px solid #D22040', fontWeight: 800 }}
            >
              {L.confirm}
            </button>
            <button type="button" className="fx-hov-light fx-focus" style={BTN} onClick={() => setConf(false)}>{L.cancel}</button>
          </>
        ) : (
          <button type="button" disabled={busy} data-bulk-remove="" onClick={() => setConf(true)} className="fx-hov-light fx-focus" style={{ ...BTN, color: '#FF9DAE' }}>
            {L.remove}
          </button>
        )}

        {/* Always mounted, so a screen reader is listening before the text
            arrives: "Saving…" while a change runs, then its result. Shown
            only when there is a result to show — the spinner on the count
            says "saving" to the eye. */}
        <span
          role="status" aria-live="polite" data-bulk-note=""
          className={note && !busy ? undefined : 'sr-only'}
          style={{ fontSize: 12, color: 'rgba(255,255,255,.72)', whiteSpace: 'nowrap' }}
        >
          {busy ? L.saving : note}
        </span>

        <button
          type="button" onClick={onClear} aria-label={L.clear} data-bulk-clear=""
          className="fx-hov-light fx-focus"
          style={{ ...BTN, padding: '0 10px', color: 'rgba(255,255,255,.72)' }}
        >
          <span aria-hidden="true">✕</span>
        </button>
      </div>
    </div>
  )
}
