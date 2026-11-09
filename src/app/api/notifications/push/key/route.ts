/** The public VAPID key, for subscribing this device to phone alerts (spec 012 R8). */
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function GET() {
  const publicKey = process.env.VAPID_PUBLIC_KEY ?? null
  return NextResponse.json({ publicKey }, { headers: { 'Cache-Control': 'no-store' } })
}
