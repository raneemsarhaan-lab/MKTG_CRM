import { redirect } from 'next/navigation'
import { getSessionMember } from '@/lib/authz'
import { AppShell } from '@/components/shared/AppShell'
import { mapMember } from '@/lib/mappers'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const member = await getSessionMember()
  if (!member) redirect('/login')

  return <AppShell member={mapMember(member)}>{children}</AppShell>
}
