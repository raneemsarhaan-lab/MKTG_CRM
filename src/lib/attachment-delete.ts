import { prisma } from '@/lib/prisma'
import { deleteObject } from '@/lib/storage'

/**
 * Delete one attachment: the row, the stored object behind it, and the card's
 * preview if no uploaded file is left. Shared by the `removeAttachment` server
 * action and the keepalive `DELETE /api/attachments/<id>` route (spec 007,
 * contracts/server.md §2), so both apply the same rule and the same clean-up.
 *
 * Server-only: imported from an action file and a route handler, never from a
 * client component.
 */
export async function deleteAttachmentFor(
  attachmentId: string,
  member: { id: string; access: string },
): Promise<{ ok: true; taskId: string | null } | { ok: false; status: 403 | 404; error: string }> {
  const a = await prisma.taskAttachment.findUnique({
    where: { id: attachmentId }, select: { task_id: true, storage_key: true },
  })
  // Already gone is not a failure for the caller: the outcome it wanted holds.
  if (!a) return { ok: true, taskId: null }

  // Owner, assignee, or an admin/superuser override: the rule every task
  // mutation uses (Constitution §III; the UI hides the control otherwise).
  const task = await prisma.task.findUnique({
    where: { id: a.task_id }, select: { task_owner_id: true, assignee_id: true },
  })
  if (!task) return { ok: false, status: 404, error: 'That task no longer exists' }
  const allowed = task.task_owner_id === member.id
    || task.assignee_id === member.id
    || member.access === 'admin'
    || member.access === 'superuser'
  if (!allowed) return { ok: false, status: 403, error: 'not_authorized' }

  await prisma.taskAttachment.delete({ where: { id: attachmentId } }).catch(() => null)

  // The object behind the row, when there is one. After the row, not before:
  // deleteObject never throws, so the worst case is an orphaned object nobody
  // can reach, rather than a row pointing at a file that is already gone.
  if (a.storage_key) await deleteObject(a.storage_key)

  // The card's preview came from an upload. If none is left, clear it rather
  // than keep showing a picture the task no longer has. "An upload" means one
  // of ours wherever its bytes are: inline in `data`, or in the bucket.
  const stillHasUpload = await prisma.taskAttachment.count({
    where: { task_id: a.task_id, OR: [{ data: { not: null } }, { storage_key: { not: null } }] },
  })
  if (stillHasUpload === 0) {
    await prisma.task.update({ where: { id: a.task_id }, data: { cover_thumb: null } })
  }
  return { ok: true, taskId: a.task_id }
}
