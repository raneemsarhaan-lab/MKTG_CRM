import { redirect } from 'next/navigation'
import { getSessionMember } from '@/lib/authz'
import { loadBoardData } from '@/lib/board-data'
import { prisma } from '@/lib/prisma'
import { cairoToday } from '@/lib/due-dates'
import { MyTasksPage } from '@/components/mytasks/MyTasksPage'
import { toTodo } from '@/actions/todos'

export const dynamic = 'force-dynamic'

/** My tasks (user, 2026-11-23): my pipeline tasks and my private to-dos, Reminders-style. */
export default async function MyTasksRoute() {
  const member = await getSessionMember()
  if (!member) redirect('/login')
  const [data, todos] = await Promise.all([
    loadBoardData(member),
    prisma.todo.findMany({ where: { owner_id: member.id, done_at: null }, orderBy: [{ day: 'asc' }, { created_at: 'asc' }] }),
  ])
  return <MyTasksPage data={data} todos={await Promise.all(todos.map(toTodo))} today={cairoToday()} />
}
