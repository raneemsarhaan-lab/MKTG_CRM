import { redirect } from 'next/navigation'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { mapMember, mapTask } from '@/lib/mappers'
import { CapacityDashboard } from '@/components/capacity/CapacityDashboard'

export default async function CapacityPage() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) redirect('/login')

  const member = await prisma.member.findUnique({ where: { id: session.user.id } })
  if (!member) redirect('/login')
  if (member.access !== 'admin') redirect('/overview')

  const [members, tasks] = await Promise.all([
    prisma.member.findMany({ orderBy: { name: 'asc' } }),
    prisma.task.findMany({
      where: { NOT: { status: 'publish' } },
      include: { brand: true },
    }),
  ])

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <CapacityDashboard
        members={members.map(mapMember)}
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        tasks={tasks.map(mapTask) as any}
      />
    </div>
  )
}
