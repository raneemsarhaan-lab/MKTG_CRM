'use client'

import type { Member } from '@/types/index'
import { Sidebar } from './Sidebar'
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
 * Per-screen padding lives on the screen, not here: My Board specifies
 * 36px 44px 44px, which other screens do not share.
 */
export function AppShell({ member, children }: AppShellProps) {
  return (
    <div style={{ minHeight: '100vh', display: 'flex', background: '#FFFFFF' }}>
      <Sidebar member={member} />

      <main style={{ flex: 1, minWidth: 0 }}>{children}</main>

      {/* Celebration overlay — global, mounts once */}
      <CelebrationOverlay />
    </div>
  )
}
