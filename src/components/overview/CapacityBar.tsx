'use client'

import { COLORS } from '@/lib/tokens'

interface CapacityBarProps {
  hoursUsed: number
  hoursTotal: number
}

export function CapacityBar({ hoursUsed, hoursTotal }: CapacityBarProps) {
  const pct      = hoursTotal > 0 ? Math.round((hoursUsed / hoursTotal) * 100) : 0
  const over     = pct > 100
  const fillPct  = Math.min(pct, 100)
  const fillColor = over ? COLORS.coral : COLORS.lime

  return (
    <div style={{
      background: COLORS.rail, borderRadius: 14,
      padding: '16px 20px',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <span style={{ fontSize: '0.82rem', fontWeight: 700, color: '#fff' }}>
          Weekly capacity
        </span>
        <span style={{
          fontSize: '0.9rem', fontWeight: 800,
          color: over ? COLORS.coral : COLORS.violet,
        }}>
          {pct}%
        </span>
      </div>
      <div style={{ height: 8, borderRadius: 99, background: '#2A2B2D', overflow: 'hidden' }}>
        <div style={{
          width: `${fillPct}%`, height: '100%', borderRadius: 99,
          background: `linear-gradient(90deg, ${fillColor}, ${over ? '#FF6B6B' : COLORS.violet})`,
          transition: 'width 0.3s ease',
        }} />
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8 }}>
        <span style={{ fontSize: '0.72rem', color: COLORS.muted }}>
          {hoursUsed}h used
        </span>
        <span style={{ fontSize: '0.72rem', color: COLORS.muted }}>
          {hoursTotal}h capacity
        </span>
      </div>
    </div>
  )
}
