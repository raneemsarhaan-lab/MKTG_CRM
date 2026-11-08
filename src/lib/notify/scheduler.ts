/**
 * Timed notification jobs (spec 012 R9). Server-only.
 *
 * One tick a minute, started by src/instrumentation.ts on the Node runtime.
 * Each job runs under a Postgres advisory lock, so only one instance runs it,
 * and keys its work by date, so a missed tick is caught up by the next one.
 *
 *   every tick   instant emails (unread for 10 minutes)
 *   hourly       due tomorrow / overdue reminders
 *   08:30 team   daily summary emails
 *   03:00 team   clean-up: read notifications over 90 days, old reminder keys
 */
import { prisma } from '@/lib/prisma'
import type { NotificationKind, NotificationMeta } from '@/types/index'
import { notify, deliver } from './notify'
import { dueState, teamDay, teamClock, DEFAULT_TZ } from './days'
import { mergeSettings, effective } from './settings'
import { renderNotification, targetPath, translatorFor } from './render'
import { emailHtml, emailReady, sendEmail } from './email'

const TZ = () => process.env.NOTIFY_TZ || DEFAULT_TZ
const INSTANT_DELAY_MS = 10 * 60_000
const MAX_TRIES = 5

async function locked<T>(job: string, fn: () => Promise<T>): Promise<T | null> {
  return prisma.$transaction(async tx => {
    const rows = await tx.$queryRaw<{ ok: boolean }[]>`SELECT pg_try_advisory_xact_lock(hashtext(${'notify-scheduler:' + job})) AS ok`
    if (!rows[0]?.ok) return null
    return fn()
  }, { timeout: 120_000 })
}

/** Due tomorrow and overdue, once per task, kind and due date (FR-050). */
export async function runDueReminders(now = new Date()): Promise<number> {
  const tasks = await prisma.task.findMany({
    where: { due_date: { not: null }, dropped_at: null, status: { not: 'publish' } },
    select: { id: true, due_date: true, status: true, dropped_at: true },
  })
  let sent = 0
  for (const t of tasks) {
    const due = t.due_date!.toISOString().slice(0, 10)
    const kind = dueState({ due_date: due, status: t.status, dropped_at: t.dropped_at }, now, TZ())
    if (!kind) continue
    const ids = await prisma.$transaction(async tx => {
      const done = await tx.dueReminder.findUnique({ where: { task_id_kind_due_date: { task_id: t.id, kind, due_date: new Date(due) } } })
      if (done) return [] as string[]
      await tx.dueReminder.create({ data: { task_id: t.id, kind, due_date: new Date(due) } })
      return notify(tx, { kind, actorId: null, taskId: t.id, dueDate: due })
    })
    if (ids.length) { sent += ids.length; void deliver(ids) }
  }
  return sent
}

function asItem(n: { id: string; kind: string; actor_ids: string[]; count: number; meta: unknown; stage_id: string | null; task_id: string | null; comment_id: string | null }) {
  return { kind: n.kind as NotificationKind, actorIds: n.actor_ids, count: n.count, meta: n.meta as NotificationMeta, stageId: n.stage_id }
}

/** Instant emails: unread for 10 minutes, kind on for email, mode Instant (FR-095). */
export async function runInstantEmails(now = new Date()): Promise<number> {
  if (!emailReady()) return 0
  const rows = await prisma.notification.findMany({
    where: {
      read_at: null, emailed_at: null, email_tries: { lt: MAX_TRIES },
      last_event_at: { lte: new Date(now.getTime() - INSTANT_DELAY_MS) },
      recipient: { email_mode: 'instant' },
    },
    include: { recipient: { select: { id: true, email: true, locale: true, notification_settings: true } }, comment: { select: { parent: { select: { author_id: true } } } } },
    take: 200,
  })
  const actorIds = [...new Set(rows.flatMap(r => r.actor_ids))]
  const actors = new Map((await prisma.member.findMany({ where: { id: { in: actorIds } }, select: { id: true, name: true, gender: true } })).map(a => [a.id, a]))
  let sent = 0
  for (const n of rows) {
    const r = n.recipient
    if (!effective(mergeSettings(r.notification_settings), n.kind as NotificationKind, 'email')) {
      await prisma.notification.update({ where: { id: n.id }, data: { emailed_at: now } })   // not wanted by email: never again
      continue
    }
    const ownParent = n.kind === 'reply' ? n.comment?.parent?.author_id === r.id : undefined
    const { text, html } = renderNotification(asItem(n), actors, r.locale, { ownParent })
    const meta = n.meta as unknown as NotificationMeta
    const ok = await sendEmail(r.email, text, emailHtml(r.locale, [{ html, url: targetPath(n), snippet: meta.snippet }]))
    await prisma.notification.update({ where: { id: n.id }, data: ok ? { emailed_at: new Date() } : { email_tries: { increment: 1 } } })
    if (ok) sent++
  }
  return sent
}

