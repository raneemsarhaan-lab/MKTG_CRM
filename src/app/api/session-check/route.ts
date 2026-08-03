import { NextResponse, type NextRequest } from 'next/server'
import { SESSION_COOKIE, verifySession } from '@/lib/session'

/**
 * Does the server see your session cookie, and can it read it?
 *
 * Deliberately public — it has to answer for someone who cannot get in, which
 * is the entire point. It returns no secret: cookie names, never values, and
 * the signed-in address only to whoever already holds that session.
 *
 * Far less to report than it used to have. There is one cookie now, with one
 * fixed name, verified by the same function that issues it — so the failure
 * this endpoint was built to diagnose (a reader and a writer disagreeing about
 * which cookie they meant) can no longer happen.
 */

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const raw     = req.cookies.get(SESSION_COOKIE)?.value
  const payload = await verifySession(raw)
  const isHttps = req.headers.get('x-forwarded-proto') === 'https' || req.nextUrl.protocol === 'https:'

  return NextResponse.json({
    signed_in: Boolean(payload),
    who:       payload?.email ?? null,

    diagnosis:
      payload ? 'The server can read your session. Sign-in is working.'
      : !raw  ? 'No session cookie reached the server. Either you have not signed in yet, or the browser refused to store it — if the site is https and this persists, the cookie is being stripped between the browser and the app.'
      :         'A session cookie arrived but did not verify. It was signed with a different NEXTAUTH_SECRET, or it has expired. Sign in again.',

    cookie_present: Boolean(raw),
    cookie_name:    SESSION_COOKIE,
    expires:        payload ? new Date(payload.exp * 1000).toISOString() : null,

    config: {
      NEXTAUTH_SECRET: Boolean(process.env.NEXTAUTH_SECRET),
      // No longer used for cookies or sign-in — kept only so a stale value
      // cannot be mistaken for the cause of anything.
      NEXTAUTH_URL:    process.env.NEXTAUTH_URL ?? null,
    },
    request: {
      host:              req.headers.get('host'),
      x_forwarded_host:  req.headers.get('x-forwarded-host'),
      x_forwarded_proto: req.headers.get('x-forwarded-proto'),
      cookie_secure_flag_would_be: isHttps,
    },
  }, { headers: { 'Cache-Control': 'no-store' } })
}
