'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { authButton, authInput, authLink, authNote } from '../AuthCard'

export function ForgotForm() {
  const t = useTranslations('passwordReset')
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState<null | { email: boolean }>(null)
  const [error, setError] = useState('')

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!email.trim()) { setError(t('emailEmpty')); return }
    setBusy(true); setError('')
    try {
      const res = await fetch('/api/password/forgot', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim() }), cache: 'no-store',
      })
      const body = await res.json().catch(() => null)
      if (!res.ok || !body?.ok) setError(t('failed'))
      else setDone({ email: !!body.email })
    } catch {
      setError(t('failed'))
    } finally {
      setBusy(false)
    }
  }

  if (done) {
    return (
      <div data-forgot-done={done.email ? 'sent' : 'no-email'}>
        <div style={authNote(done.email ? 'ok' : 'warn')} role="status">{done.email ? t('sent', { email: email.trim() }) : t('noEmail')}</div>
        <p style={{ textAlign: 'center', margin: 0 }}><a href="/login" style={authLink}>{t('backToLogin')}</a></p>
      </div>
    )
  }

  return (
    <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }} data-forgot-form="">
      <p style={{ margin: '0 0 4px', fontSize: '14px', color: 'var(--muted)', lineHeight: 1.5 }}>{t('forgotIntro')}</p>
      {error && <div style={authNote('error')} role="alert">{error}</div>}
      <input type="email" name="email" placeholder={t('email')} aria-label={t('email')} value={email}
             onChange={e => setEmail(e.target.value)} required autoComplete="email" autoFocus style={authInput} />
      <button type="submit" disabled={busy} style={authButton(busy)}>{busy ? t('sending') : t('sendLink')}</button>
      <p style={{ textAlign: 'center', margin: '8px 0 0' }}><a href="/login" style={authLink}>{t('backToLogin')}</a></p>
    </form>
  )
}
