/**
 * The bell's pulse (spec 012 R7): the unread count and the newest unread ids,
 * polled every 8 s while the app is visible. `active=1` records that the
 * member is using the app, which decides toast vs phone alert (FR-091).
 */
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSessionMember } from '@/lib/authz'

export const dynamic = 'force-dynamic'
const NO_STORE = { 'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0' }

export async function GET(req: Request) {
  const me = await getSessionMember()
  if (!me) return NextResponse.json({ error: 'not_authenticated' }, { status: 401, headers: NO_STORE })
  const active = new URL(req.url).searchParams.get('active') === '1'
  const [unread, latest] = await Promise.all([
    prisma.notification.count({ where: { recipient_id: me.id, read_at: null } }),
    prisma.notification.findMany({
      where: { recipient_id: me.id, read_at: null },
      orderBy: { last_event_at: 'desc' }, take: 5, select: { id: true, last_event_at: true },
    }),
    active ? prisma.member.update({ where: { id: me.id }, data: { last_active_at: new Date() } }) : null,
  ])
  return NextResponse.json(
    { unread, latest: latest.map(l => ({ id: l.id, last_event_at: l.last_event_at.toISOString() })) },
    { headers: NO_STORE },
  )
}
