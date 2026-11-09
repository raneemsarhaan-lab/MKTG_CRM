// Momentum Design Tokens — typed constants matching globals.css CSS variables
// constitution.md §I Design System Fidelity

export const COLORS = {
  ink:    '#1B1A13',
  rail:   '#17181A',
  lime:   '#C8F24E',
  coral:  '#F5334F',
  violet: '#B79CF5',
  cyan:   '#5B93F5',
  mint:   '#3FA34D',
  muted:  '#8A8D91',
  soft:   '#F7F7F7',
  panel:  '#FFFFFF',
  line:   '#E1E1E0',
} as const

/**
 * The blue + lime UI palette of the task panel's editing surfaces: the brief
 * editor today, TaskModal's and TaskForm's local `CU` constants next.
 *
 * Mirrored once as `--brief-*` CSS variables in globals.css, because a
 * stylesheet cannot read this file. Change both together.
 */
export const BRIEF_UI = {
  ink:        '#18233F',
  label:      '#68738D',
  faint:      '#929CB0',
  line:       '#E9EDF4',
  surface:    '#F8FAFD',
  blue:       '#3563E9',
  blueLight:  '#EEF3FF',
  blueActive: '#E5EDFF',
  error:      COLORS.coral,
} as const

/**
 * The task panel's Attachments section (spec 007): roles BRIEF_UI lacks.
 * Mirrored as `--att-*` CSS variables in globals.css. Change both together.
 */
export const ATTACH_UI = {
  /** The "Latest" pill: the app's neon green with dark text (FR-002). */
  latestBg:   COLORS.lime,
  latestText: BRIEF_UI.ink,
  /** Upload in progress: pill and bar. */
  uploading:  '#7C3AED',
  /** Too large / not uploaded: pill, text and tile tint. */
  danger:     '#D22040',
  dangerSoft: '#FDE7EA',
  dangerLine: '#F3C2CB',
  /** The preview overlay's backdrop, and its controls on top of it. */
  backdrop:   '#0A0A0E',
  onDark:     '#FFFFFF',
} as const

/**
 * The video sheet (spec 008): a dense spreadsheet grid. Mirrored as `--sheet-*`
 * CSS variables in globals.css. Change both together.
 */
export const SHEET_UI = {
  ink:          COLORS.ink,
  panel:        COLORS.panel,
  /** Gridlines on every cell. */
  grid:         '#E2E3E3',
  /** The header row and the summary line. */
  headerBg:     '#F3F4F2',
  /** Row numbers and other quiet text. */
  muted:        '#5E6166',
  /** The row-number gutter. */
  gutter:       '#F8F9F8',
  /** The line after the frozen title column and under the header. */
  frozenLine:   '#C9CBC9',
  /** The video's own row. */
  videoRowBg:   '#F4F8E4',
  /** A row reached from "Open sheet" on a clip, and the active row. */
  highlight:    '#FAFDE9',
  hover:        '#F6F8FB',
  /** Dropped clips: struck through, in this colour. */
  droppedInk:   '#6B6E72',
  /** "Missing link" on a published clip. */
  missingLink:  '#8A5300',
  missingLinkBg:'#FDF3E3',
  /** The active cell's ring, and focus. */
  focus:        BRIEF_UI.blue,
  link:         '#1F5FD1',
  /** The status menu's "Next" item. */
  menuNext:     COLORS.lime,
  menuNextInk:  COLORS.ink,
  danger:       ATTACH_UI.danger,
  dangerSoft:   ATTACH_UI.dangerSoft,
  /** A theme meeting its cadence (spec 009). */
  ok:           '#2B7A37',
  /** Behind the Paste clips dialog (CSS uses it at 45 % opacity). */
  backdrop:     '#111214',
} as const

/**
 * One colour per kind of non-image file, for the extension badge on a tile
 * and in the preview (spec 007 FR-004). Lifted from TaskModal's EXT_COLORS.
 */
