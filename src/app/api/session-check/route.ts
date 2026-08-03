import { NextResponse } from 'next/server'
import { cookies, headers } from 'next/headers'
import { getToken } from 'next-auth/jwt'
import type { NextRequest } from 'next/server'

/**
 * Does the server see your session cookie, and can it read it?
 *
 * This is the one question nothing else in the app can answer. Sign-in
 * succeeding proves the password was right; it says nothing about whether the
 * cookie was stored, sent back, and verified. When that chain breaks, all
 * three guards on /overview send you to /login without a word, and it looks
 * exactly like a wrong password.
 *
 * Deliberately public — it has to work for someone who cannot get in, which
 * is the entire point. It returns no secret: cookie *names* but never their
 * values, and the signed-in address only to the person already holding that
 * session.
 */

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const jar = await cookies()
  const h   = await headers()

  const authCookies = jar.getAll()
    .map(c => c.name)
    .filter(n => n.includes('next-auth'))

  const secureExpected = process.env.NEXTAUTH_URL?.startsWith('https://') ?? false

  let token: Awaited<ReturnType<typeof getToken>> = null
  let readError: string | null = null
  try {
    token = await getToken({ req, secureCookie: secureExpected })
  } catch (e: unknown) {
    readError = String(e).slice(0, 200)
  }

  const sessionCookieName = secureExpected
    ? '__Secure-next-auth.session-token'
    : 'next-auth.session-token'

  const received = authCookies.includes(sessionCookieName)

  return NextResponse.json({
    signed_in: Boolean(token),
    who: token?.email ?? null,

    // The three ways this goes wrong, in the order worth checking.
    diagnosis:
      token                    ? 'The server can read your session. Sign-in is working.'
      : !authCookies.length    ? 'No session cookie reached the server at all. Either you have not signed in, or the cookie was never stored — check that NEXTAUTH_URL uses https:// and matches the address bar exactly.'
      : !received              ? `Cookies arrived (${authCookies.join(', ')}) but not the ${sessionCookieName} the server is looking for. NEXTAUTH_URL and the browser disagree about https.`
      :                          'The cookie arrived but could not be verified — NEXTAUTH_SECRET has changed since it was issued. Sign in again; if it persists the secret differs between restarts.',

    cookies_received: authCookies,
    cookie_expected:  sessionCookieName,
    read_error:       readError,

    config: {
      NEXTAUTH_URL:    process.env.NEXTAUTH_URL ?? null,
      NEXTAUTH_SECRET: Boolean(process.env.NEXTAUTH_SECRET),
      expecting_https: secureExpected,
    },
    request: {
      host:              h.get('host'),
      x_forwarded_host:  h.get('x-forwarded-host'),
      x_forwarded_proto: h.get('x-forwarded-proto'),
    },
  })
}
