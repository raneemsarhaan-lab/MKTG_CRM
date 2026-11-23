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

export function StatusContent({ task, me, tipId, ns = 'sheet', name }: { task: Task; me: Member; tipId: string; ns?: 'sheet' | 'content'; /** Spec 019 stage 2: this sheet's word for the stage. */ name?: string }) {
  const t = useTranslations(ns)
  const names = useStageNames(ns)
  const status = task.status as StageId
  const moves = allowedStages(task, me)
  return (
    <>
      <StagePill stage={status} name={name ?? names.video(status)} chevron={moves.length > 0} />
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
  /** Spec 022 (US4): the linked Space's stages — its names, and the other steps of the current stage. */
  space?: { api: import('@/components/spaces/useSpaceStages').SpaceStagesApi; stepLabel: string; pick(entry: import('@/lib/space-stages').SpaceStageEntry): void } | null,
  /** Spec 022: a linked row moves only within its linked tasks' stages (Ready For Design to F-Check). */
  only?: ((s: StageId) => boolean) | null,
): MenuItem[] {
  const moves = allowedStages(task, me).filter(s => !only || only(s))
  const steps = space ? space.api.entries.filter(e => e.stage_id === task.status && e.id !== space.api.of(task)?.id) : []
  const stepItems: MenuItem[] = steps.map(e => ({
    key: `step:${e.id}`, group: space!.stepLabel,
    label: <StagePill stage={task.status as StageId} name={e.name} />, hint: names.real(task.status as StageId),
    text: `${e.name} (${names.real(task.status as StageId)})`,
    onSelect: () => space!.pick(e),
  }))
  if (!moves.length) return stepItems
  const next = nextOnPath(task)
  const i = (s: StageId) => ALL_STAGES.indexOf(s)
  const cur = i(task.status as StageId)
  const nameOf = (s: StageId) => (space ? space.api.stageName(s) : names.video(s))
  const item = (s: StageId, group: string, tone?: 'next'): MenuItem => ({
    key: s, group, tone,
    label: <StagePill stage={s} name={nameOf(s)} />, hint: names.real(s),
    text: `${nameOf(s)} (${names.real(s)})`,
    onSelect: () => choose(s),
  })
  const items: MenuItem[] = [...stepItems]
  if (next && moves.includes(next)) items.push(item(next, t('menu.next'), 'next'))
  moves.filter(s => i(s) < cur).reverse().forEach(s => items.push(item(s, t('menu.backTo'))))
  moves.filter(s => i(s) > cur && s !== next).forEach(s => items.push(item(s, t('menu.skipTo'))))
  return items
}
