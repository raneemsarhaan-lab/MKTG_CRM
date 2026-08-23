import { redirect } from 'next/navigation'
import { getSessionMember } from '@/lib/authz'
import { prisma } from '@/lib/prisma'
import { mapMember, mapTask, mapSlaConfig } from '@/lib/mappers'
import { KanbanBoard } from '@/components/kanban/KanbanBoard'
import { configured as storageConfigured } from '@/lib/storage'

export default async function BoardPage() {
  const member = await getSessionMember()
  if (!member) redirect('/login')

  const [tasks, members, brands, contentTypes, slaRows] = await Promise.all([
    prisma.task.findMany({
      include: {
        brand:      true,
        // Names only — the card shows the project under the brand, and the
        // panel shows it in Fields. Two short strings per task.
        project:    { select: { id: true, name: true } },
        task_owner: true,
        assignee:   true,
        comments:   { include: { author: true }, orderBy: { created_at: 'asc' } },
        // Never `true` here. This query reads every task, and an uploaded
        // file is inlined in `data` — pulling those across 300 rows would be
        // megabytes on every board load. The card cover only needs `url`;
        // the task panel loads its own task's files when it opens.
        attachments: {
          select: {
            id: true, task_id: true, filename: true, url: true,
            uploaded_at: true, uploaded_by: true,
          },
        },
        // The plan step this task delivers, if any — names only, so the panel
        // can show which project a task belongs to without a second request.
        project_step: {
          select: { id: true, name: true, project: { select: { id: true, name: true } } },
        },
        parent:     { select: { id: true, name: true } },
        subtasks:   { select: { id: true, name: true, status: true }, orderBy: { created_at: 'asc' } },
      },
      orderBy: { created_at: 'desc' },
    }),
    prisma.member.findMany({ orderBy: { name: 'asc' } }),
    prisma.brand.findMany({ orderBy: { name: 'asc' } }),
    prisma.contentType.findMany({ orderBy: { label: 'asc' } }),
    prisma.slaConfig.findMany(),
  ])

  const today = new Date()
  today.setHours(0, 0, 0, 0)

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <KanbanBoard
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        initialTasks={tasks.map(mapTask) as any}
        currentUser={mapMember(member)}
        members={members.map(mapMember)}
        brands={brands.map(b => ({ id: b.id, name: b.name, color: b.color, logo_url: b.logo_url ?? undefined, description: b.description ?? undefined }))}
        contentTypes={contentTypes.map(ct => ({ id: ct.id, label: ct.label }))}
        slaConfig={mapSlaConfig(slaRows)}
        hasStorage={storageConfigured()}
        today={today}
      />
    </div>
  )
}
