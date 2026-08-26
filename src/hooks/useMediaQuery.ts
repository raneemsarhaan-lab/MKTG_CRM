'use client'

import { useCallback, useSyncExternalStore } from 'react'
import { PHONE_QUERY } from '@/lib/breakpoints'

/**
 * Read a media query from a component.
 *
 * Use this only when a component has to render *different markup* on a phone —
 * a sidebar becoming a sheet, a two-column body becoming tabs. Anything that
 * is only a matter of size, spacing or visibility belongs in a CSS media
 * query instead, and for one reason: CSS is correct on the very first paint,
 * where this hook cannot be.
 *
 * It cannot be because the server has no width. It renders the desktop shape,
 * the browser hydrates, and only then does the real answer arrive — so a
 * component switched by this hook shows the desktop form for a frame. That is
 * survivable for structure and unforgivable for a whole page, which is why
 * the shell's own phone layout is done in CSS and this hook is kept for the
 * places CSS genuinely cannot reach.
 *
 * `useSyncExternalStore` rather than useState + useEffect: it is the sanctioned
 * way to read something outside React that the server cannot see. Passing a
 * server snapshot lets React hydrate against the desktop answer without the
 * mismatch warning, then re-render once with the real one.
 */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback((notify: () => void) => {
    const mql = window.matchMedia(query)
    mql.addEventListener('change', notify)
    return () => mql.removeEventListener('change', notify)
  }, [query])

  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(query).matches,
    // The server has no viewport. Desktop is the honest default: it is the
    // reference layout, and it is what every existing screen was built at.
    () => false,
  )
}

/** True on a phone-width screen. Agrees with the `@media` blocks in globals.css. */
export function useIsPhone(): boolean {
  return useMediaQuery(PHONE_QUERY)
}
