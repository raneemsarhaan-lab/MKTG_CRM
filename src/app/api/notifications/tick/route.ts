/**
 * A fallback trigger for the notification jobs (spec 012 R9), for a platform
 * cron. Off unless NOTIFY_TICK_SECRET is set; the caller sends it in the
 * x-notify-secret header.
 */
import { NextResponse } from 'next/server'
import { tick } from '@/lib/notify/scheduler'

export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  const secret = process.env.NOTIFY_TICK_SECRET
  if (!secret || req.headers.get('x-notify-secret') !== secret) return NextResponse.json({ error: 'not_found' }, { status: 404 })
  const ran = await tick()
  return NextResponse.json({ ran }, { headers: { 'Cache-Control': 'no-store' } })
}
