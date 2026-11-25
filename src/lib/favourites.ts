/**
 * Favourites (simple sheet header, user 25 Nov 2026): the pages a member starred. Pure.
 */
import type { Favourite } from '@/types/index'

export const MAX_FAVOURITES = 30

/** Only in-app paths (one leading "/"), with a name; at most 30, each once. */
export function cleanFavourites(raw: unknown): Favourite[] {
  const out: Favourite[] = []
  for (const x of Array.isArray(raw) ? raw : []) {
    const f = x as Partial<Favourite>
    if (typeof f?.href !== 'string' || !/^\/(?!\/)[\w\-/:?=&.%]{0,300}$/.test(f.href)) continue
    if (typeof f.label !== 'string' || !f.label.trim()) continue
    if (out.some(o => o.href === f.href)) continue
    out.push({ href: f.href, label: f.label.trim().slice(0, 80), ...(typeof f.color === 'string' && /^#[0-9A-Fa-f]{6}$/.test(f.color) ? { color: f.color } : {}) })
    if (out.length >= MAX_FAVOURITES) break
  }
  return out
}
