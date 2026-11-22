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
import { useTranslations } from 'next-intl'
import { useUIStore } from '@/store/useUIStore'
import type { Task } from '@/types/index'
import { spaceLabel } from '@/components/shared/NavTree/labels'
import { ViewHost } from './ViewHost'
import { ListView } from './ListView'
import { BoardView } from './BoardView'
import { CalendarView } from './CalendarView'
import { WorkloadView } from './WorkloadView'
import { TaskPanel } from './TaskPanel'
import { TaskSheet } from './TaskSheet'
import { viewTasks, viewOptions, type BoardData } from './types'
import { applyView } from '@/lib/view-config'

export function SpacePage({ data, spaceId }: { data: BoardData; spaceId: string }) {
  const t = useTranslations('spaces')
  const tv = useTranslations('views')
  const selectTask = useUIStore(s => s.selectTask)
  const space = data.spaces.find(s => s.id === spaceId)!
  const shown = useMemo(() => new Set(data.taskSpaces.filter(r => r.space_id === spaceId).map(r => r.task_id)), [data.taskSpaces, spaceId])
  const scope = useMemo(() => (task: Task) => shown.has(task.id), [shown])
  const tasks = viewTasks(data).filter(scope)
  const memberNames = data.spaceMembers.filter(r => r.space_id === spaceId)
    .map(r => data.members.find(m => m.id === r.member_id)?.name).filter(Boolean).join(', ')
  const label = spaceLabel(space, t)
  const rule = ['content', 'design', 'video', 'planning'].includes(space.key) ? t(`rules.${space.key}`) : t('rules.other')
  const sheetStart = space.key === 'content' ? 'content' : space.key === 'video' ? 'sheet' : null
  const open = (id: string) => selectTask(id)

  return (
    <ViewHost
      crumbs={[t('teams'), label]}
      title={label}
      tag={t('spaceTag')}
      color={space.color}
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
        if (tab === 'sheet' && sheetStart) return <BoardView key={view?.id} data={data} scopeTasks={inView} spaceId={spaceId} start={sheetStart} />
        // Spec 021 (FR-013a): Spaces without a sheet of their own get the task Sheet.
        const body = tab === 'sheet'
          ? <TaskSheet data={data} tasks={shownTasks.filter(x => !x.dropped_at)} fields={view?.config.fields} label={label} />
          : tab === 'calendar'
            ? <CalendarView tasks={shownTasks} brands={data.brands} colorBy="brand" onOpen={open} />
            : tab === 'workload'
              ? <WorkloadView tasks={shownTasks} members={data.members} brands={data.brands} />
              : <ListView key={view?.id} tasks={shownTasks} brands={data.brands} members={data.members} slaConfig={data.slaConfig} today={data.today} canGroupByBrand initialGroup={view?.config.group} onOpen={open} />
        return <>{body}<TaskPanel data={data} /></>
      }}
    />
  )
}
