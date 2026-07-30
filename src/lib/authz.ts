import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import type { Member } from '@prisma/client'

/**
 * Server-side authorization for server actions.
 *
 * Server actions are addressable POST endpoints. Page-level guards and
 * conditional rendering control what a user *sees*, not what they can
 * *invoke* — any authenticated session can call any exported action
 * directly. Since the Prisma migration removed Row Level Security, these
 * checks are the only thing enforcing the access tiers.
 *
 * Every mutating action must open with one of these guards.
 */

/** The signed-in member, or null when there is no valid session. */
export async function getSessionMember(): Promise<Member | null> {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return null
  return prisma.member.findUnique({ where: { id: session.user.id } })
}

type Guard =
  | { member: Member; error?: never }
  | { member?: never; error: 'not_authenticated' | 'not_authorized' }

/** Any signed-in member. */
export async function requireMember(): Promise<Guard> {
  const member = await getSessionMember()
  if (!member) return { error: 'not_authenticated' }
  return { member }
}

/** Admin only — team management, SLA matrix, workspace and workflow config. */
export async function requireAdmin(): Promise<Guard> {
  const member = await getSessionMember()
  if (!member) return { error: 'not_authenticated' }
  if (member.access !== 'admin') return { error: 'not_authorized' }
  return { member }
}

/** Admin or superuser — task creation. Mirrors the guard in TaskForm. */
export async function requireTaskCreator(): Promise<Guard> {
  const member = await getSessionMember()
  if (!member) return { error: 'not_authenticated' }
  if (member.access === 'user') return { error: 'not_authorized' }
  return { member }
}
