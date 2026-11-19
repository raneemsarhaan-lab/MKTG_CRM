'use client'

import { useState } from 'react'
import { PIPE } from '@/lib/pipeline-tokens'
import { ALL_STAGES, STAGE_META } from '@/lib/stage-meta'
import type { Brand, ContentType, Member, StageId } from '@/types/index'

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
  priority?:           'Low' | 'Medium' | 'High'
  due_date?:           string
}

/** The choices the bar can offer. The board shows its six; the Video sheet picks its own (design/video-sheet-bulk-bar.html). */
export type BulkField = 'stage' | 'assignee' | 'owner' | 'brand' | 'type' | 'priority' | 'due'

interface BulkBarProps {
  count:     number
  /** Which choices, in order (default: the board's). */
  fields?:   BulkField[]
  /** Words for the count, each choice and the remove button (default: the board's English). */
  labels?:   Partial<Record<BulkField | 'count' | 'remove' | 'confirm' | 'cancel' | 'clear' | 'noBrand' | 'setDue', string>>
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
}

type MenuKind = BulkField | null
const BOARD_FIELDS: BulkField[] = ['stage', 'assignee', 'brand', 'type', 'priority', 'due']

const BTN: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 7, height: 36,
  padding: '0 14px', borderRadius: 10, border: '1px solid rgba(255,255,255,.18)',
  background: 'rgba(255,255,255,.08)', color: '#FFFFFF',
  fontSize: 13, fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer',
  whiteSpace: 'nowrap',
}

function Menu({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 80 }} />
      <div
        role="menu"
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
      data-bulk-stage={stage}
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', gap: 8, width: '100%',
        padding: '8px 10px', borderRadius: 8, border: 'none', background: 'transparent',
        color: PIPE.textPrimary, fontSize: 13, fontFamily: 'inherit',
        cursor: 'pointer', textAlign: 'start', whiteSpace: 'nowrap',
      }}
      onMouseEnter={e => (e.currentTarget.style.background = '#F4F4F2')}
      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
    >
      {children}
    </button>
  )
}

export function BulkBar({
  count, members, brands, types, busy, note, onApply, onDelete, onClear, fields = BOARD_FIELDS, labels = {}, stageName,
}: BulkBarProps) {
  const L = {
    count: `${count} selected`, stage: 'Stage', assignee: 'Assignee', owner: 'Owner', brand: 'Brand', type: 'Type', priority: 'Priority',
    due: 'Due date', remove: 'Delete', confirm: `Delete ${count}? Yes`, cancel: 'Cancel', clear: 'Clear selection', noBrand: 'No brand', setDue: 'Set due date', ...labels,
  }
  const [menu, setMenu]       = useState<MenuKind>(null)
  const [dueDraft, setDue]    = useState('')
  const [confirming, setConf] = useState(false)

  if (count === 0) return null

  const close = () => setMenu(null)
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
            {stageName && stageName(id) !== STAGE_META[id].label_en && (
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
        case 'priority': return (['High', 'Medium', 'Low'] as const).map(p => <Item key={p} onClick={() => apply({ priority: p })}>{p}</Item>)
        case 'due': return (
          <div style={{ padding: 6, display: 'grid', gap: 6 }}>
            <input
              type="date" value={dueDraft} onChange={e => setDue(e.target.value)} data-bulk-due=""
              style={{
                width: '100%', padding: '8px 10px', borderRadius: 8,
                border: `1px solid ${PIPE.borderInput}`, fontSize: 13,
                fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box',
              }}
            />
            <button
              type="button" disabled={!dueDraft} onClick={() => apply({ due_date: dueDraft })}
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
    return (
      <div key={k} style={{ position: 'relative' }}>
        <button type="button" style={BTN} disabled={busy} data-bulk={k} aria-expanded={menu === k} onClick={() => toggle(k)}>
          {L[k]} ▾
        </button>
        {menu === k && <Menu onClose={close}>{list}</Menu>}
      </div>
    )
  }

  return (
    <div style={{
      position: 'fixed', insetInline: 0, bottom: 22, zIndex: 70,
      display: 'flex', justifyContent: 'center', pointerEvents: 'none',
    }}>
      <div data-bulk-bar="" role="toolbar" aria-label={L.count} style={{
        pointerEvents: 'auto', display: 'flex', alignItems: 'center', gap: 10,
        background: PIPE.navy, borderRadius: 14, padding: '10px 12px',
        boxShadow: '0 18px 44px rgba(20,19,60,.34)', flexWrap: 'wrap',
        maxWidth: 'calc(100vw - 60px)',
      }}>
        <span data-bulk-count="" style={{
          display: 'inline-flex', alignItems: 'center', height: 36, padding: '0 12px',
          borderRadius: 10, background: PIPE.limePrimary, color: PIPE.ink,
          fontSize: 13, fontWeight: 800, whiteSpace: 'nowrap',
        }}>
          {L.count}
        </span>

        {fields.map(f => field(f))}

        {/* The remove action asks once. */}
        {confirming ? (
          <>
            <button
              type="button" disabled={busy} data-bulk-confirm=""
              onClick={() => { setConf(false); onDelete() }}
              style={{ ...BTN, background: '#D22040', border: '1px solid #D22040', fontWeight: 800 }}
            >
              {L.confirm}
            </button>
            <button type="button" style={BTN} onClick={() => setConf(false)}>{L.cancel}</button>
          </>
        ) : (
          <button type="button" disabled={busy} data-bulk-remove="" onClick={() => setConf(true)} style={{ ...BTN, color: '#FF9DAE' }}>
            {L.remove}
          </button>
        )}

        {note && (
          <span data-bulk-note="" style={{ fontSize: 12, color: 'rgba(255,255,255,.72)', whiteSpace: 'nowrap' }}>
            {note}
          </span>
        )}

        <button
          type="button" onClick={onClear} aria-label={L.clear} data-bulk-clear=""
          style={{ ...BTN, padding: '0 10px', color: 'rgba(255,255,255,.72)' }}
        >
          ✕
        </button>
      </div>
    </div>
  )
}
