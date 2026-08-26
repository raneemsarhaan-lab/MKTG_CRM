'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useTranslations } from 'next-intl'
import type { Member } from '@/types/index'
import { PIPE } from '@/lib/pipeline-tokens'
import { NAV_ICON, PHONE_TABS, navFor } from '@/lib/nav'
import { logout } from '@/lib/logout'

/**
 * Navigation on a phone.
 *
 * The sidebar is 200px and sits in the flow — on a 390px screen that is half
 * the width before anything is shown. So below the phone breakpoint the
 * sidebar is hidden and this takes over: four destinations along the bottom,
 * where a thumb reaches, and everything else behind More.
 *
 * Shown and hidden entirely in CSS (`.fx-tabbar` in globals.css), not by
 * reading the viewport in JavaScript. The server has no width, so a
 * JS-switched shell would render the desktop layout for a frame and then jump.
 * A media query is right on the very first paint.
 *
 * More is not a leftovers drawer. It holds the admin destinations that do not
 * fit, and it holds signing out — which otherwise lives in the sidebar's
 * account menu and would simply not exist on a phone.
 *
 * ── Why the whole thing sits in a full-height shim ────────────────────────
 * A phone browser's layout viewport is taller than the part you can see; the
 * address bar covers the difference until you scroll. `bottom: 0` on a fixed
 * element measures against the taller one, so a bottom bar starts life
 * underneath the browser's own chrome — measured at 390×844: layout 901,
 * visible 844, bar at 847–895, entirely out of reach.
 *
 * `dvh` is the unit that tracks the visible height. So this is a fixed shim of
 * exactly 100dvh that ignores pointer events, with the bar aligned to its
 * bottom. The bar lands on screen under either model, and the page keeps
 * scrolling normally — which the alternative, an app shell that scrolls
 * internally, would have taken away.
 */
