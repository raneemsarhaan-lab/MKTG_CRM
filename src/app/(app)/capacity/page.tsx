import { redirect } from 'next/navigation'
import { createServerClient } from '@/lib/supabase/server'
import { CapacityDashboard } from '@/components/capacity/CapacityDashboard'

export default async function CapacityPage() {
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

  const [{ data: memberRows }, { data: taskRows }] = await Promise.all([
    supabase.from('members').select('*').order('name'),
    supabase
      .from('tasks')
      .select('*, brand:brands(id, name, color)')
      .neq('status', 'publish'),
  ])

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <CapacityDashboard
        members={memberRows ?? []}
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        tasks={(taskRows ?? []) as any}
      />
    </div>
  )
}
