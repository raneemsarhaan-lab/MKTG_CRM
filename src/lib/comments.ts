/**
 * Writing a comment or a reply, with its notifications (spec 012 R1, R4).
 * Server-only, and kept out of the 'use server' files so it can't be called
 * from the browser: addComment (the task panel) and replyToMention (the
 * Inbox) both come through here, so a comment always notifies the same way.
 *
 *   comment or reply → follow the author → notify comment/reply → notify each mention
 *
 * Threads are one level deep: replying to a reply replies to its top comment.
 */
import { prisma } from '@/lib/prisma'
import { notify, follow, deliver } from '@/lib/notify/notify'
import { snippet } from '@/lib/notify/message'

export type CommentError = 'not_found' | 'bad_parent'

export async function createComment(
  author: { id: string },
  input: { taskId: string; body: string; mentions: string[]; taskRefs: string[]; parentId?: string | null },
): Promise<{ ok: true; id: string } | { ok: false; error: CommentError }> {
  let parentId: string | null = null
  let parentAuthorId: string | null = null
  if (input.parentId) {
    const parent = await prisma.taskComment.findUnique({ where: { id: input.parentId }, select: { id: true, task_id: true, parent_id: true, author_id: true } })
    if (!parent || parent.task_id !== input.taskId) return { ok: false, error: 'bad_parent' }
    if (parent.parent_id) {
      // A reply to a reply joins the same thread.
      const top = await prisma.taskComment.findUnique({ where: { id: parent.parent_id }, select: { id: true, author_id: true } })
      if (!top) return { ok: false, error: 'bad_parent' }
      parentId = top.id
      parentAuthorId = top.author_id
    } else {
      parentId = parent.id
      parentAuthorId = parent.author_id
    }
  }

  const touched: string[] = []
  const id = await prisma.$transaction(async tx => {
    const comment = await tx.taskComment.create({
      data: {
        task_id: input.taskId, author_id: author.id, body: input.body,
        mentions: input.mentions, task_refs: input.taskRefs, parent_id: parentId,
      },
    })
    await follow(tx, input.taskId, author.id, { clearMute: true })
    const text = snippet(input.body)
    if (parentId && parentAuthorId) {
      const thread = await tx.taskComment.findMany({ where: { parent_id: parentId }, select: { author_id: true } })
      touched.push(...await notify(tx, {
        kind: 'reply', actorId: author.id, taskId: input.taskId, commentId: comment.id,
        parentAuthorId, threadAuthorIds: [...new Set(thread.map(t => t.author_id))],
      }, { snippet: text, parentCommentId: parentId }))
    } else {
      touched.push(...await notify(tx, { kind: 'comment', actorId: author.id, taskId: input.taskId, commentId: comment.id }, { snippet: text }))
    }
    const named = input.mentions.filter(m => m !== author.id)
    if (named.length) {
      for (const m of named) await follow(tx, input.taskId, m, { clearMute: true })
      touched.push(...await notify(tx, { kind: 'mention', actorId: author.id, taskId: input.taskId, commentId: comment.id, mentionedIds: named }, { snippet: text }))
    }
    return comment.id
  })
  void deliver(touched)
  return { ok: true, id }
}
