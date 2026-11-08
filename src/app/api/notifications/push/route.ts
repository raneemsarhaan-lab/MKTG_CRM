/**
 * This device's phone alerts (spec 012 FR-090, FR-093): POST saves the
 * browser's push subscription for the signed-in member, DELETE removes it.
 */
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSessionMember } from '@/lib/authz'

export const dynamic = 'force-dynamic'
const NO_STORE = { 'Cache-Control': 'no-store' }

export async function POST(req: Request) {
  const me = await getSessionMember()
  if (!me) return NextResponse.json({ error: 'not_authenticated' }, { status: 401, headers: NO_STORE })
  const body = await req.json().catch(() => null) as { subscription?: { endpoint?: string; keys?: { p256dh?: string; auth?: string } } } | null
  const s = body?.subscription
  if (!s?.endpoint || !/^https:\/\//.test(s.endpoint) || !s.keys?.p256dh || !s.keys?.auth) {
    return NextResponse.json({ error: 'bad_subscription' }, { status: 400, headers: NO_STORE })
  }
  await prisma.pushSubscription.upsert({
    where: { endpoint: s.endpoint },
    create: { member_id: me.id, endpoint: s.endpoint, p256dh: s.keys.p256dh, auth: s.keys.auth, user_agent: req.headers.get('user-agent')?.slice(0, 300) ?? null },
    update: { member_id: me.id, p256dh: s.keys.p256dh, auth: s.keys.auth, user_agent: req.headers.get('user-agent')?.slice(0, 300) ?? null },
  })
  return NextResponse.json({ success: true }, { headers: NO_STORE })
}

export async function DELETE(req: Request) {
  const me = await getSessionMember()
  if (!me) return NextResponse.json({ error: 'not_authenticated' }, { status: 401, headers: NO_STORE })
  const body = await req.json().catch(() => null) as { endpoint?: string; id?: string } | null
  if (body?.endpoint) await prisma.pushSubscription.deleteMany({ where: { endpoint: body.endpoint, member_id: me.id } })
  else if (body?.id) await prisma.pushSubscription.deleteMany({ where: { id: body.id, member_id: me.id } })
  return NextResponse.json({ success: true }, { headers: NO_STORE })
}
