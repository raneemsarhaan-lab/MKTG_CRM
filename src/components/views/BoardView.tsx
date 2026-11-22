'use client'

/**
 * Board view for a Space, brand or My tasks (spec 021 US2, FR-013a): the
 * Board itself, hosted, with only this page's tasks. The columns are the
 * pipeline as built, the moves are the Board's own, so nothing here can add a
 * second path around `allowedStages`.
 */
import { KanbanBoard } from '@/components/kanban/KanbanBoard'
import type { Task } from '@/types/index'
import type { BoardData } from './types'

export function BoardView({ data, scopeTasks, spaceId, start = 'board' }: {
  data: BoardData
  scopeTasks: (t: Task) => boolean
  spaceId?: string
  start?: 'board' | 'content' | 'sheet'
}) {
  return (
    <KanbanBoard
      {...data}
      surface="view"
      sheetsView={start}
      scopeTasks={scopeTasks}
      spaceId={spaceId}
    />
  )
}
