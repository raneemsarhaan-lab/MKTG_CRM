'use client'

/** Spec 020 tip 28: a conditional-format icon (3 Arrows, 3 Flags, 3 Traffic Lights), named for screen readers. */
import { useTranslations } from 'next-intl'
import { ICONS, type RuleLook } from '@/lib/sheet-rules'

export function RuleIcon({ icon }: { icon: NonNullable<RuleLook['icon']> }) {
  const t = useTranslations('sheets.tips.icons')
  const x = ICONS[icon.set][icon.i]
  const label = t(`${icon.set}.${icon.i}`)
  return <span className={`fx-cf-icon is-${icon.set}`} data-cf-icon={`${icon.set}:${icon.i}`} role="img" aria-label={label} title={label} style={{ color: x.color }}>{x.glyph}</span>
}

/** The grid's `cellIcon` for a cell's rule look. */
export const iconFor = (rl: RuleLook | undefined) => (rl?.icon ? { node: <RuleIcon icon={rl.icon} />, only: rl.icon.only } : null)
