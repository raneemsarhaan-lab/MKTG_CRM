'use client'

import { useRef, useState, useTransition } from 'react'
import type { Member } from '@/types/index'
import { COLORS, ACCESS_BADGE } from '@/lib/tokens'
import { initials, avatarColor } from '@/lib/utils'
import { ImageWithFallback } from '@/components/shared/ImageWithFallback'
import { ImageUpload } from '@/components/shared/ImageUpload'
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
  memberId:   string
  memberName: string
  ownedTasks: number
  activeTasks: number
  comments:   number
}

export function TeamSettings({ members, currentUserId }: TeamSettingsProps) {
  const [draft, setDraft] = useState<{ name: string; email: string; role: string; access: 'admin' | 'superuser' | 'user'; password: string }>({ name: '', email: '', role: '', access: 'user', password: '' })
  const [addError, setAddError] = useState<string | null>(null)
  const [removeWarning, setRemoveWarning] = useState<RemoveWarning | null>(null)
  const [reassignTo, setReassignTo]       = useState('')
  const [removeError, setRemoveError]     = useState<string | null>(null)
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
    setRemoveError(null)
    startTransition(async () => {
      const result = await removeMember(member.id)
      if (result.success) return
      if (result.needsReassign) {
        setReassignTo('')
        setRemoveWarning({
          memberId:    member.id,
          memberName:  member.name,
          ownedTasks:  result.ownedTasks ?? 0,
          activeTasks: result.activeTasks ?? 0,
          comments:    result.comments ?? 0,
        })
        return
      }
      setRemoveError(result.error ?? 'Could not remove that member')
    })
  }

  function confirmRemove() {
    if (!removeWarning || !reassignTo) return
    setRemoveError(null)
    startTransition(async () => {
      const res = await removeMember(removeWarning.memberId, reassignTo)
      if (res.success) setRemoveWarning(null)
      else setRemoveError(res.error ?? 'Could not remove that member')
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

      {/* Reassign-then-remove dialog */}
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
            role="dialog"
            aria-modal="true"
            aria-label={`Remove ${removeWarning.memberName}`}
            style={{
              width: '100%', maxWidth: 420, background: '#fff',
              borderRadius: 18, padding: 24,
              boxShadow: '0 24px 60px rgba(0,0,0,.2)',
            }}
          >
            <h3 style={{ fontWeight: 700, fontSize: '1rem', color: 'var(--ink)', margin: '0 0 12px' }}>
              Remove {removeWarning.memberName}
            </h3>
            <p style={{ fontSize: '0.82rem', color: 'var(--muted)', margin: '0 0 16px', lineHeight: 1.55 }}>
              They hold{' '}
              <strong style={{ color: 'var(--ink)' }}>
                {removeWarning.ownedTasks} task{removeWarning.ownedTasks === 1 ? '' : 's'}
              </strong>
              {removeWarning.activeTasks > 0 && ` (${removeWarning.activeTasks} still unfinished)`}
              {removeWarning.comments > 0 && ` and ${removeWarning.comments} comment${removeWarning.comments === 1 ? '' : 's'}`}
              . Choose who takes them over — nothing is deleted, it all moves across.
            </p>

            <label style={{
              display: 'block', fontSize: '0.7rem', fontWeight: 700, color: 'var(--muted)',
              textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 6,
            }}>
              Reassign to
            </label>
            <select
              value={reassignTo}
              onChange={e => setReassignTo(e.target.value)}
              style={{
                width: '100%', fontSize: '0.82rem', padding: '9px 10px', borderRadius: 9,
                border: '1px solid var(--line)', background: '#F6F6F4',
                color: 'var(--ink)', fontFamily: 'inherit', cursor: 'pointer',
              }}
            >
              <option value="">Select a member…</option>
              {members.filter(m => m.id !== removeWarning.memberId).map(m => (
                <option key={m.id} value={m.id}>{m.name}</option>
              ))}
            </select>

            {removeError && (
              <p role="alert" style={{ fontSize: '0.75rem', color: COLORS.coral, margin: '10px 0 0' }}>
                {removeError}
              </p>
            )}

            <div style={{ display: 'flex', gap: 8, marginTop: 18 }}>
              <button
                onClick={confirmRemove}
                disabled={!reassignTo || isPending}
                style={{
                  flex: 1, padding: '0.65rem', borderRadius: 10,
                  background: COLORS.coral, color: '#fff', border: 'none',
                  fontSize: '0.82rem', fontWeight: 700, fontFamily: 'inherit',
                  cursor: reassignTo ? 'pointer' : 'default', opacity: reassignTo && !isPending ? 1 : 0.5,
                }}
              >
                {isPending ? 'Working…' : 'Reassign and remove'}
              </button>
              <button
                onClick={() => setRemoveWarning(null)}
                style={{
                  padding: '0.65rem 1rem', borderRadius: 10,
                  background: '#fff', color: 'var(--muted)', border: '1px solid var(--line)',
                  fontSize: '0.82rem', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {removeError && !removeWarning && (
        <p role="alert" style={{ fontSize: '0.78rem', color: COLORS.coral, marginTop: 12 }}>
          {removeError}
        </p>
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
  const [issued, setIssued] = useState('')
  const pwdRef = useRef<HTMLInputElement>(null)
  const ac = ACCESS_BADGE[m.access] as { bg: string; text: string }

  /**
   * The value is read from the element, not from React state.
   *
   * These are `type=password` inputs on a page with sixteen of them, and a
   * browser password manager will autofill them without firing React's
   * onChange. State then stays empty while the box visibly holds a value, the
   * button sits disabled, and clicking it does nothing at all — which looks
   * exactly like "I reset the password and it didn't work".
   */
  function handleResetPassword() {
    const value = pwdRef.current?.value ?? newPwd
    if (!value || value.length < 6) { setPwdMsg('Min 6 characters'); return }
    startTransition(async () => {
      const r = await resetMemberPassword(m.id, value)
      if (r.success) {
        setNewPwd('')
        if (pwdRef.current) pwdRef.current.value = ''
        setPwdMsg(`Password set for ${m.name}`)
      } else {
        setPwdMsg(r.error ?? 'Failed')
      }
      setTimeout(() => setPwdMsg(''), 6000)
    })
  }

  /**
   * Set a generated password and show it once.
   *
   * Typing a temporary password into the box and then re-typing it into a
   * message is where the other half of "it still doesn't work" lives: a
   * trailing space picked up on the way, an l/1 or O/0 read wrong, and the
   * two no longer match. Generated from an alphabet with those characters
   * removed, set, then displayed for the admin to copy verbatim.
   */
  function handleGenerate() {
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789'
    const bytes = new Uint32Array(14)
    crypto.getRandomValues(bytes)
    const value = Array.from(bytes, n => alphabet[n % alphabet.length]).join('')

    setPwdMsg('')
    startTransition(async () => {
      const r = await resetMemberPassword(m.id, value)
      if (r.success) {
        setIssued(value)
        setPwdMsg(`Password set for ${m.name}`)
      } else {
        setPwdMsg(r.error ?? 'Failed')
        setTimeout(() => setPwdMsg(''), 6000)
      }
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
        {/* Avatar — the photo when one is set, initials otherwise */}
        <div style={{
          width: 34, height: 34, borderRadius: '50%', overflow: 'hidden',
          background: avatarColor(m.name), color: '#fff',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: '0.7rem', fontWeight: 700, flexShrink: 0,
        }}>
          <ImageWithFallback
            src={m.avatar_url}
            alt=""
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            fallback={<>{initials(m.name)}</>}
          />
        </div>

        {/* Name + role */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <input
              defaultValue={m.name}
              aria-label={`Name of ${m.name}`}
              onBlur={e => {
                const v = e.target.value.trim()
                if (v && v !== m.name) handleField({ name: v })
                else e.target.value = m.name
              }}
              style={{
                fontWeight: 700, fontSize: '0.87rem', color: 'var(--ink)',
                background: 'transparent', border: '1px solid transparent',
                borderRadius: 6, padding: '1px 4px', margin: '-1px -4px',
                outline: 'none', fontFamily: 'inherit', minWidth: 0, flex: 1,
              }}
              onFocus={e => (e.target.style.borderColor = 'var(--line)')}
              onBlurCapture={e => (e.target.style.borderColor = 'transparent')}
            />
            {isYou && <span style={{ fontWeight: 400, fontSize: '0.7rem', color: 'var(--muted)' }}>(you)</span>}
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

        {/* An account with no password exists and can hold work, but cannot
            sign in. The import creates people that way. */}
        {m.has_password === false && (
          <span
            title="This account has no password yet and cannot sign in. Set one below."
            style={{
              fontSize: '0.65rem', fontWeight: 700, padding: '3px 9px',
              borderRadius: 99, background: '#FCEFD9', color: '#B9821A',
              whiteSpace: 'nowrap', flexShrink: 0,
            }}
          >
            No sign-in
          </span>
        )}

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
          ref={pwdRef}
          type="password"
          name={`new-password-${m.id}`}
          autoComplete="new-password"
          placeholder={m.has_password === false ? 'Set a password' : 'New password'}
          defaultValue=""
          onChange={e => setNewPwd(e.target.value)}
          style={{
            fontSize: '0.72rem', padding: '5px 8px', borderRadius: 6,
            border: '1px solid var(--line)', background: '#F6F6F4',
            color: 'var(--ink)', outline: 'none', fontFamily: 'inherit', width: 150,
          }}
        />
        {/* Never disabled on state alone — see handleResetPassword. An empty
            box is answered with a message, not with a dead button. */}
        <button
          onClick={handleResetPassword}
          disabled={isPending}
          style={{
            fontSize: '0.7rem', padding: '5px 10px', borderRadius: 6,
            background: 'var(--ink)', color: '#fff', border: 'none',
            cursor: 'pointer', opacity: isPending ? 0.5 : 1,
            fontFamily: 'inherit', fontWeight: 600,
          }}
        >
          {m.has_password === false ? 'Set' : 'Reset'}
        </button>
        <button
          onClick={handleGenerate}
          disabled={isPending}
          title={`Generate a password for ${m.name} and show it once`}
          style={{
            fontSize: '0.7rem', padding: '5px 10px', borderRadius: 6,
            background: '#fff', color: 'var(--ink)', border: '1px solid var(--line)',
            cursor: 'pointer', fontFamily: 'inherit', fontWeight: 600,
            opacity: isPending ? 0.5 : 1, whiteSpace: 'nowrap',
          }}
        >
          Generate
        </button>
        {pwdMsg && (
          <span style={{
            fontSize: '0.7rem', fontWeight: 700, whiteSpace: 'nowrap',
            color: pwdMsg.startsWith('Password set') ? '#4B7A12' : COLORS.coral,
          }}>
            {pwdMsg.startsWith('Password set') ? `✓ ${pwdMsg}` : pwdMsg}
          </span>
        )}

        {/* Photo — uploaded from this computer, or a link. Stored in the same
            column either way; see ImageUpload for why an upload becomes a data
            URL rather than a file. */}
        <div style={{ width: 210, minWidth: 0 }}>
          <ImageUpload
            value={m.avatar_url ?? null}
            max={192}
            round
            disabled={isPending}
            onChange={v => handleField({ avatar_url: v })}
          />
        </div>
      </div>

      {/* The generated password, shown once. It is not stored anywhere in
          readable form — closing this is the only chance to copy it. */}
      {issued && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8, marginTop: 8,
          marginLeft: 46, padding: '8px 10px', borderRadius: 9,
          background: '#FCEFD9', border: '1px solid #F0DCB4', flexWrap: 'wrap',
        }}>
          <span style={{ fontSize: '0.7rem', fontWeight: 700, color: '#8A6414' }}>
            Send this to {m.name} — it is not shown again:
          </span>
          <code style={{
            fontSize: '0.82rem', fontWeight: 700, letterSpacing: '.03em',
            background: '#fff', border: '1px solid #F0DCB4', borderRadius: 6,
            padding: '4px 8px', color: 'var(--ink)', userSelect: 'all',
          }}>
            {issued}
          </code>
          <button
            onClick={() => { void navigator.clipboard?.writeText(issued) }}
            style={{
              fontSize: '0.7rem', padding: '4px 10px', borderRadius: 6,
              background: 'var(--ink)', color: '#fff', border: 'none',
              cursor: 'pointer', fontFamily: 'inherit', fontWeight: 600,
            }}
          >
            Copy
          </button>
          <button
            onClick={() => { setIssued(''); setPwdMsg('') }}
            style={{
              fontSize: '0.7rem', padding: '4px 8px', borderRadius: 6,
              background: 'transparent', color: '#8A6414', border: 'none',
              cursor: 'pointer', fontFamily: 'inherit', fontWeight: 600,
            }}
          >
            Done
          </button>
        </div>
      )}

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
