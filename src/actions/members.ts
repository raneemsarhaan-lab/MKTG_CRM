'use server'

import { revalidatePath } from 'next/cache'
import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/authz'
import bcrypt from 'bcryptjs'

type MemberPatch = Partial<{
  name:            string
  role:            string
  access:          'admin' | 'superuser' | 'user'
  capacity_hrs_wk: number
  status:          string
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

  try {
    await prisma.member.update({ where: { id: memberId }, data: patch })
    revalidateAll()
    return { success: true }
  } catch (e: unknown) {
    return { success: false, error: String(e) }
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
    await prisma.member.create({
      data: {
        name:            input.name.trim(),
        email:           input.email.trim().toLowerCase(),
        role:            input.role.trim() || 'Team Member',
        access:          input.access,
        capacity_hrs_wk: input.capacity_hrs_wk ?? 40,
        status:          'Available',
        password_hash,
      },
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

export async function removeMember(
  memberId: string,
): Promise<{ success: boolean; activeTasks?: number; error?: string }> {
  const auth = await requireAdmin()
  if (auth.error) return { success: false, error: auth.error }

  try {
    const count = await prisma.task.count({
      where: { task_owner_id: memberId, NOT: { status: 'publish' } },
    })
    if (count > 0) return { success: false, activeTasks: count }

    await prisma.member.delete({ where: { id: memberId } })
    revalidateAll()
    return { success: true }
  } catch (e: unknown) {
    return { success: false, error: String(e) }
  }
}
