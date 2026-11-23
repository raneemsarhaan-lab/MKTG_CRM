'use client'

/**
 * A team Space page (spec 021 US1/US2, design/teams-brands.html): the tasks
 * on this Space's Shows in list, from every brand — as List, Board, Sheet,
 * Calendar or Workload.
 *
 * The Content and Video Spaces' Sheet tab is today's Content sheet and Video
 * sheet, unchanged (FR-012). Other Spaces get the task Sheet (TaskSheet).
 */
import { useMemo } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { useUIStore } from '@/store/useUIStore'
import type { StageId, Task } from '@/types/index'
import { STAGE_META } from '@/lib/stage-meta'
import { SpaceStagesButton } from '@/components/spaces/SpaceStages'
import { useSpaceStages } from '@/components/spaces/useSpaceStages'
import { spaceLabel } from '@/components/shared/NavTree/labels'
import { ViewHost } from './ViewHost'
import { ListView } from './ListView'
import { BoardView } from './BoardView'
import { CalendarView } from './CalendarView'
import { WorkloadView } from './WorkloadView'
import { TaskPanel } from './TaskPanel'
import { TaskSheet } from './TaskSheet'
import { NodeWorkbook } from './NodeWorkbook'
import { KanbanBoard } from '@/components/kanban/KanbanBoard'
import { viewTasks, viewOptions, type BoardData } from './types'
import { applyView } from '@/lib/view-config'
import { isLinkedMedia } from '@/lib/media'
import { MediaCreateButton } from '@/components/media/MediaLinks'

export function SpacePage({ data, spaceId }: { data: BoardData; spaceId: string }) {
  const t = useTranslations('spaces')
  const tv = useTranslations('views')
  const selectTask = useUIStore(s => s.selectTask)
  const space = data.spaces.find(s => s.id === spaceId)!
  const shown = useMemo(() => new Set(data.taskSpaces.filter(r => r.space_id === spaceId).map(r => r.task_id)), [data.taskSpaces, spaceId])
  // Spec 022: a media board (Design, Video) shows its media tasks; other Spaces show content tasks,
  // with linked media tasks seen through their content task's chips.
  const board = space.media_board ?? null
  const scope = useMemo(() => (task: Task) => shown.has(task.id) && (board ? task.media_board === board : !isLinkedMedia(task)), [shown, board])
  const tasks = viewTasks(data).filter(scope)
  const memberNames = data.spaceMembers.filter(r => r.space_id === spaceId)
    .map(r => data.members.find(m => m.id === r.member_id)?.name).filter(Boolean).join(', ')
  const label = spaceLabel(space, t)
  const rule = ['content', 'design', 'video', 'planning'].includes(space.key) ? t(`rules.${space.key}`) : t('rules.other')
  const sheetStart = space.key === 'content' ? 'content' : space.key === 'video' ? 'sheet' : null
  const open = (id: string) => selectTask(id)
  // Spec 021 (US3): this Space's own words for the stages. Boards keep the board names.
  const locale = useLocale()
  const tSheet = useTranslations('taskSheet')
  // Spec 022 (US4): this Space's stages (renamed or split); boards elsewhere keep the original names.
  const ss = useSpaceStages(spaceId, data.spaceStages, data.taskSpaceStages)
  const stageName = (s: StageId) => ss?.stageName(s) ?? (locale === 'ar' ? STAGE_META[s]?.label_ar : STAGE_META[s]?.label_en) ?? s
  const statusName = (x: Task) => ss?.name(x) ?? stageName(x.status as StageId)

  return (
    <ViewHost
      crumbs={[t('teams'), label]}
      title={label}
      tag={t('spaceTag')}
      color={space.color}
      actions={<>{space.media_board && <MediaCreateButton board={space.media_board} boardName={space.name} brands={data.brands} />}{data.currentUser.access !== 'user' && <SpaceStagesButton space={space} rows={data.spaceStages} />}</>}
      sub={<span style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
        <span data-space-rule>{rule}</span>
        <span>{memberNames ? t('members', { names: memberNames }) : t('noMembers')}</span>
      </span>}
      tabs={[
        { key: 'list', label: tv('list') },
        { key: 'board', label: tv('board') },
        { key: 'sheet', label: tv('sheet') },
        { key: 'calendar', label: tv('calendar') },
        { key: 'workload', label: tv('workload') },
      ]}
      node={`space:${spaceId}`}
      viewTypes={['list', 'board', 'sheet', 'calendar', 'workload']}
      options={viewOptions(data, tasks)}
      lead={data.currentUser.access !== 'user'}
      render={(tab, view) => {
        // A saved view narrows the Space's tasks by its filters and orders them by its sort.
        const shownTasks = view ? applyView(tasks, view.config) : tasks
        const ids = view ? new Set(shownTasks.map(x => x.id)) : null
        const inView = ids ? (x: Task) => scope(x) && ids.has(x.id) : scope
        if (tab === 'board') return <BoardView key={view?.id} data={data} scopeTasks={inView} spaceId={spaceId} />
        // T081: every Sheet tab is a full workbook (tabs, toolbar, formatting, comments, blank tabs).
        if (tab === 'sheet' && sheetStart) return (
          <NodeWorkbook key={view?.id} data={data} folder={space.key as 'content' | 'video'}
            linked={<KanbanBoard {...data} surface="sheets" sheetsView={sheetStart} scopeTasks={inView} spaceId={spaceId} />} />
        )
        // Spec 021 (FR-013a): Spaces without a sheet of their own get the task Sheet.
        const body = tab === 'sheet'
          ? <NodeWorkbook key={view?.id} data={data} node={`space:${spaceId}`}
              linked={<TaskSheet data={data} tasks={shownTasks.filter(x => !x.dropped_at)} fields={view?.config.fields} sheetKey={`tasks:space:${spaceId}`} stages={ss} label={label} />} />
          : tab === 'calendar'
            ? <CalendarView tasks={shownTasks} brands={data.brands} colorBy="brand" statusName={statusName} onOpen={open}
                link={board ? undefined : { spaceId, media: viewTasks(data) }} />
            : tab === 'workload'
              ? <WorkloadView tasks={shownTasks} members={data.members} brands={data.brands} />
              : <ListView key={view?.id} tasks={shownTasks} brands={data.brands} members={data.members} slaConfig={data.slaConfig} today={data.today} canGroupByBrand stageName={stageName} spaceStages={ss} initialGroup={view?.config.group} onOpen={open} />
        return <>{body}<TaskPanel data={data} /></>
      }}
    />
  )
}
