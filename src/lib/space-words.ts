/**
 * A team Space's status words (spec 021 US3, option A approved 2026-11-22):
 * other names for the 11 board stages and the 3 simple statuses. A word never
 * adds a step; it only renames one, in that Space's List, Sheet and Calendar.
 * Boards, brands and Everything keep the board names (FR-013a, FR-016).
 *
 * The Content and Video Spaces' words are their sheet's words (R5), so one
 * edit shows in both places.
 *
 * Pure — used by the server action, board data, client views and the lab.
 */
import type { SheetTaskMap, StageId } from '@/types/index'
import { ALL_STAGES, STAGE_META } from '@/lib/stage-meta'
import { matchStage, normTitle } from '@/lib/sheet-links'

export const SIMPLE_KEYS = ['s-todo', 's-doing', 's-done'] as const
export type SimpleKey = typeof SIMPLE_KEYS[number]
/** Every value a Space may name: the 11 stages, then the 3 simple statuses. */
export const WORD_KEYS: string[] = [...ALL_STAGES, ...SIMPLE_KEYS]
/** { stageId | simpleStatus: words }, the first word being the one shown. */
export type SpaceWords = Record<string, string[]>

export const MAX_WORDS = 12
export const MAX_WORD_LENGTH = 60

const isLinkedSpace = (key: string) => key === 'content' || key === 'video'
export const linkedKeyOf = (key: string): 'linked_content' | 'linked_video' | null =>
  key === 'content' ? 'linked_content' : key === 'video' ? 'linked_video' : null

/** The words as sent, checked: known values, trimmed, short, each word once per value. */
export function cleanSpaceWords(raw: unknown): SpaceWords {
  const out: SpaceWords = {}
  if (!raw || typeof raw !== 'object') return out
  for (const key of WORD_KEYS) {
    const list = (raw as Record<string, unknown>)[key]
    const items = Array.isArray(list) ? list : typeof list === 'string' ? list.split(',') : []
    const seen = new Set<string>()
    const keep: string[] = []
    for (const w of items) {
      if (typeof w !== 'string') continue
      const word = w.trim().replace(/\s+/g, ' ').slice(0, MAX_WORD_LENGTH)
      if (!word || seen.has(normTitle(word))) continue
      seen.add(normTitle(word))
      keep.push(word)
      if (keep.length >= MAX_WORDS) break
    }
    if (keep.length) out[key] = keep
  }
  return out
}

/**
 * A Space's words: Content and Video read their sheet's stage words (unless
 * the sheet is set to show the board's names); every other Space its own.
 */
export function wordsFor(space: { key: string; words?: unknown }, linked?: { words?: SheetTaskMap['words']; show?: SheetTaskMap['show'] } | null): SpaceWords {
  if (isLinkedSpace(space.key)) {
    if (!linked || linked.show === 'board') return {}
    return cleanSpaceWords(linked.words?.stage ?? {})
  }
  return cleanSpaceWords(space.words ?? {})
}

/** The word a Space shows for a value, or null for the board's name. */
export const wordOf = (value: string, words: SpaceWords | undefined): string | null => words?.[value]?.[0] ?? null

const BUILT_IN = ALL_STAGES.map(id => ({ id, names: [STAGE_META[id].label_en, STAGE_META[id].label_ar] }))

/** A typed stage: its id, board name (English or Arabic), or one of the Space's words. */
export function matchWord(text: string, words?: SpaceWords): StageId | null {
  const pipeline = words ? Object.fromEntries(Object.entries(words).filter(([k]) => !k.startsWith('s-'))) : undefined
  return matchStage(text, BUILT_IN, pipeline) as StageId | null
}

/** A typed simple status: its id, its name in either language, or one of the Space's words. */
export function matchSimpleWord(text: string, words: SpaceWords | undefined, names: Record<SimpleKey, string[]>): SimpleKey | null {
  const t = normTitle(text)
  if (!t) return null
  for (const k of SIMPLE_KEYS) if (k === t || names[k].some(n => normTitle(n) === t)) return k
  for (const k of SIMPLE_KEYS) if (words?.[k]?.some(w => normTitle(w) === t)) return k
  return null
}

export interface Clash { word: string; a: string; b: string }

/**
 * A word that would make typing ambiguous: the same word for two values, or
 * a stage word that is another stage's board name. Null when the words are fine.
 */
export function findClash(words: SpaceWords): Clash | null {
  const owner = new Map<string, string>()
  for (const [key, list] of Object.entries(words)) {
    for (const w of list) {
      const n = normTitle(w)
      const before = owner.get(n)
      if (before && before !== key) return { word: w, a: before, b: key }
      owner.set(n, key)
      if (key.startsWith('s-')) continue
      const other = BUILT_IN.find(s => s.id !== key && (s.id === n || s.names.some(x => normTitle(x) === n)))
      if (other) return { word: w, a: other.id, b: key }
    }
  }
  return null
}
