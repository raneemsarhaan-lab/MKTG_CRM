import { redirect } from 'next/navigation'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { mapMember, mapSlaConfig } from '@/lib/mappers'
import { SettingsView } from '@/components/settings/SettingsView'
import type { WorkspaceSettings } from '@/types/index'

export default async function SettingsPage() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) redirect('/login')

  const member = await prisma.member.findUnique({ where: { id: session.user.id } })
  if (!member) redirect('/login')
  if (member.access !== 'admin') redirect('/overview')

  const [members, brands, contentTypes, slaRows, wsRow] = await Promise.all([
    prisma.member.findMany({ orderBy: { name: 'asc' } }),
    prisma.brand.findMany({ orderBy: { name: 'asc' }, include: { assets: { orderBy: { uploaded_at: 'asc' } } } }),
    prisma.contentType.findMany({ orderBy: { label: 'asc' } }),
    prisma.slaConfig.findMany(),
    prisma.workspaceSettings.findUnique({ where: { id: 1 } }),
  ])

  const workspaceSettings: WorkspaceSettings = wsRow
    ? { id: wsRow.id, capacity_hrs_per_wk: wsRow.capacity_hrs_per_wk, nine_stage_default: wsRow.nine_stage_default, updated_at: wsRow.updated_at.toISOString() }
    : { id: 1, capacity_hrs_per_wk: 40, nine_stage_default: false, updated_at: new Date().toISOString() }

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <SettingsView
        members={members.map(mapMember)}
        currentUserId={member.id}
        brands={brands.map(b => ({
          id: b.id, name: b.name, color: b.color,
          logo_url: b.logo_url ?? undefined,
          description: b.description ?? undefined,
          assets: b.assets.map(a => ({ id: a.id, filename: a.filename, url: a.url })),
        }))}
        contentTypes={contentTypes.map(ct => ({ id: ct.id, label: ct.label }))}
        slaConfig={mapSlaConfig(slaRows)}
        workspaceSettings={workspaceSettings}
      />
    </div>
  )
}
