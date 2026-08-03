import { redirect } from 'next/navigation'
import { getSessionMember } from '@/lib/authz'
import { prisma } from '@/lib/prisma'
import { mapMember, mapTask } from '@/lib/mappers'
import { CapacityDashboard } from '@/components/capacity/CapacityDashboard'

export default async function CapacityPage() {
  const member = await getSessionMember()
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
