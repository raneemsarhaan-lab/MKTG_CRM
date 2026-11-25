'use server'

/**
 * Comments on sheet cells (spec 015 US3, FR-050–FR-054, contracts/server.md).
 *
 * - A thread is its first comment (root_id null) and its replies, on one
 *   cell: a blank sheet's row and column ids, or on the Content and Video
 *   sheets a task id and column key. The keys aren't foreign keys, so a
 *   thread on a deleted row comes back when the delete is undone.
 * - Everyone who can open the sheet sees and may add comments, even on a
 *   protected sheet. Only the author edits a comment; the author or an admin
 *   deletes it (a soft delete). Anyone may resolve or reopen a thread.
 * - @Name mentions notify (`sheet_mention`); replies notify the thread's
 *   earlier participants (`sheet_reply`).
 */
import { prisma } from '@/lib/prisma'
import { getSessionMember } from '@/lib/authz'
import { mentionedIn } from '@/lib/notify/mentions'
import { notifyAfter, notifySheet } from '@/lib/notify/notify'
import { snippet } from '@/lib/notify/message'
import type { NotificationMeta, SheetCommentThread } from '@/types/index'

type Fail = { success: false; error: string }
const fail = (error: string): Fail => ({ success: false, error })
const MAX_BODY = 5000
const MAX_MENTIONS = 20
const KEY_MAX = 80

type Row = {
  id: string; sheet_id: string; row_key: string; col_key: string; root_id: string | null; author_id: string | null
  body: string; mentions: string[]; created_at: Date; edited_at: Date | null; deleted_at: Date | null; resolved_at: Date | null; resolved_by: string | null
}

const sheetWhere = (idOrKey: string) => (idOrKey === 'linked_content' || idOrKey === 'linked_video' ? { linked_key: idOrKey } : { id: idOrKey })

function toThread(root: Row, replies: Row[]): SheetCommentThread {
  const item = (c: Row) => ({
    id: c.id, authorId: c.author_id, body: c.deleted_at ? '' : c.body, mentions: c.deleted_at ? [] : c.mentions,
    createdAt: c.created_at.toISOString(), editedAt: c.edited_at?.toISOString() ?? null, deleted: !!c.deleted_at,
  })
  return {
    id: root.id, rowKey: root.row_key, colKey: root.col_key,
    resolved: root.resolved_at ? { at: root.resolved_at.toISOString(), by: root.resolved_by } : null,
    comments: [root, ...replies.sort((a, b) => a.created_at.getTime() - b.created_at.getTime())].map(item),
  }
}

async function threadOf(rootId: string): Promise<SheetCommentThread | null> {
  const root = await prisma.sheetComment.findUnique({ where: { id: rootId } })
  if (!root || root.root_id) return null
  const replies = await prisma.sheetComment.findMany({ where: { root_id: rootId } })
  const live = [root, ...replies].some(c => !c.deleted_at)
  return live ? toThread(root, replies) : null
}

/** A comment's text: trimmed, not empty, not too long; its mentions, read from the @Names in it. */
async function checkBody(body: string): Promise<{ ok: true; body: string; mentions: string[] } | Fail> {
  const text = (body ?? '').replace(/\r\n/g, '\n').trim()
  if (!text) return fail('empty')
  if (text.length > MAX_BODY) return fail('too_long')
  const members = await prisma.member.findMany({ select: { id: true, name: true } })
  const mentions = mentionedIn(text, members)
  if (mentions.length > MAX_MENTIONS) return fail('too_many_mentions')
  return { ok: true, body: text, mentions }
}

/** Where a notification about this cell leads, and how it reads. */
async function metaFor(sheetId: string, rowKey: string, colKey: string, cell: string | undefined, body: string): Promise<NotificationMeta> {
  const sheet = await prisma.sheet.findUnique({ where: { id: sheetId }, select: { name: true, kind: true, folder_id: true } })
  const sheetName = sheet?.name ?? (sheet?.kind === 'linked_video' ? 'Video' : 'Content')
  const cellName = (cell ?? '').slice(0, 120)
  return {
    task_name: cellName ? `${sheetName} · ${cellName}` : sheetName,
    snippet: snippet(body),
    sheet_id: sheetId, folder_id: sheet?.folder_id, sheet_name: sheetName, cell: cellName || undefined, row_key: rowKey, col_key: colKey,
  }
}

