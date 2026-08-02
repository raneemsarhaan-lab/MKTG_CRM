'use server'

import { requireAdmin } from '@/lib/authz'

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
