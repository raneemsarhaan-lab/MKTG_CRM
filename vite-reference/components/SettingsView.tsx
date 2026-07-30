import React, { useState } from 'react'
import { useStore } from '../store/useStore'
import { Member, AccessLevel } from '../types'

const UI = {
  ink: '#1B1A13',
  muted: '#8A8D91',
  line: '#E1E1E0',
  soft: '#F6F6F4',
  lime: '#C3F53D',
  dark: '#111111',
}

const REVIEW_STAGES = ['c-final', 'c-check', 'd-check', 'final-check']
const STAGE_META: Record<string, { label: string; color: string; owner: string }> = {
  'c-final':     { label: 'C-Review',  color: '#2E6FB0', owner: 'Content Manager' },
  'c-check':     { label: 'C-Check',   color: '#1F5A94', owner: 'Managing Director' },
  'd-check':     { label: 'D-Check',   color: '#5B3FB5', owner: 'Brand Director' },
  'final-check': { label: 'F-Check',   color: '#F59E0B', owner: 'Content Manager' },
}

const SLA_STAGES = ['c-prog','c-final','c-check','d-prog','d-check','final-check']
const SLA_META: Record<string, { label: string; color: string }> = {
  'c-prog':      { label: 'C-In Progress', color: '#3B82F6' },
  'c-final':     { label: 'C-Review',      color: '#2E6FB0' },
  'c-check':     { label: 'C-Check',       color: '#1F5A94' },
  'd-prog':      { label: 'D-In Progress', color: '#7C3AED' },
  'd-check':     { label: 'D-Check',       color: '#5B3FB5' },
  'final-check': { label: 'F-Check',       color: '#F59E0B' },
}

const BRANDS = [
  { name: 'Forefront',               color: '#B4322F' },
  { name: 'Omnisight',               color: '#0E7C7B' },
  { name: 'The Strategy Community',  color: '#7A5A2E' },
  { name: 'Islam Personal Branding', color: '#1E293B' },
]

const CONTENT_TYPES = ['Post', 'Video', 'Reel', 'Design', 'Email', 'Story', 'Deck', 'Other']

const ACCESS_OPTS: { value: AccessLevel; label: string }[] = [
  { value: 'admin',     label: 'Admin' },
  { value: 'superuser', label: 'Super User' },
  { value: 'user',      label: 'User' },
]
const ACCESS_BADGE: Record<string, { bg: string; color: string }> = {
  admin:     { bg: '#C3F53D', color: '#111' },
  superuser: { bg: '#B79CF5', color: '#111' },
  user:      { bg: '#EDEDEA', color: '#6B6B6B' },
}

function initials(name: string) {
  return name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
}

function avatarColor(name: string) {
  const palette = ['#1B1D1F', '#6E5BE6', '#3FA34D', '#5B93F5', '#E0736A', '#5B6066', '#B4863F']
  let h = 0; for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) | 0
  return palette[Math.abs(h) % palette.length]
}

const FIELD: React.CSSProperties = {
  fontSize: 12.5, padding: '7px 10px', borderRadius: 8,
  border: `1px solid ${UI.line}`, background: UI.soft,
  color: UI.ink, outline: 'none', fontFamily: 'inherit',
}

type Tab = 'team' | 'workflow'

interface AddMemberDraft { name: string; role: string; access: AccessLevel }

