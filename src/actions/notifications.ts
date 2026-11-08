'use server'

/**
 * Notifications (spec 012 contracts/server.md). Every action acts only for
 * the signed-in member, on their own notifications, follows and settings.
 */
import { prisma } from '@/lib/prisma'
import { getSessionMember } from '@/lib/authz'
import type { AppNotification, EmailMode, NotificationKind, NotificationMeta } from '@/types/index'
import { NOTIFICATION_KINDS } from '@/types/index'
import { mergeSettings, diffFromDefaults, type KindSettings } from '@/lib/notify/settings'
import { setMuted } from '@/lib/notify/notify'
import { emailReady } from '@/lib/notify/email'

type Fail = { success: false; error: string }
const PAGE = 20

export interface NotificationActor { id: string; name: string; avatar_url: string | null; gender: string | null }

function shape(n: {
  id: string; kind: string; task_id: string | null; comment_id: string | null; attachment_id: string | null; stage_id: string | null
  actor_ids: string[]; count: number; meta: unknown; read_at: Date | null; last_event_at: Date
}): AppNotification {
  return {
    id: n.id, kind: n.kind as NotificationKind, taskId: n.task_id, commentId: n.comment_id, attachmentId: n.attachment_id,
    stageId: n.stage_id, actorIds: n.actor_ids, count: n.count, meta: n.meta as NotificationMeta,
    read: !!n.read_at, lastEventAt: n.last_event_at.toISOString(),
  }
}

/**
 * A page of notifications, newest first. The cursor is "lastEventAt|id" of
 * the last row, so pages never repeat or skip a row (US4).
 */
export async function listNotifications(input: {
  tab?: 'all' | 'unread'; before?: string | null; limit?: number
  kinds?: NotificationKind[]; from?: string | null; to?: string | null
} = {}): Promise<{ success: true; items: AppNotification[]; next: string | null; actors: NotificationActor[]; parents: Record<string, string> } | Fail> {
  const me = await getSessionMember()
  if (!me) return { success: false, error: 'not_authenticated' }
  const limit = Math.min(50, Math.max(1, input.limit ?? PAGE))
  const where: Record<string, unknown> = { recipient_id: me.id }
  if (input.tab === 'unread') where.read_at = null
  if (input.kinds?.length) where.kind = { in: input.kinds.filter(k => NOTIFICATION_KINDS.includes(k)) }
  const range: Record<string, Date> = {}
  if (input.from) range.gte = new Date(input.from)
  if (input.to) range.lte = new Date(input.to)
  if (input.before) {
    const [at, id] = input.before.split('|')
    where.OR = [{ last_event_at: { lt: new Date(at) } }, { last_event_at: new Date(at), id: { lt: id } }]
  }
  if (Object.keys(range).length) where.last_event_at = range
  const rows = await prisma.notification.findMany({
    where, orderBy: [{ last_event_at: 'desc' }, { id: 'desc' }], take: limit + 1,
  })
  const page = rows.slice(0, limit)
  const actorIds = [...new Set(page.flatMap(r => r.actor_ids))]
  const actors = actorIds.length
    ? await prisma.member.findMany({ where: { id: { in: actorIds } }, select: { id: true, name: true, avatar_url: true, gender: true } })
    : []
  // Replies: whether the recipient wrote the parent comment ("replied to your comment").
  const replyComments = page.filter(r => r.kind === 'reply' && r.comment_id).map(r => r.comment_id as string)
  const parents: Record<string, string> = {}
  if (replyComments.length) {
    const cs = await prisma.taskComment.findMany({ where: { id: { in: replyComments } }, select: { id: true, parent: { select: { author_id: true } } } })
    for (const c of cs) if (c.parent) parents[c.id] = c.parent.author_id
  }
  const last = page[page.length - 1]
  return {
    success: true,
    items: page.map(shape),
    next: rows.length > limit && last ? `${last.last_event_at.toISOString()}|${last.id}` : null,
    actors, parents,
  }
}

export async function unreadCount(): Promise<number> {
  const me = await getSessionMember()
  if (!me) return 0
  return prisma.notification.count({ where: { recipient_id: me.id, read_at: null } })
}

/** Mark one read or unread (FR-032). */
export async function markNotification(id: string, read: boolean): Promise<{ success: true; unread: number } | Fail> {
  const me = await getSessionMember()
  if (!me) return { success: false, error: 'not_authenticated' }
  const r = await prisma.notification.updateMany({ where: { id, recipient_id: me.id }, data: { read_at: read ? new Date() : null } })
  if (!r.count) return { success: false, error: 'not_found' }
  return { success: true, unread: await prisma.notification.count({ where: { recipient_id: me.id, read_at: null } }) }
}

/** Mark all as read (FR-033). */
export async function markAllRead(): Promise<{ success: true; unread: 0 } | Fail> {
  const me = await getSessionMember()
  if (!me) return { success: false, error: 'not_authenticated' }
  await prisma.notification.updateMany({ where: { recipient_id: me.id, read_at: null }, data: { read_at: new Date() } })
  return { success: true, unread: 0 }
}

/**
 * Open a notification: mark it read and return where it points (FR-034).
 * `target: null` means the task is gone ("This task is no longer available").
 */
