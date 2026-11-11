'use client'

/**
 * Small pieces every notification screen shares (design/notifications.html):
 * the bell, an icon per kind, the avatar stack, the sentence and the time.
 */
import { useLocale, useTranslations } from 'next-intl'
import type { ReactNode } from 'react'
import type { AppNotification, NotificationKind } from '@/types/index'
import { NOTIFY_UI } from '@/lib/tokens'
import { avatarColor, initials } from '@/lib/utils'
import { messageFor, relativeTime, type Actor } from '@/lib/notify/message'
import { ImageWithFallback } from '@/components/shared/ImageWithFallback'
import type { NotificationActor } from './types'

export function BellIcon({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9"
         strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9" /><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
    </svg>
  )
}

const PATHS: Record<NotificationKind, ReactNode> = {
  comment: <path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z" />,
  reply: <><path d="M9 14 4 9l5-5" /><path d="M4 9h10a6 6 0 0 1 6 6v4" /></>,
  attachment: <path d="m21 11-8.6 8.6a5 5 0 0 1-7.1-7.1l8.6-8.6a3.3 3.3 0 0 1 4.7 4.7l-8.6 8.6a1.7 1.7 0 0 1-2.4-2.4L15 7.5" />,
  task_moved_to_stage: <><path d="M5 12h14" /><path d="m13 6 6 6-6 6" /></>,
  task_created_in_stage: <path d="M12 5v14M5 12h14" />,
  assigned: <><path d="M20 21a8 8 0 0 0-16 0" /><circle cx="12" cy="8" r="4" /></>,
  mention: <><circle cx="12" cy="12" r="4" /><path d="M16 8v5a3 3 0 0 0 6 0v-1a10 10 0 1 0-4 8" /></>,
  due_soon: <><circle cx="12" cy="13" r="8" /><path d="M12 9v4l2 2" /></>,
  overdue: <><circle cx="12" cy="13" r="8" /><path d="M12 9v4l2 2" /></>,
  sheet_mention: <><circle cx="12" cy="12" r="4" /><path d="M16 8v5a3 3 0 0 0 6 0v-1a10 10 0 1 0-4 8" /></>,
  sheet_reply: <><path d="M9 14 4 9l5-5" /><path d="M4 9h10a6 6 0 0 1 6 6v4" /></>,
}

export function KindIcon({ kind, color = '#fff', size = 11 }: { kind: NotificationKind; color?: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.6"
         strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{PATHS[kind]}</svg>
  )
}

function Face({ actor }: { actor: NotificationActor }) {
  return (
    <i className="fx-nt-face" data-initials={initials(actor.name)} style={{ background: avatarColor(actor.name) }}>
      <ImageWithFallback src={actor.avatar_url} alt="" className="fx-nt-img" fallback={null} />
    </i>
  )
}

/** One face, two stacked for a group, or the red clock for due dates; the kind's icon on the corner. */
export function NotificationAvatar({ n, actors }: { n: AppNotification; actors: Map<string, NotificationActor> }) {
  const faces = n.actorIds.map(id => actors.get(id)).filter((a): a is NotificationActor => !!a).slice(0, 2)
  if (n.kind === 'due_soon' || n.kind === 'overdue' || faces.length === 0) {
    return (
      <span className="fx-nt-ava is-one" aria-hidden="true">
        <i className="fx-nt-face is-due" style={{ background: n.kind === 'due_soon' || n.kind === 'overdue' ? '#FDE7EA' : NOTIFY_UI.kinds[n.kind] }}>
          <KindIcon kind={n.kind} size={18} color={n.kind === 'due_soon' || n.kind === 'overdue' ? NOTIFY_UI.kinds[n.kind] : '#fff'} />
        </i>
      </span>
    )
  }
  return (
    <span className={`fx-nt-ava${faces.length === 1 ? ' is-one' : ''}`} aria-hidden="true">
      {faces.map(a => <Face key={a.id} actor={a} />)}
      <span className="fx-nt-kind" style={{ background: NOTIFY_UI.kinds[n.kind] }}><KindIcon kind={n.kind} /></span>
    </span>
  )
}

/** The sentence, with names and the task in bold, in the reader's language. */
export function useSentence() {
  const t = useTranslations('notifications')
  const locale = (useLocale() === 'ar' ? 'ar' : 'en') as 'en' | 'ar'
  return (n: AppNotification, actors: Map<string, NotificationActor>, opts: { ownParent?: boolean } = {}) => {
    const { key, values } = messageFor(n, actors as Map<string, Actor>, locale, opts)
    const rich = t.rich as unknown as (k: string, v: Record<string, unknown>) => ReactNode
    return rich(key, { ...values, b: (c: ReactNode) => <b>{c}</b>, t: (c: ReactNode) => <b>{c}</b> })
  }
}

/** "now", "5m", "2h", "Yesterday", then a date. */
export function useRelativeTime() {
  const t = useTranslations('notifications')
  const locale = (useLocale() === 'ar' ? 'ar' : 'en') as 'en' | 'ar'
  return (iso: string, now: Date) => {
    const r = relativeTime(iso, now, locale)
    if ('text' in r) return r.text
    return (t as unknown as (k: string, v: Record<string, number>) => string)(r.key, r.values)
  }
}

export function actorMap(actors: NotificationActor[]): Map<string, NotificationActor> {
  return new Map(actors.map(a => [a.id, a]))
}
