// Stand-in for @/lib/authz in the smoke run: the member named by SMOKE_MEMBER.
import { prisma } from '@/lib/prisma'
export async function getSessionMember() {
  return prisma.member.findFirst({ where: { email: process.env.SMOKE_MEMBER ?? 'raneem.sarhaan@forefront.consulting' } })
}
