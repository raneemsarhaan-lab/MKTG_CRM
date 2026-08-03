'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import type { Member } from '@/types/index'
import { PIPE } from '@/lib/pipeline-tokens'
import { initials, avatarColor } from '@/lib/utils'
import { ImageWithFallback } from './ImageWithFallback'
import { updateMyProfile, changeMyPassword } from '@/actions/profile'

/**
 * Sign out by deleting the cookie, then load /login as a real navigation.
 *
 * "I can't log out" was one of the original reports. signOut() went through
 * the same machinery that was silently failing everywhere else; this asks the
 * server to clear one cookie and does not depend on any of it. Even if the
 * request fails, the navigation still happens — /login is the right place to
 * end up either way.
 */
async function logout() {
  try {
    await fetch('/api/logout', { method: 'POST', cache: 'no-store', credentials: 'same-origin' })
  } catch { /* navigate regardless */ }
  window.location.assign('/login')
}

/**
 * The account menu behind the sidebar's user row.
 *
 * Until now there was no way to sign out at all — `signOut` was never called
 * anywhere in the app — and nothing let a person change their own name, photo
 * or password without an admin doing it for them. All of that lives here.
 *
 * Positioned against the viewport rather than its parent: the sidebar is a
 * flex column with its own overflow, which would clip a panel opening upward
 * out of the user row at the bottom.
 */

interface Props {
  member: Member
  /** Where the trigger sits, so the panel opens on the correct side. */
  variant?: 'sidebar' | 'rail'
}

type Panel = 'menu' | 'profile' | 'password'

