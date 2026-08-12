'use server'

import { revalidatePath } from 'next/cache'
import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/authz'
import bcrypt from 'bcryptjs'

type MemberPatch = Partial<{
  name:            string
  email:           string
  role:            string
  access:          'admin' | 'superuser' | 'user'
  capacity_hrs_wk: number
  status:          string
  /** Profile picture. A URL — there is no upload backend. */
  avatar_url:      string | null
}>

type AddMemberInput = {
  name:            string
  email:           string
  role:            string
  access:          'admin' | 'superuser' | 'user'
  password:        string
  capacity_hrs_wk?: number
}

function revalidateAll() {
  revalidatePath('/settings')
  revalidatePath('/capacity')
  revalidatePath('/overview')
  revalidatePath('/board')
}

export async function updateMember(
  memberId: string,
  patch: MemberPatch,
): Promise<{ success: boolean; error?: string }> {
  const auth = await requireAdmin()
  if (auth.error) return { success: false, error: auth.error }

  const data: MemberPatch = {}
  if (patch.name !== undefined) {
    const name = patch.name.trim()
    if (!name) return { success: false, error: 'Name cannot be empty' }
    data.name = name
  }
  if (patch.email !== undefined) {
    const email = patch.email.trim().toLowerCase()
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { success: false, error: 'Invalid email' }
    data.email = email
  }
  if (patch.role !== undefined)            data.role            = patch.role.trim() || 'Team Member'
  if (patch.access !== undefined)          data.access          = patch.access
  if (patch.capacity_hrs_wk !== undefined) data.capacity_hrs_wk = patch.capacity_hrs_wk
  if (patch.status !== undefined)          data.status          = patch.status
  if (patch.avatar_url !== undefined)      data.avatar_url      = patch.avatar_url?.trim() || null

  try {
    await prisma.member.update({ where: { id: memberId }, data })
    revalidateAll()
    return { success: true }
  } catch (e: unknown) {
    const msg = String(e)
    if (msg.includes('Unique constraint')) return { success: false, error: 'Email already in use' }
    return { success: false, error: msg }
  }
}

export async function addMember(
  input: AddMemberInput,
): Promise<{ success: boolean; error?: string }> {
  const auth = await requireAdmin()
  if (auth.error) return { success: false, error: auth.error }

  if (!input.password || input.password.length < 6) {
    return { success: false, error: 'Password must be at least 6 characters' }
  }

  try {
    const password_hash = await bcrypt.hash(input.password, 10)
    const name  = input.name.trim()
    const email = input.email.trim().toLowerCase()

    await prisma.member.create({
      data: {
        name, email,
        role:            input.role.trim() || 'Team Member',
        access:          input.access,
        capacity_hrs_wk: input.capacity_hrs_wk ?? 40,
        status:          'Available',
        password_hash,
      },
    })

    // Adding someone back overrules an earlier removal — otherwise the
    // importers would keep skipping them and the account could never be
    // brought back into sync with the ClickUp export.
    await prisma.tombstone.deleteMany({
      where: { OR: [
        { kind: 'member',      key: email },
        { kind: 'member-name', key: name.toLowerCase() },
      ] },
    })
    revalidateAll()
    return { success: true }
  } catch (e: unknown) {
    const msg = String(e)
    if (msg.includes('Unique constraint')) return { success: false, error: 'Email already exists' }
    return { success: false, error: msg }
  }
}

export async function resetMemberPassword(
  memberId: string,
  newPassword: string,
): Promise<{ success: boolean; error?: string }> {
  const auth = await requireAdmin()
  if (auth.error) return { success: false, error: auth.error }

  if (!newPassword || newPassword.length < 6) {
    return { success: false, error: 'Password must be at least 6 characters' }
  }
  try {
    const password_hash = await bcrypt.hash(newPassword, 10)
    await prisma.member.update({ where: { id: memberId }, data: { password_hash } })
    revalidateAll()
    return { success: true }
  } catch (e: unknown) {
    return { success: false, error: String(e) }
  }
}

/**
 * Remove a member, moving their work to someone else.
 *
 * Called twice by the UI. The first call omits `reassignTo` and, if the member
 * holds anything, comes back with the counts so the dialog can ask where it
 * should go. The second call names a successor and does the deletion.
 *
 * Every task is reassigned, not just the unfinished ones — a published task
 * still needs an owner for history, and the database requires one. Comments
 * are kept and stay attributed, which is why the author relation has to be
 * moved rather than cascaded away.
 *
 * The deletion is also recorded as a Tombstone. Without it the removal only
 * held until the next deploy: the seed re-creates its seven default accounts
 * and the ClickUp importer re-creates anyone named in the export, both of them
 * on every container start. That is why a removed member kept reappearing.
 * Both the email and the display name are recorded, because the seed matches
 * on one and the importer on the other.
 */
export async function removeMember(
  memberId: string,
  reassignTo?: string,
): Promise<{
  success: boolean
  needsReassign?: boolean
  ownedTasks?: number
  activeTasks?: number
  comments?: number
  error?: string
}> {
  const auth = await requireAdmin()
  if (auth.error) return { success: false, error: auth.error }

  if (memberId === auth.member.id) {
    return { success: false, error: 'You cannot remove your own account' }
  }

  const doomed = await prisma.member.findUnique({
    where: { id: memberId }, select: { name: true, email: true },
  })
  if (!doomed) return { success: false, error: 'That member no longer exists' }

  const [owned, active, comments, created] = await Promise.all([
    prisma.task.count({ where: { task_owner_id: memberId } }),
    prisma.task.count({ where: { task_owner_id: memberId, NOT: { status: 'publish' } } }),
    prisma.taskComment.count({ where: { author_id: memberId } }),
    prisma.task.count({ where: { created_by: memberId } }),
  ])

  const holdsWork = owned > 0 || comments > 0 || created > 0
  if (holdsWork && !reassignTo) {
    return { success: false, needsReassign: true, ownedTasks: owned, activeTasks: active, comments }
  }

  if (reassignTo) {
    if (reassignTo === memberId) return { success: false, error: 'Pick a different member' }
    const target = await prisma.member.findUnique({ where: { id: reassignTo } })
    if (!target) return { success: false, error: 'That member no longer exists' }
  }

  try {
    await prisma.$transaction(async tx => {
      if (reassignTo) {
        await tx.task.updateMany({ where: { task_owner_id: memberId }, data: { task_owner_id: reassignTo } })
        await tx.task.updateMany({ where: { created_by: memberId },    data: { created_by: reassignTo } })
        await tx.taskComment.updateMany({ where: { author_id: memberId }, data: { author_id: reassignTo } })
      }
      await tx.member.delete({ where: { id: memberId } })

      // Same transaction as the delete: a tombstone without a deletion would
      // block a legitimate import, and a deletion without a tombstone is the
      // bug this exists to fix. Neither half is correct on its own.
      await tx.tombstone.createMany({
        data: [
          { kind: 'member',      key: doomed.email.toLowerCase(), label: doomed.name },
          { kind: 'member-name', key: doomed.name.toLowerCase(),  label: doomed.name },
        ],
        skipDuplicates: true,
      })
    })
    revalidateAll()
    return { success: true, ownedTasks: owned, comments }
  } catch (e: unknown) {
    return { success: false, error: String(e) }
  }
}
