'use client'

import { MomentumWordmark } from './Logo'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useTranslations } from 'next-intl'
import type { Member, NavTree as NavTreeData, PinnedFolder } from '@/types/index'
import { NavTree } from './NavTree/NavTree'
import { PIPE } from '@/lib/pipeline-tokens'
import { NavRail } from './NavRail'
import { UserMenu } from './UserMenu'
import { NAV_ICON, navFor } from '@/lib/nav'
import { openSearch } from '@/components/search/SearchDialog'

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

export function Sidebar({ member, pins = [], tree }: { member: Member; pins?: PinnedFolder[]; tree?: NavTreeData | null }) {
  // Expanded is the handoff's default. The stored preference is read after
  // mount, never during render — reading localStorage while rendering would
  // make the server and client disagree and mismatch the whole tree.
  const [expanded, setExpanded] = useState(true)
  const [ready, setReady]       = useState(false)
  const pathname = usePathname()
  const t = useTranslations('nav')
  const ts = useTranslations('search')

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

  // Spec 025: My tasks is in the tree's My work section; the other pages are a row of icons at the bottom.
  const items = navFor(member.access).filter(i => i.key !== 'myTasks')

  return (
    <aside style={{
      width: 216, flexShrink: 0, boxSizing: 'border-box',
      borderRight: '1px solid #EFEFF3', background: '#FFFFFF',
      padding: '22px 16px 16px', display: 'flex', flexDirection: 'column', gap: 14,
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

      {/* Spec 021: the nav and the Me / Teams / Brands tree scroll together
          between the wordmark and the Focus card. */}
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', marginInline: -6, paddingInline: 6, display: 'flex', flexDirection: 'column', gap: 6 }}>
      <nav aria-label="Main navigation" style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {/* Workspace search: tasks, to-dos and assets (⌘K). */}
        <button type="button" data-sidebar-search="" onClick={openSearch} aria-keyshortcuts="Control+K Meta+K"
          style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', borderRadius: 12, border: `1px solid ${PIPE.border}`, background: '#FFFFFF',
            color: PIPE.textMuted, fontSize: 13.5, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit', marginBottom: 4 }}>
          <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
          <span style={{ flex: 1, textAlign: 'start' }}>{ts('open')}</span>
          <kbd style={{ fontSize: 10.5, fontFamily: 'inherit', color: PIPE.textFaint }}>⌘K</kbd>
        </button>
      </nav>
      {tree && <NavTree tree={tree} pins={pins} pathname={pathname} />}
      </div>

      {/* Spec 025: the other pages, as icons, so the tree fits without scrolling. */}
      <nav aria-label={t('more')} data-sidebar-pages="" style={{ flexShrink: 0, display: 'flex', gap: 4, justifyContent: 'space-between', borderTop: `1px solid ${PIPE.border}`, paddingTop: 10 }}>
        {items.map(({ href, key }) => {
          const active = pathname.startsWith(href)
          return (
            <Link key={href} href={href} aria-current={active ? 'page' : undefined} aria-label={t(key)} title={t(key)} data-page={key}
              style={{ display: 'grid', placeItems: 'center', width: 34, height: 34, borderRadius: 10, textDecoration: 'none',
                background: active ? '#F4FBD6' : 'transparent', color: active ? PIPE.ink : PIPE.textSecondary }}>
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth={active ? 2.3 : 2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                {NAV_ICON[key]}
              </svg>
            </Link>
          )
        })}
      </nav>

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
            padding: 4, color: PIPE.textMuted, lineHeight: 0, flexShrink: 0,
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