export function UserMenu({ member, variant = 'sidebar' }: Props) {
  const [open, setOpen]   = useState(false)
  const [panel, setPanel] = useState<Panel>('menu')
  const [pos, setPos]     = useState<{ left: number; bottom: number }>({ left: 0, bottom: 0 })
  const [note, setNote]   = useState('')
  const [error, setError] = useState('')
  const [isPending, startTransition] = useTransition()

  const [name, setName]     = useState(member.name)
  const [photo, setPhoto]   = useState(member.avatar_url ?? '')
  const [current, setCurrent] = useState('')
  const [next, setNext]       = useState('')

  const btnRef  = useRef<HTMLButtonElement>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const router  = useRouter()

  useEffect(() => {
    if (!open) return
    function place() {
      const r = btnRef.current?.getBoundingClientRect()
      if (!r) return
      setPos({
        left:   Math.min(r.left, window.innerWidth - 300),
        bottom: Math.max(12, window.innerHeight - r.top + 8),
      })
    }
    place()
    window.addEventListener('resize', place)
    window.addEventListener('scroll', place, true)
    return () => {
      window.removeEventListener('resize', place)
      window.removeEventListener('scroll', place, true)
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    function onDown(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) close()
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') { e.stopPropagation(); close() }
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey, true)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey, true)
    }
  }, [open])

  function close() {
    setOpen(false)
    setPanel('menu')
    setError('')
    setCurrent('')
    setNext('')
  }

  function saveProfile() {
    setError(''); setNote('')
    startTransition(async () => {
      const res = await updateMyProfile({ name, avatar_url: photo || null })
      if (!res.success) { setError(res.error ?? 'Could not save'); return }
      setNote('Profile updated')
      router.refresh()
      setTimeout(() => setNote(''), 3000)
      setPanel('menu')
    })
  }

  function savePassword() {
    setError(''); setNote('')
    startTransition(async () => {
      const res = await changeMyPassword(current, next)
      if (!res.success) { setError(res.error ?? 'Could not change password'); return }
      setNote('Password changed')
      setCurrent(''); setNext('')
      setTimeout(() => setNote(''), 3000)
      setPanel('menu')
    })
  }

  const isRail = variant === 'rail'

  return (
    <div ref={wrapRef} style={{ display: 'contents' }}>
      <button
        ref={btnRef}
        type="button"
        onClick={() => (open ? close() : setOpen(true))}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Account menu"
        style={isRail ? {
          background: 'none', border: 'none', padding: 0, cursor: 'pointer',
          position: 'relative', flexShrink: 0, marginTop: 12, lineHeight: 0,
        } : {
          display: 'flex', alignItems: 'center', gap: 10, width: '100%',
          background: open ? '#F4F4F2' : 'none', border: 'none', cursor: 'pointer',
          padding: '6px 6px', margin: '0 -6px', borderRadius: 12,
          fontFamily: 'inherit', textAlign: 'start',
        }}
      >
        <span style={{
          width: isRail ? 40 : 40, height: isRail ? 40 : 40, borderRadius: '50%',
          flexShrink: 0, overflow: 'hidden', boxSizing: 'border-box',
          border: isRail ? '2px solid #34383B' : '2px solid #E9D5FF',
          background: avatarColor(member.name), color: '#FFFFFF',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 13,
        }}>
          <ImageWithFallback
            src={member.avatar_url}
            alt=""
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            fallback={<>{initials(member.name)}</>}
          />
        </span>

        {!isRail && (
          <>
            <span style={{ minWidth: 0, lineHeight: 1.25, flex: 1 }}>
              <span style={{
                display: 'block', fontWeight: 700, fontSize: 13.5, color: PIPE.ink,
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>
                {member.name}
              </span>
              <span style={{ display: 'block', fontWeight: 500, fontSize: 11.5, color: PIPE.textFaint }}>
                {member.access === 'admin' ? 'Admin' : member.role}
              </span>
            </span>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={PIPE.textFaint}
                 strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
                 style={{ flexShrink: 0, transform: open ? 'rotate(180deg)' : undefined }}>
              <path d="M6 9l6 6 6-6" />
            </svg>
          </>
        )}
      </button>

      {open && (
        <div
          role="menu"
          aria-label="Account"
          style={{
            position: 'fixed', left: pos.left, bottom: pos.bottom, zIndex: 90,
            width: 280, background: '#FFFFFF', borderRadius: 14,
            border: `1px solid ${PIPE.border}`, boxShadow: '0 18px 44px rgba(20,19,26,.24)',
            padding: 8,
          }}
        >
          <div style={{
            display: 'flex', alignItems: 'center', gap: 10, padding: '8px 8px 10px',
            borderBottom: `1px solid ${PIPE.border}`, marginBottom: 6,
          }}>
            <span style={{
              width: 34, height: 34, borderRadius: '50%', overflow: 'hidden', flexShrink: 0,
              background: avatarColor(member.name), color: '#fff',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontWeight: 700, fontSize: 12,
            }}>
              <ImageWithFallback
                src={member.avatar_url}
                alt=""
                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                fallback={<>{initials(member.name)}</>}
              />
            </span>
            <span style={{ minWidth: 0 }}>
              <span style={{
                display: 'block', fontWeight: 700, fontSize: 13, color: PIPE.ink,
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>
                {member.name}
              </span>
              <span style={{
                display: 'block', fontSize: 11.5, color: PIPE.textFaint,
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>
                {member.email}
              </span>
            </span>
          </div>

          {note && <Banner tone="ok">{note}</Banner>}
          {error && <Banner tone="bad">{error}</Banner>}

          {panel === 'menu' && (
            <>
              <Row icon="✎" onClick={() => setPanel('profile')}>Edit name &amp; photo</Row>
              <Row icon="🔒" onClick={() => setPanel('password')}>Change password</Row>
              {member.access === 'admin' && (
                <Link href="/settings" onClick={close} style={ROW_LINK}>
                  <span aria-hidden="true" style={ICON}>⚙</span> Workspace settings
                </Link>
              )}
              <div style={{ height: 1, background: PIPE.border, margin: '6px 4px' }} />
              <Row
                icon="⏻"
                tone="bad"
                onClick={() => { close(); void logout() }}
              >
                Log out
              </Row>
            </>
          )}

          {panel === 'profile' && (
            <div style={{ padding: '4px 4px 6px', display: 'grid', gap: 8 }}>
              <Field label="Name">
                <input value={name} onChange={e => setName(e.target.value)} style={INPUT} />
              </Field>
              <Field label="Photo URL">
                <input
                  value={photo}
                  onChange={e => setPhoto(e.target.value)}
                  placeholder="https://…"
                  style={INPUT}
                />
              </Field>
              <Actions
                busy={isPending}
                onSave={saveProfile}
                onCancel={() => { setName(member.name); setPhoto(member.avatar_url ?? ''); setPanel('menu') }}
              />
            </div>
          )}

          {panel === 'password' && (
            <div style={{ padding: '4px 4px 6px', display: 'grid', gap: 8 }}>
              <Field label="Current password">
                <input
                  type="password"
                  value={current}
                  onChange={e => setCurrent(e.target.value)}
                  autoComplete="current-password"
                  style={INPUT}
                />
              </Field>
              <Field label="New password">
                <input
                  type="password"
                  value={next}
                  onChange={e => setNext(e.target.value)}
                  autoComplete="new-password"
                  placeholder="At least 6 characters"
                  style={INPUT}
                />
              </Field>
              <Actions
                busy={isPending}
                disabled={next.length < 6}
                onSave={savePassword}
                onCancel={() => { setCurrent(''); setNext(''); setPanel('menu') }}
              />
            </div>
          )}
        </div>
      )}
    </div>
  )
}

const ICON: React.CSSProperties = { width: 18, textAlign: 'center', color: PIPE.textFaint }

const ROW_LINK: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 9, width: '100%',
  padding: '9px 8px', borderRadius: 9, textDecoration: 'none',
  color: PIPE.textPrimary, fontSize: 13, fontFamily: 'inherit',
}

const INPUT: React.CSSProperties = {
  width: '100%', padding: '7px 9px', borderRadius: 8, fontSize: 13,
  border: `1px solid ${PIPE.borderInput}`, background: '#FFFFFF',
  color: PIPE.textPrimary, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box',
}

function Row({ icon, children, onClick, tone }: {
  icon: string; children: React.ReactNode; onClick: () => void; tone?: 'bad'
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      style={{
        ...ROW_LINK,
        border: 'none', background: 'transparent', cursor: 'pointer', textAlign: 'start',
        color: tone === 'bad' ? '#D22040' : PIPE.textPrimary,
      }}
      onMouseEnter={e => (e.currentTarget.style.background = '#F4F4F2')}
      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
    >
      <span aria-hidden="true" style={{ ...ICON, color: tone === 'bad' ? '#D22040' : PIPE.textFaint }}>
        {icon}
      </span>
      {children}
    </button>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: 'grid', gap: 4 }}>
      <span style={{
        fontSize: 10, fontWeight: 700, letterSpacing: '.06em',
        textTransform: 'uppercase', color: PIPE.textFaint,
      }}>
        {label}
      </span>
      {children}
    </label>
  )
}

function Actions({ busy, disabled, onSave, onCancel }: {
  busy: boolean; disabled?: boolean; onSave: () => void; onCancel: () => void
}) {
  return (
    <div style={{ display: 'flex', gap: 6, marginTop: 2 }}>
      <button
        type="button"
        onClick={onSave}
        disabled={busy || disabled}
        style={{
          flex: 1, padding: '8px 10px', borderRadius: 8, border: 'none',
          background: PIPE.ink, color: PIPE.limePrimary, fontWeight: 700,
          fontSize: 12.5, cursor: 'pointer', fontFamily: 'inherit',
          opacity: busy || disabled ? 0.5 : 1,
        }}
      >
        {busy ? 'Saving…' : 'Save'}
      </button>
      <button
        type="button"
        onClick={onCancel}
        style={{
          padding: '8px 12px', borderRadius: 8, border: `1px solid ${PIPE.borderInput}`,
          background: '#fff', color: PIPE.textMuted, fontWeight: 700,
          fontSize: 12.5, cursor: 'pointer', fontFamily: 'inherit',
        }}
      >
        Cancel
      </button>
    </div>
  )
}

function Banner({ tone, children }: { tone: 'ok' | 'bad'; children: React.ReactNode }) {
  return (
    <div
      role={tone === 'bad' ? 'alert' : undefined}
      style={{
        margin: '0 4px 6px', padding: '7px 9px', borderRadius: 8, fontSize: 12,
        background: tone === 'ok' ? '#E9F8EE' : '#FDE7EA',
        color:      tone === 'ok' ? '#16A34A' : '#D22040',
      }}
    >
      {children}
    </div>
  )
}
