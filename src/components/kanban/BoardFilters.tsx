'use client'

import { useMemo } from 'react'
import { FieldPill, PillOption, PillInput } from '@/components/shared/FieldPill'
import { COLORS } from '@/lib/tokens'
import { getAlertStatus } from '@/lib/alert-status'
import { calDaysBetween } from '@/lib/utils'
import type { AlertStatus, Brand, Member, SLAConfig, Task } from '@/types/index'

/**
 * Board filters.
 *
 * All 400+ tasks are already on the client, so filtering is a pure function
 * over the loaded array — no round trip, no loading state. Every dimension
 * combines with AND, and within one dimension the selected values combine with
 * OR, which is what "Instagram or LinkedIn, assigned to Raneem" means.
 *
 * Option lists are derived from the tasks themselves rather than from the
 * settings tables, so the bar never offers a platform or content type that no
 * task actually uses.
 */

export type DuePreset = 'any' | 'overdue' | 'today' | 'week' | 'none'

export interface BoardFilterState {
  search:         string
  brandIds:       string[]
  ownerIds:       string[]
  contentTypes:   string[]
  platforms:      string[]
  priorities:     string[]
  alerts:         AlertStatus[]
  duePreset:      DuePreset
  dueFrom:        string
  dueTo:          string
  onlyMine:       boolean
  withAttachments: boolean
}

export const EMPTY_FILTERS: BoardFilterState = {
  search: '', brandIds: [], ownerIds: [], contentTypes: [], platforms: [],
  priorities: [], alerts: [], duePreset: 'any', dueFrom: '', dueTo: '',
  onlyMine: false, withAttachments: false,
}

export const ALERT_OPTIONS: AlertStatus[] =
  ['Overdue', 'Stuck', 'Will Miss', 'At Risk', 'Idle', 'On Track']

const PRIORITY_OPTIONS = ['High', 'Medium', 'Low']

/** How many dimensions are narrowing the board right now. */
export function activeFilterCount(f: BoardFilterState): number {
  return (
    (f.search.trim() ? 1 : 0) +
    (f.brandIds.length     ? 1 : 0) +
    (f.ownerIds.length     ? 1 : 0) +
    (f.contentTypes.length ? 1 : 0) +
    (f.platforms.length    ? 1 : 0) +
    (f.priorities.length   ? 1 : 0) +
    (f.alerts.length       ? 1 : 0) +
    (f.duePreset !== 'any' || f.dueFrom || f.dueTo ? 1 : 0) +
    (f.onlyMine        ? 1 : 0) +
    (f.withAttachments ? 1 : 0)
  )
}

export function applyBoardFilters<T extends Task>(
  tasks: T[],
  f: BoardFilterState,
  ctx: { currentUserId: string; slaConfig: SLAConfig; today: Date },
): T[] {
  const q = f.search.trim().toLowerCase()

  return tasks.filter(t => {
    if (q) {
      const hay = `${t.name} ${t.task_owner?.name ?? ''} ${t.campaign ?? ''} ${t.brand?.name ?? ''}`
      if (!hay.toLowerCase().includes(q)) return false
    }
    if (f.onlyMine && t.task_owner_id !== ctx.currentUserId) return false
    if (f.brandIds.length     && !f.brandIds.includes(t.brand_id)) return false
    if (f.ownerIds.length     && !f.ownerIds.includes(t.task_owner_id)) return false
    if (f.contentTypes.length && !f.contentTypes.includes(t.content_type_label)) return false
    if (f.platforms.length    && !f.platforms.includes(t.platform ?? '')) return false
    if (f.priorities.length   && !f.priorities.includes(t.priority)) return false
    if (f.withAttachments && (t.attachments?.length ?? 0) === 0) return false

    if (f.alerts.length) {
      if (!f.alerts.includes(getAlertStatus(t, ctx.slaConfig, ctx.today))) return false
    }

    if (f.duePreset !== 'any') {
      // Imported history often has no due date at all, so "no date" is a
      // filter people actually need rather than an edge case.
      if (f.duePreset === 'none') {
        if (t.due_date) return false
      } else {
        if (!t.due_date) return false
        const days = calDaysBetween(ctx.today, new Date(t.due_date))
        if (f.duePreset === 'overdue' && days >= 0)          return false
        if (f.duePreset === 'today'   && days !== 0)         return false
        if (f.duePreset === 'week'    && (days < 0 || days > 7)) return false
      }
    }

    if (f.dueFrom && (!t.due_date || t.due_date < f.dueFrom)) return false
    if (f.dueTo   && (!t.due_date || t.due_date > f.dueTo))   return false

    return true
  })
}

// ─── UI ──────────────────────────────────────────────────────────────────────

