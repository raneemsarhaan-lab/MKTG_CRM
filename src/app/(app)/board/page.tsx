import { redirect } from 'next/navigation'
import { getSessionMember } from '@/lib/authz'
import { prisma } from '@/lib/prisma'
import { mapMember, mapTask, mapSlaConfig, mapTheme, mapSheetColumn } from '@/lib/mappers'
import { KanbanBoard } from '@/components/kanban/KanbanBoard'
import { configured as storageConfigured } from '@/lib/storage'

export default async function BoardPage() {
  const member = await getSessionMember()
  if (!member) redirect('/login')

  const now = new Date()
  const [tasks, members, brands, contentTypes, slaRows, themes, reads, snoozes, prefs, sheetColumns, sheetValues] = await Promise.all([
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
            // Tells a Drive link (text/uri-list) from a file (spec 008 R7).
            content_type: true,
            // Working doc or design, for the Content sheet (spec 009).
            link_role: true,
          },
        },
        // The plan step this task delivers, if any — names only, so the panel
        // can show which project a task belongs to without a second request.
        project_step: {
          select: { id: true, name: true, project: { select: { id: true, name: true } } },
        },
        parent:     { select: { id: true, name: true } },
        subtasks:   { select: { id: true, name: true, status: true, dropped_at: true }, orderBy: { created_at: 'asc' } },
        // A clip's details, for the video sheet (spec 008). Small: numbers and two short strings.
        clip: {
          select: { clip_no: true, source: true, file_name: true, in_ms: true, out_ms: true, video_id: true, created_at: true },
        },
      },
      orderBy: { created_at: 'desc' },
    }),
    prisma.member.findMany({ orderBy: { name: 'asc' } }),
    prisma.brand.findMany({ orderBy: { name: 'asc' } }),
    prisma.contentType.findMany({ orderBy: { label: 'asc' } }),
    prisma.slaConfig.findMany(),
    // The Content sheet's themes (spec 009): flagged projects, with their pillars.
    prisma.project.findMany({
      where: { is_theme: true },
      orderBy: [{ sort_order: 'asc' }, { created_at: 'asc' }],
      select: {
        id: true, name: true, brand_id: true, owner_id: true, frequency_count: true, frequency_period: true, audience: true,
        pillars: { select: { id: true, name: true, sort_order: true } },
      },
    }),
    // The Inbox (spec 006): this member's read mentions, live put-offs and prefs.
    prisma.mentionRead.findMany({ where: { member_id: member.id }, select: { comment_id: true } }),
    prisma.taskSnooze.findMany({ where: { member_id: member.id, until: { gt: now } }, select: { task_id: true, until: true } }),
    prisma.member.findUnique({ where: { id: member.id }, select: { inbox_since: true, inbox_pinned: true, show_week: true } }),
    // Sheet columns the team has shaped, and custom values (spec 010).
    prisma.sheetColumn.findMany({ where: { deleted_at: null }, include: { updater: { select: { name: true } } }, orderBy: { position: 'asc' } }),
    prisma.sheetValue.findMany({ where: { column: { deleted_at: null } }, select: { column_id: true, task_id: true, value: true } }),
  ])
  const values: Record<string, Record<string, string>> = {}
  for (const v of sheetValues) (values[v.column_id] ??= {})[v.task_id] = v.value

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
        themes={themes.map(mapTheme)}
        hasStorage={storageConfigured()}
        sheetColumns={sheetColumns.map(mapSheetColumn)}
        sheetValues={values}
        inbox={{
          readIds:  reads.map(r => r.comment_id),
          snoozes:  Object.fromEntries(snoozes.map(z => [z.task_id, z.until.toISOString()])),
          since:    (prefs?.inbox_since ?? now).toISOString(),
          pinned:   prefs?.inbox_pinned ?? false,
          showWeek: prefs?.show_week ?? false,
        }}
        today={today}
      />
    </div>
  )
}
