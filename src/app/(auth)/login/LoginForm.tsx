'use client'

import { useEffect, useState } from 'react'
import { signIn } from 'next-auth/react'

/**
 * Sign-in tracing.
 *
 * Every stage of the click prints a line, because the failure being chased is
 * one where *nothing* happens — and "nothing" has half a dozen causes that
 * look identical from a screenshot. Which line is the last one printed says
 * which of them it is:
 *
 *   no lines at all      the bundle never ran
 *   only "evaluated"     the bundle ran, React never hydrated
 *   "click" but no       the button is not wired to the form
 *     "submit"
 *   "submit" then        the request never completed
 *     nothing
 *   "result"             the server answered; the line says what it said
 *
 * Passwords are never printed — only their length, which is enough to catch a
 * field the browser filled without the app noticing, or a stray space.
 */
const log = (...args: unknown[]) => console.log('%c[fluxo]', 'color:#7A9E2F;font-weight:700', ...args)

log('login bundle evaluated')

/**
 * `jsFailed` is set by the server when the page was reached by the browser
 * submitting this form itself — see page.tsx. It means the click never reached
 * handleSubmit, so nothing below this line ever ran.
 */
export function LoginForm({ jsFailed = false }: { jsFailed?: boolean }) {
  const [email,    setEmail]    = useState('')
  const [password, setPassword] = useState('')
  const [error,    setError]    = useState('')
  const [loading,  setLoading]  = useState(false)
  const [hint,     setHint]     = useState(false)

  useEffect(() => {
    log('login form hydrated — React is running, the button is live')
  }, [])

  /**
   * Where to go once signed in.
   *
   * Middleware appends ?callbackUrl= when it turns someone away from a page,
   * so honouring it puts them back where they were headed. Only same-origin
   * paths are accepted: a callbackUrl is attacker-supplied, and following an
   * absolute one would make this form an open redirect.
   */
  function destination() {
    const raw = new URLSearchParams(window.location.search).get('callbackUrl')
    if (!raw) return '/overview'
    try {
      const url = new URL(raw, window.location.origin)
      if (url.origin !== window.location.origin) return '/overview'
      return url.pathname.startsWith('/login') ? '/overview' : url.pathname + url.search
    } catch {
      return '/overview'
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    log('submit — email chars:', email.trim().length, '· password chars:', password.length)

    if (!email.trim() || !password) {
      // The fields can look full while these are empty: a browser password
      // manager fills the element without React hearing about it.
      log('submit refused — the app sees one or both fields as empty.',
          'DOM says:', document.querySelector<HTMLInputElement>('input[type=email]')?.value.length,
          'and', document.querySelector<HTMLInputElement>('input[type=password]')?.value.length, 'chars')
      setError('Enter your email and password.')
      return
    }

    setLoading(true)
    setError('')

    try {
      log('calling signIn…')
      const result = await signIn('credentials', {
        email: email.trim(),
        password,
        redirect: false,
      })
      log('signIn returned:', result)

      // A thrown request and a missing result both used to leave the button
      // reading "Signing in…" for ever with nothing said — the reported
      // symptom. Every path below ends in either a message or a redirect.
      if (!result) {
        log('signIn returned nothing — the request never completed')
        setError('Could not reach the sign-in service. Check your connection and try again.')
        return
      }

      if (result.error) {
        log('rejected by the server:', result.error, '· status', result.status)
        // Deliberately the same message whether the address is unknown, the
        // password is wrong, or the account has none yet: a specific answer
        // would let anyone type addresses to find out who works here. The
        // hint covers the third case without confirming any of them.
        setError('Invalid email or password.')
        setHint(true)
        return
      }

      // The password was right. That is not the same as being signed in.
      //
      // Everything past this point depends on a cookie having been set and
      // being readable again on the next request. When it is not — a wrong
      // NEXTAUTH_URL, a proxy stripping it, a Secure cookie over a connection
      // the browser does not consider secure — the old code navigated anyway,
      // the three server-side guards on /overview each sent it back to /login,
      // and the form reappeared looking untouched. No error, nothing in the
      // console, indistinguishable from a wrong password.
      //
      // So: ask for the session before trusting it.
      // Asked as a raw fetch rather than getSession(), because getSession()
      // returns null both when the cookie did not stick *and* when the server
      // failed to answer at all. Those need opposite fixes, and blaming
      // NEXTAUTH_URL for a crashing server sends you looking in the wrong file.
      log('password accepted — checking the session actually stuck…')
      let session: { user?: { email?: string | null } } | null = null
      let sessionStatus = 0
      try {
        const res = await fetch('/api/auth/session', { cache: 'no-store' })
        sessionStatus = res.status
        const body = await res.json().catch(() => null)
        session = body && Object.keys(body).length ? body : null
        log('session check — HTTP', res.status, '·', session ? `signed in as ${session.user?.email}` : 'no session in the response')
      } catch (err: unknown) {
        log('session check failed outright:', err)
      }

      if (sessionStatus >= 500 || sessionStatus === 0) {
        setError(
          `The server is not responding properly (${sessionStatus || 'no response'}). ` +
          'Your password was accepted — this is the app failing, not your account. ' +
          'Check the deployment logs.',
        )
        return
      }

      if (!session) {
        setError(
          'Your password was correct, but the session did not save. ' +
          'This is a server configuration problem, not your account — ' +
          'NEXTAUTH_URL must exactly match the address in the browser bar.',
        )
        return
      }

      // A full page load, not router.push. The client router would fetch
      // /overview as an RSC payload; if middleware turned that away the router
      // would follow the redirect back to /login in silence. A real navigation
      // sends the new cookie and shows plainly where it ends up.
      const to = destination()
      log('signed in — navigating to', to)
      window.location.assign(to)
      return
    } catch (e: unknown) {
      log('threw while signing in:', e)
      setError('Something went wrong signing in. Please try again.')
    } finally {
      setLoading(false)
      log('finished')
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

        {/* The browser submitted the form itself, so the app's own handler
            never ran. Nothing is wrong with the account — the page's
            JavaScript did not start. Server-rendered, because in this state
            nothing client-side would ever appear. */}
        {jsFailed && (
          <div
            style={{
              background: '#F8E7E5',
              color: '#C0453E',
              borderRadius: '8px',
              padding: '12px 16px',
              fontSize: '13px',
              lineHeight: 1.55,
              marginBottom: '20px',
            }}
            role="alert"
          >
            <strong>This page didn&apos;t load properly.</strong> Your email and
            password are not the problem — the sign-in button never reached the
            app. Try a private window, or another browser. If it works there,
            clear this browser&apos;s cache for this site.
          </div>
        )}

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
          {/* name= is what makes an unhydrated submit detectable: with no
              JavaScript intercepting it the browser sends the form itself, and
              the address comes back in the query string. The password field is
              deliberately left unnamed so it never reaches the URL or history. */}
          <input
            type="email"
            name="email"
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
            // A click that never turns into a submit is its own answer: the
            // button is live but the form is not, which no other line reveals.
            onClick={() => log('button clicked')}
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
