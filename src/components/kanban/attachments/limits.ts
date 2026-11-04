/**
 * Size limits for the Attachments section (spec 007 FR-052, FR-054; research R6, R7).
 * Pure functions, no React.
 */
import { MAX_INLINE_BYTES, MAX_UPLOAD_BYTES } from '@/lib/attachments'

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

/** Exact sizes for files: "220 KB", "1.4 MB", "12.4 MB", "210.0 MB". */
export function formatBytes(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n) || n < 0) return ''
  if (n < 1024) return `${n} B`
  const kb = n / 1024
  if (kb < 1024) return `${Math.round(kb)} KB`
  const mb = kb / 1024
  if (mb < 1024) return `${mb.toFixed(1)} MB`
  return `${(mb / 1024).toFixed(1)} GB`
}
