/**
 * Order, the Latest pill and ages for the Attachments section (spec 007).
 * Pure functions, no React (T006, research R2).
 */
import { attachmentKind } from '@/lib/attachments'

type Stamped = { id: string; filename: string; uploaded_at: string }

/** Newest first; ties by id so the order never flickers (FR-001). */
export function newestFirst<T extends Stamped>(list: T[]): T[] {
  return [...list].sort((a, b) =>
    (b.uploaded_at ?? '').localeCompare(a.uploaded_at ?? '') || a.id.localeCompare(b.id))
}

/**
 * The newest image: the only tile with the Latest pill (FR-002).
 * Images only, so a newer PDF never takes it (research R2). The list holds
 * stored files only; uploads in progress live elsewhere and never count.
 */
export function latestImageId<T extends Stamped>(list: T[]): string | null {
  return newestFirst(list).find(a => attachmentKind(a.filename) === 'image')?.id ?? null
}

export type AgeLabel =
  | { key: 'justNow' }
  | { key: 'minutesAgo'; n: number }
  | { key: 'hoursAgo'; n: number }
  | { key: 'yesterday' }
  | { key: 'daysAgo'; n: number }

/** "just now", "5m ago", "2h ago", "yesterday", "3d ago" (FR-003), as a message key. */
export function ageLabel(iso: string, now: Date): AgeLabel {
  const ms = now.getTime() - new Date(iso).getTime()
  const min = Math.floor(ms / 60_000)
  if (!Number.isFinite(min) || min < 1) return { key: 'justNow' }
  if (min < 60) return { key: 'minutesAgo', n: min }
  const h = Math.floor(min / 60)
  if (h < 24) return { key: 'hoursAgo', n: h }
  if (h < 48) return { key: 'yesterday' }
  return { key: 'daysAgo', n: Math.floor(h / 24) }
}
