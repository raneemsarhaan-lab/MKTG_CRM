'use client'

import { MomentumMark } from './Logo'

import Link from 'next/link'
import Image from 'next/image'
import { usePathname } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { NAV_ICON, navFor } from '@/lib/nav'
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

export function NavRail({ member, onExpand }: NavRailProps) {
  const pathname = usePathname()
  const t        = useTranslations('nav')

  const items = navFor(member.access)

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
        {/* Logo tile — the E symbol on its own. The wordmark is illegible at
            40px, and the three bars are the mark that survives the crop. */}
        <div
          style={{
            width:          40,
            height:         40,
            borderRadius:   13,
            background:     '#FFFFFF',
            display:        'flex',
            alignItems:     'center',
            justifyContent: 'center',
            marginBottom:   20,
            flexShrink:     0,
          }}
        >
          <MomentumMark size={22} title="Momentum" />
        </div>

        {/* Nav list flexes so the avatar always pins to the bottom */}
        <nav
          aria-label="Main navigation"
          style={{ display: 'flex', flexDirection: 'column', gap: 8, flex: 1 }}
        >
          {items.map(({ href, key }) => {
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
                  {NAV_ICON[key]}
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
