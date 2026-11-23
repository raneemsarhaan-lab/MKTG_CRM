'use client'

/**
 * A Space's stages in its views (spec 022 US4): the name each task shows, the
 * name typed into a sheet, and the move between sub-stages of one original
 * stage (only this Space's row changes). Optimistic; the server has the say.
 */
import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useLocale } from 'next-intl'
import type { SpaceStage, TaskSpaceStage } from '@/types/index'
import { firstOf, hasOwnStages, matchSpaceStage, spaceStageOf, stagesForSpace, type SpaceStageEntry } from '@/lib/space-stages'
import { moveSubStage } from '@/actions/space-stages'

export interface SpaceStagesApi {
  spaceId: string
  entries: SpaceStageEntry[]
  /** The Space names or splits something; otherwise its views look like the board. */
  own: boolean
  of(task: { id: string; status: string }): SpaceStageEntry | undefined
  name(task: { id: string; status: string }): string
  /** The name of an original stage's first Space stage. */
  stageName(stage: string): string
  match(text: string): SpaceStageEntry | null
  /** Move to another Space stage of the same original stage. Resolves to an error code, or null. */
  sub(task: { id: string; status: string }, entry: SpaceStageEntry): Promise<string | null>
}

export function useSpaceStages(spaceId: string | null | undefined, rows: SpaceStage[] | undefined, taskRows: TaskSpaceStage[] | undefined): SpaceStagesApi | null {
  const locale = useLocale()
  const router = useRouter()
  const [moved, setMoved] = useState<Record<string, { entry: string; stage: string }>>({})
  const entries = useMemo(() => (spaceId ? stagesForSpace(spaceId, rows ?? [], locale) : []), [spaceId, rows, locale])
  if (!spaceId) return null
  const of = (task: { id: string; status: string }) => {
    const m = moved[task.id]
    if (m && m.stage === task.status) {
      const e = entries.find(x => x.id === m.entry)
      if (e) return e
    }
    return spaceStageOf(task, spaceId, entries, taskRows ?? [])
  }
  return {
    spaceId,
    entries,
    own: hasOwnStages(entries),
    of,
    name: task => of(task)?.name ?? task.status,
    stageName: s => firstOf(entries, s)?.name ?? s,
    match: text => matchSpaceStage(text, entries),
    async sub(task, entry) {
      if (entry.stage_id !== task.status) return 'other_stage'
      if (of(task)?.id === entry.id) return null
      const before = moved[task.id]
      setMoved(m => ({ ...m, [task.id]: { entry: entry.id, stage: task.status } }))
      const r = await moveSubStage(task.id, spaceId, entry.id).catch(() => ({ success: false as const, error: 'generic' }))
      if (!r.success) {
        setMoved(m => { const n = { ...m }; if (before) n[task.id] = before; else delete n[task.id]; return n })
        return r.error
      }
      router.refresh()
      return null
    },
  }
}
