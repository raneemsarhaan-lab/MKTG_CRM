import { redirect } from 'next/navigation'
import { getSessionMember } from '@/lib/authz'
import { prisma } from '@/lib/prisma'
import { mapMember, mapTask } from '@/lib/mappers'
import { cleanFeatures, withResolvedFeatures } from '@/lib/brand-features'
import { CapacityDashboard } from '@/components/capacity/CapacityDashboard'

export default async function CapacityPage() {
  const member = await getSessionMember()
  if (!member) redirect('/login')
  if (member.access !== 'admin') redirect('/overview')

  const [members, tasks, ws] = await Promise.all([
    prisma.member.findMany({ orderBy: { name: 'asc' } }),
    prisma.task.findMany({
      // Dropped clips (spec 008) carry no load.
      where: { dropped_at: null, NOT: { status: 'publish' } },
      include: { brand: true },
    }),
    prisma.workspaceSettings.findUnique({ where: { id: 1 }, select: { brand_feature_defaults: true } }),
  ])
  // Spec 021 (US4): a brand with Hour estimates off shows none here.
  const defaults = cleanFeatures(ws?.brand_feature_defaults)
  const rows = tasks.map(mapTask).map(x => {
    if (!x.brand) return x
    const brand = withResolvedFeatures(x.brand, defaults)
    // Hidden, not cleared: the estimate stays on the task; it just isn't shown or counted here.
    return { ...x, brand, hours_estimate: brand.features.hours ? x.hours_estimate : 0 }
  })

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <CapacityDashboard
        members={members.map(mapMember)}
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        tasks={rows as any}
      />
    </div>
  )
}
