/**
 * QA 26 Nov 2026 (F10): wrong passwords are limited. After 5 wrong tries for one address, or 20 from one
 * network address, within 15 minutes, sign-in waits until the window passes. A correct password clears
 * the count for that address and for that network address. Kept in memory: a restart clears it, which only ever lets someone in sooner.
 */
const WINDOW_MS = 15 * 60_000
export const MAX_PER_EMAIL = 5
export const MAX_PER_IP = 20

const tries = new Map<string, number[]>()

function recent(key: string, now: number): number[] {
  const list = (tries.get(key) ?? []).filter(t => now - t < WINDOW_MS)
  if (list.length) tries.set(key, list); else tries.delete(key)
  return list
}

/** Minutes to wait, or 0 when this sign-in may go ahead. */
export function waitMinutes(email: string, ip: string, now = Date.now()): number {
  const byEmail = recent(`e:${email}`, now), byIp = recent(`i:${ip}`, now)
  const blocked = [byEmail.length >= MAX_PER_EMAIL ? byEmail : null, byIp.length >= MAX_PER_IP ? byIp : null].filter(Boolean) as number[][]
  if (!blocked.length) return 0
  const until = Math.max(...blocked.map(l => l[0] + WINDOW_MS))
  return Math.max(1, Math.ceil((until - now) / 60_000))
}

export function failed(email: string, ip: string, now = Date.now()) {
  for (const key of [`e:${email}`, `i:${ip}`]) tries.set(key, [...recent(key, now), now])
}

/** A correct password clears this address's count and the network address's. */
export function succeeded(email: string, ip: string) {
  tries.delete(`e:${email}`); tries.delete(`i:${ip}`)
}
