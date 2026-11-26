import { redirect } from 'next/navigation'
import { getSessionMember } from '@/lib/authz'
import { prisma } from '@/lib/prisma'
import { landingFor } from '@/lib/landing'
import { homeSpaceOf } from '@/lib/space-settings-server'

/**
 * QA 26 Nov 2026 (F08): the old all-tasks "Pipeline" page is gone. Its address still works for old links,
 * notifications and bookmarks: a task opens on its Space's board (its home Space, else another Space
 * it shows in that you can open), with the rest of the link kept; without a task you land where the app
 * opens for you.
 */
export const dynamic = 'force-dynamic'

const UUID = /^[0-9a-f-]{36}$/i

export default async function BoardPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const member = await getSessionMember()
  if (!member) redirect('/login')
  const params = await searchParams
  const q = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) if (typeof v === 'string') q.set(k, v)
  const task = q.get('task')
  if (task && UUID.test(task)) {
    const home = await homeSpaceOf(task)
    const rows = await prisma.taskSpace.findMany({ where: { task_id: task }, select: { space: { select: { id: true, key: true, settings: true, archived_at: true, members: { where: { member_id: member.id }, select: { member_id: true } } } } } })
    const canOpen = (s: { archived_at: Date | null; settings: unknown; members: unknown[] }) => !s.archived_at
      && (member.access === 'admin' || s.members.length > 0 || (s.settings as { visibility?: string } | null)?.visibility === 'everyone')
    const own = rows.map(r => r.space).find(s => s.id === home?.id && canOpen(s)) ?? rows.map(r => r.space).find(canOpen)
    if (own) {
      q.set('view', q.get('view') === 'sheet' ? 'sheet' : 'board')
      redirect(`/spaces/${own.key}?${q.toString()}`)
    }
  }
  redirect(await landingFor(member))
}
