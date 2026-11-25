/**
 * Everything the board's views need, loaded once (spec 013 R2). The Board
 * page and the Sheets folders (whose linked tab is the board's own sheet)
 * both call this, so the two can never show different data.
 *
 * Server-only: it reads the database directly.
 */
import { homeSpace, slaFor, stageRoles } from '@/lib/space-settings'
import { setWorkWeekend } from '@/lib/utils'
import { syncContentSheet } from '@/lib/content-rows-server'
import { prisma } from '@/lib/prisma'
import { cleanFeatures, withResolvedFeatures } from '@/lib/brand-features'
import { cairoToday, dayDate, ruleFromSettings } from '@/lib/due-dates'
import { mapMember, mapTask, mapSlaConfig, mapTheme, mapSheetColumn, mapBrand, mapSpace, mapSpaceStage, mapContentType, mapTaskField, mapTypeField, mapMilestone, mapTemplate, mapContentRow } from '@/lib/mappers'
import { configured as storageConfigured } from '@/lib/storage'

type SessionMember = NonNullable<Awaited<ReturnType<typeof import('@/lib/authz').getSessionMember>>>

/** Columns no one else may load: My notes ('me:<id>') and other members' My tasks sheets. */
const privateSheets = (memberId: string) => ({
  NOT: [{ sheet: { startsWith: 'me:' } }, { AND: [{ sheet: { startsWith: 'tasks:me:' } }, { NOT: { sheet: `tasks:me:${memberId}` } }] }],
})

