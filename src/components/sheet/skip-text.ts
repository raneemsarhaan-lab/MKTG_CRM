'use client'

/** "3 cells weren't changed: you can't edit 2 tasks, 1 is archived" (spec 013 FR-025). */
import { useTranslations } from 'next-intl'

export function useSkipText() {
  const t = useTranslations('sheets')
  return (skipped: Partial<Record<string, number>>): string | null => {
    const parts = Object.entries(skipped).filter(([, n]) => n)
    const total = parts.reduce((a, [, n]) => a + (n ?? 0), 0)
    if (!total) return null
    const reasons = parts.map(([k, n]) => (t.has(`grid.reason.${k}`) ? t(`grid.reason.${k}`, { n: n ?? 0 }) : t('grid.reason.invalid', { n: n ?? 0 })))
    return t('grid.skipped', { n: total, reasons: reasons.join(', ') })
  }
}
