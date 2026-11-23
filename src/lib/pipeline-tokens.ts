/**
 * Pipeline redesign tokens — "Momentum Home — Implementation Spec" §1.
 *
 * A separate table from lib/tokens.ts on purpose. That file holds the earlier
 * My Board handoff, whose palette this one does not match (its border is
 * #ECECF1, My Board's is #ECEAF8), and quietly merging the two would leave
 * neither screen matching its own reference.
 *
 * Exact hex only — the spec's own words: "Nothing here is approximate."
 */
export const PIPE = {
  ink:          '#14131A',
  textPrimary:  '#1F2430',
  textSecondary:'#4A5061',
  textMuted:    '#6B7280',
  textFaint:    '#9096A3',
  textFaintest: '#9CA3AF',
  placeholder:  '#A2A7B4',

  limePrimary:  '#D6F551',
  limeCta:      '#C9F24E',
  purple:       '#7C3AED',
  purpleStroke: '#8B5CF6',
  navy:         '#14133C',

  border:       '#ECECF1',
  borderInput:  '#E9E9EF',
  borderFaint:  '#E6E6EC',
  surface:      '#F3F3F7',
} as const

/**
 * Column accents, §7. The spec names six; the pipeline runs eleven, so the
 * remaining five continue the same progression — cool for content, warm for
 * design, green at the end — rather than reusing the old stage palette, which
 * belongs to a different colour system.
 */
export const PIPE_ACCENT: Record<string, string> = {
  'todo':          '#8B5CF6',
  'c-prog':        '#2563EB',
  'c-final':       '#7C3AED',
  'c-check':       '#F97316',
  'r-design':      '#F59E0B',
  'd-prog':        '#0EA5A5',
  'd-check':       '#0891B2',
  'final-check':   '#6366F1',
  'ready-publish': '#10B981',
  'scheduled':     '#14B8A6',
  'publish':       '#16A34A',
}

/**
 * Each stage's colour, darkened towards ink just enough for 4.5:1 on white
 * and on the column's tint: the column header's count and select box, where
 * the plain accent would be too faint to read (amber 2.2:1). The lightest
 * accents, amber and green, need the most. Same hue, so they still read as
 * the stage.
 */
export const PIPE_ACCENT_INK: Record<string, string> = {
  'todo':          '#7E54DE',
  'c-prog':        '#2563EB',
  'c-final':       '#7C3AED',
  'c-check':       '#B25517',
  'r-design':      '#9B6611',
  'd-prog':        '#107C7E',
  'd-check':       '#0A7995',
  'final-check':   '#5D5FE0',
  'ready-publish': '#11815E',
  'scheduled':     '#147E75',
  'publish':       '#16803E',
}
