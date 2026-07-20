'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import type { Member } from '@/types/index'
import { COLORS } from '@/lib/tokens'
import { LayoutDashboard, Kanban, Users, Settings, Plus } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useUIStore } from '@/store/useUIStore'
import { CelebrationOverlay } from './CelebrationOverlay'
import { LangToggle } from './LangToggle'

interface AppShellProps {
  member: Member
  children: React.ReactNode
}

const NAV_ITEMS = [
  { href: '/overview', icon: LayoutDashboard, key: 'overview', adminOnly: false },
  { href: '/board',    icon: Kanban,          key: 'board',    adminOnly: false },
  { href: '/capacity', icon: Users,           key: 'capacity', adminOnly: true  },
  { href: '/settings', icon: Settings,        key: 'settings', adminOnly: true  },
] as const

function initials(name: string) {
  return name.split(' ').map(p => p[0]).join('').slice(0, 2).toUpperCase()
}

const SECTION_LABELS: Record<string, string> = {
  '/overview':  'Overview',
  '/board':     'Creative Ops',
  '/capacity':  'Capacity',
  '/settings':  'Settings',
}

function getSectionLabel(pathname: string): string {
  for (const [prefix, label] of Object.entries(SECTION_LABELS)) {
    if (pathname.startsWith(prefix)) return label
  }
  return 'Fluxo'
}

export function AppShell({ member, children }: AppShellProps) {
  const pathname = usePathname()
  const isAdmin  = member.access === 'admin'
  const t        = useTranslations('nav')
  const setShowTaskForm  = useUIStore(s => s.setShowTaskForm)


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
          {NAV_ITEMS.filter(item => !item.adminOnly || isAdmin).map(({ href, icon: Icon, key }) => {
            const active = pathname.startsWith(href)
            return (
              <Link
                key={href}
                href={href}
                aria-label={t(key)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: '44px',
                  height: '44px',
                  borderRadius: '10px',
                  background: active ? COLORS.lime : 'transparent',
                  color: active ? COLORS.ink : COLORS.muted,
                  transition: 'background 0.15s, color 0.15s',
                  textDecoration: 'none',
                }}
              >
                <Icon size={20} strokeWidth={active ? 2.5 : 1.8} />
              </Link>
            )
          })}
        </div>

        {/* Language toggle */}
        <LangToggle />

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

      {/* Right column: topbar + main content */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        {/* Topbar */}
        <div
          style={{
            height: '56px',
            background: '#FFFFFF',
            borderBottom: '1px solid var(--line)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '0 24px',
            flexShrink: 0,
            position: 'sticky',
            top: 0,
            zIndex: 10,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span
              style={{
                fontFamily: 'var(--font-heading)',
                fontWeight: 900,
                fontSize: '16px',
                color: 'var(--ink)',
                letterSpacing: '-0.02em',
              }}
            >
              Fluxo
            </span>
            <span
              style={{
                background: COLORS.lime,
                color: COLORS.ink,
                fontFamily: 'var(--font-heading)',
                fontWeight: 700,
                fontSize: '11px',
                letterSpacing: '0.02em',
                padding: '2px 8px',
                borderRadius: '99px',
              }}
            >
              {getSectionLabel(pathname)}
            </span>
          </div>
          <button
            onClick={() => setShowTaskForm(true)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              background: COLORS.lime,
              color: COLORS.ink,
              border: 'none',
              borderRadius: '99px',
              fontFamily: 'var(--font-heading)',
              fontWeight: 700,
              fontSize: '13px',
              padding: '7px 14px',
              cursor: 'pointer',
              letterSpacing: '-0.01em',
            }}
          >
            <Plus size={14} strokeWidth={2.5} />
            New task
          </button>
        </div>

        {/* Page content */}
        <main style={{ flex: 1, overflow: 'auto' }}>
          {children}
        </main>
      </div>

      {/* Celebration overlay — global, mounts once in AppShell */}
      <CelebrationOverlay />
    </div>
  )
}
