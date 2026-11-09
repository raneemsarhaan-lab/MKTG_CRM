/**
 * Phone alerts (spec 012 R8, FR-091–FR-093). Server-only.
 *
 * Web Push with VAPID keys from the environment. A notification is pushed
 * when the kind is on for the phone, Do not disturb is off, and the member
 * hasn't been active in Momentum for a minute (otherwise they get a toast).
 * The alert's tag is the notification id, so a growing group replaces its
 * alert instead of adding one. Subscriptions the push service says are gone
 * (404, 410) are deleted.
 */
import webpush from 'web-push'
import { prisma } from '@/lib/prisma'
import { mergeSettings, effective } from './settings'
import { renderNotification, targetPath, translatorFor } from './render'
import type { NotificationKind, NotificationMeta } from '@/types/index'

const ACTIVE_MS = 60_000
let configured: boolean | null = null

export function pushReady(): boolean {
  if (configured !== null) return configured
  const pub = process.env.VAPID_PUBLIC_KEY, priv = process.env.VAPID_PRIVATE_KEY
  if (!pub || !priv) return (configured = false)
  webpush.setVapidDetails(process.env.VAPID_SUBJECT || 'mailto:notifications@forefront.consulting', pub, priv)
  return (configured = true)
}

/** Send phone alerts for these notifications, to whoever should get one. Never throws. */
export async function pushNotifications(ids: string[]): Promise<void> {
  if (!ids.length || !pushReady()) return
  const rows = await prisma.notification.findMany({
    where: { id: { in: ids }, read_at: null },
    include: {
      recipient: { select: { id: true, locale: true, notify_dnd: true, last_active_at: true, notification_settings: true, push_subscriptions: true } },
      comment: { select: { parent: { select: { author_id: true } } } },
    },
  })
  const now = Date.now()
  const actorIds = [...new Set(rows.flatMap(r => r.actor_ids))]
  const actors = new Map((await prisma.member.findMany({ where: { id: { in: actorIds } }, select: { id: true, name: true, gender: true } })).map(a => [a.id, a]))
  for (const n of rows) {
    const r = n.recipient
    if (!r.push_subscriptions.length || r.notify_dnd) continue
    if (r.last_active_at && now - r.last_active_at.getTime() < ACTIVE_MS) continue
    if (!effective(mergeSettings(r.notification_settings), n.kind as NotificationKind, 'push')) continue
    const ownParent = n.kind === 'reply' ? n.comment?.parent?.author_id === r.id : undefined
    const { text } = renderNotification(
      { kind: n.kind as NotificationKind, actorIds: n.actor_ids, count: n.count, meta: n.meta as unknown as NotificationMeta, stageId: n.stage_id },
      actors, r.locale, { ownParent },
    )
    const payload = JSON.stringify({
      title: 'Momentum', body: text, tag: n.id, url: targetPath(n),
      dir: r.locale === 'ar' ? 'rtl' : 'ltr', lang: r.locale,
      openLabel: translatorFor(r.locale).t('title'),
    })
    let sent = false
    for (const s of r.push_subscriptions) {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, { TTL: 60 * 60 * 24 })
        sent = true
        await prisma.pushSubscription.update({ where: { id: s.id }, data: { last_ok_at: new Date() } })
      } catch (e: unknown) {
        const code = (e as { statusCode?: number }).statusCode
        if (code === 404 || code === 410) await prisma.pushSubscription.delete({ where: { id: s.id } }).catch(() => {})
        else console.error('[notify] push failed', code ?? e)
      }
    }
    if (sent) await prisma.notification.update({ where: { id: n.id }, data: { pushed_at: new Date() } })
  }
}