/** The threads on a sheet (contracts/server.md `listThreads`), newest first. */
export async function listThreads(sheet: string): Promise<{ success: true; sheetId: string; threads: SheetCommentThread[] } | Fail> {
  const me = await getSessionMember()
  if (!me) return fail('not_authenticated')
  const s = await prisma.sheet.findUnique({ where: sheetWhere(sheet), select: { id: true } })
  if (!s) return fail('gone')
  const all = await prisma.sheetComment.findMany({ where: { sheet_id: s.id }, orderBy: { created_at: 'asc' } })
  const replies = new Map<string, Row[]>()
  for (const c of all) if (c.root_id) replies.set(c.root_id, [...(replies.get(c.root_id) ?? []), c])
  const threads = all.filter(c => !c.root_id)
    .map(r => ({ r, rep: replies.get(r.id) ?? [] }))
    .filter(x => [x.r, ...x.rep].some(c => !c.deleted_at))
    .map(x => toThread(x.r, x.rep))
    .sort((a, b) => b.comments[b.comments.length - 1].createdAt.localeCompare(a.comments[a.comments.length - 1].createdAt))
  return { success: true, sheetId: s.id, threads }
}

export async function getThread(threadId: string): Promise<{ success: true; thread: SheetCommentThread } | Fail> {
  const me = await getSessionMember()
  if (!me) return fail('not_authenticated')
  const t = await threadOf(threadId)
  return t ? { success: true, thread: t } : fail('not_found')
}

/** A new thread on a cell (any member, even on a protected sheet). */
export async function addComment(sheet: string, input: { rowKey: string; colKey: string; body: string; cell?: string }): Promise<{ success: true; thread: SheetCommentThread } | Fail> {
  const me = await getSessionMember()
  if (!me) return fail('not_authenticated')
  const s = await prisma.sheet.findUnique({ where: sheetWhere(sheet), select: { id: true } })
  if (!s) return fail('gone')
  if (typeof input.rowKey !== 'string' || typeof input.colKey !== 'string' || !input.rowKey || !input.colKey || input.rowKey.length > KEY_MAX || input.colKey.length > KEY_MAX) return fail('invalid')
  const b = await checkBody(input.body)
  if (!('ok' in b)) return b
  const root = await prisma.sheetComment.create({ data: { sheet_id: s.id, row_key: input.rowKey, col_key: input.colKey, author_id: me.id, body: b.body, mentions: b.mentions } })
  if (b.mentions.length) {
    const meta = await metaFor(s.id, input.rowKey, input.colKey, input.cell, b.body)
    await notifyAfter(tx => notifySheet(tx, { kind: 'sheet_mention', actorId: me.id, recipients: b.mentions, threadId: root.id, meta }))
  }
  return { success: true, thread: toThread(root, []) }
}

/** A reply: notifies the mentioned, and the thread's earlier participants. */
export async function replyComment(threadId: string, input: { body: string; cell?: string }): Promise<{ success: true; thread: SheetCommentThread } | Fail> {
  const me = await getSessionMember()
  if (!me) return fail('not_authenticated')
  const root = await prisma.sheetComment.findUnique({ where: { id: threadId } })
  if (!root || root.root_id) return fail('not_found')
  const b = await checkBody(input.body)
  if (!('ok' in b)) return b
  const earlier = await prisma.sheetComment.findMany({ where: { OR: [{ id: threadId }, { root_id: threadId }], deleted_at: null }, select: { author_id: true } })
  await prisma.sheetComment.create({ data: { sheet_id: root.sheet_id, row_key: root.row_key, col_key: root.col_key, root_id: threadId, author_id: me.id, body: b.body, mentions: b.mentions } })
  // A reply on a resolved thread reopens it, as in Excel.
  if (root.resolved_at) await prisma.sheetComment.update({ where: { id: threadId }, data: { resolved_at: null, resolved_by: null } })
  const meta = await metaFor(root.sheet_id, root.row_key, root.col_key, input.cell, b.body)
  const participants = [...new Set(earlier.map(e => e.author_id).filter((x): x is string => !!x))].filter(id => !b.mentions.includes(id))
  await notifyAfter(async tx => [
    ...(b.mentions.length ? await notifySheet(tx, { kind: 'sheet_mention', actorId: me.id, recipients: b.mentions, threadId, meta }) : []),
    ...(participants.length ? await notifySheet(tx, { kind: 'sheet_reply', actorId: me.id, recipients: participants, threadId, meta }) : []),
  ])
  const t = await threadOf(threadId)
  return t ? { success: true, thread: t } : fail('not_found')
}

