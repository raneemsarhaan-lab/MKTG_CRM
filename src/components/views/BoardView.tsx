'use client'

/**
 * Board view for a Space, brand or My tasks (spec 021 US2, FR-013a): the
 * Board itself, hosted, with only this page's tasks. The columns are the
 * pipeline as built, the moves are the Board's own, so nothing here can add a
 * second path around `allowedStages`.
 */
import { KanbanBoard } from '@/components/kanban/KanbanBoard'
import type { ContentTheme, Task } from '@/types/index'
import type { BoardData } from './types'
import { ShownFieldsProvider } from '@/components/fields/CardFields'

export function BoardView({ data, scopeTasks, spaceId, start = 'board', sheetScope, themeScope, boardKey, fields, defaultBrandId }: {
  /** QA 26 Nov 2026 (F04): a Space › Brand folder's or Brand page's brand, for new tasks. */
  defaultBrandId?: string | null
  /** Spec 023: what the page's Fields button shows on cards. */
  fields?: string[]
  /** Which board, for the member's saved sort. */
  boardKey?: string
  data: BoardData
  scopeTasks: (t: Task) => boolean
  spaceId?: string
  start?: 'board' | 'content' | 'sheet'
  sheetScope?: (t: Task) => boolean
  themeScope?: (theme: ContentTheme) => boolean
}) {
  return (
    <ShownFieldsProvider shown={fields}>
    <KanbanBoard
      {...data}
      surface="view"
      sheetsView={start}
      scopeTasks={scopeTasks}
      spaceId={spaceId}
      sheetScope={sheetScope}
      themeScope={themeScope}
      boardKey={boardKey}
      defaultBrandId={defaultBrandId}
    />
    </ShownFieldsProvider>
  )
}
