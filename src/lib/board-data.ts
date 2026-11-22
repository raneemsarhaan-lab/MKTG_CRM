/**
 * Everything the board's views need, loaded once (spec 013 R2). The Board
 * page and the Sheets folders (whose linked tab is the board's own sheet)
 * both call this, so the two can never show different data.
 *
 * Server-only: it reads the database directly.
 */
import { prisma } from '@/lib/prisma'
import { mapMember, mapTask, mapSlaConfig, mapTheme, mapSheetColumn, mapBrand, mapSpace } from '@/lib/mappers'
import { configured as storageConfigured } from '@/lib/storage'

type SessionMember = NonNullable<Awaited<ReturnType<typeof import('@/lib/authz').getSessionMember>>>

/** Columns no one else may load: My notes ('me:<id>') and other members' My tasks sheets. */
const privateSheets = (memberId: string) => ({
  NOT: [{ sheet: { startsWith: 'me:' } }, { AND: [{ sheet: { startsWith: 'tasks:me:' } }, { NOT: { sheet: `tasks:me:${memberId}` } }] }],
})

export async function loadBoardData(member: SessionMember) {
  const now = new Date()
  const [tasks, members, brands, contentTypes, slaRows, themes, reads, snoozes, prefs, sheetColumns, sheetValues, rowHeights, spaces, spaceMembers, taskSpaces] = await Promise.all([
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
      orderBy: [
        { due_date: { sort: 'asc', nulls: 'last' } },
        { created_at: 'desc' },
      ],
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
    // Spec 021: a member's private My notes columns (sheet 'me:<id>') are never loaded for anyone's sheets.
    // T081: a My tasks sheet's columns ('tasks:me:<id>') reach only their owner.
    prisma.sheetColumn.findMany({ where: { deleted_at: null, ...privateSheets(member.id) }, include: { updater: { select: { name: true } } }, orderBy: { position: 'asc' } }),
    prisma.sheetValue.findMany({ where: { column: { deleted_at: null, ...privateSheets(member.id) } }, select: { column_id: true, task_id: true, value: true } }),
    // Row heights on the linked sheets (spec 013 FR-045), shared by the team.
    prisma.linkedRowHeight.findMany({ select: { sheet_kind: true, task_id: true, height: true } }),
    // Spec 021: team Spaces, who is in them, and the Shows in rows — three flat
    // arrays beside the tasks, never a query per task (plan: SC-003).
    prisma.teamSpace.findMany({ where: { archived_at: null }, orderBy: [{ sort_order: 'asc' }, { created_at: 'asc' }] }),
    prisma.teamSpaceMember.findMany({ select: { space_id: true, member_id: true } }),
    prisma.taskSpace.findMany({ select: { task_id: true, space_id: true, added_via: true } }),
  ])
  const linkedRowHeights: { content: Record<string, number>; video: Record<string, number> } = { content: {}, video: {} }
  for (const h of rowHeights) linkedRowHeights[h.sheet_kind === 'linked_video' ? 'video' : 'content'][h.task_id] = h.height
  const values: Record<string, Record<string, string>> = {}
  for (const v of sheetValues) (values[v.column_id] ??= {})[v.task_id] = v.value

  const today = new Date()
  today.setHours(0, 0, 0, 0)

  return {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    initialTasks: tasks.map(mapTask) as any,
    currentUser: mapMember(member),
    members: members.map(mapMember),
    brands: brands.map(mapBrand),
    contentTypes: contentTypes.map(ct => ({ id: ct.id, label: ct.label })),
    slaConfig: mapSlaConfig(slaRows),
    themes: themes.map(mapTheme),
    hasStorage: storageConfigured(),
    sheetColumns: sheetColumns.map(mapSheetColumn),
    sheetValues: values,
    linkedRowHeights,
    spaces: spaces.map(mapSpace),
    spaceMembers,
    taskSpaces: taskSpaces as import('@/types/index').TaskSpace[],
    inbox: {
      readIds:  reads.map(r => r.comment_id),
      snoozes:  Object.fromEntries(snoozes.map(z => [z.task_id, z.until.toISOString()])),
      since:    (prefs?.inbox_since ?? now).toISOString(),
      pinned:   prefs?.inbox_pinned ?? false,
      showWeek: prefs?.show_week ?? false,
    },
    today,
  }
}
