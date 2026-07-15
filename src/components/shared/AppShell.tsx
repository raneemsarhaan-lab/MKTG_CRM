'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import type { Member } from '@/types/index'
import { COLORS } from '@/lib/tokens'
import { LayoutDashboard, Kanban, Users, Settings } from 'lucide-react'

interface AppShellProps {
  member: Member
  children: React.ReactNode
}

const NAV_ITEMS = [
  { href: '/overview', icon: LayoutDashboard, label: 'Overview', adminOnly: false },
  { href: '/board',    icon: Kanban,          label: 'Board',    adminOnly: false },
  { href: '/capacity', icon: Users,           label: 'Capacity', adminOnly: true  },
  { href: '/settings', icon: Settings,        label: 'Settings', adminOnly: true  },
]

function initials(name: string) {
  return name.split(' ').map(p => p[0]).join('').slice(0, 2).toUpperCase()
}

export function AppShell({ member, children }: AppShellProps) {
  const pathname = usePathname()
  const isAdmin = member.access === 'admin'

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--soft)' }}>
      {/* Sidebar */}
      <nav
        style={{
          width: '64px',
          background: 'var(--rail)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          padding: '16px 0',
          flexShrink: 0,
          position: 'sticky',
          top: 0,
          height: '100vh',
        }}
        aria-label="Main navigation"
      >
        {/* Brand mark */}
        <div
          style={{
            width: '36px',
            height: '36px',
            background: COLORS.lime,
            borderRadius: '8px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: '24px',
            flexShrink: 0,
          }}
        >
          <span
            style={{
              fontFamily: 'var(--font-heading)',
              fontWeight: 900,
              fontSize: '14px',
              color: COLORS.ink,
            }}
          >
            F
          </span>
        </div>

        {/* Nav icons */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', flex: 1 }}>
          {NAV_ITEMS.filter(item => !item.adminOnly || isAdmin).map(({ href, icon: Icon, label }) => {
            const active = pathname.startsWith(href)
            return (
              <Link
                key={href}
                href={href}
                aria-label={label}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: '44px',
                  height: '44px',
                  borderRadius: '10px',
                  background: active ? 'rgba(200,242,78,0.12)' : 'transparent',
                  color: active ? COLORS.lime : COLORS.muted,
                  transition: 'background 0.15s, color 0.15s',
                  textDecoration: 'none',
                }}
              >
                <Icon size={20} strokeWidth={active ? 2.5 : 1.8} />
              </Link>
            )
          })}
        </div>

        {/* User avatar */}
        <div
          style={{
            width: '36px',
            height: '36px',
            borderRadius: '50%',
            background: '#6E5BE6',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
            marginTop: 'auto',
          }}
          title={member.name}
        >
          <span
            style={{
              fontFamily: 'var(--font-heading)',
              fontWeight: 700,
              fontSize: '12px',
              color: '#ffffff',
            }}
          >
            {initials(member.name)}
          </span>
        </div>
      </nav>

      {/* Main content */}
      <main style={{ flex: 1, overflow: 'auto', padding: '0' }}>
        {children}
      </main>
    </div>
  )
}
