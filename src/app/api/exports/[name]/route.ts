import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSessionMember } from '@/lib/authz'

/**
 * A kept export (spec 026): the clip details as a CSV, saved before their
 * columns and fields were removed. Admins and superusers download it from
 * Settings › Diagnostics.
 */
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(_req: Request, { params }: { params: Promise<{ name: string }> }) {
  const member = await getSessionMember()
  if (!member) return NextResponse.json({ error: 'not_authenticated' }, { status: 401 })
  if (member.access !== 'admin' && member.access !== 'superuser') return NextResponse.json({ error: 'not_authorized' }, { status: 403 })
  const { name } = await params
  const row = /^[\w.-]{1,80}$/.test(name) ? await prisma.dataExport.findUnique({ where: { name } }) : null
  if (!row) return NextResponse.json({ error: 'not_found' }, { status: 404 })
  // A BOM so a spreadsheet opens Arabic names correctly.
  return new NextResponse('﻿' + row.content, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${row.name}"`,
      'Cache-Control': 'private, no-store',
    },
  })
}
