'use client'

/**
 * A team Space page (spec 021 US1, design/teams-brands.html): the tasks on
 * this Space's Shows in list, from every brand, as List or Board.
 */
import { useMemo } from 'react'
import { useTranslations } from 'next-intl'
import { useUIStore } from '@/store/useUIStore'
import type { Task } from '@/types/index'
import { spaceLabel } from '@/components/shared/NavTree/labels'
import { ViewHost } from './ViewHost'
import { ListView } from './ListView'
import { BoardView } from './BoardView'
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

  return (
    <>
      <ViewHost
        crumbs={[t('teams'), label]}
        title={label}
        tag={t('spaceTag')}
        color={space.color}
        sub={<span style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
          <span data-space-rule>{rule}</span>
          <span>{memberNames ? t('members', { names: memberNames }) : t('noMembers')}</span>
        </span>}
        tabs={[{ key: 'list', label: tv('list') }, { key: 'board', label: tv('board') }]}
        render={tab => tab === 'board'
          ? <BoardView data={data} scopeTasks={scope} spaceId={spaceId} />
          : <><ListView tasks={tasks} brands={data.brands} members={data.members} slaConfig={data.slaConfig} today={data.today} canGroupByBrand onOpen={id => selectTask(id)} /><TaskPanel data={data} /></>}
      />
    </>
  )
}