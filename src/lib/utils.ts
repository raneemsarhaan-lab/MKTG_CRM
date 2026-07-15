// Pure utility functions — no side effects, deterministic
// research.md Decision 1, data-model.md §Avatar Color Function

/** Count business days (Mon–Fri) between two dates, inclusive of from. */
export function businessDaysBetween(from: Date, to: Date): number {
  if (from >= to) return 0
  let count = 0
  const cur = new Date(from)
  cur.setHours(0, 0, 0, 0)
  const end = new Date(to)
  end.setHours(0, 0, 0, 0)
  while (cur < end) {
    const day = cur.getDay()
    if (day !== 0 && day !== 6) count++
    cur.setDate(cur.getDate() + 1)
  }
  return count
}

/** Count calendar days between two dates (positive = to is after from). */
export function calDaysBetween(from: Date, to: Date): number {
  const ms = to.getTime() - from.getTime()
  return Math.round(ms / (1000 * 60 * 60 * 24))
}

/** ISO date string for today (YYYY-MM-DD). */
export function todayISO(): string {
  return new Date().toISOString().split('T')[0]
}

/** Up-to-2-letter initials from a display name. */
export function initials(name: string): string {
  return name
    .split(' ')
    .map(p => p[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()
}

/** Deterministic avatar background color based on name hash. */
export function avatarColor(name: string): string {
  const palette = [
    '#1B1D1F', '#6E5BE6', '#3FA34D', '#5B93F5',
    '#E0736A', '#5B6066', '#B4863F',
  ]
  let h = 0
  for (let i = 0; i < name.length; i++) {
    h = (h * 31 + name.charCodeAt(i)) | 0
  }
  return palette[Math.abs(h) % palette.length]
}

/** Soft gradient background derived from brand hex color. */
export function brandGradient(hex: string): string {
  return `linear-gradient(135deg, ${hex}22, ${hex}55)`
}

/** Time-of-day greeting string. */
export function getGreeting(hour: number): 'morning' | 'afternoon' | 'evening' {
  if (hour < 12) return 'morning'
  if (hour < 17) return 'afternoon'
  return 'evening'
}
