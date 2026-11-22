import { redirect } from 'next/navigation'
import { getSessionMember } from '@/lib/authz'
import { loadBoardData } from '@/lib/board-data'
import { MyTasks } from '@/components/me/MyTasks'

/** Me › My tasks (spec 021 FR-013b): your tasks from every brand and Space. */
export default async function MePage() {
  const member = await getSessionMember()
  if (!member) redirect('/login')
  const data = await loadBoardData(member)
  return <MyTasks data={data} />
}
