'use client'

/**
 * How the board orders tasks within a column.
 *
 * Every task is already on the client (BoardFilters' own note), so this is a
 * pure sort over the array already built for filtering — no round trip, and
 * it runs right before `tasksByStage` groups by stage, so the chosen order
 * survives grouping (`Array.forEach` push preserves it).
 *
 * 'due' mirrors the server's own default order (`src/lib/board-data.ts`), so
 * a fresh load and an explicit "Due date" pick agree with no visible jump.
 */
import { useTranslations } from 'next-intl'
import type { Task } from '@/types/index'
import { HeaderMenu, ChevronIcon } from './HeaderMenu'
import { compareByDue, compareByPublish } from '@/lib/due-dates'
import { priorityRank, urgentFirst } from '@/lib/priorities'

export type SortKey = 'due' | 'publish' | 'priority' | 'name' | 'created' | 'updated'
/** Boards sort by due date, earliest first, unless a person picks otherwise for that board. */
export const DEFAULT_SORT: SortKey = 'due'
export const SORT_KEYS: readonly SortKey[] = ['due', 'publish', 'priority', 'name', 'created', 'updated']


/** Due date, earliest first; no due date last; then publishing date, then created. */
function byDue<T extends Task>(a: T, b: T): number {
  return compareByDue(a, b)
}
function byPublish<T extends Task>(a: T, b: T): number {
  return compareByPublish(a, b)
}

function byPriority<T extends Task>(a: T, b: T): number {
  const d = priorityRank(a.priority) - priorityRank(b.priority)
  return d !== 0 ? d : byDue(a, b)
}

function byName<T extends Task>(a: T, b: T): number {
  return a.name.localeCompare(b.name)
}

function byCreated<T extends Task>(a: T, b: T): number {
  return a.created_at === b.created_at ? 0 : a.created_at < b.created_at ? 1 : -1
}

function byUpdated<T extends Task>(a: T, b: T): number {
  return a.updated_at === b.updated_at ? 0 : a.updated_at < b.updated_at ? 1 : -1
}

/** Sorts a copy; the input array is left untouched. */
export function sortTasks<T extends Task>(tasks: T[], sort: SortKey): T[] {
  const copy = [...tasks]
  // Spec 023 (D8): Urgent first in every sort; the chosen order follows.
  switch (sort) {
    case 'due':      return copy.sort(urgentFirst(byDue))
    case 'publish':  return copy.sort(urgentFirst(byPublish))
    case 'priority': return copy.sort(byPriority)
    case 'name':     return copy.sort(urgentFirst(byName))
    case 'created':  return copy.sort(urgentFirst(byCreated))
    case 'updated':  return copy.sort(urgentFirst(byUpdated))
  }
}

function SortIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" aria-hidden="true">
      <path d="M3 7h12M3 12h8M3 17h4" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M17 6v14M21 16l-4 4-4-4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export function SortMenu({ value, onChange, noPriority = false, onReset }: {
  value: SortKey
  onChange(next: SortKey): void
  /** Spec 021 (US4): no brand on the board uses Priorities. */
  noPriority?: boolean
  /** "Reset to default sort": back to due date, and the board forgets the choice. */
  onReset?(): void
}) {
  const t = useTranslations('header')
  const tDates = useTranslations('dates')

  return (
    <HeaderMenu
      label={t('sortLabel')}
      data="data-sort-menu"
      width={200}
      trigger={<><SortIcon /><span className="fx-hd-lbl-keep">{t(`sort.${value}`)}</span><ChevronIcon /></>}
    >
      {SORT_KEYS.filter(key => !(noPriority && key === 'priority')).map(key => (
        <button key={key} type="button" className="fx-hd-opt" data-sort-option={key}
                aria-pressed={value === key} onClick={() => onChange(key)}>
          <span className="fx-hd-opt-txt">{t(`sort.${key}`)}</span>
          {value === key && <span className="fx-hd-check" aria-hidden="true">✓</span>}
        </button>
      ))}
      {onReset && (
        <button type="button" className="fx-hd-opt" data-sort-reset="" disabled={value === DEFAULT_SORT} onClick={onReset}
                style={{ borderTop: '1px solid var(--line, #E5E7EB)', marginTop: 4 }}>
          <span className="fx-hd-opt-txt">{tDates('sortReset')}</span>
        </button>
      )}
    </HeaderMenu>
  )
}
