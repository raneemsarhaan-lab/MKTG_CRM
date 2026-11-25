'use client'

/**
 * A team Space page (spec 021 US1/US2, design/teams-brands.html): the tasks
 * on this Space's Shows in list, from every brand — as List, Board, Sheet,
 * Calendar or Workload.
 *
 * The Content and Video Spaces' Sheet tab is today's Content sheet and Video
 * sheet, unchanged (FR-012). Other Spaces get the task Sheet (TaskSheet).
 */
import { setWorkWeekend } from '@/lib/utils'
import { useMemo } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { useUIStore } from '@/store/useUIStore'
import type { ContentTheme, StageId, Task } from '@/types/index'
import { STAGE_META } from '@/lib/stage-meta'
import { inRange, mayCreateIn, newTaskLabel, typesForSpace } from '@/lib/space-settings'
import { defaultAssigneeFor } from '@/lib/spaces'
import { TaskForm } from '@/components/shared/TaskForm'
import { useSpaceStages } from '@/components/spaces/useSpaceStages'
import { spaceLabel } from '@/components/shared/NavTree/labels'
import { ViewHost } from './ViewHost'
import { BoardView } from './BoardView'
import { CalendarView } from './CalendarView'
import { ListView } from './ListView'
import { useFieldView } from './useFieldView'
import { TaskPanel } from './TaskPanel'
import { TaskSheet } from './TaskSheet'
import { NodeWorkbook } from './NodeWorkbook'
import { KanbanBoard } from '@/components/kanban/KanbanBoard'
import { viewTasks, viewOptions, fieldsSetup, fieldValuesOf, type BoardData } from './types'
import { applyView, cleanTabPrefs, isFieldViewKey } from '@/lib/view-config'
import { fieldOnIn } from '@/lib/field-catalog'
import { isLinkedMedia } from '@/lib/media'
import { MediaCreateButton } from '@/components/media/MediaLinks'
import { SpaceSettingsPanel } from '@/components/spaces/SpaceSettings'
import { BrandMark, SpaceIcon, SpacesIcon, useFavourite } from './simple-head'
import { useState as useStateSH } from 'react'

const brandShort = (b: { name: string; short_name?: string | null }) => b.short_name?.trim() || b.name

