'use client'

import type { BigStatMetric } from '@/types/index'
import { STAT_CARD_TINTS } from '@/lib/tokens'

interface BigStatProps {
  metric: BigStatMetric
}

export function BigStat({ metric }: BigStatProps) {
  const tint = STAT_CARD_TINTS[metric.theme] ?? STAT_CARD_TINTS.default

  return (
    <div
      style={{
        borderRadius: '16px',
        padding: '18px 20px',
        background: tint.bg,
        minHeight: '110px',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
      }}
    >
      <div style={{ fontSize: '0.75rem', fontWeight: 700, color: tint.label, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
        {metric.label}
      </div>
      <div>
        <div
          style={{
            fontFamily: 'var(--font-heading)',
            fontSize: '2.2rem',
            fontWeight: 800,
            color: tint.value,
            lineHeight: 1,
            marginBottom: '4px',
          }}
        >
          {metric.value}
        </div>
        {metric.sub && (
          <div style={{ fontSize: '0.78rem', color: tint.label }}>{metric.sub}</div>
        )}
      </div>
    </div>
  )
}
