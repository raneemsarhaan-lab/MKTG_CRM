/**
 * Workspace search (user, 2026-11-23). Pure: the server action, the lab and
 * the tests use it. Matching ignores case, Arabic letter forms, diacritics and
 * tatweel; ranking puts exact matches first, then the closest and most
 * relevant results.
 *
 * Levels (a lower level never appears above a higher one):
 *   1  the task name is the search text
 *   2  the task name starts with it
 *   3  every search word is in the name (the phrase in order before any order)
 *   4  Caption, TOV or Description contains the search text
 *   5  every search word is in Caption, TOV or Description
 *   6  close matches: typos, singular/plural and word endings, partial words
 *   7  other fields: brand, Space, assignee, tags, custom fields, asset names
 * Within a level: fewer spelling mistakes (level 6), open before Published,
 * the page's Space or brand first, then the publishing date nearest today
 * (upcoming first, then most recent).
 *
 * "Text in quotes" is an exact phrase: no close matches.
 */

// ─── normalising ────────────────────────────────────────────────────────────

const AR_DIACRITICS = /[ؐ-ًؚ-ٰٟۖ-ۭ]/g
const TATWEEL = /ـ/g

/** Lower case; Arabic أ إ آ ٱ → ا, ة → ه, ى → ي; no diacritics or tatweel; Arabic digits → 0–9; Latin accents dropped. */
export function normalize(s: string): string {
  return s
    .normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .replace(AR_DIACRITICS, '').replace(TATWEEL, '')
    .replace(/[أإآٱ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي')
    .replace(/[٠-٩]/g, d => String(d.charCodeAt(0) - 0x0660))
    .toLowerCase()
}

/**
 * QA 26 Nov 2026 (F14): the Arabic article and the joined forms before it (ال، وال، بال، كال، فال، لل) are
 * left out of a word, in the search and in the titles alike, so "حملة" finds "إطلاق الحملة".
 */
const AR_ARTICLE = /^(?:وال|بال|كال|فال|لل|ال)(?=[\u0621-\u064A]{2,})/
export const unArticle = (w: string): string => w.replace(AR_ARTICLE, '')

/** The words of a text, normalised (the Arabic article left out). */
export const words = (s: string | null | undefined): string[] => (s ? normalize(s).split(/[^\p{L}\p{N}]+/u).filter(Boolean).map(unArticle) : [])

const LATIN = /^[a-z0-9]+$/

/** One stem for singular/plural and common endings (-s, -es, -ies, -ing, -ed), Latin words only. */
export function stem(w: string): string {
  if (!LATIN.test(w) || w.length < 4) return w
  let s = w
  if (s.length > 4 && s.endsWith('ies')) s = `${s.slice(0, -3)}y`
  else if (s.length > 5 && s.endsWith('ing')) s = s.slice(0, -3)
  else if (s.length > 4 && s.endsWith('ed')) s = s.slice(0, -2)
  else if (s.length > 4 && s.endsWith('es')) s = s.slice(0, -2)
  else if (s.endsWith('s') && !s.endsWith('ss')) s = s.slice(0, -1)
  if (s.length > 3 && s.endsWith('e')) s = s.slice(0, -1)
  return s
}

/** Edits between two words: a wrong, missing or extra letter, or two letters swapped, each count one. */
export function distance(a: string, b: string, max = 3): number {
  if (a === b) return 0
  if (Math.abs(a.length - b.length) > max) return max + 1
  const d: number[][] = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)])
  for (let j = 1; j <= b.length; j++) d[0][j] = j
  for (let i = 1; i <= a.length; i++) {
    let best = Infinity
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost)
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1)
      best = Math.min(best, d[i][j])
    }
    if (best > max) return max + 1
  }
  return d[a.length][b.length]
}

/** Mistakes a search word may have: none under 4 letters, two from 7 letters, otherwise one. */
export const allowed = (w: string) => (w.length < 4 ? 0 : w.length >= 7 ? 2 : 1)

/**
 * How a search word matches a word of the text: 0 the same word (or the same
 * after singular/plural and endings), 0.5 a partial word (3+ letters, start of
 * the word), 1–2 spelling mistakes; null when it doesn't.
 */
export function wordCost(q: string, w: string): number | null {
  if (q === w) return 0
  if (q.length >= 4 && stem(q) === stem(w)) return 0
  if (q.length >= 3 && w.startsWith(q)) return 0.5
  const max = allowed(q)
  if (!max) return null
  // The ending isn't a mistake: compare with and without it on either side.
  const sq = stem(q), sw = stem(w)
  const d = Math.min(distance(q, w, max), distance(sq, sw, max), distance(q, sw, max), distance(sq, w, max))
  return d <= max ? d : null
}