/** Edit your own comment; people newly mentioned are notified. */
export async function editComment(id: string, body: string, cell?: string): Promise<{ success: true; thread: SheetCommentThread } | Fail> {
  const me = await getSessionMember()
  if (!me) return fail('not_authenticated')
  const c = await prisma.sheetComment.findUnique({ where: { id } })
  if (!c || c.deleted_at) return fail('not_found')
  if (c.author_id !== me.id) return fail('not_author')
  const b = await checkBody(body)
  if (!('ok' in b)) return b
  await prisma.sheetComment.update({ where: { id }, data: { body: b.body, mentions: b.mentions, edited_at: new Date() } })
  const added = b.mentions.filter(x => !c.mentions.includes(x))
  const rootId = c.root_id ?? c.id
  if (added.length) {
    const meta = await metaFor(c.sheet_id, c.row_key, c.col_key, cell, b.body)
    await notifyAfter(tx => notifySheet(tx, { kind: 'sheet_mention', actorId: me.id, recipients: added, threadId: rootId, meta }))
  }
  const t = await threadOf(rootId)
  return t ? { success: true, thread: t } : fail('not_found')
}

/** Delete your own comment, or any as an admin. A thread with nothing left disappears. */
export async function deleteComment(id: string): Promise<{ success: true; thread: SheetCommentThread | null } | Fail> {
  const me = await getSessionMember()
  if (!me) return fail('not_authenticated')
  const c = await prisma.sheetComment.findUnique({ where: { id } })
  if (!c || c.deleted_at) return fail('not_found')
  if (c.author_id !== me.id && me.access !== 'admin') return fail('not_author')
  await prisma.sheetComment.update({ where: { id }, data: { deleted_at: new Date() } })
  return { success: true, thread: await threadOf(c.root_id ?? c.id) }
}

async function setResolved(id: string, on: boolean): Promise<{ success: true; thread: SheetCommentThread } | Fail> {
  const me = await getSessionMember()
  if (!me) return fail('not_authenticated')
  const root = await prisma.sheetComment.findUnique({ where: { id } })
  if (!root || root.root_id) return fail('not_found')
  await prisma.sheetComment.update({ where: { id }, data: on ? { resolved_at: new Date(), resolved_by: me.id } : { resolved_at: null, resolved_by: null } })
  const t = await threadOf(id)
  return t ? { success: true, thread: t } : fail('not_found')
}
export async function resolveThread(id: string) { return setResolved(id, true) }
export async function reopenThread(id: string) { return setResolved(id, false) }

/**
 * Clear › Comments (spec 015 FR-042): the comments on these cells, soft
 * deleted. Members clear their own; admins clear all. What someone else
 * wrote is left and counted. Not on the undo stack, as in Excel (R6).
 */
export async function clearCellComments(sheet: string, keys: string[]): Promise<{ success: true; cleared: number; skipped: number } | Fail> {
  const me = await getSessionMember()
  if (!me) return fail('not_authenticated')
  const s = await prisma.sheet.findUnique({ where: sheetWhere(sheet), select: { id: true } })
  if (!s) return fail('gone')
  const pairs = keys.slice(0, 20_000).map(k => { const i = k.lastIndexOf('|'); return i > 0 ? [k.slice(0, i), k.slice(i + 1)] : null }).filter((x): x is string[] => !!x)
  if (!pairs.length) return { success: true, cleared: 0, skipped: 0 }
  const rows = await prisma.$queryRaw<{ id: string; author_id: string | null }[]>`
    SELECT id, author_id FROM sheet_comments WHERE sheet_id = ${s.id}::uuid AND deleted_at IS NULL AND (row_key, col_key) IN (
      SELECT * FROM unnest(${pairs.map(p => p[0])}::text[], ${pairs.map(p => p[1])}::text[]))`
  const mine = rows.filter(r => me.access === 'admin' || r.author_id === me.id).map(r => r.id)
  if (mine.length) await prisma.sheetComment.updateMany({ where: { id: { in: mine } }, data: { deleted_at: new Date() } })
  return { success: true, cleared: mine.length, skipped: rows.length - mine.length }
}
