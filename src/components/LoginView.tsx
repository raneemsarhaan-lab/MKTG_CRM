import React, { useState } from 'react'
import { supabase } from '../lib/supabase'

const UI = {
  ink: '#1B1A13',
  lime: '#C3F53D',
  dark: '#111111',
}

type Mode = 'signin' | 'forgot' | 'forgot-sent'

export function LoginView() {
  const [mode, setMode] = useState<Mode>('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  function validateDomain(e: string) {
    if (!e.toLowerCase().endsWith('@forefront.consulting')) {
      setError('Only @forefront.consulting emails are allowed.')
      return false
    }
    return true
  }

  async function handleSignIn(ev: React.FormEvent) {
    ev.preventDefault()
    setError('')
    if (!validateDomain(email)) return
    setLoading(true)
    const { error: err } = await supabase.auth.signInWithPassword({ email, password })
    setLoading(false)
    if (err) setError(err.message)
  }

  async function handleForgot(ev: React.FormEvent) {
    ev.preventDefault()
    setError('')
    if (!validateDomain(email)) return
    setLoading(true)
    const { error: err } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin + window.location.pathname,
    })
    setLoading(false)
    if (err) { setError(err.message); return }
    setMode('forgot-sent')
  }

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '0.75rem 1rem',
    background: 'rgba(255,255,255,0.06)',
    border: '1px solid rgba(255,255,255,0.12)',
    borderRadius: 12, color: '#fff',
    fontSize: '0.9rem', outline: 'none',
    boxSizing: 'border-box', fontFamily: 'inherit',
    transition: 'border-color 0.15s',
  }

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'radial-gradient(900px 500px at 50% -10%, #232427 0%, transparent 60%), #17181A',
      fontFamily: "'Montserrat','Inter',system-ui,sans-serif",
      padding: '1.5rem',
    }}>
      <div style={{ width: '100%', maxWidth: 400 }}>
        {/* Logo */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: 40 }}>
          <div style={{
            width: 48, height: 48, borderRadius: 14, background: UI.lime,
            display: 'grid', gridTemplateColumns: '1fr 1fr', gridTemplateRows: '1fr 1fr',
            gap: 5, padding: 11, marginBottom: 16,
          }}>
            {[0,1,2,3].map(i => <span key={i} style={{ background: UI.dark, borderRadius: 3 }} />)}
          </div>
          <span style={{ fontWeight: 900, fontSize: '1.5rem', color: '#fff', letterSpacing: '-0.03em' }}>Fluxo</span>
          <span style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.35)', marginTop: 4, letterSpacing: '0.1em', textTransform: 'uppercase' }}>Creative Ops · Forefront</span>
        </div>

        {/* Card */}
        <div style={{
          background: 'rgba(255,255,255,0.04)',
          border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: 20, padding: '2rem',
        }}>
          {mode === 'forgot-sent' ? (
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '2.5rem', marginBottom: 16 }}>📬</div>
              <h2 style={{ color: '#fff', fontWeight: 700, fontSize: '1.1rem', margin: '0 0 8px' }}>Check your inbox</h2>
              <p style={{ color: 'rgba(255,255,255,0.45)', fontSize: '0.85rem', margin: '0 0 24px', lineHeight: 1.6 }}>
                We sent a reset link to <strong style={{ color: 'rgba(255,255,255,0.7)' }}>{email}</strong>
              </p>
              <button onClick={() => { setMode('signin'); setError('') }} style={{ ...btnStyle, width: '100%' }}>
                Back to sign in
              </button>
            </div>
          ) : (
            <form onSubmit={mode === 'signin' ? handleSignIn : handleForgot}>
              <h2 style={{ color: '#fff', fontWeight: 700, fontSize: '1.1rem', margin: '0 0 6px' }}>
                {mode === 'signin' ? 'Sign in to Fluxo' : 'Reset your password'}
              </h2>
              <p style={{ color: 'rgba(255,255,255,0.35)', fontSize: '0.78rem', margin: '0 0 24px' }}>
                {mode === 'signin' ? 'Use your @forefront.consulting email' : "We'll send a reset link to your email"}
              </p>

              {/* Email */}
              <div style={{ marginBottom: 14 }}>
                <label style={{ display: 'block', fontSize: '0.65rem', color: 'rgba(255,255,255,0.45)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 700 }}>
                  Email
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={e => { setEmail(e.target.value); setError('') }}
                  placeholder="you@forefront.consulting"
                  required
                  autoFocus
                  style={inputStyle}
                  onFocus={e => { e.currentTarget.style.borderColor = UI.lime }}
                  onBlur={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.12)' }}
                />
              </div>

              {/* Password — sign in only */}
              {mode === 'signin' && (
                <div style={{ marginBottom: 20 }}>
                  <label style={{ display: 'block', fontSize: '0.65rem', color: 'rgba(255,255,255,0.45)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 700 }}>
                    Password
                  </label>
                  <div style={{ position: 'relative' }}>
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={e => { setPassword(e.target.value); setError('') }}
                      placeholder="••••••••"
                      required
                      style={{ ...inputStyle, paddingRight: '2.8rem' }}
                      onFocus={e => { e.currentTarget.style.borderColor = UI.lime }}
                      onBlur={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.12)' }}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(v => !v)}
                      style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.35)', padding: 4, display: 'flex' }}
                    >
                      {showPassword
                        ? <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19M1 1l22 22"/></svg>
                        : <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                      }
                    </button>
                  </div>
                </div>
              )}

              {error && (
                <p style={{ color: '#F87171', fontSize: '0.78rem', margin: '0 0 14px', background: 'rgba(248,113,113,0.1)', padding: '8px 12px', borderRadius: 8 }}>
                  {error}
                </p>
              )}

              <button type="submit" disabled={loading} style={{ ...btnStyle, width: '100%', opacity: loading ? 0.7 : 1 }}>
                {loading ? 'Please wait…' : mode === 'signin' ? 'Sign in' : 'Send reset link'}
              </button>

              <div style={{ textAlign: 'center', marginTop: 16 }}>
                {mode === 'signin' ? (
                  <button type="button" onClick={() => { setMode('forgot'); setError('') }} style={linkStyle}>
                    Forgot password?
                  </button>
                ) : (
                  <button type="button" onClick={() => { setMode('signin'); setError('') }} style={linkStyle}>
                    ← Back to sign in
                  </button>
                )}
              </div>
            </form>
          )}
        </div>

        <p style={{ color: 'rgba(255,255,255,0.2)', fontSize: '0.7rem', textAlign: 'center', marginTop: 24 }}>
          Access restricted to @forefront.consulting accounts
        </p>
      </div>
    </div>
  )
}

const btnStyle: React.CSSProperties = {
  padding: '0.8rem 1rem',
  background: UI.lime, color: UI.dark,
  border: 'none', borderRadius: 12,
  fontSize: '0.9rem', fontWeight: 800,
  cursor: 'pointer', fontFamily: 'inherit',
  boxShadow: '0 6px 24px rgba(195,245,61,0.3)',
}

const linkStyle: React.CSSProperties = {
  background: 'none', border: 'none', cursor: 'pointer',
  color: 'rgba(255,255,255,0.4)', fontSize: '0.78rem',
  fontFamily: 'inherit', textDecoration: 'underline',
}