/** The best match of each search word among the text's words: the total cost, and the text's words that matched. */
function fuzzy(q: string[], text: string[]): { cost: number; hits: string[] } | null {
  let cost = 0
  const hits: string[] = []
  for (const qw of q) {
    let best: { c: number; w: string } | null = null
    for (const w of text) {
      const c = wordCost(qw, w)
      if (c !== null && (!best || c < best.c)) { best = { c, w }; if (c === 0) break }
    }
    if (!best) return null
    cost += best.c
    hits.push(best.w)
  }
  return { cost, hits }
}

const hasPhrase = (text: string[], q: string[]) => {
  if (!q.length || q.length > text.length) return false
  outer: for (let i = 0; i + q.length <= text.length; i++) {
    for (let j = 0; j < q.length; j++) if (text[i + j] !== q[j]) continue outer
    return true
  }
  return false
}
const allIn = (text: string[], q: string[]) => q.every(w => text.includes(w))

// ─── the query ──────────────────────────────────────────────────────────────

export interface Query { raw: string; words: string[]; exact: boolean }

/** A search's words; text in quotes ("Ramadan nights") is an exact phrase. */
export function parseQuery(raw: string): Query {
  const t = raw.trim()
  const quoted = /^["“”«»].*["“”«»]$/.test(t) && t.length > 2
  return { raw: t, words: words(quoted ? t.slice(1, -1) : t), exact: quoted }
}

// ─── ranking a task ─────────────────────────────────────────────────────────

export type MatchField = 'name' | 'caption' | 'tov' | 'description' | 'brand' | 'space' | 'assignee' | 'tag' | 'field' | 'asset'

export interface Searchable {
  id: string
  name: string
  /** Caption, TOV and Description, by field. */
  text: { field: 'caption' | 'tov' | 'description'; value: string }[]
  /** Brand, Space, assignee, tags, custom fields, asset names. */
  other: { field: Exclude<MatchField, 'name' | 'caption' | 'tov' | 'description'>; label?: string; value: string }[]
  open: boolean
  brand_id: string | null
  space_ids: string[]
  publish_date: string | null
}

export interface Hit {
  id: string
  level: 1 | 2 | 3 | 4 | 5 | 6 | 7
  /** Order inside the level before the tie-breaks: phrase before any order (3); fewer mistakes (6). */
  sub: number
  field: MatchField
  /** A custom field's name, when field is 'field'. */
  fieldLabel?: string
  /** The words to show in bold (normalised; the client bolds words that normalise to these). */
  bold: string[]
  /** The matched text, when it isn't the name (a short excerpt). */
  snippet?: string
}

