/**
 * Simple tasks (spec 021 US5): To Do › In progress › Done. Pure.
 * No stage owners, no SLA, no terminal stage — anyone who may edit the task
 * may move it, forward or back.
 */
import type { SimpleStatus } from '@/types/index'

export const SIMPLE_STATUSES: SimpleStatus[] = ['s-todo', 's-doing', 's-done']

export const isSimpleStatus = (v: unknown): v is SimpleStatus =>
  typeof v === 'string' && (SIMPLE_STATUSES as string[]).includes(v)

/** The next status, or null at Done. */
export function nextSimple(status: SimpleStatus | null | undefined): SimpleStatus | null {
  const i = SIMPLE_STATUSES.indexOf(status ?? 's-todo')
  return i >= 0 && i < SIMPLE_STATUSES.length - 1 ? SIMPLE_STATUSES[i + 1] : null
}

/** Message key under `spaces.simple.*` for a status. */
export const simpleLabelKey = (s: SimpleStatus) => s.slice(2) as 'todo' | 'doing' | 'done'
