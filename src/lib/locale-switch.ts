/**
 * Switch this browser's language at once: the cookie the server reads, and
 * the page's direction and lang before the refresh lands, so nothing flashes.
 * Callers also store it on the member for phone alerts and emails (spec 012
 * R13) and refresh the page.
 */
export function applyLocale(next: 'en' | 'ar') {
  document.cookie = `fluxo-locale=${next}; path=/; max-age=31536000; SameSite=Lax`
  document.documentElement.dir  = next === 'ar' ? 'rtl' : 'ltr'
  document.documentElement.lang = next
}
