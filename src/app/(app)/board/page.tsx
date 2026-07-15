import { redirect } from 'next/navigation'
import { createServerClient } from '@/lib/supabase/server'
import { KanbanBoard } from '@/components/kanban/KanbanBoard'
import type { SLAConfig } from '@/types/index'

export default async function BoardPage() {
  const supabase = await createServerClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user?.email) redirect('/login')

  const { data: currentUser } = await supabase
    .from('members')
    .select('*')
    .eq('email', user.email)
    .single()
  if (!currentUser) redirect('/login')

  const [
    { data: taskRows },
    { data: memberRows },
    { data: brandRows },
    { data: contentTypeRows },
    { data: slaRows },
  ] = await Promise.all([
    supabase
      .from('tasks')
      .select('*, brand:brands(*), task_owner:members!task_owner_id(*), comments:task_comments(*, author:members!author_id(*))')
      .order('created_at', { ascending: false }),
    supabase.from('members').select('*').order('name'),
    supabase.from('brands').select('*').order('name'),
    supabase.from('content_types').select('*').order('label'),
    supabase.from('sla_config').select('*'),
  ])

  // Transform sla_config rows → SLAConfig shape
  const slaConfig: SLAConfig = {}
  ;(slaRows ?? []).forEach((row: { stage_id: string; content_type_label: string; days: number }) => {
    if (!slaConfig[row.stage_id]) slaConfig[row.stage_id] = {}
    slaConfig[row.stage_id][row.content_type_label] = row.days
  })

  const today = new Date()
  today.setHours(0, 0, 0, 0)

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <KanbanBoard
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        initialTasks={(taskRows ?? []) as any}
        currentUser={currentUser}
        members={memberRows ?? []}
        brands={brandRows ?? []}
        contentTypes={contentTypeRows ?? []}
        slaConfig={slaConfig}
        today={today}
      />
    </div>
  )
}
