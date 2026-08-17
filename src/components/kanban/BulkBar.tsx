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

interface BulkBarProps {
  count:     number
  members:   Member[]
  brands:    Brand[]
  types:     ContentType[]
  busy:      boolean
  note:      string
  onApply:   (patch: BulkPatch) => void
  onDelete:  () => void
  onClear:   () => void
}

type MenuKind = 'stage' | 'assignee' | 'brand' | 'type' | 'priority' | 'due' | null

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

function Item({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', gap: 8, width: '100%',
        padding: '8px 10px', borderRadius: 8, border: 'none', background: 'transparent',
        color: PIPE.textPrimary, fontSize: 13, fontFamily: 'inherit',
        cursor: 'pointer', textAlign: 'start',
      }}
      onMouseEnter={e => (e.currentTarget.style.background = '#F4F4F2')}
      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
    >
      {children}
    </button>
  )
}

export function BulkBar({
  count, members, brands, types, busy, note, onApply, onDelete, onClear,
}: BulkBarProps) {
  const [menu, setMenu]       = useState<MenuKind>(null)
  const [dueDraft, setDue]    = useState('')
  const [confirming, setConf] = useState(false)

  if (count === 0) return null

  const close = () => setMenu(null)
  const apply = (patch: BulkPatch) => { close(); onApply(patch) }

  return (
    <div style={{
      position: 'fixed', insetInline: 0, bottom: 22, zIndex: 70,
      display: 'flex', justifyContent: 'center', pointerEvents: 'none',
    }}>
      <div style={{
        pointerEvents: 'auto', display: 'flex', alignItems: 'center', gap: 10,
        background: PIPE.navy, borderRadius: 14, padding: '10px 12px',
        boxShadow: '0 18px 44px rgba(20,19,60,.34)', flexWrap: 'wrap',
        maxWidth: 'calc(100vw - 60px)',
      }}>
        <span style={{
          display: 'inline-flex', alignItems: 'center', height: 36, padding: '0 12px',
          borderRadius: 10, background: PIPE.limePrimary, color: PIPE.ink,
          fontSize: 13, fontWeight: 800, whiteSpace: 'nowrap',
        }}>
          {count} selected
        </span>

        <div style={{ position: 'relative' }}>
          <button type="button" style={BTN} disabled={busy}
                  onClick={() => setMenu(m => (m === 'stage' ? null : 'stage'))}>
            Stage ▾
          </button>
          {menu === 'stage' && (
            <Menu onClose={close}>
              {ALL_STAGES.map(id => (
                <Item key={id} onClick={() => apply({ status: id })}>
                  <span aria-hidden="true" style={{
                    width: 8, height: 8, borderRadius: '50%',
                    background: STAGE_META[id].color, flexShrink: 0,
                  }} />
                  {STAGE_META[id].label_en}
                </Item>
              ))}
            </Menu>
          )}
        </div>

        <div style={{ position: 'relative' }}>
          <button type="button" style={BTN} disabled={busy}
                  onClick={() => setMenu(m => (m === 'assignee' ? null : 'assignee'))}>
            Assignee ▾
          </button>
          {menu === 'assignee' && (
            <Menu onClose={close}>
              {members.map(m => (
                <Item key={m.id} onClick={() => apply({ assignee_id: m.id })}>{m.name}</Item>
              ))}
            </Menu>
          )}
        </div>

        <div style={{ position: 'relative' }}>
          <button type="button" style={BTN} disabled={busy}
                  onClick={() => setMenu(m => (m === 'brand' ? null : 'brand'))}>
            Brand ▾
          </button>
          {menu === 'brand' && (
            <Menu onClose={close}>
              <Item onClick={() => apply({ brand_id: '' })}>No brand</Item>
              {brands.map(b => (
                <Item key={b.id} onClick={() => apply({ brand_id: b.id })}>
                  <span aria-hidden="true" style={{
                    width: 10, height: 10, borderRadius: 3, background: b.color, flexShrink: 0,
                  }} />
                  {b.name}
                </Item>
              ))}
            </Menu>
          )}
        </div>

        <div style={{ position: 'relative' }}>
          <button type="button" style={BTN} disabled={busy}
                  onClick={() => setMenu(m => (m === 'type' ? null : 'type'))}>
            Type ▾
          </button>
          {menu === 'type' && (
            <Menu onClose={close}>
              {types.map(t => (
                <Item key={t.id} onClick={() => apply({ content_type_label: t.label })}>{t.label}</Item>
              ))}
            </Menu>
          )}
        </div>

        <div style={{ position: 'relative' }}>
          <button type="button" style={BTN} disabled={busy}
                  onClick={() => setMenu(m => (m === 'priority' ? null : 'priority'))}>
            Priority ▾
          </button>
          {menu === 'priority' && (
            <Menu onClose={close}>
              {(['High', 'Medium', 'Low'] as const).map(p => (
                <Item key={p} onClick={() => apply({ priority: p })}>{p}</Item>
              ))}
            </Menu>
          )}
        </div>

        <div style={{ position: 'relative' }}>
          <button type="button" style={BTN} disabled={busy}
                  onClick={() => setMenu(m => (m === 'due' ? null : 'due'))}>
            Due date ▾
          </button>
          {menu === 'due' && (
            <Menu onClose={close}>
              <div style={{ padding: 6, display: 'grid', gap: 6 }}>
                <input
                  type="date"
                  value={dueDraft}
                  onChange={e => setDue(e.target.value)}
                  style={{
                    width: '100%', padding: '8px 10px', borderRadius: 8,
                    border: `1px solid ${PIPE.borderInput}`, fontSize: 13,
                    fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box',
                  }}
                />
                <button
                  type="button"
                  disabled={!dueDraft}
                  onClick={() => apply({ due_date: dueDraft })}
                  style={{
                    padding: '8px 10px', borderRadius: 8, border: 'none',
                    background: PIPE.ink, color: PIPE.limePrimary, fontWeight: 700,
                    fontSize: 12.5, cursor: 'pointer', fontFamily: 'inherit',
                    opacity: dueDraft ? 1 : 0.5,
                  }}
                >
                  Set due date
                </button>
              </div>
            </Menu>
          )}
        </div>

        {/* Delete asks once. Bulk delete is the one action here with nothing
            to undo it. */}
        {confirming ? (
          <>
            <button
              type="button"
              disabled={busy}
              onClick={() => { setConf(false); onDelete() }}
              style={{ ...BTN, background: '#D22040', border: '1px solid #D22040', fontWeight: 800 }}
            >
              Delete {count}? Yes
            </button>
            <button type="button" style={BTN} onClick={() => setConf(false)}>Cancel</button>
          </>
        ) : (
          <button
            type="button"
            disabled={busy}
            onClick={() => setConf(true)}
            style={{ ...BTN, color: '#FF9DAE' }}
          >
            Delete
          </button>
        )}

        {note && (
          <span style={{ fontSize: 12, color: 'rgba(255,255,255,.72)', whiteSpace: 'nowrap' }}>
            {note}
          </span>
        )}

        <button
          type="button"
          onClick={onClear}
          aria-label="Clear selection"
          style={{ ...BTN, padding: '0 10px', color: 'rgba(255,255,255,.72)' }}
        >
          ✕
        </button>
      </div>
    </div>
  )
}
