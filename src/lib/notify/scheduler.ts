/**
 * Timed notification jobs (spec 012 R9). Server-only.
 *
 * One tick a minute, started by src/instrumentation.ts on the Node runtime.
 * Each job keys its work by date, so a missed tick is caught up by the next
 * one, and claims each piece of work by a key the database enforces (a due
 * reminder's, a digest's, a notification's emailed_at), so two instances — the
 * old and new container overlapping during a deploy — never send twice.
 *
 * Every database call here is short and uses one connection at a time. This
 * used to wrap each job in a transaction held open for its whole run (up to
 * two minutes) just to hold an advisory lock, while the job opened further
 * transactions of its own; and a new tick started every minute whether the
 * last had finished or not. On a container's small connection pool that left
 * nothing for pages: every request queued, the proxy answered 504, and the
 * platform killed the container as unresponsive — over and over.
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

/** A unique-key clash: another instance got there first. */
const isClash = (e: unknown) => (e as { code?: string })?.code === 'P2002'

/** Due tomorrow and overdue, once per task, kind and due date (FR-050). */
export async function runDueReminders(now = new Date()): Promise<number> {
  const tasks = await prisma.task.findMany({
    where: { due_date: { not: null }, dropped_at: null, status: { not: 'publish' } },
    select: { id: true, due_date: true, status: true, dropped_at: true },
  })
  const due = tasks.flatMap(t => {
    const day = t.due_date!.toISOString().slice(0, 10)
    const kind = dueState({ due_date: day, status: t.status, dropped_at: t.dropped_at }, now, TZ())
    return kind ? [{ id: t.id, kind, day }] : []
  })
  if (!due.length) return 0
  // The ones already sent, in one query, rather than a transaction per task to find out.
  const done = new Set((await prisma.dueReminder.findMany({
    where: { task_id: { in: due.map(d => d.id) } }, select: { task_id: true, kind: true, due_date: true },
  })).map(r => `${r.task_id}|${r.kind}|${r.due_date.toISOString().slice(0, 10)}`))
  let sent = 0
  for (const d of due) {
    if (done.has(`${d.id}|${d.kind}|${d.day}`)) continue
    try {
      const ids = await prisma.$transaction(async tx => {
        // The key claims it: a second instance's create fails here and sends nothing.
        await tx.dueReminder.create({ data: { task_id: d.id, kind: d.kind, due_date: new Date(d.day) } })
        return notify(tx, { kind: d.kind, actorId: null, taskId: d.id, dueDate: d.day })
      }, { timeout: 20_000 })
      if (ids.length) { sent += ids.length; await deliver(ids) }
    } catch (e) {
      // One task's failure is that task's; the rest still get their reminders.
      if (!isClash(e)) console.error('[notify] due reminder failed', d.id, e)
    }
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
    // Claim it: only the instance whose update lands sends it.
    const claimed = await prisma.notification.updateMany({ where: { id: n.id, emailed_at: null }, data: { emailed_at: new Date() } })
    if (!claimed.count) continue
    if (!effective(mergeSettings(r.notification_settings), n.kind as NotificationKind, 'email')) continue   // not wanted by email: never again
    const ownParent = n.kind === 'reply' ? n.comment?.parent?.author_id === r.id : undefined
    const { text, html } = renderNotification(asItem(n), actors, r.locale, { ownParent })
    const meta = n.meta as unknown as NotificationMeta
    const ok = await sendEmail(r.email, text, emailHtml(r.locale, [{ html, url: targetPath(n), snippet: meta.snippet }]))
    // Not sent: give the claim back so a later tick tries again.
    if (!ok) await prisma.notification.update({ where: { id: n.id }, data: { emailed_at: null, email_tries: { increment: 1 } } })
    else sent++
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
    // The key claims the day: a second instance's create fails and it moves on.
    try { await prisma.emailDigest.create({ data: { member_id: m.id, day: new Date(day) } }) }
    catch (e) { if (isClash(e)) continue; throw e }
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
/**
 * One tick: every job that is due now. Returns the jobs it ran. A job that
 * fails is logged and the others still run; the hourly and nightly ones are
 * marked done before they start, so a failure waits for its next turn rather
 * than retrying every minute.
 */
export async function tick(now = new Date()): Promise<string[]> {
  const ran: string[] = []
  const job = async (name: string, fn: () => Promise<unknown>) => {
    try { await fn(); ran.push(name) } catch (e) { console.error(`[notify] ${name} failed`, e) }
  }
  const clock = teamClock(now, TZ())
  await job('instant', () => runInstantEmails(now))
  if (now.getTime() - lastDue >= 55 * 60_000) {
    lastDue = now.getTime()
    await job('due', () => runDueReminders(now))
  }
  if (clock.h > 8 || (clock.h === 8 && clock.m >= 30)) await job('daily', () => runDailySummary(now))
  const day = teamDay(now, TZ())
  if (clock.h >= 3 && lastCleanupDay !== day) {
    lastCleanupDay = day
    await job('cleanup', () => runCleanup(now))
  }
  return ran
}

let started = false, running = false
export function startNotifyScheduler(): void {
  if (started || process.env.NOTIFY_SCHEDULER === '0') return
  started = true
  // Never two ticks at once: a slow one is skipped over, not stacked on.
  const run = () => {
    if (running) return
    running = true
    tick().catch(e => console.error('[notify] tick failed', e)).finally(() => { running = false })
  }
  setTimeout(run, 15_000)
  setInterval(run, 60_000).unref?.()
}