export const FILE_KIND_COLORS = {
  pdf:         '#E5484D',
  document:    '#2F6FEB',
  slides:      '#D97706',
  spreadsheet: '#16A34A',
  video:       '#7C3AED',
  audio:       '#0D9488',
  subtitles:   '#0D9488',
  archive:     '#6B7280',
  other:       '#8A8F98',
} as const
export type FileKindColor = keyof typeof FILE_KIND_COLORS

/** `#RRGGBB` → `rgba(r, g, b, a)`: shadows and tints derived from a token. */
export function alpha(hex: string, a: number): string {
  const n = parseInt(hex.slice(1), 16)
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`
}

/**
 * The Board Inbox (spec 006), from the approved preview "Option B · Inbox
 * button". Built on the pipeline palette; CSS reads the same values as
 * --inbox-* variables in globals.css.
 */
export const INBOX_UI = {
  ink:        '#14131A',
  text:       '#1F2430',
  text2:      '#4A5061',
  muted:      '#6B7280',
  faint:      '#6E727C',
  border:     '#ECECF1',
  surface:    '#F3F3F7',
  panel:      '#FFFFFF',
  purple:     '#7C3AED',
  purpleDeep: '#6D28D9',
  purpleSoft: '#F0EBFE',
  lime:       '#C9F24E',
  late:       '#C81E3A',
  lateSoft:   '#FDE7EA',
  today:      '#B45309',
  todaySoft:  '#FFF3E6',
  /** The urgent badge: orange fill, dark ink for contrast. */
  urgent:     '#F59E0B',
  ok:         '#15803D',
  okSoft:     '#E8F7EE',
  pink:       '#D6336C',
  pinkSoft:   '#FCE7F0',
  teal:       '#0E7C7C',
  tealSoft:   '#E3F6F6',
  blue:       '#2563EB',
  blueSoft:   '#E8EEFE',
} as const

/**
 * A status pill's fill and edge (the sheets): the stage colour mixed with
 * white, so the dark label keeps AA contrast on every stage.
 */
export function stageTint(stage: string): { fill: string; edge: string } {
  const hex = (STAGE_COLORS[stage] ?? '#64748B').replace('#', '')
  const n = parseInt(hex, 16)
  const mix = (a: number) => {
    const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map(v => Math.round(v * a + 255 * (1 - a)))
    return `#${c.map(v => v.toString(16).padStart(2, '0')).join('')}`
  }
  return { fill: mix(0.14), edge: mix(0.38) }
}

/**
 * The Content sheet's Type cell (a filled pill per content type). Each colour
 * carries white text at AA contrast or better. Unknown types take one of these
 * by name, so a type keeps its colour everywhere.
 */
export const CONTENT_TYPE_COLORS: Record<string, string> = {
  'Post':            '#1D4ED8',
  'Reel':            '#BE185D',
  'Video':           '#7E22CE',
  'Article':         '#0F766E',
  'Report':          '#B45309',
  'Framework/Model': '#4338CA',
  'Story':           '#C2410C',
  'Deck':            '#334155',
  'Design':          '#A21CAF',
  'Email':           '#0369A1',
  'Other':           '#52525B',
}
/** A Choice column's option colours (spec 010), each with white text at AA or better. */
export const CHOICE_COLORS = [
  '#1D4ED8', '#BE185D', '#7E22CE', '#0F766E', '#B45309',
  '#4338CA', '#C2410C', '#334155', '#A21CAF', '#0369A1',
] as const
export function contentTypeColor(label: string | null | undefined): string {
  if (!label) return CONTENT_TYPE_COLORS.Other
  if (CONTENT_TYPE_COLORS[label]) return CONTENT_TYPE_COLORS[label]
  const all = Object.values(CONTENT_TYPE_COLORS)
  let h = 0
  for (let i = 0; i < label.length; i++) h = (h * 31 + label.charCodeAt(i)) >>> 0
  return all[h % all.length]
}

