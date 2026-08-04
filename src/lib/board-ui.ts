/**
 * The visual language of the planning boards, from the reference design.
 *
 * Kept apart from lib/tokens.ts, which the pipeline board uses. These boards
 * are a different surface — softer cards, a violet accent, coloured stat chips
 * — and folding them into the same token set would drag the pipeline along
 * with every adjustment made here.
 */

export const UI = {
  bg:        '#F7F7FB',
  card:      '#FFFFFF',
  ink:       '#171724',
  muted:     '#7A7A8C',
  faint:     '#A3A3B4',
  line:      '#EDEDF3',
  lineSoft:  '#F4F4F8',

  violet:     '#6C5CE7',
  violetSoft: '#EEEBFD',
  green:      '#22C55E',
  greenSoft:  '#E6F8EC',
  amber:      '#F59E0B',
  amberSoft:  '#FEF3DC',
  rose:       '#E2445C',
  roseSoft:   '#FDECEF',
  blue:       '#3B82F6',
  blueSoft:   '#E8F0FE',

  radius:    16,
  radiusSm:  11,
  shadow:    '0 1px 2px rgba(23,23,36,.05), 0 8px 24px rgba(23,23,36,.05)',
  shadowSm:  '0 1px 2px rgba(23,23,36,.06)',
} as const

/**
 * A duration reads as a warning above a couple of days: a step measured in a
 * week is a step that has not been broken down. The colour is the signal.
 */
export function durationTone(days: number) {
  if (days >= 5) return { fg: UI.rose,  bg: UI.roseSoft }
  if (days >= 2) return { fg: UI.amber, bg: UI.amberSoft }
  return { fg: UI.muted, bg: UI.lineSoft }
}

/** Deterministic avatar colour, so a person keeps the same one everywhere. */
export function personColor(name: string): string {
  const palette = ['#6C5CE7', '#2563A8', '#C2691E', '#1F7A4D', '#A25DDC', '#D99A1F', '#E2445C']
  let h = 0
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0
  return palette[h % palette.length]
}

export const font = {
  h1:     { fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 30, letterSpacing: '-0.03em', color: UI.ink },
  eyebrow:{ fontWeight: 700, fontSize: 10.5, letterSpacing: '.16em', textTransform: 'uppercase' as const, color: UI.faint },
  stat:   { fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 27, letterSpacing: '-0.02em', color: UI.ink },
}

export const card: React.CSSProperties = {
  background: UI.card,
  border: `1px solid ${UI.line}`,
  borderRadius: UI.radius,
  boxShadow: UI.shadowSm,
}

export const input: React.CSSProperties = {
  fontSize: 13, padding: '9px 12px', borderRadius: 10,
  border: `1px solid ${UI.line}`, background: UI.card,
  color: UI.ink, outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box',
}

/** A segmented progress bar — five blocks, filled proportionally. */
export function segments(done: number, total: number, count = 6) {
  const filled = total ? Math.round((done / total) * count) : 0
  return Array.from({ length: count }, (_, i) => i < filled)
}
