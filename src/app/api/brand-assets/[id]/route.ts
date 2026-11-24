import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSessionMember } from '@/lib/authz'

/**
 * A brand asset kept in the database (spec 025, when no bucket is configured):
 * its bytes, to signed-in members only. Files in the bucket are read from
 * their own address and never come through here.
 */
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const member = await getSessionMember()
  if (!member) return NextResponse.json({ error: 'not_authenticated' }, { status: 401 })
  const { id } = await params
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: 'not_found' }, { status: 404 })
  const row = await prisma.brandAsset.findUnique({ where: { id }, select: { filename: true, data: true, url: true, content_type: true } })
  if (!row) return NextResponse.json({ error: 'not_found' }, { status: 404 })
  if (!row.data) return row.url ? NextResponse.redirect(row.url) : NextResponse.json({ error: 'not_found' }, { status: 404 })
  const m = /^data:([^;,]*)(;base64)?,/.exec(row.data)
  if (!m) return NextResponse.json({ error: 'not_found' }, { status: 404 })
  const bytes = Buffer.from(row.data.slice(m[0].length), m[2] ? 'base64' : 'utf8')
  // Shown in the page only when it is a picture or a PDF; anything else downloads.
  const type = row.content_type || m[1] || 'application/octet-stream'
  const inline = /^(image\/(png|jpe?g|webp|gif)|application\/pdf)$/i.test(type)
  return new NextResponse(new Uint8Array(bytes), {
    headers: {
      'Content-Type': inline ? type : 'application/octet-stream',
      'Content-Disposition': `${inline ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(row.filename)}`,
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'private, max-age=3600',
    },
  })
}
