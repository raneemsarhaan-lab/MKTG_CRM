'use client'

import type { Member } from '@/types/index'
import { Sidebar } from './Sidebar'
import { TabBar } from './TabBar'
import { CelebrationOverlay } from './CelebrationOverlay'

interface AppShellProps {
  member: Member
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
export function AppShell({ member, children }: AppShellProps) {
  return (
    <div className="fx-shell" style={{
      // dvh, not vh: on a phone `100vh` is the window *without* the browser's
      // own bars, so a full-height page sits taller than the screen and the
      // whole app scrolls a few pixels behind the address bar.
      minHeight: '100dvh',
      display: 'flex', background: '#FFFFFF',
    }}>
      <Sidebar member={member} />

      <main style={{ flex: 1, minWidth: 0 }}>{children}</main>

      {/* Rendered always, shown only at phone widths. */}
      <TabBar member={member} />

      {/* Celebration overlay — global, mounts once */}
      <CelebrationOverlay />
    </div>
  )
}
