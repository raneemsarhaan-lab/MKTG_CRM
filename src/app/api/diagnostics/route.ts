import { NextResponse } from 'next/server'
import { headers } from 'next/headers'
import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/authz'

/**
 * What the running server actually sees.
 *
 * "The password reset doesn't work" and "the login doesn't work" look the same
 * from a browser whether the cause is a stale deployment, a database the app
 * cannot reach, an account with no password, or a reverse proxy rewriting the
 * host so Next rejects every server action. Each of those has a different fix
 * and none of them is visible from the login screen.
 *
 * This is a GET rather than a server action on purpose: if server actions are
 * the thing that is broken, a diagnostic built on one cannot report it.
 *
 * Admin only, and no secret is ever returned — only whether each is present.
 * NEXTAUTH_URL is returned in full because it is a URL, not a credential, and
 * a wrong one is a common cause of sessions that never stick.
 */

export const dynamic = 'force-dynamic'

export async function GET() {
  const guard = await requireAdmin()
  if (guard.error) {
    return NextResponse.json({ error: guard.error }, { status: guard.error === 'not_authenticated' ? 401 : 403 })
  }

  const h = await headers()

  const env = {
    NEXTAUTH_URL:    process.env.NEXTAUTH_URL ?? null,
    NEXTAUTH_SECRET: Boolean(process.env.NEXTAUTH_SECRET),
    DATABASE_URL:    Boolean(process.env.DATABASE_URL),
    AUTH_TRUST_HOST: Boolean(process.env.AUTH_TRUST_HOST),
    NODE_ENV:        process.env.NODE_ENV ?? null,
  }

  // Next compares the browser's Origin against the forwarded host before it
  // will run a server action. Behind a proxy these can disagree, and when they
  // do every save in the product fails with nothing shown.
  //
  // A same-origin GET sends no Origin header, so the panel passes the page's
  // own origin along instead — otherwise this check would compare against
  // nothing and always pass, which is the one answer it must never give.
  const browserOrigin = h.get('x-browser-origin') ?? h.get('origin')
  const effectiveHost = h.get('x-forwarded-host') ?? h.get('host')

  let originMatches: boolean | null = null
  if (browserOrigin) {
    try { originMatches = new URL(browserOrigin).host === effectiveHost } catch { originMatches = false }
  }

  const request = {
    host:              h.get('host'),
    x_forwarded_host:  h.get('x-forwarded-host'),
    x_forwarded_proto: h.get('x-forwarded-proto'),
    origin:            browserOrigin,
    server_action_origin_matches: originMatches,
  }

  let database: Record<string, unknown>
  try {
    const members = await prisma.member.findMany({
      select: { name: true, email: true, password_hash: true },
      orderBy: { name: 'asc' },
    })
    database = {
      reachable:    true,
      members:      members.length,
      with_password: members.filter(m => m.password_hash).length,
      // The list an admin already sees in Team & Access, in a form that can be
      // pasted into a message. Hashes are never included.
      accounts: members.map(m => ({
        name: m.name, email: m.email, can_sign_in: Boolean(m.password_hash),
      })),
    }
  } catch (e: unknown) {
    database = { reachable: false, error: String(e).slice(0, 300) }
  }

  return NextResponse.json({
    build: process.env.NEXT_PUBLIC_BUILD_STAMP ?? 'unknown',
    checked_at: new Date().toISOString(),
    env,
    request,
    database,
  })
}
