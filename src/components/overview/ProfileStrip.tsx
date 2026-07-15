'use client'

import type { Member } from '@/types/index'
import { ACCESS_BADGE } from '@/lib/tokens'
import { initials, avatarColor } from '@/lib/utils'

interface ProfileStripProps {
  member: Member
}

export function ProfileStrip({ member }: ProfileStripProps) {
  const badge = ACCESS_BADGE[member.access] ?? ACCESS_BADGE.user

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 28 }}>
      {/* Avatar */}
      <div style={{
        width: 48, height: 48, borderRadius: '50%',
        background: avatarColor(member.name), color: '#fff',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: '1.1rem', fontWeight: 700, flexShrink: 0,
      }}>
        {initials(member.name)}
      </div>

      {/* Name + role */}
      <div>
        <div style={{
          fontFamily: 'var(--font-heading)',
          fontWeight: 800, fontSize: '1.1rem', color: 'var(--ink)',
        }}>
          {member.name}
        </div>
        <div style={{ fontSize: '0.82rem', color: 'var(--muted)', marginTop: 1 }}>
          {member.role}
        </div>
      </div>

      {/* Access badge */}
      <span style={{
        marginLeft: 4,
        fontSize: '0.65rem', fontWeight: 700,
        background: badge.bg, color: badge.text,
        padding: '3px 9px', borderRadius: 99,
        textTransform: 'uppercase', letterSpacing: '0.05em',
      }}>
        {member.access}
      </span>
    </div>
  )
}
