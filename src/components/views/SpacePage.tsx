'use client'

/**
 * A team Space page (spec 021 US1/US2, design/teams-brands.html): the tasks
 * on this Space's Shows in list, from every brand — as List, Board, Sheet,
 * Calendar or Workload.
 *
 * The Content and Video Spaces' Sheet tab is today's Content sheet and Video
 * sheet, unchanged (FR-012). Other Spaces get theirs with a later stage.
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
import { viewTasks, type BoardData } from './types'

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
        sheetStart ? { key: 'sheet', label: tv('sheet') } : { key: 'sheet', label: tv('sheet'), disabled: true, note: tv('sheetLater') },
        { key: 'calendar', label: tv('calendar') },
        { key: 'workload', label: tv('workload') },
      ]}
      render={tab => {
        if (tab === 'board') return <BoardView data={data} scopeTasks={scope} spaceId={spaceId} />
        if (tab === 'sheet' && sheetStart) return <BoardView data={data} scopeTasks={scope} spaceId={spaceId} start={sheetStart} />
        const body = tab === 'calendar'
          ? <CalendarView tasks={tasks} brands={data.brands} colorBy="brand" onOpen={open} />
          : tab === 'workload'
            ? <WorkloadView tasks={tasks} members={data.members} brands={data.brands} />
            : <ListView tasks={tasks} brands={data.brands} members={data.members} slaConfig={data.slaConfig} today={data.today} canGroupByBrand onOpen={open} />
        return <>{body}<TaskPanel data={data} /></>
      }}
    />
  )
}
