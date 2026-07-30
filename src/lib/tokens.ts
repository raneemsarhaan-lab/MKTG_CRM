// Fluxo Design Tokens — typed constants matching globals.css CSS variables
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

export const STAGE_COLORS: Record<string, string> = {
  'todo':         '#64748B',
  'c-prog':       '#3B82F6',
  'c-final':      '#2E6FB0',
  'c-check':      '#1F5A94',
  'r-design':     '#8B5CF6',
  'd-prog':       '#7C3AED',
  'd-check':      '#5B3FB5',
  'final-check':  '#F59E0B',
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