export async function openNotification(id: string): Promise<{ success: true; target: { taskId: string; commentId?: string; section?: 'attachments' } | null } | Fail> {
  const me = await getSessionMember()
  if (!me) return { success: false, error: 'not_authenticated' }
  const n = await prisma.notification.findFirst({ where: { id, recipient_id: me.id } })
  if (!n) return { success: false, error: 'not_found' }
  if (!n.read_at) await prisma.notification.update({ where: { id }, data: { read_at: new Date() } })
  if (!n.task_id) return { success: true, target: null }
  const task = await prisma.task.findUnique({ where: { id: n.task_id }, select: { id: true } })
  if (!task) return { success: true, target: null }
  if (n.kind === 'attachment') return { success: true, target: { taskId: task.id, section: 'attachments' } }
  if (n.comment_id) return { success: true, target: { taskId: task.id, commentId: n.comment_id } }
  return { success: true, target: { taskId: task.id } }
}

// ─── following ──────────────────────────────────────────────────────────────

export async function getFollow(taskId: string): Promise<{ success: true; following: boolean } | Fail> {
  const me = await getSessionMember()
  if (!me) return { success: false, error: 'not_authenticated' }
  const f = await prisma.taskFollower.findUnique({ where: { task_id_member_id: { task_id: taskId, member_id: me.id } } })
  return { success: true, following: !!f && !f.muted }
}

/** Follow / Following (FR-011). Unfollowing is remembered (R3). */
export async function setFollow(taskId: string, following: boolean): Promise<{ success: true; following: boolean } | Fail> {
  const me = await getSessionMember()
  if (!me) return { success: false, error: 'not_authenticated' }
  const task = await prisma.task.findUnique({ where: { id: taskId }, select: { id: true } })
  if (!task) return { success: false, error: 'not_found' }
  await prisma.$transaction(tx => setMuted(tx, taskId, me.id, !following))
  return { success: true, following }
}

/** "Turn off notifications for this task" (FR-032): unfollow and stay unfollowed. */
export async function muteTaskNotifications(taskId: string): Promise<{ success: true } | Fail> {
  const r = await setFollow(taskId, false)
  return r.success ? { success: true } : r
}

// ─── settings ───────────────────────────────────────────────────────────────

export interface NotificationSettingsView {
  kinds: KindSettings
  emailMode: EmailMode
  dnd: boolean
  emailReady: boolean
  devices: { id: string; label: string; created_at: string }[]
}

function deviceLabel(ua: string | null): string {
  if (!ua) return 'Browser'
  const os = /iPhone|iPad/.test(ua) ? 'iPhone' : /Android/.test(ua) ? 'Android' : /Mac OS X/.test(ua) ? 'Mac' : /Windows/.test(ua) ? 'Windows' : 'Device'
  const br = /Edg\//.test(ua) ? 'Edge' : /Chrome\//.test(ua) ? 'Chrome' : /Firefox\//.test(ua) ? 'Firefox' : /Safari\//.test(ua) ? 'Safari' : 'Browser'
  return `${br} · ${os}`
}

export async function getNotificationSettings(): Promise<({ success: true } & NotificationSettingsView) | Fail> {
  const me = await getSessionMember()
  if (!me) return { success: false, error: 'not_authenticated' }
  const [rows, member, devices] = await Promise.all([
    prisma.notificationSetting.findMany({ where: { member_id: me.id } }),
    prisma.member.findUnique({ where: { id: me.id }, select: { notify_dnd: true, email_mode: true } }),
    prisma.pushSubscription.findMany({ where: { member_id: me.id }, orderBy: { created_at: 'desc' } }),
  ])
  return {
    success: true,
    kinds: mergeSettings(rows),
    emailMode: (member?.email_mode ?? 'daily') as EmailMode,
    dnd: !!member?.notify_dnd,
    emailReady: emailReady(),
    devices: devices.map(d => ({ id: d.id, label: deviceLabel(d.user_agent), created_at: d.created_at.toISOString() })),
  }
}

/** Save a member's settings (FR-040): only what differs from the defaults is stored. */
export async function saveNotificationSettings(input: { kinds?: KindSettings; emailMode?: EmailMode; dnd?: boolean }): Promise<{ success: true } | Fail> {
  const me = await getSessionMember()
  if (!me) return { success: false, error: 'not_authenticated' }
  await prisma.$transaction(async tx => {
    if (input.kinds) {
      const clean = mergeSettings(NOTIFICATION_KINDS.map(k => ({ kind: k, ...input.kinds![k] })).filter(r => r.in_app !== undefined))
      await tx.notificationSetting.deleteMany({ where: { member_id: me.id } })
      const rows = diffFromDefaults(clean)
      if (rows.length) await tx.notificationSetting.createMany({ data: rows.map(r => ({ member_id: me.id, ...r })) })
    }
    const data: Record<string, unknown> = {}
    if (input.emailMode && ['instant', 'daily', 'off'].includes(input.emailMode)) data.email_mode = input.emailMode
    if (input.dnd !== undefined) data.notify_dnd = !!input.dnd
    if (Object.keys(data).length) await tx.member.update({ where: { id: me.id }, data })
  })
  return { success: true }
}

/** The member's language, for push and email (R13). */
export async function setLocale(locale: 'en' | 'ar'): Promise<{ success: true } | Fail> {
  const me = await getSessionMember()
  if (!me) return { success: false, error: 'not_authenticated' }
  if (locale !== 'en' && locale !== 'ar') return { success: false, error: 'bad_locale' }
  await prisma.member.update({ where: { id: me.id }, data: { locale } })
  return { success: true }
}
