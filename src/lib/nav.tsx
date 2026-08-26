import type { AccessLevel } from '@/types/index'

/**
 * The navigation, once.
 *
 * There were two copies of this list — one in Sidebar, one in NavRail — with a
 * comment on each saying the two must agree. The phone tab bar would have been
 * a third, and three lists that must agree is a list that will not. So: one
 * array, one set of icons, and each surface decides only how to draw them.
 *
 * Admin-only items are removed from the list rather than disabled. Hiding is
 * not the enforcement — every page behind one of these has its own server-side
 * guard, and that is what actually holds.
 */

export interface NavItem {
  href: string
  /** Key into the `nav` translations. */
  key: string
  adminOnly: boolean
}

export const NAV: readonly NavItem[] = [
  { href: '/overview', key: 'overview', adminOnly: false },
  { href: '/board',    key: 'board',    adminOnly: false },
  { href: '/projects', key: 'projects', adminOnly: false },
  { href: '/team',     key: 'team',     adminOnly: false },
  { href: '/capacity', key: 'capacity', adminOnly: true  },
  { href: '/settings', key: 'settings', adminOnly: true  },
] as const

/** What a phone's tab bar has room for. The rest live behind "More". */
export const PHONE_TABS = 4

export function navFor(access: AccessLevel): NavItem[] {
  const isAdmin = access === 'admin'
  return NAV.filter(i => !i.adminOnly || isAdmin)
}

/**
 * Icon paths only — no `<svg>` wrapper.
 *
 * Each surface draws them at its own size and stroke weight (the rail uses 20px
 * at 2, the sidebar 18px and thickens the active one), so the element belongs
 * to the caller and only the geometry is shared.
 */
export const NAV_ICON: Record<string, React.ReactNode> = {
  overview: (<>
    <rect width="7" height="9" x="3" y="3" rx="1" /><rect width="7" height="5" x="14" y="3" rx="1" />
    <rect width="7" height="9" x="14" y="12" rx="1" /><rect width="7" height="5" x="3" y="16" rx="1" />
  </>),
  board: (<>
    <rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" />
    <rect x="14" y="14" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" />
  </>),
  projects: (<>
    <circle cx="12" cy="12" r="10" /><circle cx="12" cy="12" r="6" /><circle cx="12" cy="12" r="2" />
  </>),
  team: (<>
    <path d="m3 17 2 2 4-4" /><path d="m3 7 2 2 4-4" />
    <line x1="13" x2="21" y1="6" y2="6" /><line x1="13" x2="21" y1="12" y2="12" />
    <line x1="13" x2="21" y1="18" y2="18" />
  </>),
  capacity: (<>
    <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" />
    <path d="M22 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" />
  </>),
  settings: (<>
    <line x1="21" x2="14" y1="4" y2="4" /><line x1="10" x2="3" y1="4" y2="4" />
    <line x1="21" x2="12" y1="12" y2="12" /><line x1="8" x2="3" y1="12" y2="12" />
    <line x1="21" x2="16" y1="20" y2="20" /><line x1="12" x2="3" y1="20" y2="20" />
    <line x1="14" x2="14" y1="2" y2="6" /><line x1="8" x2="8" y1="10" y2="14" />
    <line x1="16" x2="16" y1="18" y2="22" />
  </>),
  more: (<>
    <circle cx="5" cy="12" r="1.6" /><circle cx="12" cy="12" r="1.6" /><circle cx="19" cy="12" r="1.6" />
  </>),
}