export async function loadBoardData(member: SessionMember) {
  const now = new Date()
  // Sheet 2b: every theme's pieces have rows, and linked rows follow their tasks.
  await syncContentSheet().catch(e => console.error('[content] sync failed', e))
  const [tasks, members, brands, contentTypes, slaRows, themes, reads, snoozes, prefs, sheetColumns, sheetValues, rowHeights, spaces, spaceMembers, taskSpaces, linkedViews, ws, spaceStages, taskSpaceStages, taskFields, typeFields, fieldValues, milestones, tags, templates, contentRows] = await Promise.all([
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
        // Spec 023 (R9): the other assignees and each person's hours (the lead stays in assignee_id).
        assignees:  { select: { member_id: true, position: true, hours: true }, orderBy: { position: 'asc' } },
        tags:       { select: { tag_id: true } },
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
    // The Content sheet's themes (sheet 2b): the sheet's own list, in its order, each pointing at its project.
    prisma.contentSheetTheme.findMany({
      orderBy: [{ position: 'asc' }, { created_at: 'asc' }],
      select: {
        id: true, position: true, pillar_order: true, space_id: true, sheet_id: true,
        project: { select: {
          id: true, name: true, brand_id: true, owner_id: true, frequency_count: true, frequency_period: true, audience: true,
          pillars: { select: { id: true, name: true, sort_order: true } },
        } },
      },
    }),
    // The Inbox (spec 006): this member's read mentions, live put-offs and prefs.
    prisma.mentionRead.findMany({ where: { member_id: member.id }, select: { comment_id: true } }),
    prisma.taskSnooze.findMany({ where: { member_id: member.id, until: { gt: now } }, select: { task_id: true, until: true } }),
    prisma.member.findUnique({ where: { id: member.id }, select: { inbox_since: true, inbox_pinned: true, show_week: true, board_sorts: true, sheet_layouts: true } }),
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
    // Spec 021 (US3, R5): the Content and Video Spaces' words are their sheet's words.
    prisma.sheet.findMany({ where: { linked_key: { in: ['linked_content', 'linked_video'] } }, select: { linked_key: true, view: true } }),
    // Spec 021 (US4, R11): the workspace's default feature switches for brands.
    prisma.workspaceSettings.findUnique({ where: { id: 1 }, select: { brand_feature_defaults: true, nine_stage_default: true, due_days_before: true, due_weekend_days: true, due_weekend_shift: true, standard_fields: true } }),
    // Spec 022: Space stages and each task's sub-stage — two flat arrays, never a query per task.
    prisma.spaceStage.findMany({ orderBy: [{ space_id: 'asc' }, { stage_id: 'asc' }, { position: 'asc' }] }),
    prisma.taskSpaceStage.findMany({ select: { task_id: true, space_id: true, space_stage_id: true, stage_id: true } }),
    // Spec 023: the field library, what each type carries, every value, and milestones — flat arrays.
    prisma.taskField.findMany({ orderBy: [{ position: 'asc' }, { created_at: 'asc' }] }),
    prisma.taskTypeField.findMany({ orderBy: { position: 'asc' } }),
    prisma.taskFieldValue.findMany({ select: { task_id: true, field_id: true, value: true } }),
    prisma.milestone.findMany({ orderBy: { day: 'asc' } }),
    // Spec 023 (R8): the workspace's tags.
    prisma.tag.findMany({ orderBy: { name: 'asc' }, select: { id: true, name: true, color: true } }),
    // Spec 023 (US7): task templates, for + Task › From template.
    prisma.taskTemplate.findMany({ orderBy: [{ type_label: 'asc' }, { name: 'asc' }] }),
    // Sheet 2b: the Content sheet's rows.
    prisma.contentRow.findMany({ orderBy: [{ position: 'asc' }] }),
  ])
  const linkedRowHeights: { content: Record<string, number>; video: Record<string, number> } = { content: {}, video: {} }
  for (const h of rowHeights) linkedRowHeights[h.sheet_kind === 'linked_video' ? 'video' : 'content'][h.task_id] = h.height
  const values: Record<string, Record<string, string>> = {}
  for (const v of sheetValues) (values[v.column_id] ??= {})[v.task_id] = v.value

  // Today is Cairo's day, at UTC midnight like every stored date (src/lib/due-dates.ts).
  const today = dayDate(cairoToday())

  // Spec 021 (US4): brands carry their switches resolved, and so does each task's brand.
  const brandFeatureDefaults = cleanFeatures(ws?.brand_feature_defaults)
  const resolvedBrands = brands.map(b => withResolvedFeatures(mapBrand(b), brandFeatureDefaults))
  const brandById = new Map(resolvedBrands.map(b => [b.id, b]))
  // Spec 024: each task carries the Space whose rules apply to it, that Space's role per stage
  // and its SLA for the task's current stage (when the Space sets one).
  const liveSpaces = spaces.map(mapSpace)
  const madeIn = new Map(taskSpaces.filter(r => r.added_via === 'created').map(r => [r.task_id, r.space_id]))
  const rolesBySpace = new Map(liveSpaces.map(sp => [sp.id, stageRoles(sp.settings)]))
  const viewTaskRows = tasks.map(mapTask).map(x => {
    const home = homeSpace(x, liveSpaces, madeIn.get(x.id))
    return {
      ...x,
      ...(x.brand_id && brandById.has(x.brand_id) ? { brand: brandById.get(x.brand_id) } : {}),
      home_space_id: home?.id ?? null,
      stage_roles: home ? rolesBySpace.get(home.id) ?? null : null,
      space_sla_days: slaFor(home?.settings, x.status),
    }
  })

  return {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    initialTasks: viewTaskRows as any,
    currentUser: mapMember(member),
    members: members.map(mapMember),
    brands: resolvedBrands,
    brandFeatureDefaults,
    workspaceNineStage: ws?.nine_stage_default ?? false,
    // This member's sort per board; a missing board means due date (the default).
    boardSorts: (prefs?.board_sorts ?? {}) as Record<string, string>,
    // The due-date rule (Settings › Due Dates).
    dueRule: (() => { const r = ruleFromSettings(ws); setWorkWeekend(r.weekend); return r })(),
    contentTypes: [...contentTypes].sort((a, b) => (a.position ?? 0) - (b.position ?? 0) || a.label.localeCompare(b.label)).map(mapContentType),
    taskFields: taskFields.map(mapTaskField),
    typeFields: typeFields.map(mapTypeField),
    fieldValues: fieldValues as import('@/types/index').TaskFieldValueRow[],
    milestones: milestones.map(mapMilestone),
    tags: tags as import('@/types/index').Tag[],
    templates: templates.map(mapTemplate),
    spaceStages: spaceStages.map(mapSpaceStage),
    taskSpaceStages: taskSpaceStages as import('@/types/index').TaskSpaceStage[],
    slaConfig: mapSlaConfig(slaRows),
    // Spec 026: every Space's sheet has its own themes; each carries its Space.
    // Spec 027: the Board tabs' themes and rows; added tabs' themes and rows apart, so nothing else sees them twice.
    themes: themes.filter(th => !th.sheet_id).map(th => mapTheme({ ...th.project, sheet_theme_id: th.id, position: th.position, pillar_order: th.pillar_order, space_id: th.space_id })),
    tabThemes: themes.filter(th => th.sheet_id).map(th => mapTheme({ ...th.project, sheet_theme_id: th.id, position: th.position, pillar_order: th.pillar_order, space_id: null, sheet_id: th.sheet_id })),
    contentRows: contentRows.filter(r => !r.sheet_id).map(mapContentRow),
    tabRows: contentRows.filter(r => r.sheet_id).map(mapContentRow),
    hasStorage: storageConfigured(),
    sheetColumns: sheetColumns.map(mapSheetColumn),
    sheetValues: values,
    linkedRowHeights,
    spaces: liveSpaces,
    // This member's tab choices per page (home, pinned, hidden, last view), so a page opens on the right view at once.
    viewPrefs: ((member as { view_prefs?: unknown }).view_prefs ?? {}) as Record<string, unknown>,
    // Fields (25 Nov 2026): custom fields promoted to Standard, and this person's own sheet columns per view.
    standardFields: (ws?.standard_fields ?? []) as string[],
    myLayouts: ((prefs?.sheet_layouts ?? {}) as Record<string, { cols: string[]; widths?: Record<string, number> }>),
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
