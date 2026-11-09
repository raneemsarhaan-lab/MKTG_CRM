/*
 * Momentum's push-only service worker (spec 012 R8, FR-094).
 *
 * It does two things: show a phone alert when the server pushes one, and open
 * Momentum at the right place when the alert is tapped. It has NO fetch
 * handler on purpose: it never sees, caches or answers a request, so the
 * app's "no second caching layer" rule (src/app/manifest.ts) still holds.
 */
self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()))

self.addEventListener('push', event => {
  let data = {}
  try { data = event.data ? event.data.json() : {} } catch { data = { body: event.data && event.data.text() } }
  const title = data.title || 'Momentum'
  event.waitUntil(self.registration.showNotification(title, {
    body: data.body || '',
    tag: data.tag,            // the notification id: a growing group replaces its alert
    renotify: !!data.tag,
    dir: data.dir || 'auto',
    lang: data.lang || '',
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    data: { url: data.url || '/board' },
  }))
})

self.addEventListener('notificationclick', event => {
  event.notification.close()
  const url = new URL(event.notification.data && event.notification.data.url || '/board', self.location.origin).href
  event.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    for (const c of all) {
      if (new URL(c.url).origin === self.location.origin && 'focus' in c) {
        await c.focus()
        if ('navigate' in c) return c.navigate(url)
        return
      }
    }
    return self.clients.openWindow(url)
  })())
})