export function TabBar({ member }: { member: Member }) {
  const pathname = usePathname()
  const t        = useTranslations('nav')
  const [moreOpen, setMoreOpen] = useState(false)

  const items    = navFor(member.access)
  const tabs     = items.slice(0, PHONE_TABS)
  const overflow = items.slice(PHONE_TABS)

  // Close on navigation — a sheet still standing over the page you asked for
  // reads as a page that did not load.
  useEffect(() => { setMoreOpen(false) }, [pathname])

  useEffect(() => {
    if (!moreOpen) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setMoreOpen(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [moreOpen])

  const inMore   = overflow.some(i => pathname.startsWith(i.href))
  const activeSt = { background: '#F4FBD6' }

  return (
    <div
      className="fx-tabbar"
      style={{
        position: 'fixed', insetInline: 0, top: 0, height: '100dvh', zIndex: 60,
        flexDirection: 'column', justifyContent: 'flex-end',
        // The shim covers the screen; only its children take clicks, so the
        // page underneath stays entirely usable.
        pointerEvents: 'none',
      }}
    >
      {moreOpen && (
        <div
          onClick={() => setMoreOpen(false)}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(28,24,54,.34)',
            pointerEvents: 'auto',
          }}
        />
      )}

      {moreOpen && (
        <div
          role="dialog"
          aria-label="More"
          style={{
            position: 'relative', pointerEvents: 'auto',
            background: '#fff', borderRadius: '18px 18px 0 0',
            padding: '10px 12px 14px', boxShadow: '0 -8px 30px rgba(28,24,54,.18)',
          }}
        >
          <div style={{
            width: 38, height: 4, borderRadius: 999, background: '#E4E1F2',
            margin: '2px auto 12px',
          }} />

          {overflow.map(({ href, key }) => (
            <Link
              key={href}
              href={href}
              aria-current={pathname.startsWith(href) ? 'page' : undefined}
              style={{
                display: 'flex', alignItems: 'center', gap: 12, minHeight: 48,
                padding: '0 10px', borderRadius: 12, textDecoration: 'none',
                color: PIPE.ink, fontSize: 15, fontWeight: 600,
                ...(pathname.startsWith(href) ? activeSt : null),
              }}
            >
              <svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor"
                   strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                {NAV_ICON[key]}
              </svg>
              {t(key)}
            </Link>
          ))}

          <div style={{
            display: 'flex', alignItems: 'center', gap: 10, marginTop: 8, paddingTop: 12,
            borderTop: '1px solid #F1EFFA',
          }}>
            <span style={{
              width: 34, height: 34, borderRadius: '50%', flexShrink: 0,
              background: member.color ?? PIPE.ink, color: '#fff',
              display: 'grid', placeItems: 'center', fontSize: 12.5, fontWeight: 800,
            }}>
              {member.name.split(' ').map(p => p[0]).slice(0, 2).join('')}
            </span>
            <span style={{ flex: 1, minWidth: 0 }}>
              <span style={{
                display: 'block', fontSize: 14, fontWeight: 700, color: PIPE.ink,
                whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
              }}>
                {member.name}
              </span>
              <span style={{ display: 'block', fontSize: 12, color: PIPE.textSecondary }}>
                {member.role}
              </span>
            </span>
            <button
              type="button"
              onClick={() => { void logout() }}
              style={{
                minHeight: 44, padding: '0 16px', borderRadius: 11, cursor: 'pointer',
                border: '1px solid #E4E1F2', background: '#fff', color: PIPE.ink,
                fontFamily: 'inherit', fontSize: 13.5, fontWeight: 700,
              }}
            >
              Sign out
            </button>
          </div>
        </div>
      )}

      <nav
        aria-label="Main navigation"
        style={{
          position: 'relative', pointerEvents: 'auto',
          background: '#fff', borderTop: '1px solid #ECEAF8',
          // The home indicator sits over the last few pixels on an iPhone.
          padding: '6px 4px calc(6px + env(safe-area-inset-bottom, 0px))',
          display: 'grid',
          gridTemplateColumns: `repeat(${tabs.length + (overflow.length ? 1 : 0)}, 1fr)`,
        }}
      >
        {tabs.map(({ href, key }) => {
          const active = pathname.startsWith(href)
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? 'page' : undefined}
              style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
                minHeight: 48, justifyContent: 'center', textDecoration: 'none',
                color: active ? PIPE.ink : PIPE.textFaint,
                fontSize: 10.5, fontWeight: active ? 700 : 600,
              }}
            >
              <span style={{
                width: 30, height: 22, borderRadius: 8, display: 'grid', placeItems: 'center',
                ...(active ? activeSt : null),
              }}>
                <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor"
                     strokeWidth={active ? 2.3 : 2} strokeLinecap="round" strokeLinejoin="round"
                     aria-hidden="true">
                  {NAV_ICON[key]}
                </svg>
              </span>
              {t(key)}
            </Link>
          )
        })}

        {overflow.length > 0 && (
          <button
            type="button"
            onClick={() => setMoreOpen(v => !v)}
            aria-expanded={moreOpen}
            aria-label="More"
            style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
              minHeight: 48, justifyContent: 'center', border: 'none', background: 'none',
              cursor: 'pointer', fontFamily: 'inherit', padding: 0,
              color: moreOpen || inMore ? PIPE.ink : PIPE.textFaint,
              fontSize: 10.5, fontWeight: moreOpen || inMore ? 700 : 600,
            }}
          >
            <span style={{
              width: 30, height: 22, borderRadius: 8, display: 'grid', placeItems: 'center',
              ...(moreOpen || inMore ? activeSt : null),
            }}>
              <svg viewBox="0 0 24 24" width="17" height="17" fill="currentColor" stroke="none"
                   aria-hidden="true">
                {NAV_ICON.more}
              </svg>
            </span>
            More
          </button>
        )}
      </nav>
    </div>
  )
}
