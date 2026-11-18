'use client'

/**
 * Spec 020 stage C: the right-drag menu, as Excel's (Move Here, Copy Here,
 * Copy Here as Values Only, …), with Excel's access keys (V, F, M, C, S, R,
 * D, T). Shared by team sheets and the board's sheets.
 */
import type { MoveRequest } from '@/components/sheet/GridCore'
import { MOVE_CHOICES, type MoveChoice } from '@/lib/sheet-move'
import type { PopItem } from '../PopMenu'

/** The request a menu choice makes from the drag's own. */
export function moveFor(req: MoveRequest, choice: MoveChoice): MoveRequest | null {
  const base = { from: req.from, to: req.to }
  switch (choice) {
    case 'move': return { ...base, kind: 'move', shift: null }
    case 'copy': return { ...base, kind: 'copy', shift: null }
    case 'values': return { ...base, kind: 'copy', shift: null, only: 'values' }
    case 'formats': return { ...base, kind: 'copy', shift: null, only: 'formats' }
    case 'shiftDownCopy': return { ...base, kind: 'copy', shift: 'down' }
    case 'shiftRightCopy': return { ...base, kind: 'copy', shift: 'right' }
    case 'shiftDownMove': return { ...base, kind: 'move', shift: 'down' }
    case 'shiftRightMove': return { ...base, kind: 'move', shift: 'right' }
    default: return null
  }
}

export function moveMenuItems(t: (k: string) => string, run: (choice: MoveChoice) => void, opts: { linked: boolean }): PopItem[] {
  const off = (c: MoveChoice): { disabled?: boolean; why?: string } => {
    if (c === 'link' || c === 'hyperlink') return { disabled: true, why: t('move.formulasWhy') }
    if (opts.linked && (c === 'formats' || c.startsWith('shift'))) return { disabled: true, why: t('move.linkedWhy') }
    return {}
  }
  const item = (c: typeof MOVE_CHOICES[number]): PopItem => ({ key: c.key, label: t(`move.menu.${c.key}`), ak: c.letter, kbd: c.letter, ...off(c.key), onSelect: () => run(c.key) })
  return [
    ...MOVE_CHOICES.slice(0, 6).map(item),
    { kind: 'sep', key: 's1' },
    ...MOVE_CHOICES.slice(6).map(item),
    { kind: 'sep', key: 's2' },
    { key: 'cancel', label: t('move.menu.cancel'), kbd: 'Esc', onSelect: () => {} },
  ]
}
