import { redirect } from 'next/navigation'
import { createServerClient } from '@/lib/supabase/server'
import { SettingsView } from '@/components/settings/SettingsView'
import type { SLAConfig, WorkspaceSettings } from '@/types/index'

export default async function SettingsPage() {
  const supabase = await createServerClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user?.email) redirect('/login')

  const { data: currentUser } = await supabase
    .from('members')
    .select('*')
    .eq('email', user.email)
    .single()
  if (!currentUser) redirect('/login')

  // Admin-only page
  if (currentUser.access !== 'admin') redirect('/overview')

  const [
    { data: memberRows },
    { data: brandRows },
    { data: contentTypeRows },
    { data: slaRows },
    { data: wsRows },
  ] = await Promise.all([
    supabase.from('members').select('*').order('name'),
    supabase.from('brands').select('*').order('name'),
    supabase.from('content_types').select('*').order('label'),
    supabase.from('sla_configs').select('*'),
    supabase.from('workspace_settings').select('*').eq('id', 1).single(),
  ])

  // Transform flat SLA rows into nested SLAConfig shape
  const slaConfig: SLAConfig = {}
  for (const row of slaRows ?? []) {
    if (!slaConfig[row.stage_id]) slaConfig[row.stage_id] = {}
    slaConfig[row.stage_id][row.content_type_label] = row.days
  }

  const workspaceSettings: WorkspaceSettings = wsRows ?? {
    id: 1, capacity_hrs_per_wk: 40, nine_stage_default: false, updated_at: new Date().toISOString(),
  }

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <SettingsView
        members={memberRows ?? []}
        currentUserId={currentUser.id}
        brands={brandRows ?? []}
        contentTypes={contentTypeRows ?? []}
        slaConfig={slaConfig}
        workspaceSettings={workspaceSettings}
      />
    </div>
  )
}
