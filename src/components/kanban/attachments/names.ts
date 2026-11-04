/**
 * File-name helpers for the Attachments section (spec 007).
 * Pure functions, no React, so the lab can check them in Node (T008).
 */

/** Name and extension. The extension includes its dot; '' when there is none. */
export function splitExt(name: string): { base: string; ext: string } {
  const dot = name.lastIndexOf('.')
  // A leading dot (".env") or a long tail after the dot is not an extension.
  if (dot <= 0 || name.length - dot > 9 || !/^\.[A-Za-z0-9]+$/.test(name.slice(dot))) {
    return { base: name, ext: '' }
  }
  return { base: name.slice(0, dot), ext: name.slice(dot) }
}

/**
 * How a tile shows a name in at most two lines (FR-005, research R3).
 *
 * Up to 24 characters: the whole name, which wraps naturally. Longer: a head
 * that CSS cuts with "…" on line one, and a tail of about 17 characters,
 * moved forward to start at a word, that is never cut. The tail is where "v3",
 * "FINAL" and the extension live, so it is the part that must stay readable.
 */
export function splitName(name: string): { whole: string } | { head: string; tail: string } {
  if (name.length <= 24) return { whole: name }
  let t = name.length - 17
  if (name[t - 1] !== ' ') {
    const sp = name.indexOf(' ', t)
    if (sp > 0 && sp < name.length - 8) t = sp + 1
  }
  return { head: name.slice(0, t), tail: name.slice(t) }
}

/** Same file name, ignoring capitals and surrounding spaces (FR-056). */
export function sameName(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase()
}

/** "name (2).ext", then (3)… — the first one not already taken (FR-056 "Keep both"). */
export function nextFreeName(name: string, taken: string[]): string {
  const { base, ext } = splitExt(name)
  for (let n = 2; n < 1000; n++) {
    const candidate = `${base} (${n})${ext}`
    if (!taken.some(t => sameName(t, candidate))) return candidate
  }
  return `${base} (${Date.now()})${ext}`
}

/** A clipboard picture with no real name: "image.png", or nothing at all. */
export function isGenericClipboardName(name: string | undefined): boolean {
  return !name || /^image\.(png|jpe?g|gif|webp|bmp)$/i.test(name.trim())
}

/** "Screenshot 14.32.png", from local time (FR-051). ASCII in every language: it is a file name. */
export function screenshotName(d: Date, ext = '.png'): string {
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  return `Screenshot ${hh}.${mm}${ext}`
}

/**
 * The name to save after a rename (FR-041): the typed base plus the original
 * extension, never doubled. An empty name keeps the old one (returns null).
 */
export function renamedTo(typed: string, original: string): string | null {
  const { ext } = splitExt(original)
  let base = typed.trim()
  if (!base) return null
  if (ext && base.toLowerCase().endsWith(ext.toLowerCase())) base = base.slice(0, -ext.length).trim()
  if (!base) return null
  const next = `${base}${ext}`
  return next === original ? null : next
}

/** First name for the tile's meta line ("yosra eltopgy" → "yosra"). */
export function firstName(full: string): string {
  return full.trim().split(/\s+/)[0] ?? full
}
