import { redirect } from 'next/navigation'
import { createServerClient } from '@/lib/supabase/server'
import { AppShell } from '@/components/shared/AppShell'
import type { Member } from '@/types/index'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createServerClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user?.email) {
    redirect('/login')
  }

  const { data: member } = await supabase
    .from('members')
    .select('*')
    .eq('email', user.email)
    .single()

  if (!member) {
    redirect('/login?error=not_member')
  }

  return <AppShell member={member as Member}>{children}</AppShell>
}