export function SettingsView() {
  const { members, currentUser, addMember, updateMember, removeMember, slaConfig, updateSLA } = useStore()
  const [tab, setTab] = useState<Tab>('team')
  const [draft, setDraft] = useState<AddMemberDraft>({ name: '', role: '', access: 'user' })
  const [addBrandOpen, setAddBrandOpen] = useState(false)
  const [brandDraft, setBrandDraft] = useState({ name: '', color: '#B4322F' })

  function handleAddMember() {
    if (!draft.name.trim()) return
    const color = avatarColor(draft.name)
    addMember({
      name: draft.name.trim(),
      role: draft.role.trim() || 'Team Member',
      access: draft.access,
      color, bg: color, tc: 'white',
    })
    setDraft({ name: '', role: '', access: 'user' })
  }

  const tabBtn = (active: boolean): React.CSSProperties => ({
    fontSize: 12.5, fontWeight: 700, padding: '9px 18px', borderRadius: 7, border: 'none',
    cursor: 'pointer', fontFamily: 'inherit',
    background: active ? '#fff' : 'transparent',
    color: active ? UI.ink : UI.muted,
    boxShadow: active ? '0 1px 3px rgba(16,16,11,.12)' : 'none',
  })

  return (
    <div style={{ overflowY: 'auto', flex: 1, padding: '48px clamp(20px,4vw,64px)', maxWidth: 1000, margin: '0 auto', width: '100%' }}>
      {/* Header */}
      <div style={{ marginBottom: 28 }}>
        <p className="mont" style={{ fontWeight: 800, fontSize: 10, letterSpacing: '.22em', textTransform: 'uppercase', color: UI.muted, margin: '0 0 10px' }}>Admin</p>
        <div style={{ height: 2, width: 36, background: UI.lime, borderRadius: 2, marginBottom: 18 }} />
        <h1 className="mont" style={{ fontWeight: 900, fontSize: 28, color: UI.ink, margin: 0 }}>Settings</h1>
        <p style={{ fontSize: 14, color: UI.muted, margin: '6px 0 0' }}>Controls for your team and workflow.</p>
      </div>

      {/* Tab switcher */}
      <div style={{ display: 'inline-flex', borderRadius: 10, padding: 4, background: '#F1F1EF', marginBottom: 28, gap: 2 }}>
        <button style={tabBtn(tab === 'team')} onClick={() => setTab('team')}>Team &amp; Access</button>
        <button style={tabBtn(tab === 'workflow')} onClick={() => setTab('workflow')}>SLA &amp; Workflow</button>
      </div>

      {/* ── TEAM TAB ── */}
      {tab === 'team' && (
        <div>
          <p style={{ fontSize: 13, color: UI.muted, margin: '0 0 18px', maxWidth: 720 }}>
            Add people, set their role and access, and see which review stages each person owns.{' '}
            <b style={{ color: UI.ink }}>Admin</b> sees everything,{' '}
            <b style={{ color: UI.ink }}>Super User</b> can move any task,{' '}
            <b style={{ color: UI.ink }}>User</b> moves only their own.
          </p>

          {/* Member list */}
          <div style={{ borderRadius: 16, overflow: 'hidden', background: '#fff', border: `1px solid ${UI.line}`, boxShadow: '0 1px 3px rgba(16,16,11,.05)', marginBottom: 14 }}>
            {members.map((m, i) => (
              <MemberRow
                key={m.name}
                member={m}
                isYou={m.name === currentUser?.name}
                first={i === 0}
                onUpdate={patch => updateMember(m.name, patch)}
                onRemove={() => removeMember(m.name)}
              />
            ))}
            {members.length === 0 && (
              <div style={{ padding: 32, textAlign: 'center', color: UI.muted, fontSize: 13 }}>No members yet.</div>
            )}
          </div>

          {/* Add member form */}
          <div style={{ borderRadius: 16, padding: 18, background: '#F1F1EF', border: '1px dashed #C7CFE0' }}>
            <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.08em', color: UI.muted, marginBottom: 12 }}>Add member</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
              <input
                placeholder="Name"
                value={draft.name}
                onChange={e => setDraft(d => ({ ...d, name: e.target.value }))}
                onKeyDown={e => e.key === 'Enter' && handleAddMember()}
                style={{ ...FIELD, flex: '2 1 160px' }}
              />
              <input
                placeholder="Role"
                value={draft.role}
                onChange={e => setDraft(d => ({ ...d, role: e.target.value }))}
                onKeyDown={e => e.key === 'Enter' && handleAddMember()}
                style={{ ...FIELD, flex: '2 1 160px' }}
              />
              <select
                value={draft.access}
                onChange={e => setDraft(d => ({ ...d, access: e.target.value as AccessLevel }))}
                style={{ ...FIELD, flex: '1 1 120px', cursor: 'pointer' }}
              >
                {ACCESS_OPTS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
              <button
                onClick={handleAddMember}
                disabled={!draft.name.trim()}
                style={{
                  ...FIELD, background: UI.dark, color: UI.lime, border: 'none',
                  fontWeight: 700, cursor: draft.name.trim() ? 'pointer' : 'default',
                  opacity: draft.name.trim() ? 1 : 0.4, paddingInline: 20, fontSize: 13,
                }}
              >
                + Add
              </button>
            </div>
          </div>

          <p style={{ fontSize: 11.5, color: UI.muted, marginTop: 14 }}>
            Review stage owners are set by role. Each review stage has one designated reviewer.
          </p>

          {/* Stage ownership table */}
          <div style={{ borderRadius: 16, padding: 22, background: '#fff', border: `1px solid ${UI.line}`, boxShadow: '0 1px 3px rgba(16,16,11,.05)', marginTop: 16 }}>
            <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.08em', color: UI.muted, marginBottom: 14 }}>Review stage owners</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {REVIEW_STAGES.map(stageId => {
                const meta = STAGE_META[stageId]
                const owner = members.find(m => m.role === meta.owner || m.name === meta.owner)
                return (
                  <div key={stageId} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', borderRadius: 10, background: UI.soft }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span style={{ width: 8, height: 8, borderRadius: 2, background: meta.color, display: 'inline-block', flexShrink: 0 }} />
                      <span style={{ fontSize: 13, fontWeight: 600, color: UI.ink }}>{meta.label}</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      {owner && (
                        <div style={{ width: 26, height: 26, borderRadius: '50%', background: avatarColor(owner.name), color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700 }}>
                          {initials(owner.name)}
                        </div>
                      )}
                      <span style={{ fontSize: 12.5, fontWeight: 600, color: UI.ink }}>{meta.owner}</span>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}

      {/* ── WORKFLOW TAB ── */}
      {tab === 'workflow' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* Brands */}
          <div style={{ borderRadius: 16, padding: 22, background: '#fff', border: `1px solid ${UI.line}`, boxShadow: '0 1px 3px rgba(16,16,11,.05)' }}>
            <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.08em', color: UI.muted, marginBottom: 14 }}>Brands</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 14 }}>
              {BRANDS.map(b => (
                <span key={b.name} style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '6px 10px 6px 8px', borderRadius: 10, border: `1px solid ${UI.line}`, background: UI.soft }}>
                  <span style={{ width: 14, height: 14, borderRadius: 4, background: b.color, display: 'inline-block', flexShrink: 0 }} />
                  <span style={{ fontSize: 12.5, fontWeight: 600, color: UI.ink }}>{b.name}</span>
                </span>
              ))}
            </div>
            <button
              onClick={() => setAddBrandOpen(true)}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 700, color: '#fff', padding: '10px 16px', borderRadius: 8, border: 'none', cursor: 'pointer', background: UI.dark, fontFamily: 'inherit' }}
            >
              + Add brand
            </button>
            <p style={{ fontSize: 11.5, color: UI.muted, margin: '10px 0 0' }}>Contact your admin to add or remove a brand from the pipeline.</p>
          </div>

          {/* Content types */}
          <div style={{ borderRadius: 16, padding: 22, background: '#fff', border: `1px solid ${UI.line}`, boxShadow: '0 1px 3px rgba(16,16,11,.05)' }}>
            <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.08em', color: UI.muted, marginBottom: 14 }}>Task / content types</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {CONTENT_TYPES.map(c => (
                <span key={c} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 14px', borderRadius: 99, background: '#F1F1EF' }}>
                  <span style={{ fontSize: 12.5, fontWeight: 600, color: UI.ink }}>{c}</span>
                </span>
              ))}
            </div>
          </div>

          {/* SLA per stage */}
          <div style={{ borderRadius: 16, padding: 22, background: '#fff', border: `1px solid ${UI.line}`, boxShadow: '0 1px 3px rgba(16,16,11,.05)' }}>
            <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.08em', color: UI.muted, marginBottom: 4 }}>SLA per stage</div>
            <p style={{ fontSize: 11.5, color: UI.muted, margin: '0 0 16px' }}>Max business days a task can sit in each stage before being flagged as "Stuck".</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 1, borderRadius: 10, overflow: 'hidden', border: `1px solid ${UI.line}` }}>
              {SLA_STAGES.map((stageId, i) => {
                const meta = SLA_META[stageId]
                const val = slaConfig[stageId] ?? 2
                return (
                  <div key={stageId} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 16px', background: i % 2 === 0 ? '#fff' : UI.soft }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span style={{ width: 8, height: 8, borderRadius: 2, background: meta.color, display: 'inline-block', flexShrink: 0 }} />
                      <span style={{ fontSize: 13, fontWeight: 600, color: UI.ink }}>{meta.label}</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <input
                        type="number"
                        min={1}
                        max={30}
                        value={val}
                        onChange={e => updateSLA({ [stageId]: Math.max(1, parseInt(e.target.value) || 1) })}
                        style={{ width: 56, textAlign: 'center', ...FIELD, fontWeight: 700, fontSize: 14 }}
                      />
                      <span style={{ fontSize: 12, color: UI.muted, minWidth: 28 }}>days</span>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}

      {/* Add brand modal */}
      {addBrandOpen && (
        <div
          onClick={() => setAddBrandOpen(false)}
          style={{ position: 'fixed', inset: 0, zIndex: 60, background: 'rgba(16,16,11,.5)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{ width: '100%', maxWidth: 400, background: '#fff', borderRadius: 20, padding: 24, boxShadow: '0 30px 80px rgba(0,0,0,.25)', fontFamily: 'inherit' }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
              <h3 style={{ fontWeight: 700, fontSize: '1rem', color: UI.ink, margin: 0 }}>Add brand</h3>
              <button onClick={() => setAddBrandOpen(false)} style={{ width: 28, height: 28, borderRadius: '50%', background: UI.soft, border: 'none', cursor: 'pointer', color: UI.ink, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✕</button>
            </div>
            <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 16 }}>
              <div style={{ width: 52, height: 52, borderRadius: 14, background: brandDraft.color, border: `1px solid ${UI.line}`, flexShrink: 0 }} />
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
                <input
                  placeholder="Brand name"
                  value={brandDraft.name}
                  onChange={e => setBrandDraft(d => ({ ...d, name: e.target.value }))}
                  style={{ ...FIELD, width: '100%', boxSizing: 'border-box', fontSize: 13 }}
                />
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <label style={{ fontSize: 11, color: UI.muted, fontWeight: 600 }}>Color</label>
                  <input type="color" value={brandDraft.color} onChange={e => setBrandDraft(d => ({ ...d, color: e.target.value }))} style={{ width: 36, height: 28, border: 'none', borderRadius: 6, cursor: 'pointer', padding: 2, background: 'transparent' }} />
                  <span style={{ fontSize: 12, color: UI.muted, fontFamily: 'monospace' }}>{brandDraft.color}</span>
                </div>
              </div>
            </div>
            <p style={{ fontSize: 11.5, color: UI.muted, margin: '0 0 16px' }}>Contact your developer to fully integrate a new brand into the pipeline.</p>
            <button
              onClick={() => setAddBrandOpen(false)}
              style={{ width: '100%', padding: '0.75rem', borderRadius: 12, background: UI.dark, color: UI.lime, border: 'none', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}
            >
              Done
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

interface MemberRowProps {
  member: Member
  isYou: boolean
  first: boolean
  onUpdate: (patch: Partial<Member>) => void
  onRemove: () => void
}

function MemberRow({ member: m, isYou, first, onUpdate, onRemove }: MemberRowProps) {
  const ac = ACCESS_BADGE[m.access]
  const owns = REVIEW_STAGES.filter(s => STAGE_META[s].owner === m.role || STAGE_META[s].owner === m.name)

  return (
    <div style={{ padding: '16px 20px', borderTop: first ? 'none' : `1px solid ${UI.soft}` }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        {/* Avatar */}
        <div style={{ width: 36, height: 36, borderRadius: '50%', background: avatarColor(m.name), color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, flexShrink: 0 }}>
          {initials(m.name)}
        </div>

        {/* Name + role */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="mont" style={{ fontWeight: 700, fontSize: 14, color: UI.ink }}>
            {m.name}
            {isYou && <span style={{ fontWeight: 400, fontSize: 11, color: UI.muted, marginLeft: 6 }}>(you)</span>}
          </div>
          <input
            value={m.role}
            onChange={e => onUpdate({ role: e.target.value })}
            placeholder="Role"
            style={{ fontSize: 12, marginTop: 2, outline: 'none', background: 'transparent', border: 'none', width: '100%', color: UI.muted, padding: 0, fontFamily: 'inherit' }}
          />
        </div>

        {/* Capacity */}
        <input
          type="number"
          min={1}
          max={80}
          value={m.capacity ?? 40}
          onChange={e => onUpdate({ capacity: Math.max(1, parseInt(e.target.value) || 40) })}
          title="Weekly capacity (hours)"
          style={{ ...FIELD, width: 64, textAlign: 'center', fontWeight: 600 } as React.CSSProperties}
        />
        <span style={{ fontSize: 11, color: UI.muted, whiteSpace: 'nowrap' }}>hrs/wk</span>

        {/* Access level */}
        <select
          value={m.access}
          onChange={e => onUpdate({ access: e.target.value as AccessLevel })}
          style={{ ...FIELD, cursor: 'pointer', fontWeight: 600 } as React.CSSProperties}
        >
          {ACCESS_OPTS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>

        {/* Access badge */}
        <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 9px', borderRadius: 99, background: ac.bg, color: ac.color, whiteSpace: 'nowrap', flexShrink: 0 }}>
          {m.access === 'admin' ? 'Admin' : m.access === 'superuser' ? 'Super User' : 'User'}
        </span>

        {/* Remove */}
        <button
          onClick={isYou ? undefined : onRemove}
          disabled={isYou}
          title={isYou ? "Can't remove yourself" : `Remove ${m.name}`}
          style={{ border: 'none', background: 'transparent', cursor: isYou ? 'default' : 'pointer', color: '#C03A3A', fontSize: 13, padding: 6, borderRadius: 8, opacity: isYou ? 0.25 : 1, flexShrink: 0 }}
        >
          ✕
        </button>
      </div>

      {/* Stage ownership chips */}
      {owns.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 10, paddingLeft: 50, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em', color: UI.muted, marginRight: 2 }}>Owns review</span>
          {owns.map(stageId => {
            const meta = STAGE_META[stageId]
            return (
              <span key={stageId} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11.5, fontWeight: 600, padding: '4px 10px', borderRadius: 99, background: meta.color, color: '#fff' }}>
                <span style={{ width: 5, height: 5, borderRadius: 2, background: 'rgba(255,255,255,.7)', display: 'inline-block' }} />
                {meta.label}
              </span>
            )
          })}
        </div>
      )}
    </div>
  )
}
