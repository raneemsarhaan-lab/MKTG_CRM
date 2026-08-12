import { redirect } from 'next/navigation'
import { getSessionMember } from '@/lib/authz'
import { prisma } from '@/lib/prisma'
import { mapMember, mapSlaConfig } from '@/lib/mappers'
import { SettingsView } from '@/components/settings/SettingsView'
import type { WorkspaceSettings } from '@/types/index'

export default async function SettingsPage() {
  const member = await getSessionMember()
  if (!member) redirect('/login')
  if (member.access !== 'admin') redirect('/overview')

  const [members, brands, contentTypes, slaRows, wsRow, levels] = await Promise.all([
    prisma.member.findMany({ orderBy: { name: 'asc' } }),
    prisma.brand.findMany({ orderBy: { name: 'asc' }, include: { assets: { orderBy: { uploaded_at: 'asc' } } } }),
    prisma.contentType.findMany({ orderBy: { label: 'asc' } }),
    prisma.slaConfig.findMany(),
    prisma.workspaceSettings.findUnique({ where: { id: 1 } }),
    prisma.seniorityLevel.findMany({ orderBy: { sort_order: 'asc' } }),
  ])

  const workspaceSettings: WorkspaceSettings = wsRow
    ? { id: wsRow.id, capacity_hrs_per_wk: wsRow.capacity_hrs_per_wk, nine_stage_default: wsRow.nine_stage_default, updated_at: wsRow.updated_at.toISOString() }
    : { id: 1, capacity_hrs_per_wk: 40, nine_stage_default: false, updated_at: new Date().toISOString() }

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <SettingsView
        members={members.map(mapMember)}
        currentUserId={member.id}
        seniorityLevels={levels.map(l => ({ key: l.key, label: l.label }))}
        workload={{
          settings: {
            hoursPerStepDay:         Number(wsRow?.hours_per_step_day ?? 8),
            capacityPeriodEnd:       wsRow?.capacity_period_end ? wsRow.capacity_period_end.toISOString().slice(0, 10) : null,
            complexityThresholdDays: Number(wsRow?.complexity_threshold_days ?? 3),
            supervisingRole:         wsRow?.supervising_role ?? 'Marketing Manager',
          },
          levels: levels.map(l => ({
            key: l.key, label: l.label,
            effortFactor: Number(l.effort_factor),
            supervisionRate: Number(l.supervision_rate),
          })),
          roles: [...new Set(members.map(m => m.role))].sort(),
        }}
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
