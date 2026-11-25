import { NextResponse, type NextRequest } from 'next/server'
import { spendToken } from '@/lib/password-reset'

/** Forgot password: set a new password with a reset link's token. Open to anyone signed out. */
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  let token = '', password = ''
  try {
    const body = await req.json()
    token = String(body?.token ?? '')
    password = String(body?.password ?? '')
  } catch {
    return NextResponse.json({ ok: false, error: 'malformed' }, { status: 400 })
  }
  try {
    const r = await spendToken(token, password)
    if (!r.ok) return NextResponse.json({ ok: false, error: r.reason }, { status: r.reason === 'short' ? 400 : 410 })
    return NextResponse.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (e) {
    console.log('[fluxo:reset] reset failed:', e)
    return NextResponse.json({ ok: false, error: 'server' }, { status: 500 })
  }
}
