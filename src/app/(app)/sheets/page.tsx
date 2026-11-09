import { redirect } from 'next/navigation'
import { getSessionMember } from '@/lib/authz'
import { listFolders } from '@/actions/sheets'
import { SheetsHomePage } from '@/components/sheets/pages'

export const dynamic = 'force-dynamic'

/** The Sheets home (spec 013 US8): linked folders, then the team's. */
export default async function SheetsPage() {
  const member = await getSessionMember()
  if (!member) redirect('/login')
  const res = await listFolders()
  if (!res.success) redirect('/board')
  return <SheetsHomePage folders={res.folders} pins={res.pins} now={new Date().toISOString()} />
}
