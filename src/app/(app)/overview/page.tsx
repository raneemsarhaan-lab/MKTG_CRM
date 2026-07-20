import { redirect } from 'next/navigation'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { mapMember, mapTask, mapSlaConfig } from '@/lib/mappers'
import { PersonalBoard } from '@/components/overview/PersonalBoard'

export default async function OverviewPage() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) redirect('/login')

  const member = await prisma.member.findUnique({ where: { id: session.user.id } })
  if (!member) redirect('/login')

  const [myTasks, allTasks, members, slaRows] = await Promise.all([
    prisma.task.findMany({
      where: { task_owner_id: member.id, NOT: { status: 'publish' } },
      include: {
        brand:      true,
        task_owner: true,
        comments:   { include: { author: true }, orderBy: { created_at: 'asc' } },
        attachments: true,
      },
      orderBy: { due_date: 'asc' },
    }),
    prisma.task.findMany({ orderBy: { created_at: 'desc' } }),
    prisma.member.findMany({ orderBy: { name: 'asc' } }),
    prisma.slaConfig.findMany(),
  ])

  const today = new Date()
  today.setHours(0, 0, 0, 0)

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <PersonalBoard
        currentUser={mapMember(member)}
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        myTasks={myTasks.map(mapTask) as any}
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        allTasks={allTasks as any}
        members={members.map(mapMember)}
        slaConfig={mapSlaConfig(slaRows)}
        today={today}
      />
    </div>
  )
}
