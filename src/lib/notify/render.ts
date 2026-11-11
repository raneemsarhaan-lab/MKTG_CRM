/**
 * Notification sentences on the server, for phone alerts and emails, in the
 * recipient's stored language (spec 012 R6, R13). The browser renders the
 * same keys with next-intl, so the bell, the phone and the email read alike.
 */
import { createTranslator } from 'next-intl'
import en from '../../../messages/en.json'
import ar from '../../../messages/ar.json'
import type { AppNotification } from '@/types/index'
import { messageFor, type Actor } from './message'

const MESSAGES = { en, ar } as const
const esc = (s: string) => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] as string)

export function translatorFor(locale: string) {
  const l = locale === 'ar' ? 'ar' : 'en'
  return { locale: l as 'en' | 'ar', t: createTranslator({ locale: l, messages: MESSAGES[l], namespace: 'notifications' }) }
}

/** The sentence as plain text and as HTML (names and the task in bold). */
export function renderNotification(
  n: Pick<AppNotification, 'kind' | 'actorIds' | 'count' | 'meta' | 'stageId'>,
  actors: Map<string, Actor>,
  locale: string,
  opts: { ownParent?: boolean } = {},
): { text: string; html: string } {
  const { locale: l, t } = translatorFor(locale)
  const { key, values } = messageFor(n, actors, l, opts)
  const k = key as Parameters<typeof t.markup>[0]
  const text = t.markup(k, { ...values, b: c => c, t: c => c })
  const safe = Object.fromEntries(Object.entries(values).map(([a, v]) => [a, typeof v === 'string' ? esc(v) : v]))
  const html = t.markup(k, { ...safe, b: c => `<b>${c}</b>`, t: c => `<b>${c}</b>` })
  return { text, html }
}

/** Where a notification leads: the board with the task open, and the notification to mark read. */
export function targetPath(n: { id: string; kind: string; task_id: string | null; comment_id: string | null; meta?: unknown }): string {
  const sheet = sheetTarget(n)
  if (sheet) return `${sheet}&n=${n.id}`
  if (!n.task_id) return `/board?n=${n.id}`
  const q = new URLSearchParams({ task: n.task_id, n: n.id })
  if (n.kind === 'attachment') q.set('section', 'attachments')
  else if (n.comment_id) q.set('comment', n.comment_id)
  return `/board?${q.toString()}`
}

/** Spec 015: a sheet comment's notification opens the sheet at the cell, with its thread. */
export function sheetTarget(n: { kind: string; meta?: unknown }): string | null {
  if (n.kind !== 'sheet_mention' && n.kind !== 'sheet_reply') return null
  const m = (n.meta ?? {}) as { folder_id?: string; sheet_id?: string; row_key?: string; col_key?: string }
  if (!m.folder_id || !m.sheet_id) return null
  const q = new URLSearchParams({ sheet: m.sheet_id, cell: `${m.row_key ?? ''}:${m.col_key ?? ''}` })
  return `/sheets/${m.folder_id}?${q.toString()}`
}
