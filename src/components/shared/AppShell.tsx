'use client'

import type { Member, NavTree, PinnedFolder } from '@/types/index'
import { Sidebar } from './Sidebar'
import { SearchDialog } from '@/components/search/SearchDialog'
import { TabBar } from './TabBar'
import { CelebrationOverlay } from './CelebrationOverlay'
import { HandoffDialog } from '@/components/handoff/HandoffDialog'
import { NotifyProvider } from '@/components/notifications/NotifyProvider'
import { notifyApi } from '@/components/notifications/api'
import { HoursReminderApp } from '@/components/hours/pages'
import { useEffect } from 'react'
import { useTranslations } from 'next-intl'
import { useUIStore } from '@/store/useUIStore'

interface AppShellProps {
  member: Member
  /** Folders pinned under Sheets (spec 013). */
  pins?: PinnedFolder[]
  /** Spec 021: the sidebar's Me / Teams / Brands sections. */
  tree?: NavTree | null
  children: React.ReactNode
}

/**
 * Page skeleton — developer handoff §2.
 *
 * Two-column shell. The sidebar is a *sibling* of main content, not an
 * overlay, and occupies real flow width so the main column's left edge is
 * defined by it. Main content is fluid — no max-width.
 *
 * The sidebar has two forms: the Pipeline handoff's 200px panel, and the
 * earlier handoff's 66px icon rail when collapsed.
 *
 * On a phone it has a third: none. Below 767px the sidebar is hidden and the
 * TabBar takes over along the bottom — both switched in CSS (`.fx-sidebar`,
 * `.fx-tabbar`), never by reading the viewport here. The server has no width,
 * so a JavaScript switch would paint the desktop shell first and jump on
 * hydration; a media query is right on the first frame.
 *
 * Per-screen padding lives on the screen, not here: My Board specifies
 * 36px 44px 44px, which other screens do not share.
 */
export function AppShell({ member, pins = [], tree = null, children }: AppShellProps) {
  // The member's own choice; celebrations stay off until they turn them on.
  const on = !!member.celebrations
  const skipText = useTranslations('nav')('skipToContent')
  useEffect(() => { useUIStore.getState().setCelebrationsOn(on) }, [on])
  return (
    // The notifications' pulse, toasts and opening (spec 012), once for the app.
    <NotifyProvider api={notifyApi} meId={member.id} storedLocale={member.locale}>
    <div className="fx-shell" style={{
      // dvh, not vh: on a phone `100vh` is the window *without* the browser's
      // own bars, so a full-height page sits taller than the screen and the
      // whole app scrolls a few pixels behind the address bar.
      minHeight: '100dvh',
      display: 'flex', background: '#FFFFFF',
    }}>
      {/* QA 26 Nov 2026 (F20): the first Tab offers "Skip to content". */}
      <a href="#main-content" className="fx-skip" data-skip-link="">{skipText}</a>
      <Sidebar member={member} pins={pins} tree={tree} />

      <main id="main-content" tabIndex={-1} style={{ flex: 1, minWidth: 0, outline: 'none' }}>{children}</main>

      {/* Rendered always, shown only at phone widths. */}
      <TabBar member={member} pins={pins} tree={tree} />

      {/* The forgotten-day hours reminder (spec 014), once for the app. */}
      <HoursReminderApp />

      {/* Workspace search (⌘K / Ctrl+K, or Search in the sidebar) — global, mounts once */}
      <SearchDialog />

      {/* Spec 021: the hand-off box — global, mounts once */}
      <HandoffDialog />

      {/* Celebration overlay — global, mounts once */}
      <CelebrationOverlay />
    </div>
    </NotifyProvider>
  )
}