/** The 08:30 daily summary, once per member per day (FR-096). */
export async function runDailySummary(now = new Date()): Promise<number> {
  if (!emailReady()) return 0
  const day = teamDay(now, TZ())
  const members = await prisma.member.findMany({
    where: { email_mode: 'daily', email_digests: { none: { day: new Date(day) } } },
    select: { id: true, email: true, locale: true, notification_settings: true },
  })
  let sent = 0
  for (const m of members) {
    const settings = mergeSettings(m.notification_settings)
    const rows = (await prisma.notification.findMany({
      where: { recipient_id: m.id, read_at: null, last_event_at: { gte: new Date(now.getTime() - 24 * 3600_000) } },
      include: { comment: { select: { parent: { select: { author_id: true } } } } },
      orderBy: { last_event_at: 'desc' }, take: 50,
    })).filter(n => effective(settings, n.kind as NotificationKind, 'email'))
    await prisma.emailDigest.create({ data: { member_id: m.id, day: new Date(day) } })
    if (!rows.length) continue
    const actorIds = [...new Set(rows.flatMap(r => r.actor_ids))]
    const actors = new Map((await prisma.member.findMany({ where: { id: { in: actorIds } }, select: { id: true, name: true, gender: true } })).map(a => [a.id, a]))
    const { t } = translatorFor(m.locale)
    const items = rows.map(n => {
      const { html } = renderNotification(asItem(n), actors, m.locale, { ownParent: n.kind === 'reply' ? n.comment?.parent?.author_id === m.id : undefined })
      return { html, url: targetPath(n), snippet: (n.meta as unknown as NotificationMeta).snippet }
    })
    if (await sendEmail(m.email, t('email.subjectDaily', { n: rows.length }), emailHtml(m.locale, items, t('email.dailyIntro')))) sent++
  }
  return sent
}

/** Read notifications over 90 days, and old reminder and digest keys (FR-060). */
export async function runCleanup(now = new Date()): Promise<number> {
  const cutoff = new Date(now.getTime() - 90 * 24 * 3600_000)
  const r = await prisma.notification.deleteMany({ where: { read_at: { not: null, lt: cutoff } } })
  await prisma.dueReminder.deleteMany({ where: { due_date: { lt: new Date(now.getTime() - 30 * 24 * 3600_000) } } })
  await prisma.emailDigest.deleteMany({ where: { day: { lt: new Date(now.getTime() - 30 * 24 * 3600_000) } } })
  return r.count
}

let lastDue = 0, lastCleanupDay = ''
/** One tick: every job that is due now. Returns the jobs it ran. */
export async function tick(now = new Date()): Promise<string[]> {
  const ran: string[] = []
  const clock = teamClock(now, TZ())
  if (await locked('instant', () => runInstantEmails(now)) !== null) ran.push('instant')
  if (now.getTime() - lastDue >= 55 * 60_000) {
    if (await locked('due', () => runDueReminders(now)) !== null) ran.push('due')
    lastDue = now.getTime()
  }
  if (clock.h > 8 || (clock.h === 8 && clock.m >= 30)) {
    if (await locked('daily', () => runDailySummary(now)) !== null) ran.push('daily')
  }
  const day = teamDay(now, TZ())
  if (clock.h >= 3 && lastCleanupDay !== day) {
    if (await locked('cleanup', () => runCleanup(now)) !== null) ran.push('cleanup')
    lastCleanupDay = day
  }
  return ran
}

let started = false
export function startNotifyScheduler(): void {
  if (started || process.env.NOTIFY_SCHEDULER === '0') return
  started = true
  const run = () => { tick().catch(e => console.error('[notify] tick failed', e)) }
  setTimeout(run, 15_000)
  setInterval(run, 60_000).unref?.()
}