interface BoardFiltersProps {
  filters:  BoardFilterState
  onChange: (next: BoardFilterState) => void
  tasks:    Task[]          // unfiltered — the source of the option lists
  brands:   Brand[]
  members:  Member[]
  shown:    number
  total:    number
}

function Check({ on }: { on: boolean }) {
  return (
    <span
      aria-hidden="true"
      style={{
        width: 14, height: 14, borderRadius: 4, flexShrink: 0,
        border: `1.5px solid ${on ? COLORS.ink : COLORS.line}`,
        background: on ? COLORS.ink : '#fff', color: COLORS.lime,
        fontSize: 10, lineHeight: '11px', textAlign: 'center', fontWeight: 900,
      }}
    >
      {on ? '✓' : ''}
    </span>
  )
}

function summary(selected: string[], label: (v: string) => string): string | null {
  if (selected.length === 0) return null
  if (selected.length === 1) return label(selected[0])
  return `${selected.length} selected`
}

export function BoardFilters({
  filters, onChange, tasks, brands, members, shown, total,
}: BoardFiltersProps) {
  const set = <K extends keyof BoardFilterState>(key: K, value: BoardFilterState[K]) =>
    onChange({ ...filters, [key]: value })

  const toggle = (key: 'brandIds' | 'ownerIds' | 'contentTypes' | 'platforms' | 'priorities', v: string) => {
    const cur = filters[key]
    set(key, cur.includes(v) ? cur.filter(x => x !== v) : [...cur, v])
  }

  const toggleAlert = (v: AlertStatus) =>
    set('alerts', filters.alerts.includes(v)
      ? filters.alerts.filter(x => x !== v)
      : [...filters.alerts, v])

  // Only offer values that exist on the board.
  const usedTypes = useMemo(
    () => [...new Set(tasks.map(t => t.content_type_label).filter(Boolean))].sort(),
    [tasks])
  const usedPlatforms = useMemo(
    () => [...new Set(tasks.map(t => t.platform).filter((p): p is string => Boolean(p)))].sort(),
    [tasks])
  const usedOwnerIds = useMemo(
    () => new Set(tasks.map(t => t.task_owner_id)),
    [tasks])

  const memberName = (id: string) => members.find(m => m.id === id)?.name ?? 'Unknown'
  const brandName  = (id: string) => brands.find(b => b.id === id)?.name ?? 'Unknown'

  const count   = activeFilterCount(filters)
  const dueText = filters.duePreset !== 'any'
    ? ({ overdue: 'Overdue', today: 'Due today', week: 'Next 7 days', none: 'No due date' } as const)[filters.duePreset]
    : filters.dueFrom || filters.dueTo
      ? `${filters.dueFrom || '…'} → ${filters.dueTo || '…'}`
      : null

  return (
    <div style={{ padding: '0 24px 8px', flexShrink: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        {/* Search */}
        <div style={{ position: 'relative' }}>
          <input
            value={filters.search}
            onChange={e => set('search', e.target.value)}
            placeholder="Search tasks…"
            aria-label="Search tasks"
            style={{
              width: 210, padding: '7px 10px 7px 28px',
              background: '#fff', border: `1px solid ${COLORS.line}`, borderRadius: 8,
              fontSize: 13, outline: 'none', color: COLORS.ink, fontFamily: 'inherit',
            }}
          />
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={COLORS.muted}
               strokeWidth="2" strokeLinecap="round" aria-hidden="true"
               style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}>
            <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
          </svg>
        </div>

        {/* Brand — colour swatches, because that is how the board reads them */}
        <FieldPill
          label="Brand"
          value={summary(filters.brandIds, brandName)}
          active={filters.brandIds.length > 0}
          width={230}
        >
          {() => (
            <>
              {brands.map(b => (
                <PillOption key={b.id} selected={filters.brandIds.includes(b.id)}
                            onClick={() => toggle('brandIds', b.id)}>
                  <Check on={filters.brandIds.includes(b.id)} />
                  <span aria-hidden="true" style={{
                    width: 10, height: 10, borderRadius: 3, background: b.color, flexShrink: 0,
                  }} />
                  {b.name}
                </PillOption>
              ))}
            </>
          )}
        </FieldPill>

        <FieldPill
          label="Assignee"
          value={summary(filters.ownerIds, memberName)}
          active={filters.ownerIds.length > 0}
          width={230}
        >
          {() => (
            <>
              {members.filter(m => usedOwnerIds.has(m.id)).map(m => (
                <PillOption key={m.id} selected={filters.ownerIds.includes(m.id)}
                            onClick={() => toggle('ownerIds', m.id)}>
                  <Check on={filters.ownerIds.includes(m.id)} />
                  {m.name}
                </PillOption>
              ))}
            </>
          )}
        </FieldPill>

        <FieldPill
          label="Content type"
          value={summary(filters.contentTypes, v => v)}
          active={filters.contentTypes.length > 0}
        >
          {() => (
            <>
              {usedTypes.map(v => (
                <PillOption key={v} selected={filters.contentTypes.includes(v)}
                            onClick={() => toggle('contentTypes', v)}>
                  <Check on={filters.contentTypes.includes(v)} /> {v}
                </PillOption>
              ))}
            </>
          )}
        </FieldPill>

        {usedPlatforms.length > 0 && (
          <FieldPill
            label="Platform"
            value={summary(filters.platforms, v => v)}
            active={filters.platforms.length > 0}
          >
            {() => (
              <>
                {usedPlatforms.map(v => (
                  <PillOption key={v} selected={filters.platforms.includes(v)}
                              onClick={() => toggle('platforms', v)}>
                    <Check on={filters.platforms.includes(v)} /> {v}
                  </PillOption>
                ))}
              </>
            )}
          </FieldPill>
        )}

        <FieldPill
          label="Priority"
          value={summary(filters.priorities, v => v)}
          active={filters.priorities.length > 0}
          width={190}
        >
          {() => (
            <>
              {PRIORITY_OPTIONS.map(v => (
                <PillOption key={v} selected={filters.priorities.includes(v)}
                            onClick={() => toggle('priorities', v)}>
                  <Check on={filters.priorities.includes(v)} /> {v}
                </PillOption>
              ))}
            </>
          )}
        </FieldPill>

        <FieldPill
          label="SLA status"
          value={summary(filters.alerts, v => v)}
          active={filters.alerts.length > 0}
          width={200}
        >
          {() => (
            <>
              {ALERT_OPTIONS.map(v => (
                <PillOption key={v} selected={filters.alerts.includes(v)}
                            onClick={() => toggleAlert(v)}>
                  <Check on={filters.alerts.includes(v)} /> {v}
                </PillOption>
              ))}
            </>
          )}
        </FieldPill>

        <FieldPill
          label="Due date"
          value={dueText}
          active={Boolean(dueText)}
          width={250}
        >
          {() => (
            <>
              {([
                ['any',     'Any date'],
                ['overdue', 'Overdue'],
                ['today',   'Due today'],
                ['week',    'Next 7 days'],
                ['none',    'No due date'],
              ] as [DuePreset, string][]).map(([v, label]) => (
                <PillOption key={v} selected={filters.duePreset === v}
                            onClick={() => set('duePreset', v)}>
                  <Check on={filters.duePreset === v} /> {label}
                </PillOption>
              ))}
              <div style={{
                borderTop: `1px solid ${COLORS.line}`, margin: '8px 0 6px', paddingTop: 8,
                display: 'grid', gap: 6,
              }}>
                <label style={{ fontSize: 11, color: COLORS.muted, fontWeight: 700 }}>From</label>
                <PillInput type="date" value={filters.dueFrom}
                           onChange={e => set('dueFrom', e.target.value)} />
                <label style={{ fontSize: 11, color: COLORS.muted, fontWeight: 700 }}>To</label>
                <PillInput type="date" value={filters.dueTo}
                           onChange={e => set('dueTo', e.target.value)} />
              </div>
            </>
          )}
        </FieldPill>

        <Toggle on={filters.onlyMine} onClick={() => set('onlyMine', !filters.onlyMine)}>
          My tasks
        </Toggle>
        <Toggle on={filters.withAttachments} onClick={() => set('withAttachments', !filters.withAttachments)}>
          Has files
        </Toggle>

        <div style={{ marginInlineStart: 'auto', display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 12, color: COLORS.muted, whiteSpace: 'nowrap' }}>
            {count > 0 ? `${shown} of ${total} tasks` : `${total} tasks`}
          </span>
          {count > 0 && (
            <button
              type="button"
              onClick={() => onChange(EMPTY_FILTERS)}
              style={{
                border: `1px solid ${COLORS.line}`, background: '#fff', color: COLORS.ink,
                borderRadius: 8, padding: '6px 10px', fontSize: 12, fontWeight: 700,
                cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap',
              }}
            >
              Clear {count} filter{count === 1 ? '' : 's'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

function Toggle({ on, onClick, children }: {
  on: boolean; onClick: () => void; children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      style={{
        padding: '7px 12px', borderRadius: 8,
        border: `1px solid ${on ? COLORS.ink : COLORS.line}`,
        background: on ? COLORS.ink : '#fff',
        color: on ? COLORS.lime : COLORS.muted,
        fontSize: 13, fontWeight: on ? 700 : 500,
        cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap',
      }}
    >
      {children}
    </button>
  )
}