export const STAGE_COLORS: Record<string, string> = {
  'todo':         '#64748B',
  'c-prog':       '#3B82F6',
  'c-final':      '#2E6FB0',
  'c-check':      '#1F5A94',
  'r-design':     '#8B5CF6',
  'd-prog':       '#7C3AED',
  'd-check':      '#5B3FB5',
  'final-check':  '#F59E0B',
  'ready-publish':'#0EA5E9',
  'scheduled':    '#14B8A6',
  'publish':      '#22C55E',
}

// Access tier badge colors — constitution.md §III
export const ACCESS_BADGE: Record<string, { bg: string; text: string }> = {
  admin:      { bg: '#C3F53D', text: '#111111' },
  superuser:  { bg: '#B79CF5', text: '#111111' },
  user:       { bg: '#EDEDEA', text: '#6B6B6B' },
}

// AlertStatus badge styles — data-model.md §AlertStatus Badge Styles
import type { AlertStatus } from '@/types/index'

export const ALERT_BADGE_STYLES: Record<AlertStatus, { bg: string; text: string }> = {
  'On Track':  { bg: '#EDF6C6', text: '#4B7A12' },
  'At Risk':   { bg: '#F7EFD3', text: '#A9791F' },
  'Will Miss': { bg: '#F7E6D8', text: '#BF5A2A' },
  'Stuck':     { bg: '#F8E7E5', text: '#C0453E' },
  'Idle':      { bg: '#F1ECDD', text: '#7E6A3D' },
  'Overdue':   { bg: '#F8E7E5', text: '#C0453E' },
}

// BigStat card gradient backgrounds
export const BIG_STAT_GRADIENTS: Record<'danger' | 'accent' | 'lime' | 'default', string> = {
  danger:  'linear-gradient(135deg, #F5334F22, #F5334F44)',
  accent:  'linear-gradient(135deg, #B79CF522, #B79CF544)',
  lime:    'linear-gradient(135deg, #C8F24E22, #C8F24E44)',
  default: 'linear-gradient(135deg, #F59E0B22, #F59E0B44)',
}

// Flat tint backgrounds for My Board stat cards (reference: a646bb17-Fluxo_My_Board)
export const STAT_CARD_TINTS: Record<'accent' | 'default' | 'danger' | 'lime', { bg: string; value: string; label: string }> = {
  accent:  { bg: '#EBE6FD', value: '#6B49DB', label: '#7B5BDC' },
  default: { bg: '#FDF3E3', value: '#C27A0A', label: '#C47C0A' },
  danger:  { bg: '#FCE8EA', value: '#C0202F', label: '#C03030' },
  lime:    { bg: '#E8F9EE', value: '#1F7A35', label: '#2E8B4F' },
}

// Celebration reaction colors — constitution.md §V
export const REACTION_COLORS: Record<string, string> = {
  zaghrota: '#D4537E',
  tasqeef:  '#378ADD',
  mabhour:  '#EF9F27',
  tabla:    '#534AB7',
}

// Brand palette for color picker in AddBrandModal
export const BRAND_PALETTE = [
  '#B4322F', '#0E7C7B', '#7A5A2E', '#1E293B',
  '#3B82F6', '#8B5CF6', '#EC4899', '#F59E0B',
  '#10B981', '#EF4444', '#6366F1', '#14B8A6',
]

/**
 * Notifications (spec 012, design/notifications.html). The bell's count is
 * red so it never reads as the Inbox's purple or orange one; unread rows are
 * tinted, with a blue dot and time. Mirrored as --nt-* in globals.css.
 */
export const NOTIFY_UI = {
  red:        '#E5484D',
  tint:       '#F4F0FF',
  tintHover:  '#ECE5FF',
  blue:       '#2563EB',
  /** Text on the unread tint (contrast ≥ 4.5:1). */
  blueText:   '#1D4ED8',
  mutedOnTint: '#4B5563',
  kinds: {
    comment:               '#2563EB',
    reply:                 '#0E7C7C',
    attachment:            '#B45309',
    task_created_in_stage: '#7C3AED',
    task_moved_to_stage:   '#7C3AED',
    assigned:              '#15803D',
    mention:               '#D6336C',
    due_soon:              '#C81E3A',
    overdue:               '#C81E3A',
  },
} as const

