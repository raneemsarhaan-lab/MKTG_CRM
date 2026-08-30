import type { MetadataRoute } from 'next'

/**
 * The web app manifest — what a phone reads when someone adds Momentum to
 * their home screen.
 *
 * Served by Next at /manifest.webmanifest. Written as code rather than a
 * static file so the icon paths are checked at build time; they are the part
 * that silently stops working when something moves.
 *
 * On what this deliberately does NOT include: there is no service worker.
 * This app is behind a cache that already replays POST responses by URL —
 * the bug that made attachment uploads return someone else's file — and a
 * second caching layer, one that ships inside the client and outlives a
 * reload, is the last thing this deployment needs. Installing works without
 * one: iOS never required it, and Chrome dropped the requirement. If an
 * install prompt does turn out to need a worker on some browser, it must be
 * network-only and must not touch /api/* or any authenticated document. An
 * offline mode is a separate decision, not a side effect of an icon.
 *
 * start_url carries a query so analytics can tell an installed launch from a
 * tab; it lands on /overview, which is where the app redirects anyway.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Momentum — Creative Operations',
    // What fits under an icon on a home screen. 12 characters is about the
    // limit before Android truncates.
    short_name: 'Momentum',
    description: 'Marketing CRM for Forefront Consulting',
    start_url: '/overview?source=pwa',
    // Everything under the origin, so an in-app link never bounces the person
    // out into a browser tab halfway through a task.
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    // The app's own surface, so the status bar area matches the page rather
    // than flashing white against it.
    background_color: '#F6F6F4',
    theme_color: '#F6F6F4',
    lang: 'en',
    dir: 'auto',
    categories: ['productivity', 'business'],
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      // Android masks this one to whatever shape the launcher uses; it is
      // full-bleed with the mark inset, which is why it is a separate file.
      { src: '/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  }
}
