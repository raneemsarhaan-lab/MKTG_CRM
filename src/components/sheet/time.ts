/**
 * Clip times (spec 008): how in, out and length are written and read.
 *
 * Always Western digits, whatever the language (spec edge case "Arabic"). Pure.
 */

/** 140200 → "2:20.2"; null → "". Tenths, rounded. */
export function formatClipTime(ms: number | null | undefined): string {
  if (ms == null || !Number.isFinite(ms)) return ''
  const tenths = Math.round(ms / 100)
  const m = Math.floor(tenths / 600)
  const s = (tenths - m * 600) / 10
  return `${m}:${s.toFixed(1).padStart(4, '0')}`
}

/**
 * Reads what someone typed into an In or Out cell. Accepts "2:20.2", "02:20",
 * "2m20.2s", "2m", "140.2" (seconds) and "1:02:03" (hours). Returns ms, or null
 * when it can't be read. An empty string is `undefined` (meaning: clear it).
 */
export function parseClipTime(text: string): number | null | undefined {
  const v = text.trim().replace(/,/g, '.')
  if (!v) return undefined
  let secs: number | null = null
  let m: RegExpExecArray | null
  if ((m = /^(\d+):(\d{1,2}):(\d{1,2}(?:\.\d+)?)$/.exec(v))) {
    secs = Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3])
    if (Number(m[2]) >= 60 || Number(m[3]) >= 60) secs = null
  } else if ((m = /^(\d+):(\d{1,2}(?:\.\d+)?)$/.exec(v))) {
    secs = Number(m[1]) * 60 + Number(m[2])
    if (Number(m[2]) >= 60) secs = null
  } else if ((m = /^(?:(\d+)m)?\s*(?:(\d+(?:\.\d+)?)s)?$/i.exec(v)) && (m[1] || m[2])) {
    secs = Number(m[1] ?? 0) * 60 + Number(m[2] ?? 0)
  } else if ((m = /^(\d+(?:\.\d+)?)$/.exec(v))) {
    secs = Number(m[1])
  }
  if (secs == null || !Number.isFinite(secs) || secs > 24 * 3600) return null
  return Math.round(secs * 1000)
}

/** A clip's length, or null when it lacks either time. */
export function clipLength(inMs: number | null | undefined, outMs: number | null | undefined): number | null {
  return inMs != null && outMs != null && outMs > inMs ? outMs - inMs : null
}

/** The summary line's total: 940000 → "15m 40s"; over an hour, "1h 05m". */
export function formatLength(ms: number): string {
  const s = Math.round(ms / 1000)
  if (s >= 3600) return `${Math.floor(s / 3600)}h ${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}m`
  return `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, '0')}s`
}
