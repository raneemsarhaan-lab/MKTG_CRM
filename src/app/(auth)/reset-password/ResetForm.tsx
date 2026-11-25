'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { authButton, authInput, authLink, authNote } from '../AuthCard'

const MIN = 8

export function ResetForm({ token, name }: { token: string; name: string }) {
  const t = useTranslations('passwordReset')
  const [pw, setPw] = useState('')
  const [again, setAgain] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (pw.length < MIN) { setError(t('short', { min: MIN })); return }
    if (pw !== again) { setError(t('mismatch')); return }
    setBusy(true); setError('')
    try {
      const res = await fetch('/api/password/reset', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password: pw }), cache: 'no-store',
      })
      const body = await res.json().catch(() => null)
      if (res.ok && body?.ok) setDone(true)
      else if (body?.error === 'short') setError(t('short', { min: MIN }))
      else if (body?.error === 'used' || body?.error === 'expired' || body?.error === 'invalid') setError(t(`bad.${body.error}`))
      else setError(t('failed'))
    } catch {
      setError(t('failed'))
    } finally {
      setBusy(false)
    }
  }

  if (done) {
    return (
      <div data-reset-done="">
        <div style={authNote('ok')} role="status">{t('done')}</div>
        <a href="/login" style={{ ...authButton(false), display: 'block', textAlign: 'center', textDecoration: 'none', boxSizing: 'border-box' }}>{t('signIn')}</a>
      </div>
    )
  }

  return (
    <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }} data-reset-form="">
      <p style={{ margin: '0 0 4px', fontSize: '14px', color: 'var(--muted)', lineHeight: 1.5 }}>{t('resetIntro', { name, min: MIN })}</p>
      {error && <div style={authNote('error')} role="alert">{error}</div>}
      <input type="password" placeholder={t('newPassword')} aria-label={t('newPassword')} value={pw}
             onChange={e => setPw(e.target.value)} required minLength={MIN} autoComplete="new-password" autoFocus style={authInput} data-reset-pw="" />
      <input type="password" placeholder={t('confirmPassword')} aria-label={t('confirmPassword')} value={again}
             onChange={e => setAgain(e.target.value)} required minLength={MIN} autoComplete="new-password" style={authInput} data-reset-again="" />
      <button type="submit" disabled={busy} style={authButton(busy)}>{busy ? t('saving') : t('save')}</button>
      <p style={{ textAlign: 'center', margin: '8px 0 0' }}><a href="/login" style={authLink}>{t('backToLogin')}</a></p>
    </form>
  )
}
