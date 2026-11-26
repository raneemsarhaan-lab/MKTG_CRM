import { NextResponse, type NextRequest } from 'next/server'
import bcrypt from 'bcryptjs'
import { prisma } from '@/lib/prisma'
import { SESSION_COOKIE, signSession, cookieOptions } from '@/lib/session'
import { failed, succeeded, waitMinutes } from '@/lib/login-limit'

/**
 * Sign in. One request in, one cookie out.
 *
 * A plain route handler on purpose. Not a server action — those carry an
 * origin check that a reverse proxy can fail on our behalf. Not NextAuth's
 * credentials flow — that fetched a CSRF token first and refused the sign-in
 * before checking the password when the token and its cookie fell out of step,
 * while reporting success. There is nothing here to fall out of step with.
 *
 * The reply says which of the four things went wrong, because the server log
 * is the only place that can afford to: the browser is told one generic
 * message, so nobody can type addresses to discover who works here.
 */

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  let email = '', password = ''
  try {
    const body = await req.json()
    email    = String(body?.email ?? '').toLowerCase().trim()
    password = String(body?.password ?? '')
  } catch {
    return NextResponse.json({ ok: false, error: 'Malformed request.' }, { status: 400 })
  }

  if (!email || !password) {
    return NextResponse.json({ ok: false, error: 'Enter your email and password.' }, { status: 400 })
  }

  // QA 26 Nov 2026 (F10): too many wrong tries → wait. Addresses aren't written to the log.
  const ip = (req.headers.get('x-forwarded-for') ?? '').split(',')[0].trim() || req.headers.get('x-real-ip') || 'local'
  const wait = waitMinutes(email, ip)
  if (wait) {
    console.log(`[fluxo:auth] too many wrong tries — sign-in paused for ${wait} min`)
    return NextResponse.json({ ok: false, error: `Too many tries. Try again in ${wait} minute${wait === 1 ? '' : 's'}, or reset your password.`, wait }, { status: 429 })
  }

  let member
  try {
    member = await prisma.member.findUnique({ where: { email } })
  } catch (e: unknown) {
    // Never let this reach the user as "wrong password" — it sends whoever
    // reads it hunting through accounts for a problem in the database.
    console.log('[fluxo:auth] DATABASE ERROR — this is not a wrong password:', e)
    return NextResponse.json(
      { ok: false, error: 'The server could not reach the database. This is not your password.' },
      { status: 503 },
    )
  }

  if (!member) {
    console.log('[fluxo:auth] no account with that address')
    failed(email, ip)
    return NextResponse.json({ ok: false, error: 'Invalid email or password.' }, { status: 401 })
  }
  if (!member.password_hash) {
    console.log(`[fluxo:auth] ${member.name} has no password set — an admin must set one`)
    return NextResponse.json(
      { ok: false, error: 'Invalid email or password.', hint: 'no_password' },
      { status: 401 },
    )
  }
  if (!(await bcrypt.compare(password, member.password_hash))) {
    console.log(`[fluxo:auth] wrong password for ${member.name}`)
    failed(email, ip)
    return NextResponse.json({ ok: false, error: 'Invalid email or password.' }, { status: 401 })
  }

  // Secure follows the connection actually being answered, not an environment
  // variable that can disagree with the browser about https.
  const isHttps =
    req.headers.get('x-forwarded-proto') === 'https' ||
    req.nextUrl.protocol === 'https:'

  succeeded(email, ip)
  const res = NextResponse.json({ ok: true, name: member.name })
  res.cookies.set(SESSION_COOKIE, await signSession(member), cookieOptions(isHttps))
  res.headers.set('Cache-Control', 'no-store')

  console.log(`[fluxo:auth] ✅ ${member.name} signed in · cookie secure=${isHttps}`)
  return res
}
