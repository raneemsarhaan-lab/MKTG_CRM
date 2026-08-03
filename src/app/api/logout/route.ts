import { NextResponse, type NextRequest } from 'next/server'
import { SESSION_COOKIE } from '@/lib/session'

/**
 * Sign out — delete the cookie.
 *
 * "I can't log out" was one of the original complaints, and it had the same
 * root as everything else: signOut() went through the same NextAuth machinery
 * that was failing silently. Deleting a cookie needs none of it.
 *
 * GET as well as POST, so a stuck session can always be cleared by typing
 * /api/logout into the address bar.
 */

export const dynamic = 'force-dynamic'

async function clear(req: NextRequest, redirect: boolean) {
  const res = redirect
    ? NextResponse.redirect(new URL('/login', req.nextUrl.origin))
    : NextResponse.json({ ok: true })

  res.cookies.set(SESSION_COOKIE, '', { path: '/', maxAge: 0 })
  res.headers.set('Cache-Control', 'no-store')
  return res
}

export async function POST(req: NextRequest) { return clear(req, false) }
export async function GET(req: NextRequest)  { return clear(req, true) }
