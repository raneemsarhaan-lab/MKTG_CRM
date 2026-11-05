/**
 * The team's clip file names (spec 008 FR-032, contracts/paste-format.md).
 *
 *   30_IMG_0296_6m12.4s-7m20.9s.mp4  →  clip 30 of IMG_0296, 6:12.4 → 7:20.9
 *
 * Shared by the paste preview and by `addClips`, which re-reads every name on
 * the server instead of trusting times sent by the browser. Pure: no React, no
 * Prisma.
 */

export const FILE_RE = /^(\d+)_(.+)_(\d+)m(\d+(?:\.\d+)?)s-(\d+)m(\d+(?:\.\d+)?)s\.(mp4|mov|m4v)$/i

export interface ParsedClipFileName {
  clip_no: number
  source: string
  in_ms: number
  out_ms: number
}

/** The clip details a file name carries, or null when it isn't a clip file name. */
export function parseClipFileName(name: string | null | undefined): ParsedClipFileName | null {
  const m = FILE_RE.exec((name ?? '').trim())
  if (!m) return null
  const in_ms  = Math.round((Number(m[3]) * 60 + Number(m[4])) * 1000)
  const out_ms = Math.round((Number(m[5]) * 60 + Number(m[6])) * 1000)
  // An out time that isn't after the in time is not a clip.
  if (!(out_ms > in_ms)) return null
  const clip_no = Number(m[1])
  if (!Number.isSafeInteger(clip_no) || clip_no > 9999) return null
  return { clip_no, source: m[2].slice(0, 120), in_ms, out_ms }
}

/** How file names are compared: the same clip whatever its letter case. */
export function fileNameKey(name: string | null | undefined): string {
  return (name ?? '').trim().toLowerCase()
}