function excerpt(value: string, bold: string[], max = 110): string {
  const plain = value.replace(/[#*_`>\[\]()!-]+/g, ' ').replace(/\s+/g, ' ').trim()
  if (plain.length <= max) return plain
  const parts = plain.split(/(\s+)/)
  let at = 0, pos = 0
  for (const p of parts) { if (bold.includes(normalize(p).replace(/[^\p{L}\p{N}]/gu, ''))) { at = pos; break } pos += p.length }
  const start = Math.max(0, at - 30)
  return `${start > 0 ? '…' : ''}${plain.slice(start, start + max).trim()}${start + max < plain.length ? '…' : ''}`
}

/** The best level a task reaches for a query, or null. */
export function matchTask(t: Searchable, q: Query): Hit | null {
  if (!q.words.length) return null
  const name = words(t.name)
  const joined = q.words.join(' ')
  const nameJoined = name.join(' ')
  if (nameJoined === joined) return { id: t.id, level: 1, sub: 0, field: 'name', bold: q.words }
  if (nameJoined.startsWith(`${joined} `) || (q.exact ? false : nameJoined.startsWith(joined))) return { id: t.id, level: 2, sub: 0, field: 'name', bold: q.words }
  if (hasPhrase(name, q.words)) return { id: t.id, level: 3, sub: 0, field: 'name', bold: q.words }
  if (!q.exact && allIn(name, q.words)) return { id: t.id, level: 3, sub: 1, field: 'name', bold: q.words }
  const texts = t.text.map(x => ({ ...x, w: words(x.value) }))
  for (const x of texts) if (hasPhrase(x.w, q.words)) return { id: t.id, level: 4, sub: 0, field: x.field, bold: q.words, snippet: excerpt(x.value, q.words) }
  if (!q.exact) {
    for (const x of texts) if (allIn(x.w, q.words)) return { id: t.id, level: 5, sub: 0, field: x.field, bold: q.words, snippet: excerpt(x.value, q.words) }
    const all = texts.flatMap(x => x.w)
    if (texts.length > 1 && allIn(all, q.words)) {
      const x = texts.find(y => q.words.some(w => y.w.includes(w)))!
      return { id: t.id, level: 5, sub: 0, field: x.field, bold: q.words, snippet: excerpt(x.value, q.words) }
    }
    // 6: close matches in the name first, then in Caption, TOV, Description.
    const n = fuzzy(q.words, name)
    let best: Hit | null = n ? { id: t.id, level: 6, sub: n.cost, field: 'name', bold: n.hits } : null
    for (const x of texts) {
      const f = fuzzy(q.words, x.w)
      if (f && (!best || f.cost + 0.25 < best.sub)) best = { id: t.id, level: 6, sub: f.cost + 0.25, field: x.field, bold: f.hits, snippet: excerpt(x.value, f.hits) }
    }
    if (best) return best
  }
  // 7: other fields (brand, Space, assignee, tags, custom fields, asset names): every
  // word found somewhere in the task, at least one of them in another field.
  const others = t.other.map(x => ({ ...x, w: words(x.value) }))
  if (!others.length) return null
  const everywhere = [...name, ...texts.flatMap(x => x.w), ...others.flatMap(x => x.w)]
  const found = q.exact ? (hasPhrase(others.flatMap(x => x.w), q.words) ? { cost: 0, hits: q.words } : null) : fuzzy(q.words, everywhere)
  if (!found) return null
  const where = others.find(x => found.hits.some(h => x.w.includes(h)))
  if (!where) return null
  return { id: t.id, level: 7, sub: found.cost, field: where.field, fieldLabel: where.label, bold: found.hits, snippet: where.field === 'field' || where.field === 'asset' || where.field === 'tag' ? excerpt(where.value, found.hits) : undefined }
}

/** The page the search is made from: its Space or brand comes first at the same level. */
export interface SearchContext { spaceId?: string | null; brandId?: string | null; today: string }

export function rank<T extends Searchable>(tasks: T[], q: Query, ctx: SearchContext): { task: T; hit: Hit }[] {
  const out: { task: T; hit: Hit }[] = []
  for (const t of tasks) { const hit = matchTask(t, q); if (hit) out.push({ task: t, hit }) }
  const here = (t: T) => (ctx.spaceId && t.space_ids.includes(ctx.spaceId)) || (ctx.brandId && t.brand_id === ctx.brandId) ? 0 : 1
  const when = (t: T): [number, number] => {
    if (!t.publish_date) return [2, 0]
    const d = Date.parse(t.publish_date) - Date.parse(ctx.today)
    return d >= 0 ? [0, d] : [1, -d]
  }
  out.sort((a, b) => {
    if (a.hit.level !== b.hit.level) return a.hit.level - b.hit.level
    if (a.hit.sub !== b.hit.sub) return a.hit.sub - b.hit.sub
    if (a.task.open !== b.task.open) return a.task.open ? -1 : 1
    const h = here(a.task) - here(b.task)
    if (h) return h
    const [ga, da] = when(a.task), [gb, db] = when(b.task)
    return ga - gb || da - db || a.task.name.localeCompare(b.task.name)
  })
  return out
}

// ─── "Did you mean" ─────────────────────────────────────────────────────────

/** The workspace's words (task names, Caption, TOV, tags, brands), each with how often it's used and its usual spelling. */
export function vocabulary(texts: string[]): Map<string, { shown: string; n: number }> {
  const v = new Map<string, { shown: string; n: number }>()
  for (const text of texts) {
    for (const raw of text.split(/[^\p{L}\p{N}]+/u)) {
      if (!raw) continue
      const k = normalize(raw)
      const cur = v.get(k)
      if (cur) cur.n++
      else v.set(k, { shown: raw.toLowerCase(), n: 1 })
    }
  }
  return v
}

/**
 * The search with its misspelt words corrected from the workspace's own words,
 * or null when every word is a real word (or nothing close is known).
 */
export function didYouMean(q: Query, vocab: Map<string, { shown: string; n: number }>): string | null {
  if (q.exact || !q.words.length) return null
  let changed = false
  const out = q.words.map(w => {
    if (vocab.has(w) || allowed(w) === 0) return w
    const st = stem(w)
    for (const k of vocab.keys()) if (k.length >= 4 && stem(k) === st) return w
    let best: { k: string; d: number; n: number } | null = null
    for (const [k, info] of vocab) {
      if (Math.abs(k.length - w.length) > allowed(w)) continue
      const d = Math.min(distance(w, k, allowed(w)), distance(st, stem(k), allowed(w)))
      if (d <= allowed(w) && (!best || d < best.d || (d === best.d && info.n > best.n))) best = { k, d, n: info.n }
    }
    if (!best) return w
    changed = true
    return vocab.get(best.k)!.shown
  })
  return changed ? out.join(' ') : null
}

/** When nothing matches: the tasks whose names are nearest the search, by letters (never an empty screen). */
export function closest<T extends Searchable>(tasks: T[], q: Query, n = 5): T[] {
  if (!q.words.length) return []
  const score = (t: T) => {
    const name = words(t.name)
    if (!name.length) return Infinity
    return q.words.reduce((sum, w) => sum + Math.min(...name.map(x => distance(w, x, 6) / Math.max(w.length, x.length))), 0)
  }
  return tasks.map(t => ({ t, s: score(t) })).filter(x => x.s < q.words.length * 0.75).sort((a, b) => a.s - b.s).slice(0, n).map(x => x.t)
}
