'use server'

import { revalidatePath } from 'next/cache'
import bcrypt from 'bcryptjs'
import { prisma } from '@/lib/prisma'
import { getSessionMember } from '@/lib/authz'

/**
 * Self-service account actions.
 *
 * Everything here acts on the signed-in member and nobody else — the id comes
 * from the session, never from the caller, so there is no id to tamper with.
 * The admin equivalents in actions/members.ts stay separate and keep their
 * requireAdmin guard.
 */

function revalidateAll() {
  revalidatePath('/board')
  revalidatePath('/overview')
  revalidatePath('/capacity')
  revalidatePath('/settings')
}

export async function updateMyProfile(
  patch: { name?: string; avatar_url?: string | null },
): Promise<{ success: boolean; error?: string }> {
  const member = await getSessionMember()
  if (!member) return { success: false, error: 'not_authenticated' }

  const data: Record<string, unknown> = {}
  if (patch.name !== undefined) {
    const name = patch.name.trim()
    if (!name) return { success: false, error: 'Name cannot be empty' }
    data.name = name
  }
  if (patch.avatar_url !== undefined) data.avatar_url = patch.avatar_url?.trim() || null

  if (Object.keys(data).length === 0) return { success: true }

  try {
    await prisma.member.update({ where: { id: member.id }, data })
    revalidateAll()
    return { success: true }
  } catch (e: unknown) {
    return { success: false, error: String(e) }
  }
}

/**
 * Change your own password.
 *
 * The current password is required, so a walked-away-from session cannot be
 * used to lock the real owner out. The one exception is an account that has
 * never had a password — the nine created by the ClickUp import — where there
 * is nothing to prove and the field is skipped.
 */
export async function changeMyPassword(
  currentPassword: string,
  newPassword: string,
): Promise<{ success: boolean; error?: string }> {
  const member = await getSessionMember()
  if (!member) return { success: false, error: 'not_authenticated' }

  if (!newPassword || newPassword.length < 6) {
    return { success: false, error: 'New password must be at least 6 characters' }
  }

  const row = await prisma.member.findUnique({ where: { id: member.id } })
  if (!row) return { success: false, error: 'not_found' }

  if (row.password_hash) {
    const ok = await bcrypt.compare(currentPassword, row.password_hash)
    if (!ok) return { success: false, error: 'Current password is not right' }
  }

  try {
    await prisma.member.update({
      where: { id: member.id },
      data:  { password_hash: await bcrypt.hash(newPassword, 10) },
    })
    revalidateAll()
    return { success: true }
  } catch (e: unknown) {
    return { success: false, error: String(e) }
  }
}
