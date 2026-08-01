'use client'

import type { Member, Task } from '@/types/index'
import { COLORS } from '@/lib/tokens'
import { initials, avatarColor } from '@/lib/utils'

interface MemberCapacityCardProps {
  member: Member
  activeTasks: Task[]
}

export function MemberCapacityCard({ member, activeTasks }: MemberCapacityCardProps) {
  const totalHours  = activeTasks.reduce((s, t) => s + (t.hours_estimate ?? 0), 0)
  const capacity    = member.capacity_hrs_wk
  const pct         = capacity > 0 ? Math.round((totalHours / capacity) * 100) : 0
  const over        = pct > 100
  const fillWidth   = Math.min(pct, 100)
  const fillColor   = over ? COLORS.coral : COLORS.lime
  const highCount   = activeTasks.filter(t => t.priority === 'High').length

  // Brand breakdown: { brandId → hours }
  const byBrandId: Record<string, { hours: number; count: number; name?: string; color?: string }> = {}
  activeTasks.forEach(t => {
    const key = t.brand_id
    if (!byBrandId[key]) byBrandId[key] = { hours: 0, count: 0 }
    byBrandId[key].hours += t.hours_estimate ?? 0
    byBrandId[key].count++
    // brand name/color injected by CapacityDashboard via task.brand
    const taskWithBrand = t as Task & { brand?: { name: string; color: string } }
    if (taskWithBrand.brand) {
      byBrandId[key].name  = taskWithBrand.brand?.name ?? 'No brand'
      byBrandId[key].color = taskWithBrand.brand?.color ?? '#C4C4BE'
    }
  })
  const brandRows = Object.entries(byBrandId)

  return (
    <div style={{
      background: 'var(--panel)',
      border: '1px solid var(--line)',
      borderRadius: 14,
      padding: '16px 18px',
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
        <div style={{
          width: 38, height: 38, borderRadius: '50%',
          background: avatarColor(member.name), color: '#fff',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: '0.78rem', fontWeight: 700, flexShrink: 0,
        }}>
          {initials(member.name)}
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
            <span style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--ink)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {member.name}
            </span>
            <span style={{ fontSize: '0.72rem', color: 'var(--muted)', flexShrink: 0 }}>
              {member.role}
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 2 }}>
            <span style={{ fontSize: '0.72rem', color: over ? COLORS.coral : 'var(--muted)' }}>
              {totalHours}h / {capacity}h
            </span>
            <span style={{ fontSize: '0.72rem', color: 'var(--muted)' }}>
              {activeTasks.length} task{activeTasks.length !== 1 ? 's' : ''}
            </span>
            {highCount > 0 && (
              <span style={{
                fontSize: '0.65rem', color: COLORS.coral,
                background: `${COLORS.coral}18`, border: `1px solid ${COLORS.coral}44`,
                borderRadius: 4, padding: '1px 6px', fontWeight: 700,
              }}>
                {highCount} high
              </span>
            )}
          </div>
        </div>

        {/* Hours number */}
        <div style={{ textAlign: 'right', flexShrink: 0 }}>
          <div style={{
            fontFamily: 'var(--font-heading)', fontSize: '1.3rem', fontWeight: 800,
            color: over ? COLORS.coral : 'var(--ink)',
          }}>
            {pct}%
          </div>
          <div style={{ fontSize: '0.62rem', color: 'var(--muted)' }}>capacity</div>
        </div>
      </div>

      {/* Fill bar */}
      <div style={{ height: 7, background: '#EBEBEB', borderRadius: 99, overflow: 'hidden', marginBottom: 10 }}>
        <div style={{
          width: `${fillWidth}%`, height: '100%', borderRadius: 99,
          background: over
            ? `linear-gradient(90deg, ${COLORS.coral}, #FF6B6B)`
            : `linear-gradient(90deg, ${COLORS.lime}, ${COLORS.mint})`,
          transition: 'width 0.3s ease',
        }} />
      </div>

      {/* Brand breakdown */}
      {brandRows.length > 0 ? (
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          {brandRows.map(([id, { name, color, hours, count }]) => (
            <div key={id} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: color ?? '#94A3B8', display: 'inline-block', flexShrink: 0 }} />
              <span style={{ fontSize: '0.67rem', color: 'var(--muted)' }}>
                <strong style={{ color: 'var(--ink)' }}>{name?.split(' ')[0] ?? id.slice(0, 6)}</strong>
                {' '}{hours}h · {count}
              </span>
            </div>
          ))}
        </div>
      ) : (
        <div style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>No active tasks</div>
      )}
    </div>
  )
}
