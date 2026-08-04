/**
 * The planning boards' design system, from the handoff.
 *
 * Every value is transcribed from "Fluxo Portfolio - Design Spec.md" §1 and
 * "Fluxo Team Tasks - Design Spec.md" §1. The two specs overlap and agree;
 * where only one names a token it is still kept here, because both boards draw
 * from this file.
 *
 * Kept apart from lib/tokens.ts, which the pipeline board uses. These are a
 * different surface with a different palette, and folding them together would
 * drag the pipeline along with every adjustment made here.
 */

export const UI = {
  /* text */
  ink:        '#14131A',   // logo, page title, KPI numbers
  textPrimary:'#1F2430',   // card + task titles, control labels
  textSecond: '#4A5061',   // subtitle, inactive nav/tab labels
  muted:      '#6B7280',   // control icons, chevrons
  soft:       '#8A90A0',   // meta lines, due dates, units
  faint:      '#9096A3',   // eyebrow, kebab, sidebar role
  faintest:   '#A2A7B4',   // axis + day labels, placeholders

  /* lime */
  lime:       '#D6F551',   // active toggle pill, chart bars
  limeCta:    '#C9F24E',   // logo sparkle, active member chip border
  limeDeep:   '#B7D93F',   // today's bar
  limeDot:    '#C9D633',   // title sparkle, progress fills
  limeTint:   '#F4FBD6',   // active sidebar nav row
  limeTint2:  '#F1FAD6',   // active tab pill
  limeBg:     '#FBFFEE',   // active member chip background

  /* purple */
  purple:     '#7C3AED',
  purpleStroke:'#8B5CF6',
  purpleTint: '#F0EBFE',
  purpleSoft: '#A78BFA',   // project bullet dots
  purpleLine: '#EDEBFA',   // project tree left rail
  purplePale: '#A5B4FC',   // days-left progress fill

  /* status */
  green:      '#16A34A',
  amber:      '#EA8C0B',
  amberDeep:  '#E07C0B',
  blue:       '#2563EB',
  indigo:     '#4F46E5',
  red:        '#E0294B',
  redStrong:  '#D22040',
  star:       '#F2A93B',
  teal:       '#0EA5A5',

  /* lines and surfaces */
  border:     '#ECECF1',   // every card border
  borderInput:'#E9E9EF',   // every control border
  borderSide: '#EFEFF3',
  track:      '#F0F0F4',
  gridLine:   '#EDEDF2',
  axisLine:   '#E4E4EA',
  zeroBar:    '#E9E9EE',
  surface:    '#F3F3F7',   // toggle group bg
  segEmpty:   '#EDEDF2',
  groupBg:    '#FBFBFC',   // expanded group body
  groupLine:  '#F0F0F4',
  checkbox:   '#D3D3DC',
  trackAmber: '#FDF2E2',

  /* brand marks used by the mock; real logos win when a brand has one */
  brandRed:   '#E8253C',
  navy:       '#14133C',
  brown:      '#6B4A3A',
} as const

/** Tile tints, in the order the specs list them for KPI and project icons. */
export const TILE = {
  purple: '#F0EBFE',
  lime:   '#F1FAE0',
  amber:  '#FFF3E6',
  indigo: '#EEF2FF',
  red:    '#FDECEF',
  blue:   '#EAF2FE',
  teal:   '#E4F7F4',
} as const

export const font = {
  eyebrow: {
    fontWeight: 800, fontSize: 11.5, letterSpacing: '0.14em',
    textTransform: 'uppercase' as const, color: UI.faint,
  },
  /** Caveat 52 — the page title on both boards. */
  title: {
    fontFamily: 'var(--font-accent)', fontWeight: 700, fontSize: 52,
    lineHeight: 1, color: UI.ink,
  },
  subtitle: { fontWeight: 500, fontSize: 14.5, color: UI.textSecond },
  kpiLabel: {
    fontWeight: 800, fontSize: 11.5, letterSpacing: '0.08em', color: UI.textPrimary,
  },
  kpiValue: {
    fontWeight: 800, fontSize: 34, letterSpacing: '-0.03em', color: UI.ink,
  },
  cardTitle: { fontWeight: 700, fontSize: 17, letterSpacing: '-0.01em', color: UI.ink },
}

export const card: React.CSSProperties = {
  background: '#FFFFFF',
  border: `1px solid ${UI.border}`,
  borderRadius: 16,
}

/** A control: select, button, search field. Border differs from cards. */
export const control: React.CSSProperties = {
  height: 48,
  border: `1px solid ${UI.borderInput}`,
  borderRadius: 12,
  background: '#FFFFFF',
  display: 'flex',
  alignItems: 'center',
  boxSizing: 'border-box',
}

export const input: React.CSSProperties = {
  fontSize: 13.5, fontWeight: 500, padding: '9px 12px', borderRadius: 10,
  border: `1px solid ${UI.borderInput}`, background: '#FFFFFF',
  color: UI.textPrimary, outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box',
}

/**
 * Duration colours — Team Tasks §8.4: 1d green, 2d amber, 3d deeper amber.
 * Anything longer keeps the deepest tone; a step measured in a week is a step
 * that has not been broken down.
 */
export function durationTone(days: number) {
  if (days >= 3) return UI.amberDeep
  if (days >= 2) return UI.amber
  return UI.green
}

/** Deterministic avatar colour, so a person keeps the same one everywhere. */
export function personColor(name: string): string {
  const palette = ['#7C3AED', '#B4712F', '#16794A', '#2563A8', '#C2691E', '#6B4A3A', '#E8253C']
  let h = 0
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0
  return palette[h % palette.length]
}

/**
 * How a project is travelling, for the footer chip in Portfolio §8.
 *
 * Behind and At risk are different failures: Behind is work already missed,
 * At risk is a deadline that cannot be reached at the current rate. A project
 * with nothing late but nine steps and a fortnight is not "on track", and
 * saying so is the whole point of the chip.
 */
export type Track = 'ontrack' | 'risk' | 'behind'

export function trackOf(
  p: { steps: { done: boolean; dueDate: string | null }[]; dueDate: string | null },
  today: string,
): Track {
  const late = p.steps.filter(s => !s.done && s.dueDate && s.dueDate < today).length
  if (late > 0) return 'behind'

  const open = p.steps.filter(s => !s.done).length
  if (!open || !p.dueDate) return 'ontrack'

  // Calendar days to the deadline, against one working day per open step.
  const days = Math.round(
    (new Date(p.dueDate + 'T00:00:00').getTime() - new Date(today + 'T00:00:00').getTime()) / 864e5,
  )
  return days < open ? 'risk' : 'ontrack'
}

export const TRACK_STYLE: Record<Track, { label: string; bg: string; fg: string }> = {
  ontrack: { label: 'On track', bg: '#E9F8EE', fg: UI.green },
  risk:    { label: 'At risk',  bg: '#FDE7EA', fg: UI.redStrong },
  behind:  { label: 'Behind',   bg: '#FFF1E3', fg: UI.amberDeep },
}

/** A segmented bar of equal total width — Team Tasks §9. */
export function segmentWidth(count: number, total = 146, gap = 4) {
  return Math.max(6, Math.round((total - (count - 1) * gap) / Math.max(1, count)))
}
