'use client'

/**
 * The task panel for views that aren't the Board (List, Calendar, Sheet):
 * the same TaskModal, opened from the shared `selectedTaskId`.
 */
import { createTask } from '@/actions/tasks'
import { useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { setValue } from '@/actions/sheet-columns'
import { TaskLinksSection, taskLinkFields } from '@/components/kanban/TaskLinks'
import { MediaPanelSection } from '@/components/media/MediaLinks'
import { useUIStore } from '@/store/useUIStore'
import { TaskModal } from '@/components/kanban/TaskModal'
import { CardFieldsProvider } from '@/components/fields/CardFields'
import { viewTasks, type BoardData } from './types'

export function TaskPanel({ data }: { data: BoardData }) {
  const selectedTaskId = useUIStore(s => s.selectedTaskId)
  const selectTask = useUIStore(s => s.selectTask)
  // A task link (?task=<id>) opens its panel here too, as it does on the Board.
  const linked = useSearchParams().get('task')
  const router = useRouter()
  useEffect(() => { if (linked) selectTask(linked) }, [linked, selectTask])
  const tasks = viewTasks(data)
  const task = tasks.find(t => t.id === selectedTaskId)
  if (!task) return null
  return (
    // Spec 023: the panel's task fields (Channels, Caption, TOV…) read the page's field data.
    <CardFieldsProvider fields={data.taskFields} links={data.typeFields} values={data.fieldValues} types={data.contentTypes} members={data.members}
      taskName={id => tasks.find(x => x.id === id)?.name}>
    <TaskModal
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      task={task as any}
      currentUser={data.currentUser}
      stages={[]}
      slaConfig={data.slaConfig}
      today={data.today}
      dueDaysBefore={data.dueRule.daysBefore}
      brands={data.brands}
      members={data.members}
      contentTypes={data.contentTypes}
      allTasks={tasks.map(t => ({ id: t.id, name: t.name, status: t.status }))}
      hasStorage={data.hasStorage}
      spaces={data.spaces}
      taskSpaces={data.taskSpaces}
      linksSection={<>
        <MediaPanelSection key={`m-${task.id}`} task={task as never} tasks={tasks as never} onOpenTask={id => selectTask(id)} />
        <TaskLinksSection key={task.id} taskId={task.id} brandId={task.brand_id}
          fields={taskLinkFields(data.sheetColumns, data.sheetValues, task.id)}
          ctx={{ tasks, spaces: data.spaces, brands: data.brands, me: data.currentUser, workspaceNineStage: data.workspaceNineStage,
            openTask: id => selectTask(id), onCreated: () => router.refresh(), create: createTask }}
          set={async (columnId, value) => { const r = await setValue(columnId, task.id, value).catch(() => ({ success: false })); router.refresh(); return r.success }} />
      </>}
      onClose={() => selectTask(null)}
    />
    </CardFieldsProvider>
  )
}
