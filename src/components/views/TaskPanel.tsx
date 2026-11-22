'use client'

/**
 * The task panel for views that aren't the Board (List, Calendar, Sheet):
 * the same TaskModal, opened from the shared `selectedTaskId`.
 */
import { useEffect } from 'react'
import { useSearchParams } from 'next/navigation'
import { useUIStore } from '@/store/useUIStore'
import { TaskModal } from '@/components/kanban/TaskModal'
import { viewTasks, type BoardData } from './types'

export function TaskPanel({ data }: { data: BoardData }) {
  const selectedTaskId = useUIStore(s => s.selectedTaskId)
  const selectTask = useUIStore(s => s.selectTask)
  // A task link (?task=<id>) opens its panel here too, as it does on the Board.
  const linked = useSearchParams().get('task')
  useEffect(() => { if (linked) selectTask(linked) }, [linked, selectTask])
  const tasks = viewTasks(data)
  const task = tasks.find(t => t.id === selectedTaskId)
  if (!task) return null
  return (
    <TaskModal
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      task={task as any}
      currentUser={data.currentUser}
      stages={[]}
      slaConfig={data.slaConfig}
      today={data.today}
      brands={data.brands}
      members={data.members}
      contentTypes={data.contentTypes}
      allTasks={tasks.map(t => ({ id: t.id, name: t.name, status: t.status }))}
      hasStorage={data.hasStorage}
      spaces={data.spaces}
      taskSpaces={data.taskSpaces}
      onClose={() => selectTask(null)}
    />
  )
}
