import { redirect } from 'next/navigation'
import { getSessionMember } from '@/lib/authz'
import { AppShell } from '@/components/shared/AppShell'
import { StaleBuildNotice } from '@/components/shared/StaleBuildNotice'
import { PendingDeletes } from '@/components/shared/PendingDeletes'
import { mapMember } from '@/lib/mappers'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const member = await getSessionMember()
  if (!member) redirect('/login')

  return (
    <AppShell member={mapMember(member)}>
      {children}
      {/* Every deploy leaves open tabs holding action ids the new server does
          not know. Without this the only symptom is that nothing happens. */}
      <StaleBuildNotice />
      {/* Attachment deletes keep their Undo after the task panel closes (spec 007). */}
      <PendingDeletes />
    </AppShell>
  )
}
