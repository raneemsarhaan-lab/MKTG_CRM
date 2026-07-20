'use client'

import { useState, useTransition } from 'react'
import type { Member } from '@/types/index'
import { COLORS, ACCESS_BADGE } from '@/lib/tokens'
import { initials, avatarColor } from '@/lib/utils'
import { updateMember, addMember, removeMember, resetMemberPassword } from '@/actions/members'
import { STAGE_META } from '@/lib/stage-meta'

const REVIEW_STAGES = ['c-final', 'c-check', 'd-check', 'final-check'] as const

const ACCESS_OPTS = [
  { value: 'admin',     label: 'Admin' },
  { value: 'superuser', label: 'Super User' },
  { value: 'user',      label: 'User' },
] as const

interface TeamSettingsProps {
  members: Member[]
  currentUserId: string
}

interface RemoveWarning {
  memberId: string
  memberName: string
  activeTasks: number
}

export function TeamSettings({ members, currentUserId }: TeamSettingsProps) {
  const [draft, setDraft] = useState<{ name: string; email: string; role: string; access: 'admin' | 'superuser' | 'user'; password: string }>({ name: '', email: '', role: '', access: 'user', password: '' })
  const [addError, setAddError] = useState<string | null>(null)
  const [removeWarning, setRemoveWarning] = useState<RemoveWarning | null>(null)
  const [isPending, startTransition] = useTransition()

  function handleAdd() {
    setAddError(null)
    if (!draft.name.trim() || !draft.email.trim()) return
    startTransition(async () => {
      const result = await addMember({
        name: draft.name,
        email: draft.email,
        role: draft.role,
        access: draft.access,
        password: draft.password,
      })
      if (!result.success) {
        setAddError(result.error ?? 'Failed to add member')
      } else {
        setDraft({ name: '', email: '', role: '', access: 'user', password: '' })
      }
    })
  }

  function handleRemove(member: Member) {
    startTransition(async () => {
      const result = await removeMember(member.id)
      if (!result.success && result.activeTasks) {
        setRemoveWarning({ memberId: member.id, memberName: member.name, activeTasks: result.activeTasks })
      }
    })
  }

  const inputStyle: React.CSSProperties = {
    fontSize: '0.8rem', padding: '7px 10px', borderRadius: 8,
    border: '1px solid var(--line)', background: '#F6F6F4',
    color: 'var(--ink)', outline: 'none', fontFamily: 'inherit',
  }

  return (
    <div>
      <p style={{ fontSize: '0.82rem', color: 'var(--muted)', margin: '0 0 18px', maxWidth: 680 }}>
        Manage team access and capacity.{' '}
        <strong style={{ color: 'var(--ink)' }}>Admin</strong> sees everything,{' '}
        <strong style={{ color: 'var(--ink)' }}>Super User</strong> can advance any task,{' '}
        <strong style={{ color: 'var(--ink)' }}>User</strong> moves only their own.
      </p>

      {/* Member list */}
      <div style={{
        borderRadius: 16, overflow: 'hidden',
        background: '#fff', border: '1px solid var(--line)',
        boxShadow: '0 1px 3px rgba(16,16,11,.05)', marginBottom: 14,
      }}>
        {members.length === 0 ? (
          <div style={{ padding: 32, textAlign: 'center', color: 'var(--muted)', fontSize: '0.82rem' }}>
            No members yet.
          </div>
        ) : (
          members.map((m, i) => (
            <MemberRow
              key={m.id}
              member={m}
              isYou={m.id === currentUserId}
              first={i === 0}
              onRemove={() => handleRemove(m)}
            />
          ))
        )}
      </div>

      {/* Add member form */}
      <div style={{
        borderRadius: 14, padding: 18,
        background: '#F1F1EF', border: '1px dashed #C7CFE0',
        marginBottom: 20,
      }}>
        <div style={{ fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.08em', color: 'var(--muted)', marginBottom: 12 }}>
          Add member
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
          <input
            placeholder="Full name"
            value={draft.name}
            onChange={e => setDraft(d => ({ ...d, name: e.target.value }))}
            onKeyDown={e => e.key === 'Enter' && handleAdd()}
            style={{ ...inputStyle, flex: '2 1 160px' }}
          />
          <input
            placeholder="name@forefront.consulting"
            value={draft.email}
            onChange={e => setDraft(d => ({ ...d, email: e.target.value }))}
            onKeyDown={e => e.key === 'Enter' && handleAdd()}
            style={{ ...inputStyle, flex: '2 1 200px' }}
          />
          <input
            placeholder="Role"
            value={draft.role}
            onChange={e => setDraft(d => ({ ...d, role: e.target.value }))}
            onKeyDown={e => e.key === 'Enter' && handleAdd()}
            style={{ ...inputStyle, flex: '2 1 140px' }}
          />
          <select
            value={draft.access}
            onChange={e => setDraft(d => ({ ...d, access: e.target.value as 'admin' | 'superuser' | 'user' }))}
            style={{ ...inputStyle, flex: '1 1 120px', cursor: 'pointer' }}
          >
            {ACCESS_OPTS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          <input
            type="password"
            placeholder="Password (min 6 chars)"
            value={draft.password}
            onChange={e => setDraft(d => ({ ...d, password: e.target.value }))}
            onKeyDown={e => e.key === 'Enter' && handleAdd()}
            style={{ ...inputStyle, flex: '2 1 160px' }}
          />
          <button
            onClick={handleAdd}
            disabled={isPending || !draft.name.trim() || !draft.email.trim() || !draft.password.trim()}
            style={{
              ...inputStyle,
              background: 'var(--ink)', color: COLORS.lime, border: 'none',
              fontWeight: 700, cursor: (draft.name.trim() && draft.email.trim()) ? 'pointer' : 'default',
              opacity: (draft.name.trim() && draft.email.trim() && !isPending) ? 1 : 0.4,
              paddingInline: 20, fontSize: '0.82rem',
            }}
          >
            + Add
          </button>
        </div>
        {addError && (
          <div style={{ marginTop: 8, fontSize: '0.75rem', color: COLORS.coral }}>
            {addError}
          </div>
        )}
      </div>

      {/* Stage ownership info */}
      <div style={{
        borderRadius: 14, padding: 20,
        background: '#fff', border: '1px solid var(--line)',
        boxShadow: '0 1px 3px rgba(16,16,11,.05)',
      }}>
        <div style={{ fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.08em', color: 'var(--muted)', marginBottom: 14 }}>
          Review stage owners
        </div>
        <p style={{ fontSize: '0.75rem', color: 'var(--muted)', margin: '0 0 14px' }}>
          Review stages are owned by role. The first member matching each role is the designated reviewer.
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {REVIEW_STAGES.map(stageId => {
            const meta = STAGE_META[stageId]
            const owner = members.find(m => m.role === meta.owner_role)
            return (
              <div key={stageId} style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '10px 14px', borderRadius: 10, background: '#F6F6F4',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ width: 8, height: 8, borderRadius: 2, background: meta.color, display: 'inline-block', flexShrink: 0 }} />
                  <span style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--ink)' }}>{meta.label_en}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  {owner && (
                    <div style={{
                      width: 24, height: 24, borderRadius: '50%',
                      background: avatarColor(owner.name), color: '#fff',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: '0.6rem', fontWeight: 700,
                    }}>
                      {initials(owner.name)}
                    </div>
                  )}
                  <span style={{ fontSize: '0.78rem', fontWeight: 600, color: owner ? 'var(--ink)' : 'var(--muted)' }}>
                    {owner ? owner.name : `Role: ${meta.owner_role ?? '—'}`}
                  </span>
                  {meta.owner_role && (
                    <span style={{ fontSize: '0.65rem', color: 'var(--muted)', background: '#EBEBEB', borderRadius: 4, padding: '2px 6px' }}>
                      {meta.owner_role}
                    </span>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Remove warning modal */}
      {removeWarning && (
        <div
          onClick={() => setRemoveWarning(null)}
          style={{
            position: 'fixed', inset: 0, zIndex: 60,
            background: 'rgba(16,16,11,.45)', backdropFilter: 'blur(4px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              width: '100%', maxWidth: 360, background: '#fff',
              borderRadius: 18, padding: 24,
              boxShadow: '0 24px 60px rgba(0,0,0,.2)',
            }}
          >
            <h3 style={{ fontWeight: 700, fontSize: '1rem', color: 'var(--ink)', margin: '0 0 12px' }}>
              Can&apos;t remove {removeWarning.memberName}
            </h3>
            <p style={{ fontSize: '0.82rem', color: 'var(--muted)', margin: '0 0 18px', lineHeight: 1.55 }}>
              This member owns <strong style={{ color: 'var(--ink)' }}>{removeWarning.activeTasks} active task{removeWarning.activeTasks !== 1 ? 's' : ''}</strong>.
              Reassign or complete those tasks before removing them from the team.
            </p>
            <button
              onClick={() => setRemoveWarning(null)}
              style={{
                width: '100%', padding: '0.65rem', borderRadius: 10,
                background: 'var(--ink)', color: '#fff', border: 'none',
                fontSize: '0.82rem', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
              }}
            >
              Got it
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
  onRemove: () => void
}

function MemberRow({ member: m, isYou, first, onRemove }: MemberRowProps) {
  const [isPending, startTransition] = useTransition()
  const [newPwd, setNewPwd] = useState('')
  const [pwdMsg, setPwdMsg] = useState('')
  const ac = ACCESS_BADGE[m.access] as { bg: string; text: string }

  function handleResetPassword() {
    if (!newPwd || newPwd.length < 6) { setPwdMsg('Min 6 characters'); return }
    startTransition(async () => {
      const r = await resetMemberPassword(m.id, newPwd)
      if (r.success) { setNewPwd(''); setPwdMsg('Password updated') }
      else setPwdMsg(r.error ?? 'Failed')
      setTimeout(() => setPwdMsg(''), 3000)
    })
  }
  const ownedStages = REVIEW_STAGES.filter(s => STAGE_META[s].owner_role === m.role)

  function handleField(patch: Parameters<typeof updateMember>[1]) {
    startTransition(async () => { await updateMember(m.id, patch) })
  }

  return (
    <div style={{
      padding: '14px 18px',
      borderTop: first ? 'none' : '1px solid #F6F6F4',
      opacity: isPending ? 0.6 : 1,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        {/* Avatar */}
        <div style={{
          width: 34, height: 34, borderRadius: '50%',
          background: avatarColor(m.name), color: '#fff',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: '0.7rem', fontWeight: 700, flexShrink: 0,
        }}>
          {initials(m.name)}
        </div>

        {/* Name + role */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: '0.87rem', color: 'var(--ink)' }}>
            {m.name}
            {isYou && <span style={{ fontWeight: 400, fontSize: '0.7rem', color: 'var(--muted)', marginLeft: 6 }}>(you)</span>}
          </div>
          <input
            defaultValue={m.role}
            placeholder="Role"
            onBlur={e => {
              if (e.target.value !== m.role) handleField({ role: e.target.value })
            }}
            style={{
              fontSize: '0.72rem', marginTop: 2, outline: 'none',
              background: 'transparent', border: 'none', width: '100%',
              color: 'var(--muted)', padding: 0, fontFamily: 'inherit',
            }}
          />
        </div>

        {/* Capacity */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <input
            type="number" min={1} max={168}
            defaultValue={m.capacity_hrs_wk}
            onBlur={e => {
              const val = parseInt(e.target.value, 10)
              if (!isNaN(val) && val > 0 && val !== m.capacity_hrs_wk) handleField({ capacity_hrs_wk: val })
            }}
            title="Weekly capacity (hours)"
            style={{
              width: 52, textAlign: 'center', fontSize: '0.82rem', fontWeight: 600,
              padding: '5px 6px', borderRadius: 7, border: '1px solid var(--line)',
              background: '#F6F6F4', color: 'var(--ink)', outline: 'none', fontFamily: 'inherit',
            }}
          />
          <span style={{ fontSize: '0.65rem', color: 'var(--muted)', whiteSpace: 'nowrap' }}>hrs/wk</span>
        </div>

        {/* Access select */}
        <select
          defaultValue={m.access}
          onChange={e => handleField({ access: e.target.value as 'admin' | 'superuser' | 'user' })}
          style={{
            fontSize: '0.75rem', padding: '5px 8px', borderRadius: 7,
            border: '1px solid var(--line)', background: '#F6F6F4',
            color: 'var(--ink)', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 600,
          }}
        >
          {ACCESS_OPTS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>

        {/* Access badge */}
        <span style={{
          fontSize: '0.65rem', fontWeight: 700, padding: '3px 9px',
          borderRadius: 99, background: ac.bg, color: ac.text, whiteSpace: 'nowrap', flexShrink: 0,
        }}>
          {m.access === 'admin' ? 'Admin' : m.access === 'superuser' ? 'Super User' : 'User'}
        </span>

        {/* Remove */}
        <button
          onClick={isYou ? undefined : onRemove}
          disabled={isYou}
          title={isYou ? "Can't remove yourself" : `Remove ${m.name}`}
          style={{
            border: 'none', background: 'transparent',
            cursor: isYou ? 'default' : 'pointer',
            color: COLORS.coral, fontSize: '0.82rem', padding: 6,
            borderRadius: 8, opacity: isYou ? 0.2 : 1, flexShrink: 0,
          }}
        >
          ✕
        </button>
      </div>

      {/* Reset password */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 8, paddingLeft: 46 }}>
        <input
          type="password"
          placeholder="New password"
          value={newPwd}
          onChange={e => setNewPwd(e.target.value)}
          style={{
            fontSize: '0.72rem', padding: '5px 8px', borderRadius: 6,
            border: '1px solid var(--line)', background: '#F6F6F4',
            color: 'var(--ink)', outline: 'none', fontFamily: 'inherit', width: 150,
          }}
        />
        <button
          onClick={handleResetPassword}
          disabled={isPending || !newPwd}
          style={{
            fontSize: '0.7rem', padding: '5px 10px', borderRadius: 6,
            background: 'var(--ink)', color: '#fff', border: 'none',
            cursor: newPwd ? 'pointer' : 'default', opacity: newPwd ? 1 : 0.4,
            fontFamily: 'inherit', fontWeight: 600,
          }}
        >
          Reset
        </button>
        {pwdMsg && <span style={{ fontSize: '0.7rem', color: pwdMsg.includes('updated') ? '#4B7A12' : COLORS.coral }}>{pwdMsg}</span>}
      </div>

      {/* Stage ownership chips */}
      {ownedStages.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 8, paddingLeft: 46, flexWrap: 'wrap' }}>
          <span style={{ fontSize: '0.62rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--muted)', marginRight: 2 }}>
            Owns review
          </span>
          {ownedStages.map(stageId => {
            const meta = STAGE_META[stageId]
            return (
              <span key={stageId} style={{
                display: 'inline-flex', alignItems: 'center', gap: 5,
                fontSize: '0.7rem', fontWeight: 600, padding: '3px 9px',
                borderRadius: 99, background: meta.color, color: '#fff',
              }}>
                {meta.label_en}
              </span>
            )
          })}
        </div>
      )}
    </div>
  )
}
