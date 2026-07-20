import { redirect } from 'next/navigation'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { AppShell } from '@/components/shared/AppShell'
import { mapMember } from '@/lib/mappers'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) redirect('/login')

  const member = await prisma.member.findUnique({ where: { id: session.user.id } })
  if (!member) redirect('/login')

  return <AppShell member={mapMember(member)}>{children}</AppShell>
}
