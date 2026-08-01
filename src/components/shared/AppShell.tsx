'use client'

import type { Member } from '@/types/index'
import { NavRail } from './NavRail'
import { CelebrationOverlay } from './CelebrationOverlay'

interface AppShellProps {
  member: Member
  children: React.ReactNode
}

/**
 * Page skeleton — developer handoff §2.
 *
 * Two-column shell. The rail is a *sibling* of main content, not an overlay,
 * and occupies real flow width (66 + 24 = 90px) so the main column's left edge
 * is defined by it. Main content is fluid — no max-width.
 *
 * Per-screen padding lives on the screen, not here: My Board specifies
 * 36px 44px 44px, which other screens do not share.
 */
export function AppShell({ member, children }: AppShellProps) {
  return (
    <div style={{ minHeight: '100vh', display: 'flex', background: 'var(--bg-app)' }}>
      <NavRail member={member} />

      <main style={{ flex: 1, minWidth: 0 }}>{children}</main>

      {/* Celebration overlay — global, mounts once */}
      <CelebrationOverlay />
    </div>
  )
}
