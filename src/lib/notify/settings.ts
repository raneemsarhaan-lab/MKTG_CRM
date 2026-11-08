/**
 * Notification settings (spec 012 FR-040, FR-041, data-model §4). Pure.
 *
 * Only a member's changes are stored; everything else is the default here.
 * "Off in the app" is off everywhere: a notification that is never recorded
 * can't be pushed or emailed.
 */
import type { EmailMode, NotificationChannel, NotificationKind } from '@/types/index'
import { NOTIFICATION_KINDS } from '@/types/index'

export interface KindSetting { in_app: boolean; push: boolean; email: boolean }
export type KindSettings = Record<NotificationKind, KindSetting>

const URGENT: NotificationKind[] = ['mention', 'assigned', 'due_soon', 'overdue']

export const DEFAULT_SETTINGS: KindSettings = Object.fromEntries(
  NOTIFICATION_KINDS.map(k => [k, { in_app: true, push: URGENT.includes(k), email: false }]),
) as KindSettings
export const DEFAULT_EMAIL_MODE: EmailMode = 'daily'

/** Stored rows (changes only) merged over the defaults. */
export function mergeSettings(rows: { kind: string; in_app: boolean; push: boolean; email: boolean }[]): KindSettings {
  const out = structuredClone(DEFAULT_SETTINGS)
  for (const r of rows) {
    if (!(r.kind in out)) continue
    out[r.kind as NotificationKind] = { in_app: r.in_app, push: r.in_app && r.push, email: r.in_app && r.email }
  }
  return out
}

/** Whether a member hears about a kind on a channel. */
export function effective(settings: KindSettings, kind: NotificationKind, channel: NotificationChannel): boolean {
  const s = settings[kind] ?? DEFAULT_SETTINGS[kind]
  if (!s.in_app) return false
  return channel === 'in_app' ? true : s[channel]
}

/** The rows to store for a member's settings: only kinds that differ from the defaults. */
export function diffFromDefaults(settings: KindSettings): { kind: NotificationKind; in_app: boolean; push: boolean; email: boolean }[] {
  return NOTIFICATION_KINDS
    .map(kind => {
      const s = settings[kind]
      const clean = { in_app: s.in_app, push: s.in_app && s.push, email: s.in_app && s.email }
      return { kind, ...clean }
    })
    .filter(r => {
      const d = DEFAULT_SETTINGS[r.kind]
      return r.in_app !== d.in_app || r.push !== d.push || r.email !== d.email
    })
}
