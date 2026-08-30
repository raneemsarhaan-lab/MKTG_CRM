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
 *
 * The manifest and the icons are here because a browser does not fetch them
 * as the person. A `<link rel="manifest">` is fetched with credentials
 * omitted unless it carries crossorigin="use-credentials", and the icon
 * fetches behave the same way, so every one of them arrived here without the
 * session cookie and was answered with the login page. The browser then had
 * HTML where it wanted JSON or a PNG, said nothing, and simply did not offer
 * to install the app. The tab icon had the same problem for anyone signed
 * out, which is every visit to /login.
 *
 * All five files are the product's name and mark. They carry no workspace
 * data and reveal nothing that the login page does not already show.
 */
/* One unbroken string on purpose: Next parses this pattern out of the source
   at build time, so it cannot be split across concatenated lines. */
export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|icon.svg|apple-icon.png|icon-192.png|icon-512.png|icon-maskable-512.png|api/auth|api/login|api/logout|api/session-check|login).*)',
  ],
}
