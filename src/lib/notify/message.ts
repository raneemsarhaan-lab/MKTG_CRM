/**
 * The sentence for a notification, as a message key and its values (spec 012
 * R6, FR-070). Pure: the browser renders it with next-intl, the server (push,
 * email) with createTranslator in the recipient's stored language.
 *
 * Keys live under `notifications.msg.*`. Arabic verbs agree with the first
 * actor through the `gender` value ('f' | 'm' | 'other').
 */
import type { AppNotification } from '@/types/index'
import { STAGE_META } from '@/lib/stage-meta'
import type { StageId } from '@/types/index'

export interface Actor { id: string; name: string; gender?: string | null }

export function messageFor(
  n: Pick<AppNotification, 'kind' | 'actorIds' | 'count' | 'meta' | 'stageId'>,
  actorsById: Map<string, Actor>,
  locale: 'en' | 'ar',
  opts: { ownParent?: boolean } = {},
): { key: string; values: Record<string, string | number> } {
  const actors = n.actorIds.map(id => actorsById.get(id)).filter((a): a is Actor => !!a)
  const first = actors[0]
  const others = Math.max(0, actors.length - 2)
  const stage = n.stageId && STAGE_META[n.stageId as StageId]
    ? (locale === 'ar' ? STAGE_META[n.stageId as StageId].label_ar : STAGE_META[n.stageId as StageId].label_en)
    : ''
  const values: Record<string, string | number> = {
    actor: first?.name ?? '',
    actor2: actors[1]?.name ?? '',
    others,
    count: n.count,
    task: n.meta.task_name,
    stage,
    gender: first?.gender === 'f' || first?.gender === 'm' ? first.gender : 'other',
  }
  const shape = actors.length <= 1 ? 'one' : actors.length === 2 ? 'two' : 'many'
  switch (n.kind) {
    case 'comment': return { key: `msg.comment.${shape}`, values }
    case 'reply':
      if (opts.ownParent === false) return { key: actors.length > 1 ? 'msg.reply.threadMany' : 'msg.reply.thread', values: { ...values, others: actors.length - 1 } }
      return { key: `msg.reply.${shape}`, values }
    case 'attachment': return { key: actors.length > 1 ? 'msg.attachment.many' : 'msg.attachment.one', values: { ...values, others: actors.length - 1 } }
    case 'task_created_in_stage':
      return n.meta.paste_count ? { key: 'msg.task_created_in_stage.paste', values: { ...values, count: n.meta.paste_count } } : { key: 'msg.task_created_in_stage.one', values }
    default: return { key: `msg.${n.kind}`, values }
  }
}

/** "now", "5m", "2h", "Yesterday", then a date: as a key and values under notifications.time, or a formatted date. */
export function relativeTime(iso: string, now: Date, locale: 'en' | 'ar'): { key: string; values: Record<string, number> } | { text: string } {
  const ms = now.getTime() - new Date(iso).getTime()
  const min = Math.floor(ms / 60000)
  if (min < 1) return { key: 'time.now', values: {} }
  if (min < 60) return { key: 'time.m', values: { n: min } }
  const h = Math.floor(min / 60)
  if (h < 24) return { key: 'time.h', values: { n: h } }
  if (h < 48) return { key: 'time.yesterday', values: {} }
  return { text: new Intl.DateTimeFormat(locale === 'ar' ? 'ar-EG' : 'en-GB', { day: 'numeric', month: 'short' }).format(new Date(iso)) }
}

/** A comment's text, cut to 100 characters for the notification. */
export function snippet(body: string): string {
  const flat = body.replace(/\s+/g, ' ').trim()
  return flat.length > 100 ? `${flat.slice(0, 99)}…` : flat
}
