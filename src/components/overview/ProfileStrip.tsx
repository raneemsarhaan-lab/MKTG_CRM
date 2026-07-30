'use client'

import type { Member } from '@/types/index'
import { ACCESS_BADGE, COLORS } from '@/lib/tokens'
import { initials, avatarColor } from '@/lib/utils'

interface ProfileStripProps {
  member: Member
  hoursUsed?: number
}

export function ProfileStrip({ member, hoursUsed = 0 }: ProfileStripProps) {
  const badge   = ACCESS_BADGE[member.access] ?? ACCESS_BADGE.user
  const pct     = member.capacity_hrs_wk > 0
    ? Math.min(100, Math.round((hoursUsed / member.capacity_hrs_wk) * 100))
    : 0

  return (
    <div
      style={{
        borderRadius: '16px',
        background: '#fff',
        border: '1px solid var(--line)',
        overflow: 'hidden',
        marginBottom: '24px',
      }}
    >
      {/* Gradient header strip */}
      <div
        style={{
          height: '72px',
          background: 'linear-gradient(135deg, #B79CF5 0%, #D4BFFD 100%)',
        }}
      />

      {/* Card body */}
      <div style={{ padding: '0 20px 20px' }}>
        {/* Avatar — overlaps the gradient */}
        <div style={{ marginTop: '-40px', marginBottom: '12px', display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }}>
          <div
            style={{
              width: '80px',
              height: '80px',
              borderRadius: '14px',
              background: avatarColor(member.name),
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              border: '3px solid #fff',
              flexShrink: 0,
              boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
            }}
          >
            <span
              style={{
                fontFamily: 'var(--font-heading)',
                fontWeight: 700,
                fontSize: '22px',
                color: '#fff',
              }}
            >
              {initials(member.name)}
            </span>
          </div>

          {/* Status pill */}
          <span
            style={{
              fontSize: '11px',
              fontWeight: 700,
              padding: '4px 10px',
              borderRadius: '99px',
              background: member.status === 'Available' ? '#EDF6C6' : '#F7EFD3',
              color: member.status === 'Available' ? '#4B7A12' : '#A9791F',
              marginBottom: '4px',
            }}
          >
            {member.status}
          </span>
        </div>

        {/* Name + role */}
        <div style={{ marginBottom: '4px' }}>
          <span
            style={{
              fontFamily: 'var(--font-heading)',
              fontWeight: 800,
              fontSize: '17px',
              color: 'var(--ink)',
            }}
          >
            {member.name}
          </span>
          <span
            style={{
              marginLeft: '8px',
              fontSize: '0.65rem',
              fontWeight: 700,
              background: badge.bg,
              color: badge.text,
              padding: '2px 8px',
              borderRadius: '99px',
              textTransform: 'uppercase' as const,
              letterSpacing: '0.05em',
              verticalAlign: 'middle',
            }}
          >
            {member.access}
          </span>
        </div>
        <div style={{ fontSize: '13px', color: 'var(--muted)', marginBottom: '6px' }}>
          {member.role}
        </div>
        <div style={{ fontSize: '12px', color: 'var(--muted)', marginBottom: '16px' }}>
          {member.email}
        </div>

        {/* Workload bar */}
        <div style={{ marginBottom: '4px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase' as const, letterSpacing: '0.06em' }}>
            Workload
          </span>
          <span style={{ fontSize: '11px', color: 'var(--muted)' }}>
            {hoursUsed}h / {member.capacity_hrs_wk}h
          </span>
        </div>
        <div
          style={{
            height: '6px',
            borderRadius: '99px',
            background: 'var(--line)',
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              height: '100%',
              width: `${pct}%`,
              borderRadius: '99px',
              background: pct > 85 ? COLORS.coral : COLORS.violet,
              transition: 'width 0.3s',
            }}
          />
        </div>
      </div>
    </div>
  )
}
