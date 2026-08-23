'use client'

import Link from 'next/link'

/**
 * Mine / Team switch for the dashboard.
 *
 * Rendered only for admins, and only as a convenience — the page decides what
 * data to read from the session member's access level, not from this link.
 * A non-admin who types ?view=team gets their own board back, so nothing here
 * is load-bearing for authorization.
 *
 * It is two links rather than a stateful control so the choice survives a
 * refresh and can be bookmarked, and so the server renders the right data on
 * the first paint instead of swapping it in afterwards.
 */
export function ScopeToggle({ teamView }: { teamView: boolean }) {
  const tab = (active: boolean): React.CSSProperties => ({
    padding:        '6px 14px',
    borderRadius:   8,
    fontSize:       13,
    fontWeight:     700,
    textDecoration: 'none',
    whiteSpace:     'nowrap',
    color:          active ? '#fff' : 'var(--ink-500)',
    background:     active ? 'var(--violet-link)' : 'transparent',
  })

  return (
    <div
      role="group"
      aria-label="Dashboard scope"
      style={{
        display:      'inline-flex',
        alignItems:   'center',
        gap:          4,
        background:   '#fff',
        border:       '1px solid var(--border-input)',
        borderRadius: 10,
        padding:      3,
        marginBottom: 8,
      }}
    >
      <Link href="/overview" aria-current={teamView ? undefined : 'page'} style={tab(!teamView)}>
        Mine
      </Link>
      <Link href="/overview?view=team" aria-current={teamView ? 'page' : undefined} style={tab(teamView)}>
        Team
      </Link>
    </div>
  )
}
