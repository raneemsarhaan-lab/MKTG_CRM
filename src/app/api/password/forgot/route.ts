import { NextResponse, type NextRequest } from 'next/server'
import { requestReset } from '@/lib/password-reset'

/**
 * Forgot password: email a reset link. Open to anyone signed out.
 *
 * Every request gets the same answer, account or not, so nobody can use this to find out who
 * works here. `email` only says whether this app can send email at all (if not, the page says to
 * ask an admin).
 */
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  let email = ''
  try {
    email = String((await req.json())?.email ?? '')
  } catch {
    return NextResponse.json({ ok: false, error: 'malformed' }, { status: 400 })
  }
  if (!email.trim()) return NextResponse.json({ ok: false, error: 'email_empty' }, { status: 400 })
  try {
    const r = await requestReset(email, req.nextUrl.origin)
    return NextResponse.json({ ok: true, email: r.email }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (e) {
    console.log('[fluxo:reset] request failed:', e)
    return NextResponse.json({ ok: false, error: 'server' }, { status: 500 })
  }
}
