import { redirect } from 'next/navigation'
import { getSessionMember } from '@/lib/authz'
import { KanbanBoard } from '@/components/kanban/KanbanBoard'
import { loadBoardData } from '@/lib/board-data'

export default async function BoardPage() {
  const member = await getSessionMember()
  if (!member) redirect('/login')

  // Shared with the Sheets folders' linked tab (spec 013 R2).
  const data = await loadBoardData(member)

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <KanbanBoard {...data} />
    </div>
  )
}
