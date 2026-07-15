import { redirect } from 'next/navigation'
import { createServerClient } from '@/lib/supabase/server'
import { PersonalBoard } from '@/components/overview/PersonalBoard'
import type { SLAConfig } from '@/types/index'

export default async function OverviewPage() {
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
    { data: myTaskRows },
    { data: allTaskRows },
    { data: memberRows },
    { data: slaRows },
  ] = await Promise.all([
    // My tasks: tasks where I am the task_owner, not published
    supabase
      .from('tasks')
      .select('*, brand:brands(*), task_owner:members!task_owner_id(*), comments:task_comments(*, author:members!author_id(*))')
      .eq('task_owner_id', currentUser.id)
      .neq('status', 'publish')
      .order('due_date', { ascending: true }),
    // All tasks (for BigStat published count + team digest counts)
    supabase
      .from('tasks')
      .select('*')
      .order('created_at', { ascending: false }),
    supabase.from('members').select('*').order('name'),
    supabase.from('sla_config').select('*'),
  ])

  const slaConfig: SLAConfig = {}
  ;(slaRows ?? []).forEach((row: { stage_id: string; content_type_label: string; days: number }) => {
    if (!slaConfig[row.stage_id]) slaConfig[row.stage_id] = {}
    slaConfig[row.stage_id][row.content_type_label] = row.days
  })

  const today = new Date()
  today.setHours(0, 0, 0, 0)

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <PersonalBoard
        currentUser={currentUser}
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        myTasks={(myTaskRows ?? []) as any}
        allTasks={allTaskRows ?? []}
        members={memberRows ?? []}
        slaConfig={slaConfig}
        today={today}
      />
    </div>
  )
}
