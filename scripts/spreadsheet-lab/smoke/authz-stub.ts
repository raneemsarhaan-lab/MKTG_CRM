// Stand-in for @/lib/authz in the smoke run: the member named by SMOKE_MEMBER.
import { prisma } from '@/lib/prisma'
export async function getSessionMember() {
  return prisma.member.findFirst({ where: { email: process.env.SMOKE_MEMBER ?? 'raneem.sarhaan@forefront.consulting' } })
}
export async function requireTaskCreator() {
  const member = await getSessionMember()
  if (!member) return { error: 'not_authenticated' as const }
  if (member.access === 'user') return { error: 'not_authorized' as const }
  return { member }
}
