'use client'

/**
 * The status cell (spec 008 FR-010–FR-012, FR-020–FR-022, research R3): the
 * stage in video words, the real name in a tooltip on hover and keyboard
 * focus, and a menu of exactly the moves the board allows this member.
 */
import { useTranslations } from 'next-intl'
import type { Member, StageId, Task } from '@/types/index'
import { STAGE_META, ALL_STAGES } from '@/lib/stage-meta'
import { STAGE_COLORS, stageTint } from '@/lib/tokens'
import { allowedStages, nextOnPath } from '@/lib/stage-moves'
import type { MenuItem } from './SheetMenu'

/** Stage names for a sheet: video words (spec 008) or content words (spec 009). */
export function useStageNames(ns: 'sheet' | 'content' = 'sheet') {
  const t = useTranslations(ns)
  return {
    video: (id: StageId) => t(`stage.${id}`),
    real: (id: StageId) => STAGE_META[id]?.label_en ?? id,
  }
}

export function StatusContent({ task, me, tipId, ns = 'sheet' }: { task: Task; me: Member; tipId: string; ns?: 'sheet' | 'content' }) {
  const t = useTranslations(ns)
  const names = useStageNames(ns)
  const status = task.status as StageId
  const moves = allowedStages(task, me)
  return (
    <>
      <StagePill stage={status} name={names.video(status)} chevron={moves.length > 0} />
      <span className="fx-sheet-tip" id={tipId} role="tooltip">
        {t('stageTitle', { video: names.video(status), real: names.real(status) })}
      </span>
    </>
  )
}

/** A stage as a pill: tinted in the stage's colour, with its dot. */
export function StagePill({ stage, name, chevron }: { stage: StageId; name: string; chevron?: boolean }) {
  const tint = stageTint(stage)
  return (
    <span className="fx-sheet-status" style={{ background: tint.fill, borderColor: tint.edge }}>
      <i className="fx-sheet-dot" style={{ background: STAGE_COLORS[stage] }} aria-hidden="true" />
      <span className="fx-sheet-ellipsis">{name}</span>
      {chevron && <span className="fx-sheet-chev" aria-hidden="true">▾</span>}
    </span>
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
    key: s, group, tone,
    label: <StagePill stage={s} name={names.video(s)} />, hint: names.real(s),
    text: `${names.video(s)} (${names.real(s)})`,
    onSelect: () => choose(s),
  })
  const items: MenuItem[] = []
  if (next && moves.includes(next)) items.push(item(next, t('menu.next'), 'next'))
  moves.filter(s => i(s) < cur).reverse().forEach(s => items.push(item(s, t('menu.backTo'))))
  moves.filter(s => i(s) > cur && s !== next).forEach(s => items.push(item(s, t('menu.skipTo'))))
  return items
}
