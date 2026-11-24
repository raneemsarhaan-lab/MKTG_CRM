'use server'

import { getSessionMember, requireAdmin } from '@/lib/authz'
import { prisma } from '@/lib/prisma'

/**
 * A server action that does nothing but come back.
 *
 * Server actions are POSTs that Next will refuse to run if the browser's
 * Origin does not match the host the server was given — the usual reason is a
 * reverse proxy in front of the app. The refusal happens before any of our
 * code runs, so a broken deployment looks exactly like a button that does
 * nothing: no error, no message, no save. Calling this from the diagnostics
 * panel separates "the action failed" from "the action never ran".
 */
export async function pingServerAction(): Promise<{ ok: boolean; error?: string; at: string }> {
  const guard = await requireAdmin()
  if (guard.error) return { ok: false, error: guard.error, at: new Date().toISOString() }
  return { ok: true, at: new Date().toISOString() }
}

/** Spec 026: the exports kept for the record (the clip details CSV), for Settings › Diagnostics. */
export async function listDataExports(): Promise<{ name: string; title: string; rows: number; created_at: string }[]> {
  const member = await getSessionMember()
  if (!member || (member.access !== 'admin' && member.access !== 'superuser')) return []
  const rows = await prisma.dataExport.findMany({ orderBy: { created_at: 'desc' }, select: { name: true, title: true, rows: true, created_at: true } })
  return rows.map(r => ({ ...r, created_at: r.created_at.toISOString() }))
}
