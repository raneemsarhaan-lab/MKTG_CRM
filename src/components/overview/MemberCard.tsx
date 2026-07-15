'use client'

import { useTransition } from 'react'
import type { Member } from '@/types/index'
import { COLORS } from '@/lib/tokens'
import { initials, avatarColor } from '@/lib/utils'
import { updateMember } from '@/actions/members'

interface MemberCardProps {
  member: Member
  activeTaskCount: number
  isAdminViewer: boolean
}

export function MemberCard({ member, activeTaskCount, isAdminViewer }: MemberCardProps) {
  const [isPending, startTransition] = useTransition()
  const statusColor = member.status === 'Available' ? COLORS.lime : COLORS.coral

  function handleCapacityBlur(e: React.FocusEvent<HTMLInputElement>) {
    const val = parseInt(e.target.value, 10)
    if (!isNaN(val) && val > 0 && val !== member.capacity_hrs_wk) {
      startTransition(async () => { await updateMember(member.id, { capacity_hrs_wk: val }) })
    }
  }

  return (
    <div style={{
      borderRadius: 14, padding: 14,
      background: '#F7F7F7', border: '1px solid var(--line)',
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
        <div style={{ position: 'relative', flexShrink: 0 }}>
          <div style={{
            width: 32, height: 32, borderRadius: '50%',
            background: avatarColor(member.name), color: '#fff',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '0.62rem', fontWeight: 700,
          }}>
            {initials(member.name)}
          </div>
          {/* Status dot */}
          <span style={{
            position: 'absolute', bottom: 0, right: 0,
            width: 9, height: 9, borderRadius: '50%',
            background: statusColor, border: '1.5px solid #F7F7F7',
          }} />
        </div>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--ink)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {member.name}
          </div>
          <div style={{ fontSize: '0.72rem', color: 'var(--muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {member.role}
          </div>
        </div>
      </div>

      {/* Stats row */}
      <div style={{ display: 'flex', borderTop: '1px solid var(--line)', paddingTop: 10, gap: 0 }}>
        {/* Active tasks */}
        <div style={{ flex: 1, textAlign: 'center' }}>
          <div style={{ fontFamily: 'var(--font-heading)', fontSize: '1.1rem', fontWeight: 800, color: 'var(--ink)' }}>
            {activeTaskCount}
          </div>
          <div style={{ fontSize: '0.6rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--muted)' }}>
            Active
          </div>
        </div>

        {/* Capacity */}
        <div style={{ flex: 1, textAlign: 'center', borderLeft: '1px solid var(--line)', paddingLeft: 8 }}>
          {isAdminViewer ? (
            <input
              type="number"
              defaultValue={member.capacity_hrs_wk}
              onBlur={handleCapacityBlur}
              disabled={isPending}
              min={1}
              max={168}
              style={{
                fontFamily: 'var(--font-heading)', fontSize: '1.1rem', fontWeight: 800,
                color: 'var(--ink)', width: '4ch', border: 'none', background: 'transparent',
                outline: 'none', textAlign: 'center', padding: 0,
                opacity: isPending ? 0.6 : 1,
              }}
            />
          ) : (
            <div style={{ fontFamily: 'var(--font-heading)', fontSize: '1.1rem', fontWeight: 800, color: 'var(--ink)' }}>
              {member.capacity_hrs_wk}
            </div>
          )}
          <div style={{ fontSize: '0.6rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--muted)' }}>
            Hrs/wk
          </div>
        </div>
      </div>
    </div>
  )
}
