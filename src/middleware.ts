import { NextResponse, type NextRequest } from 'next/server'
import { SESSION_COOKIE, verifySession } from '@/lib/session'

/**
 * Turn away anyone without a valid session.
 *
 * This verifies the same cookie, by the same fixed name, with the same
 * function the server used to issue it. The version this replaces used
 * next-auth's withAuth, which chose between two cookie names depending on
 * whether NEXTAUTH_URL happened to begin with https — so the reader and the
 * writer could disagree about what they were even looking for, and the only
 * symptom was a login page that reappeared without a word.
 *
 * The page guards in (app)/layout.tsx and each page still stand. This is the
 * cheap first pass, not the enforcement.
 */
export default async function middleware(req: NextRequest) {
  const payload = await verifySession(req.cookies.get(SESSION_COOKIE)?.value)
  if (payload) return NextResponse.next()

  const login = new URL('/login', req.nextUrl.origin)
  login.searchParams.set('callbackUrl', req.nextUrl.pathname + req.nextUrl.search)
  return NextResponse.redirect(login)
}

/**
 * Everything except the routes that must work while signed out.
 *
 * `api/login` and `api/logout` are the sign-in path itself; guarding them
 * would make signing in require being signed in. `api/session-check` reports
 * why a session is missing, so it has to answer for someone who has none.
 */
export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|api/auth|api/login|api/logout|api/session-check|login).*)',
  ],
}
