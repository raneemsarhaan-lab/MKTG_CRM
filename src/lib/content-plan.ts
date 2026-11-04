/**
 * Reading the team's Content Library rows (spec 009 research R8): statuses,
 * types, frequency, audience, Task Links and links. Shared by the paste
 * preview and by `addPlan`, which re-reads every value on the server. Pure.
 */
import type { AudienceKey, FrequencyPeriod, StageId } from '@/types/index'
import { STAGE_META } from '@/lib/stage-meta'

/** The team's audience segments, in display order (data-model §3). */
export const AUDIENCE_KEYS: AudienceKey[] = ['c-level', 'strategy-heads', 'top-management', 'second-line', 'ceo-mid']

/** The content types the Content Library uses, plus the board's own. */
export const KNOWN_TYPES = ['Post', 'Video', 'Reel', 'Design', 'Email', 'Story', 'Deck', 'Other', 'Article', 'Report', 'Framework/Model']

/** The Content sheet's words for each stage (FR-020), as typed in the reference. */
export const CONTENT_STAGE_WORDS: Record<StageId, string> = {
  'todo': 'Planned', 'c-prog': 'Writing', 'c-final': 'Content Review', 'c-check': 'Content Check',
  'r-design': 'Ready for Design', 'd-prog': 'Initial Design', 'd-check': 'Final Design', 'final-check': 'Final Check',
  'ready-publish': 'Ready to Publish', 'scheduled': 'Scheduled', 'publish': 'Published',
}
const VIDEO_STAGE_WORDS: Partial<Record<StageId, string[]>> = {
  'c-prog': ['Script'], 'c-final': ['Script Review'], 'c-check': ['Script Check'], 'r-design': ['Ready to Edit'],
  'd-prog': ['Editing'], 'd-check': ['Edit Review'], 'final-check': ['Final Cut'],
}

export const norm = (s: string | null | undefined) => (s ?? '').toLowerCase().replace(/[^a-z0-9؀-ۿ]+/g, '')

const STATUS_INDEX: Map<string, StageId> = (() => {
  const m = new Map<string, StageId>()
  for (const id of Object.keys(STAGE_META) as StageId[]) {
    m.set(norm(id), id)
    m.set(norm(STAGE_META[id].label_en), id)
    m.set(norm(CONTENT_STAGE_WORDS[id]), id)
    for (const w of VIDEO_STAGE_WORDS[id] ?? []) m.set(norm(w), id)
  }
  m.set(norm('Idea'), 'todo')
  m.set(norm('In Design'), 'd-prog')
  return m
})()

/**
 * A pasted status: a stage, Archived, blank (To Do) or unknown (null).
 * Content words, real stage names and video words are all accepted, ignoring
 * capitals and spaces.
 */
export function readStatus(text: string | null | undefined): { stage: StageId; archived: boolean } | null {
  const n = norm(text)
  if (!n) return { stage: 'todo', archived: false }
  if (n === 'archived' || n === 'dropped') return { stage: 'todo', archived: true }
  const stage = STATUS_INDEX.get(n)
  return stage ? { stage, archived: false } : null
}

/** A pasted type: "Social Media" is a Post; unknown types are Other; blank is null. */
export function readType(text: string | null | undefined, known: string[] = KNOWN_TYPES): string | null {
  const n = norm(text)
  if (!n) return null
  if (n === 'socialmedia' || n === 'social' || n === 'sm' || n === 'linkedinpost') return 'Post'
  if (n === 'framework' || n === 'model' || n === 'frameworkmodel') return 'Framework/Model'
  return known.find(k => norm(k) === n) ?? 'Other'
}

/** "2 per week", "1/week", "3 a month" → a count and period; null when not readable. */
export function readFrequency(text: string | null | undefined): { count: number; period: FrequencyPeriod } | null {
  const m = /(\d{1,2})\s*(?:x|times)?\s*(?:per|\/|a|every|each|in)?\s*(week|wk|w|month|mo|m)\b/i.exec((text ?? '').trim())
  if (!m) return null
  const count = Number(m[1])
  if (count < 1 || count > 50) return null
  return { count, period: /^w/i.test(m[2]) ? 'week' : 'month' }
}

/** "C-Level, Strategy Heads, Top Management" → audience keys, in list order. */
export function readAudience(text: string | null | undefined): AudienceKey[] {
  const out = new Set<AudienceKey>()
  for (const part of (text ?? '').split(/[,;\n]+/)) {
    const n = norm(part)
    if (!n) continue
    if (/clevel|csuite|executive/.test(n) && !/ceo/.test(n)) out.add('c-level')
    else if (/strategy/.test(n)) out.add('strategy-heads')
    else if (/top|seniormanagement|heads|directors/.test(n)) out.add('top-management')
    else if (/2nd|second|middle|line/.test(n)) out.add('second-line')
    else if (/ceo/.test(n)) out.add('ceo-mid')
  }
  return AUDIENCE_KEYS.filter(k => out.has(k))
}

const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i

/** The task id of a Momentum task link (…/board?task=<uuid>), or a bare id. */
export function taskIdFromLink(text: string | null | undefined): string | null {
  const v = (text ?? '').trim()
  if (!v) return null
  try {
    const u = new URL(v)
    const q = u.searchParams.get('task')
    if (q && UUID.test(q)) return q.match(UUID)![0].toLowerCase()
  } catch { /* not a URL */ }
  const m = /^[0-9a-f-]{36}$/i.test(v) ? v.match(UUID) : null
  return m ? m[0].toLowerCase() : null
}

/** A web address we will store: http(s), no spaces, at most 2,000 characters. */
export function isWebLink(text: string | null | undefined): boolean {
  const v = (text ?? '').trim()
  if (!v || v.length > 2000 || /\s/.test(v)) return false
  try { const u = new URL(v); return u.protocol === 'http:' || u.protocol === 'https:' } catch { return false }
}

/** What a link cell shows: the site's name. */
export function siteName(url: string | null | undefined): string {
  try {
    const host = new URL(url ?? '').hostname.replace(/^www\./, '')
    if (/^docs\.google\.com$/.test(host)) return 'Google Docs'
    if (/^drive\.google\.com$/.test(host)) return 'Google Drive'
    return host
  } catch { return '' }
}