export function SpacePage({ data, spaceId, brandId = null }: {
  data: BoardData; spaceId: string
  /** Spec 025: a Space › Brand folder — only this brand's tasks in the Space. */
  brandId?: string | null
}) {
  setWorkWeekend(data.dueRule?.weekend)
  const t = useTranslations('spaces')
  const tv = useTranslations('views')
  const selectTask = useUIStore(s => s.selectTask)
  const space = data.spaces.find(s => s.id === spaceId)!
  const shown = useMemo(() => new Set(data.taskSpaces.filter(r => r.space_id === spaceId).map(r => r.task_id)), [data.taskSpaces, spaceId])
  // Spec 022: a media board (Design, Video) shows its media tasks; other Spaces show content tasks,
  // with linked media tasks seen through their content task's chips.
  const board = space.media_board ?? null
  // Spec 024 (§2): its views show only the stages from "Starts at" to "Ends at".
  const flow = space.settings.flow
  // Spec 025 (§2): a folder is one brand.
  const folderBrand = brandId ? data.brands.find(b => b.id === brandId) ?? null : null
  const brandIds = useMemo(() => (brandId ? [brandId] : []), [brandId])
  // Owner, 25 Nov 2026: a content task handed to a board shows on it and stays in Content (it isn't copied).
  const scope = useMemo(() => (task: Task) => shown.has(task.id) && (board ? (!task.media_board || task.media_board === board) : !isLinkedMedia(task)) && (task.kind === 'simple' || inRange(flow, task.status))
    && (!brandIds.length || (!!task.brand_id && brandIds.includes(task.brand_id))), [shown, board, flow, brandIds])
  const themeScope = useMemo(() => (brandIds.length ? (th: ContentTheme) => !!th.brand_id && brandIds.includes(th.brand_id) : undefined), [brandIds])
  const tasks = viewTasks(data).filter(scope)
  const label = spaceLabel(space, t)
  const sheetStart = space.key === 'content' ? 'content' : space.key === 'video' ? 'sheet' : null
  const open = (id: string) => selectTask(id)
  // Fields (§5): saved views filter, sort and group by any field on in this Space.
  const fv = useFieldView(data)
  const custom = useMemo(() => ({ fields: data.taskFields, links: data.typeFields, values: fieldValuesOf(data), types: data.contentTypes, tags: data.tags }), [data])
  // Spec 024 (§3): the Space's own text for the add button, and who may create here.
  const showTaskForm = useUIStore(s => s.showTaskForm)
  const setShowTaskForm = useUIStore(s => s.setShowTaskForm)
  const memberIds = data.spaceMembers.filter(r => r.space_id === spaceId).map(r => r.member_id)
  const mayCreate = mayCreateIn(space.settings, data.currentUser, memberIds)
  // Spec 021 (US3): this Space's own words for the stages. Boards keep the board names.
  const locale = useLocale()
  // Spec 022 (US4): this Space's stages (renamed or split); boards elsewhere keep the original names.
  const ss = useSpaceStages(spaceId, data.spaceStages, data.taskSpaceStages)
  const stageName = (s: StageId) => ss?.stageName(s) ?? (locale === 'ar' ? STAGE_META[s]?.label_ar : STAGE_META[s]?.label_en) ?? s
  const statusName = (x: Task) => ss?.name(x) ?? stageName(x.status as StageId)
  const addLabel = newTaskLabel(space.settings, locale, t('config.newLabelDefault'))
  // The add form, on the tabs that don't carry a board of their own.
  const taskForm = showTaskForm && (
    <TaskForm currentUser={data.currentUser} brands={data.brands} contentTypes={typesForSpace(space.settings, data.contentTypes)} members={data.members}
      spaceId={spaceId} spaceAssignees={{ [spaceId]: defaultAssigneeFor(space, data.members, memberIds) }} dueRule={data.dueRule} />
  )

  // Simple sheet header (user, 25 Nov 2026): Spaces / Content / [logo] Forefront ☆, the settings icon, "+ Post".
  const [settingsOpen, setSettingsOpen] = useStateSH(false)
  const fav = useFavourite({ href: folderBrand ? `/spaces/${space.key}/${folderBrand.id}` : `/spaces/${space.key}`, label: folderBrand ? `${label} · ${brandShort(folderBrand)}` : label, color: folderBrand?.color ?? space.color }, data.favourites)
  const simple = {
    crumbs: [
      { label: t('teams'), icon: <SpacesIcon /> },
      { label, icon: <SpaceIcon />, href: folderBrand ? `/spaces/${space.key}` : undefined },
      ...(folderBrand ? [{ label: brandShort(folderBrand), icon: <BrandMark brand={folderBrand} /> }] : []),
    ],
    favourite: fav,
    settings: data.currentUser.access !== 'user' ? { label: t('config.open'), open: () => setSettingsOpen(true) } : null,
    add: mayCreate
      ? (space.media_board
        ? { label: addLabel, node: <MediaCreateButton board={space.media_board} boardName={space.name} brands={data.brands} label={addLabel} split /> }
        : { label: addLabel, onClick: () => setShowTaskForm(true) })
      : null,
  }

  return (
    <>
    {settingsOpen && <SpaceSettingsPanel space={space} data={data} onClose={() => setSettingsOpen(false)} />}
    <ViewHost
      simple={simple}
      crumbs={folderBrand ? [t('teams'), label, brandShort(folderBrand)] : [t('teams'), label]}
      title={folderBrand ? `${label} · ${brandShort(folderBrand)}` : label}
      tag={folderBrand ? t('folderTag') : t('spaceTag')}
      color={folderBrand?.color ?? space.color}
      actions={<>
        {mayCreate && (space.media_board
          ? <MediaCreateButton board={space.media_board} boardName={space.name} brands={data.brands} label={addLabel} />
          : <button type="button" data-space-add onClick={() => setShowTaskForm(true)}
              style={{ border: 'none', background: '#14131A', color: '#FFFFFF', borderRadius: 9, padding: '6px 12px', fontFamily: 'inherit', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>＋ {addLabel}</button>)}
        {/* Settings: the header's settings icon opens the same panel (simple header). */}
      </>}
      defaultTab={space.settings.views.default}
      initialPrefs={cleanTabPrefs(data.viewPrefs[folderBrand ? `space:${spaceId}:brand:${folderBrand.id}` : `space:${spaceId}`])}
      tabs={[
        { key: 'board', label: tv('board') },
        { key: 'sheet', label: tv('sheet') },
        { key: 'calendar', label: tv('calendar') },
      ]}
      node={folderBrand ? `space:${spaceId}:brand:${folderBrand.id}` : `space:${spaceId}`}
      viewTypes={['board', 'sheet', 'calendar', 'list']}
      // The built-in Sheet tab is the Space's workbook, with its own Fields; the page's Fields is for the Board and saved views.
      builtInFields={['board', 'list']}
      options={viewOptions(data, tasks)}
      fields={fieldsSetup(data, tasks)}
      // Fields (§5): a custom field this Space has turned off can still filter (with a note); it isn't offered.
      fieldPicker={fv.picker(tasks, key => fieldOnIn(key, space.settings.fields, data.standardFields ?? [], key.startsWith('f:') ? data.taskFields.find(f => f.id === key.slice(2)) ?? null : null))}
      lead={data.currentUser.access !== 'user'}
      render={(tab, view, shownKeys) => {
        // A saved view narrows the Space's tasks by its filters and orders them by its sort.
        const shownTasks = view ? applyView(tasks, view.config, fv.valueOf) : tasks
        const ids = view ? new Set(shownTasks.map(x => x.id)) : null
        const inView = ids ? (x: Task) => scope(x) && ids.has(x.id) : scope
        if (tab === 'board') return <BoardView key={view?.id} fields={shownKeys} data={data} scopeTasks={inView} spaceId={spaceId} />
        // Spec 026: every Space's Sheet view is its sheet of rows — themes, pillars, plain and linked rows —
        // inside a full workbook (tabs, toolbar, formatting, comments, blank tabs). The Content and Video
        // Spaces keep the workbooks their sheets always had, so formatting and comments carry over.
        // Spec 027: a saved Sheet view is the new sheet too, narrowed by the view's filters.
        // Fields (§5): a saved List view, grouped by its grouping (a field included).
        if (tab === 'list') return <>
          <ListView key={view?.id} fields={shownKeys} custom={custom} tasks={shownTasks} brands={data.brands} members={data.members} slaConfig={data.slaConfig} today={data.today}
            canGroupByBrand={!folderBrand} stageName={stageName} spaceStages={ss} onOpen={open}
            initialGroup={view && !isFieldViewKey(view.config.group) ? view.config.group : null} fieldGroups={view ? fv.groupsFor(view.config, shownTasks) : null} />
          <TaskPanel data={data} spaceId={spaceId} />{taskForm}
        </>
        if (tab === 'sheet') return (<>
          <NodeWorkbook key={view?.id} data={data} brandId={brandId} {...(space.key === 'content' || space.key === 'video' ? { folder: space.key as 'content' | 'video' } : { node: `space:${spaceId}` })}
            linked={<KanbanBoard {...data} surface="sheets" sheetsView="content" scopeTasks={inView} spaceId={spaceId}
              themeScope={themeScope} sheetBrandId={brandId} narrowed={!!view} />}
            // Spec 027 (US3): "+" adds a tab of rows; linked, its rows are tasks on this Space's board.
            spaceId={spaceId}
            rowsTab={s => <KanbanBoard {...data} surface="sheets" sheetsView="content" spaceId={spaceId} sheetBrandId={brandId}
              tabSheet={{ id: s.id, linked: !!s.linked, spaceId: s.spaceId ?? spaceId }} />} />
          {taskForm}
        </>)
        const body = <CalendarView tasks={shownTasks} brands={data.brands} colorBy={folderBrand ? 'stage' : 'brand'} statusName={statusName} onOpen={open}
              milestones={{ list: data.milestones, brandIds: [...new Set(shownTasks.map(x => x.brand_id).filter(Boolean))] as string[], canEdit: data.currentUser.access !== 'user' }}
              link={board ? undefined : { spaceId, media: viewTasks(data) }} />
        return <>{body}<TaskPanel data={data} spaceId={spaceId} />{taskForm}</>
      }}
    />
    </>
  )
}
