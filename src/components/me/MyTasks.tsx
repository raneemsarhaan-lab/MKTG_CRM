'use client'

/**
 * Me › My tasks (spec 021 FR-013b, design/noran-workspace.html): every task
 * assigned to me, plus every task I own that someone else is working on now
 * (handed off), across all brands and Spaces. Show: All mine, Assigned to me,
 * Handed off. The List groups them as Working on, Handed off · I own it,
 * Planning and Published.
 */
import { useMemo, useState } from 'react'
import { useTranslations } from 'next-intl'
import { useUIStore } from '@/store/useUIStore'
import type { Task } from '@/types/index'
import { PIPE } from '@/lib/pipeline-tokens'
import { ViewHost } from '@/components/views/ViewHost'
import { ListView } from '@/components/views/ListView'
import { BoardView } from '@/components/views/BoardView'
import { CalendarView } from '@/components/views/CalendarView'
import { TaskPanel } from '@/components/views/TaskPanel'
import { TaskSheet } from '@/components/views/TaskSheet'
import { viewTasks, type BoardData, type ViewTask } from '@/components/views/types'

type Show = 'all' | 'assigned' | 'handed'
const finished = (t: Task) => (t.kind === 'simple' ? t.simple_status === 's-done' : t.status === 'publish')

export function MyTasks({ data }: { data: BoardData }) {
  const t = useTranslations('me')
  const tv = useTranslations('views')
  const ts = useTranslations('spaces')
  const selectTask = useUIStore(s => s.selectTask)
  const me = data.currentUser.id
  const [show, setShow] = useState<Show>('all')
  const scope = useMemo(() => (x: Task) => {
    const assigned = x.assignee_id === me
    const handed = x.task_owner_id === me && x.assignee_id !== me
    return show === 'assigned' ? assigned : show === 'handed' ? handed : assigned || handed
  }, [me, show])
  const tasks = viewTasks(data).filter(x => !x.dropped_at && scope(x))
  const open = (id: string) => selectTask(id)

  const groups: [string, ViewTask[]][] = [
    [t('working'), tasks.filter(x => x.assignee_id === me && !finished(x) && x.kind !== 'simple')],
    [t('handedGroup'), tasks.filter(x => x.assignee_id !== me && !finished(x))],
    [t('planning'), tasks.filter(x => x.kind === 'simple' && !finished(x))],
    [t('published'), tasks.filter(finished)],
  ]

  const filter = (
    <div role="group" aria-label={t('show')} style={{ display: 'inline-flex', border: `1px solid ${PIPE.border}`, borderRadius: 10, overflow: 'hidden' }}>
      {(['all', 'assigned', 'handed'] as const).map(k => (
        <button key={k} type="button" data-show={k} aria-pressed={show === k} onClick={() => setShow(k)}
          style={{ border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: 12.5, fontWeight: 600, padding: '6px 11px', background: show === k ? PIPE.ink : '#FFFFFF', color: show === k ? '#FFFFFF' : PIPE.ink }}>
          {t(k)}
        </button>
      ))}
    </div>
  )

  return (
    <ViewHost
      crumbs={[ts('me'), t('title')]}
      title={t('title')}
      tag={t('tag')}
      sub={t('lede')}
      actions={filter}
      tabs={[
        { key: 'list', label: tv('list') },
        { key: 'calendar', label: tv('calendar') },
        { key: 'board', label: tv('board') },
        { key: 'sheet', label: tv('sheet') },
      ]}
      render={tab => {
        if (tab === 'board') return <BoardView key={show} data={data} scopeTasks={scope} />
        // FR-013b: the same groups as the List, with a private My notes column.
        if (tab === 'sheet') return <><TaskSheet data={data} tasks={tasks} groups={groups.filter(([, g]) => g.length)} notes label={t('title')} /><TaskPanel data={data} /></>
        if (tab === 'calendar') return <><CalendarView tasks={tasks} brands={data.brands} colorBy="brand" onOpen={open} /><TaskPanel data={data} /></>
        return (
          <div data-my-tasks>
            {groups.filter(([, g]) => g.length).map(([label, g]) => (
              <section key={label} data-my-group={label}>
                <h2 style={{ margin: '16px 38px 0', fontSize: 12, fontWeight: 800, letterSpacing: '.08em', textTransform: 'uppercase', color: PIPE.textMuted }}>{label} · {g.length}</h2>
                <ListView tasks={g} brands={data.brands} members={data.members} slaConfig={data.slaConfig} today={data.today} canGroupByBrand onOpen={open} />
              </section>
            ))}
            <TaskPanel data={data} />
          </div>
        )
      }}
    />
  )
}
