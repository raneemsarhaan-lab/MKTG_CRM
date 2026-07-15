'use client'

import type { BigStatMetric } from '@/types/index'
import { BIG_STAT_GRADIENTS, COLORS } from '@/lib/tokens'

const THEME_TEXT: Record<string, { value: string; label: string }> = {
  danger:  { value: '#C0453E', label: '#A0362F' },
  accent:  { value: '#6E5BE6', label: '#5B4CBE' },
  lime:    { value: '#3FA34D', label: '#2E8B4F' },
  default: { value: '#D18A15', label: '#B9821A' },
}

interface BigStatProps {
  metric: BigStatMetric
}

export function BigStat({ metric }: BigStatProps) {
  const bg      = BIG_STAT_GRADIENTS[metric.theme]
  const colors  = THEME_TEXT[metric.theme] ?? THEME_TEXT.default

  return (
    <div style={{
      borderRadius: 16, padding: '18px 20px',
      background: bg, position: 'relative', overflow: 'hidden', minHeight: 120,
    }}>
      <div style={{ fontSize: '0.82rem', fontWeight: 700, color: colors.label }}>
        {metric.label}
      </div>
      <div style={{
        fontFamily: 'var(--font-heading)',
        fontSize: '2.4rem', fontWeight: 800,
        color: colors.value, margin: '12px 0 2px', lineHeight: 1,
      }}>
        {metric.value}
      </div>
      {metric.sub && (
        <div style={{ fontSize: '0.78rem', color: colors.label }}>{metric.sub}</div>
      )}
    </div>
  )
}
