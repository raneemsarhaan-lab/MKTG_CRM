'use client'

import { useState } from 'react'
import { signIn } from 'next-auth/react'
import { useRouter } from 'next/navigation'

export default function LoginPage() {
  const [email,    setEmail]    = useState('')
  const [password, setPassword] = useState('')
  const [error,    setError]    = useState('')
  const [loading,  setLoading]  = useState(false)
  const [hint,     setHint]     = useState(false)
  const router = useRouter()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()

    if (!email.trim() || !password) {
      setError('Enter your email and password.')
      return
    }

    setLoading(true)
    setError('')

    try {
      const result = await signIn('credentials', {
        email: email.trim(),
        password,
        redirect: false,
      })

      // A thrown request and a missing result both used to leave the button
      // reading "Signing in…" for ever with nothing said — the reported
      // symptom. Every path below ends in either a message or a redirect.
      if (!result) {
        setError('Could not reach the sign-in service. Check your connection and try again.')
        return
      }

      if (result.error) {
        // Deliberately the same message whether the address is unknown, the
        // password is wrong, or the account has none yet: a specific answer
        // would let anyone type addresses to find out who works here. The
        // hint covers the third case without confirming any of them.
        setError('Invalid email or password.')
        setHint(true)
        return
      }

      router.push('/overview')
      router.refresh()
    } catch {
      setError('Something went wrong signing in. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      style={{ background: 'var(--rail)', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
    >
      <div
        style={{
          background: 'var(--panel)',
          borderRadius: '16px',
          padding: '48px',
          width: '100%',
          maxWidth: '400px',
          boxShadow: '0 4px 32px rgba(0,0,0,0.18)',
        }}
      >
        {/* Logo / wordmark */}
        <div style={{ marginBottom: '32px', textAlign: 'center' }}>
          <h1
            style={{
              fontFamily: 'var(--font-heading)',
              fontWeight: 900,
              fontSize: '28px',
              letterSpacing: '-0.02em',
              color: 'var(--ink)',
              margin: 0,
            }}
          >
            Fluxo
          </h1>
          <p style={{ color: 'var(--muted)', fontSize: '14px', marginTop: '4px' }}>
            Creative Operations
          </p>
        </div>

        {/* Error banner */}
        {error && (
          <div
            style={{
              background: '#F8E7E5',
              color: '#C0453E',
              borderRadius: '8px',
              padding: '12px 16px',
              fontSize: '14px',
              marginBottom: '20px',
            }}
            role="alert"
          >
            {error}
          </div>
        )}

        {/* Nine accounts came from the ClickUp import with no password set.
            They can hold work but cannot sign in until an admin sets one, and
            the failure looks identical to a typo from out here. */}
        {hint && (
          <div
            style={{
              background: '#FCEFD9',
              color: '#8A6414',
              borderRadius: '8px',
              padding: '12px 16px',
              fontSize: '13px',
              lineHeight: 1.5,
              marginBottom: '20px',
            }}
          >
            Never signed in before? Your account may not have a password yet —
            ask an admin to set one for you in Settings.
          </div>
        )}

        {/* Sign in form */}
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            required
            autoComplete="email"
            style={{
              padding: '12px 14px',
              borderRadius: '10px',
              border: '1px solid var(--line)',
              fontSize: '14px',
              outline: 'none',
              fontFamily: 'inherit',
              color: 'var(--ink)',
              background: '#F6F6F4',
            }}
          />
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            required
            autoComplete="current-password"
            style={{
              padding: '12px 14px',
              borderRadius: '10px',
              border: '1px solid var(--line)',
              fontSize: '14px',
              outline: 'none',
              fontFamily: 'inherit',
              color: 'var(--ink)',
              background: '#F6F6F4',
            }}
          />
          <button
            type="submit"
            disabled={loading}
            style={{
              background: 'var(--lime)',
              color: 'var(--ink)',
              borderRadius: '10px',
              padding: '14px 24px',
              width: '100%',
              fontFamily: 'inherit',
              fontWeight: 700,
              fontSize: '15px',
              border: 'none',
              cursor: loading ? 'not-allowed' : 'pointer',
              opacity: loading ? 0.7 : 1,
              marginTop: '4px',
            }}
          >
            {loading ? 'Signing in…' : 'Sign in'}
          </button>
        </form>

        {/* Which build is answering. Readable without signing in, so it can
            still be checked by the person who cannot get in — and it is the
            difference between "the fix is broken" and "the fix isn't live". */}
        <p style={{
          textAlign: 'center', margin: '20px 0 0', fontSize: '11px',
          color: 'var(--muted)', opacity: 0.7, letterSpacing: '.02em',
        }}>
          Build {process.env.NEXT_PUBLIC_BUILD_STAMP ?? 'unknown'}
        </p>
      </div>
    </div>
  )
}
