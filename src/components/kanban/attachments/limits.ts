/**
 * Size limits for the Attachments section (spec 007 FR-052, FR-054; research R6, R7).
 * Pure functions, no React.
 */
import { MAX_INLINE_BYTES, MAX_UPLOAD_BYTES } from '@/lib/attachments'
import { intlLocale } from '@/lib/sheet-format'

/** The per-file limit that applies on this deployment. */
export function limitFor(hasStorage: boolean): number {
  return hasStorage ? MAX_UPLOAD_BYTES : MAX_INLINE_BYTES
}

/**
 * Which label to show for the limit: "Up to 200 MB each" or "Up to about 5 MB
 * each". A message key, not a number, so the inline limit never prints as
 * "5.2 MB" (analysis A1).
 */
export function limitLabelKey(hasStorage: boolean): 'limitStorage' | 'limitInline' {
  return hasStorage ? 'limitStorage' : 'limitInline'
}

/** Size units as written in each language the app ships. */
const UNITS: Record<'en' | 'ar', [string, string, string, string]> = {
  en: ['B', 'KB', 'MB', 'GB'],
  ar: ['بايت', 'كيلوبايت', 'ميغابايت', 'غيغابايت'],
}

/**
 * Exact sizes for files: "220 KB", "1.4 MB", "12.4 MB", "210.0 MB", with the
 * locale's digits and a non-breaking space so the number never wraps away
 * from its unit. Not Intl's unit style: it writes "kB" in English.
 *
 * `locale` defaults to the page's language, since some callers (the upload
 * queue, server-side helpers) have no locale of their own.
 */
export function formatBytes(n: number | null | undefined, locale?: string): string {
  if (n == null || !Number.isFinite(n) || n < 0) return ''
  const lang = locale ?? (typeof document !== 'undefined' ? document.documentElement.lang : '')
  const loc = intlLocale(lang || 'en')
  const units = UNITS[loc.startsWith('ar') ? 'ar' : 'en']
  const num = (v: number, digits: number) =>
    new Intl.NumberFormat(loc, { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(v)
  if (n < 1024) return `${num(n, 0)} ${units[0]}`
  const kb = n / 1024
  if (kb < 1024) return `${num(Math.round(kb), 0)} ${units[1]}`
  const mb = kb / 1024
  if (mb < 1024) return `${num(mb, 1)} ${units[2]}`
  return `${num(mb / 1024, 1)} ${units[3]}`
}
