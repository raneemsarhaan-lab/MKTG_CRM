import type { loadBoardData } from '@/lib/board-data'
import type { mapTask } from '@/lib/mappers'

/** Everything a Space, brand or My tasks page receives from `loadBoardData`. */
export type BoardData = Awaited<ReturnType<typeof loadBoardData>>
/** One task as the views read it (the loader hands them over untyped for the Board). */
export type ViewTask = ReturnType<typeof mapTask>

export const viewTasks = (d: BoardData): ViewTask[] => d.initialTasks as ViewTask[]
