'use client'

/**
 * The status cell (spec 008 FR-010–FR-012, FR-020–FR-022, research R3): the
 * stage in video words, the real name in a tooltip on hover and keyboard
 * focus, and a menu of exactly the moves the board allows this member.
 */
import { useTranslations } from 'next-intl'
import type { Member, StageId, Task } from '@/types/index'
import { STAGE_META, ALL_STAGES } from '@/lib/stage-meta'
import { STAGE_COLORS } from '@/lib/tokens'
import { allowedStages, nextOnPath } from '@/lib/stage-moves'
import type { MenuItem } from './SheetMenu'

export function useStageNames() {
  const t = useTranslations('sheet')
  return {
    video: (id: StageId) => t(`stage.${id}`),
    real: (id: StageId) => STAGE_META[id]?.label_en ?? id,
  }
}

export function StatusContent({ task, me, tipId }: { task: Task; me: Member; tipId: string }) {
  const t = useTranslations('sheet')
  const names = useStageNames()
  const status = task.status as StageId
  const moves = allowedStages(task, me)
  return (
    <>
      <span className="fx-sheet-status">
        <i className="fx-sheet-dot" style={{ background: STAGE_COLORS[status] }} aria-hidden="true" />
        <span className="fx-sheet-ellipsis">{names.video(status)}</span>
        {moves.length > 0 && <span className="fx-sheet-chev" aria-hidden="true">▾</span>}
      </span>
      <span className="fx-sheet-tip" id={tipId} role="tooltip">
        {t('stageTitle', { video: names.video(status), real: names.real(status) })}
      </span>
    </>
  )
}

/** The status menu, grouped Next / Back to / Skip to. Empty when the member has no moves. */
export function statusMenuItems(
  task: Task, me: Member,
  t: ReturnType<typeof useTranslations>, names: ReturnType<typeof useStageNames>,
  choose: (to: StageId) => void,
): MenuItem[] {
  const moves = allowedStages(task, me)
  if (!moves.length) return []
  const next = nextOnPath(task)
  const i = (s: StageId) => ALL_STAGES.indexOf(s)
  const cur = i(task.status as StageId)
  const item = (s: StageId, group: string, tone?: 'next'): MenuItem => ({
    key: s, group, tone, dot: STAGE_COLORS[s],
    label: names.video(s), hint: names.real(s),
    text: `${names.video(s)} (${names.real(s)})`,
    onSelect: () => choose(s),
  })
  const items: MenuItem[] = []
  if (next && moves.includes(next)) items.push(item(next, t('menu.next'), 'next'))
  moves.filter(s => i(s) < cur).reverse().forEach(s => items.push(item(s, t('menu.backTo'))))
  moves.filter(s => i(s) > cur && s !== next).forEach(s => items.push(item(s, t('menu.skipTo'))))
  return items
}
