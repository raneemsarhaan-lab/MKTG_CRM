import { withAuth } from 'next-auth/middleware'

export default withAuth({
  pages: { signIn: '/login' },
})

/**
 * Everything except the routes that must work while signed out.
 *
 * `api/session-check` is on this list on purpose: it reports whether the
 * server can see your session cookie, so it has to answer for someone who is
 * not signed in. Guarding it would make it useless — it would redirect to
 * /login, which is precisely the state it exists to explain. It returns cookie
 * names and configuration flags, never a cookie value or a secret.
 */
export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|api/auth|api/session-check|login).*)'],
}
