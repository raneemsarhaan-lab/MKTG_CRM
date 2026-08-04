'use client'

import Link from 'next/link'
import Image from 'next/image'
import { usePathname } from 'next/navigation'
import { useTranslations } from 'next-intl'
import type { Member } from '@/types/index'
import { initials, avatarColor } from '@/lib/utils'
import { LangToggle } from './LangToggle'
import { UserMenu } from './UserMenu'

/**
 * Navigation rail — developer handoff §3.
 *
 * Icon-only, 66px wide, dark charcoal, fully rounded. Shared across every
 * screen: this is a layout component, never rebuilt per page.
 *
 * The two admin items are *removed from the DOM* rather than hidden or
 * disabled (§3.1). UI gating here is convenience only — /capacity and
 * /settings reject non-admins server-side in their page guards.
 */

interface NavRailProps {
  member: Member
  /** Shown as an expand control when the sidebar is in its collapsed form. */
  onExpand?: () => void
}

const ICON = {
  // Lucide layout-grid
  board: (
    <>
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="14" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
    </>
  ),
  // Lucide layout-dashboard
  overview: (
    <>
      <rect width="7" height="9" x="3" y="3" rx="1" />
      <rect width="7" height="5" x="14" y="3" rx="1" />
      <rect width="7" height="9" x="14" y="12" rx="1" />
      <rect width="7" height="5" x="3" y="16" rx="1" />
    </>
  ),
  // Lucide target
  projects: (
    <>
      <circle cx="12" cy="12" r="10" />
      <circle cx="12" cy="12" r="6" />
      <circle cx="12" cy="12" r="2" />
    </>
  ),
  // Lucide list-checks
  team: (
    <>
      <path d="m3 17 2 2 4-4" />
      <path d="m3 7 2 2 4-4" />
      <line x1="13" x2="21" y1="6" y2="6" />
      <line x1="13" x2="21" y1="12" y2="12" />
      <line x1="13" x2="21" y1="18" y2="18" />
    </>
  ),
  // Lucide users
  capacity: (
    <>
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </>
  ),
  // Lucide sliders-horizontal
  settings: (
    <>
      <line x1="21" x2="14" y1="4" y2="4" />
      <line x1="10" x2="3" y1="4" y2="4" />
      <line x1="21" x2="12" y1="12" y2="12" />
      <line x1="8" x2="3" y1="12" y2="12" />
      <line x1="21" x2="16" y1="20" y2="20" />
      <line x1="12" x2="3" y1="20" y2="20" />
      <line x1="14" x2="14" y1="2" y2="6" />
      <line x1="8" x2="8" y1="10" y2="14" />
      <line x1="16" x2="16" y1="18" y2="22" />
    </>
  ),
}

const NAV_ITEMS = [
  { href: '/board',    key: 'board',    icon: ICON.board,    adminOnly: false },
  { href: '/overview', key: 'overview', icon: ICON.overview, adminOnly: false },
  { href: '/projects', key: 'projects', icon: ICON.projects, adminOnly: false },
  { href: '/team',     key: 'team',     icon: ICON.team,     adminOnly: false },
  { href: '/capacity', key: 'capacity', icon: ICON.capacity, adminOnly: true  },
  { href: '/settings', key: 'settings', icon: ICON.settings, adminOnly: true  },
] as const

export function NavRail({ member, onExpand }: NavRailProps) {
  const pathname = usePathname()
  const isAdmin  = member.access === 'admin'
  const t        = useTranslations('nav')

  const items = NAV_ITEMS.filter(item => !item.adminOnly || isAdmin)

  return (
    <aside
      style={{
        position:   'sticky',
        top:        0,
        alignSelf:  'flex-start',
        height:     '100vh',
        padding:    12,
        flexShrink: 0,
        boxSizing:  'border-box',
      }}
    >
      <div
        style={{
          height:        '100%',
          width:         66,
          background:    'var(--rail-bg)',
          borderRadius:  28,
          display:       'flex',
          flexDirection: 'column',
          alignItems:    'center',
          boxSizing:     'border-box',
          padding:       '16px 0 14px',
          boxShadow:     '0 16px 44px rgba(0,0,0,.35)',
        }}
      >
        {/* Logo tile — 40×40, radius 13, sparkle glyph stroked #111111 at 2px */}
        <div
          style={{
            width:          40,
            height:         40,
            borderRadius:   13,
            background:     'var(--brand-lime)',
            display:        'flex',
            alignItems:     'center',
            justifyContent: 'center',
            marginBottom:   20,
            flexShrink:     0,
          }}
        >
          <svg
            viewBox="0 0 24 24"
            width="21"
            height="21"
            fill="none"
            stroke="#111111"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M12 3 L14 9 L20 11 L14 13 L12 19 L10 13 L4 11 L10 9 Z" />
          </svg>
        </div>

        {/* Nav list flexes so the avatar always pins to the bottom */}
        <nav
          aria-label="Main navigation"
          style={{ display: 'flex', flexDirection: 'column', gap: 8, flex: 1 }}
        >
          {items.map(({ href, key, icon }) => {
            const active = pathname.startsWith(href)
            return (
              <Link
                key={href}
                href={href}
                title={t(key)}
                aria-label={t(key)}
                aria-current={active ? 'page' : undefined}
                className="fx-rail-btn"
                data-active={active ? 'true' : undefined}
                style={{
                  width:          46,
                  height:         46,
                  borderRadius:   15,
                  display:        'flex',
                  alignItems:     'center',
                  justifyContent: 'center',
                  background:     active ? 'var(--brand-lime)' : 'transparent',
                  color:          active ? '#111111' : 'var(--rail-icon)',
                  textDecoration: 'none',
                }}
              >
                <svg
                  viewBox="0 0 24 24"
                  width="19"
                  height="19"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={active ? 2.4 : 2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  {icon}
                </svg>
              </Link>
            )
          })}
        </nav>

        {onExpand && (
          <button
            type="button"
            onClick={onExpand}
            title="Expand sidebar"
            aria-label="Expand sidebar"
            className="fx-rail-btn"
            style={{
              width: 46, height: 46, borderRadius: 15, border: 'none',
              background: 'transparent', color: 'var(--rail-icon)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer', flexShrink: 0, marginBottom: 4,
            }}
          >
            <svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor"
                 strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M9 18l6-6-6-6" />
            </svg>
          </button>
        )}

        {/* Language toggle.
            DEVIATION from handoff §3, which specifies only nav items plus a
            bottom-pinned avatar. Arabic/RTL is a shipped product feature and
            the sidebar is its only entry point — dropping the control to match
            the rail anatomy would remove the feature outright. Kept subdued so
            the rail still reads as icon-only. */}
        <LangToggle />

        {/* Avatar — also the account menu, so logging out does not require
            expanding the sidebar first. */}
        <div style={{ position: 'relative', flexShrink: 0 }}>
          <UserMenu member={member} variant="rail" />
          <span
            aria-hidden="true"
            style={{
              position:     'absolute',
              bottom:       11,
              right:        -1,
              width:        10,
              height:       10,
              borderRadius: '50%',
              background:   'var(--brand-lime)',
              border:       '2px solid var(--rail-bg)',
              pointerEvents: 'none',
            }}
          />
        </div>
      </div>
    </aside>
  )
}
