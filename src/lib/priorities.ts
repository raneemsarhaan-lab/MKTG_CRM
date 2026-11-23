/**
 * Priorities (spec 023 US4, R7, decisions D7–D8): Urgent, High, Normal, Low,
 * No priority. "Medium" is read as Normal (once('priority-normal-v1') renamed
 * the stored values). Urgent sorts first everywhere and notifies; it does not
 * shorten the SLA. Pure.
 */
import type { Priority } from '@/types/index'

export const PRIORITIES: Priority[] = ['Urgent', 'High', 'Normal', 'Low', 'None']
export const DEFAULT_PRIORITY: Priority = 'Normal'

const RANK: Record<string, number> = { Urgent: 0, High: 1, Normal: 2, Medium: 2, Low: 3, None: 4 }
export const priorityRank = (p: string | null | undefined) => RANK[p ?? 'None'] ?? 4

/** A stored value as today's priority ('Medium' → 'Normal'; anything unknown → null). */
export function asPriority(v: unknown): Priority | null {
  if (v === 'Medium') return 'Normal'
  return typeof v === 'string' && (PRIORITIES as string[]).includes(v) ? (v as Priority) : null
}

/** The flag colour: Urgent red, High orange, Normal blue, Low grey, none faint. */
export const PRIORITY_COLOR: Record<Priority, string> = {
  Urgent: '#D22040', High: '#E8772E', Normal: '#3E7BEA', Low: '#8F95A1', None: '#C9CDD5',
}
export const priorityColor = (p: string | null | undefined) => PRIORITY_COLOR[asPriority(p) ?? 'None']

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ')
/** Typed or pasted words, English and Arabic. */
const WORDS: Record<string, Priority> = {
  urgent: 'Urgent', high: 'High', normal: 'Normal', medium: 'Normal', low: 'Low', none: 'None', 'no priority': 'None',
  'عاجل': 'Urgent', 'عاجلة': 'Urgent', 'مرتفعة': 'High', 'عالية': 'High', 'عادية': 'Normal', 'متوسطة': 'Normal', 'منخفضة': 'Low', 'بلا أولوية': 'None', 'بدون أولوية': 'None',
}
export const readPriority = (text: string): Priority | null => WORDS[norm(text)] ?? null

/** Urgent first, then the given order (spec 023 D8: a chosen sort keeps working after it). */
export function urgentFirst<T extends { priority?: string | null }>(cmp: (a: T, b: T) => number) {
  return (a: T, b: T) => {
    const ua = a.priority === 'Urgent' ? 0 : 1, ub = b.priority === 'Urgent' ? 0 : 1
    return ua - ub || cmp(a, b)
  }
}
