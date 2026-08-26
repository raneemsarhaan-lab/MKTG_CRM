'use client'

import { MomentumWordmark } from './Logo'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useTranslations } from 'next-intl'
import type { Member } from '@/types/index'
import { PIPE } from '@/lib/pipeline-tokens'
import { NavRail } from './NavRail'
import { UserMenu } from './UserMenu'
import { NAV_ICON, navFor } from '@/lib/nav'

/**
 * Expanded sidebar — Pipeline handoff §3.
 *
 * 200px: wordmark, Creative Ops pill, labelled nav, the Focus / Flow / Finish
 * card and a user row. Collapsing swaps in the icon rail built for the earlier
 * handoff, so the compact form is the one already in the product rather than a
 * second, narrower design.
 *
 * The handoff blurs its nav block out — it is a mock, not a menu — so the real
 * navigation from the rail is used, admin items included on the same terms:
 * removed from the DOM rather than disabled, with the server-side page guards
 * still doing the actual enforcing.
 */

const STORAGE_KEY = 'fluxo.sidebar.expanded'

export function Sidebar({ member }: { member: Member }) {
  // Expanded is the handoff's default. The stored preference is read after
  // mount, never during render — reading localStorage while rendering would
  // make the server and client disagree and mismatch the whole tree.
  const [expanded, setExpanded] = useState(true)
  const [ready, setReady]       = useState(false)
  const pathname = usePathname()
  const t = useTranslations('nav')

  useEffect(() => {
    const stored = window.localStorage.getItem(STORAGE_KEY)
    if (stored !== null) setExpanded(stored === '1')
    setReady(true)
  }, [])

  function toggle() {
    setExpanded(v => {
      window.localStorage.setItem(STORAGE_KEY, v ? '0' : '1')
      return !v
    })
  }

  if (ready && !expanded) return <NavRail member={member} onExpand={toggle} />

  const items = navFor(member.access)

  return (
    <aside style={{
      width: 200, flexShrink: 0, boxSizing: 'border-box',
      borderRight: '1px solid #EFEFF3', background: '#FFFFFF',
      padding: '26px 20px 20px', display: 'flex', flexDirection: 'column', gap: 18,
      position: 'sticky', top: 0, height: '100vh', alignSelf: 'flex-start',
    }}>
      <div>
        {/* 23px, not larger: the sidebar is 200px wide with 20px padding
            either side, and the wordmark clips past ~24px. */}
        <MomentumWordmark fontSize={23} />
        <div style={{
          marginTop: 11, display: 'inline-block', background: PIPE.limePrimary,
          borderRadius: 999, padding: '6px 14px', fontSize: 12.5, fontWeight: 700, color: PIPE.ink,
        }}>
          Creative Ops
        </div>
      </div>

      <nav aria-label="Main navigation" style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {items.map(({ href, key }) => {
          const active = pathname.startsWith(href)
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? 'page' : undefined}
              style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '10px 12px', borderRadius: 12, textDecoration: 'none',
                background: active ? '#F4FBD6' : 'transparent',
                color: active ? PIPE.ink : PIPE.textSecondary,
                fontSize: 13.5, fontWeight: active ? 700 : 500,
              }}
            >
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor"
                   strokeWidth={active ? 2.3 : 2} strokeLinecap="round" strokeLinejoin="round"
                   aria-hidden="true">
                {NAV_ICON[key]}
              </svg>
              {t(key)}
            </Link>
          )
        })}
      </nav>

      {/* Focus card — §3, margin-top:auto pins it above the user row */}
      <div style={{
        marginTop: 'auto', border: `1px solid ${PIPE.border}`, borderRadius: 16,
        padding: '18px 16px 14px', position: 'relative', background: '#FFFFFF',
      }}>
        <div style={{
          fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 21,
          lineHeight: 1.32, letterSpacing: '-0.02em', color: PIPE.ink,
        }}>
          Focus.<br />Flow.<br />Finish.
        </div>
        <svg width="64" height="8" viewBox="0 0 64 8" fill="none" aria-hidden="true"
             style={{ display: 'block' }}>
          <path d="M2 5C14 2 44 1.6 62 4" stroke={PIPE.limePrimary} strokeWidth="4" strokeLinecap="round" />
        </svg>
        <div style={{ marginTop: 14, fontWeight: 500, fontSize: 13.5, lineHeight: 1.5, color: '#3A3F4B' }}>
          Small wins,<br />every day.
        </div>

        <svg width="42" height="42" viewBox="0 0 42 42" fill="none" aria-hidden="true"
             style={{ position: 'absolute', right: 14, bottom: 16 }}>
          <circle cx="21" cy="21" r="20" fill={PIPE.limePrimary} />
          <circle cx="15" cy="17" r="2" fill={PIPE.ink} /><circle cx="27" cy="17" r="2" fill={PIPE.ink} />
          <path d="M14 25c2 3 12 3 14 0" stroke={PIPE.ink} strokeWidth="2.2" strokeLinecap="round" />
        </svg>
        <svg width="52" height="26" viewBox="0 0 52 26" fill="none" aria-hidden="true"
             style={{ position: 'absolute', right: 44, top: 24 }}>
          <path d="M2 20c8-16 16 8 24-6s14 2 24-6" stroke={PIPE.purpleStroke} strokeWidth="2" strokeLinecap="round" />
        </svg>
      </div>

      {/* User row — the account menu, plus the collapse control */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, paddingTop: 4 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <UserMenu member={member} />
        </div>
        <button
          type="button"
          onClick={toggle}
          title="Collapse sidebar"
          aria-label="Collapse sidebar"
          style={{
            background: 'none', border: 'none', cursor: 'pointer',
            padding: 4, color: PIPE.textFaint, lineHeight: 0, flexShrink: 0,
          }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
               strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </button>
      </div>
    </aside>
  )
}
