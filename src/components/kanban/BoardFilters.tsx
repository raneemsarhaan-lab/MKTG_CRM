'use client'

import { useMemo } from 'react'
import { FieldPill, PillOption, PillInput } from '@/components/shared/FieldPill'
import { COLORS } from '@/lib/tokens'
import { PIPE } from '@/lib/pipeline-tokens'
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


/** Brand chip mark — the emblem when the brand has one, else its initial. */
function BrandMark({ brand, size = 22 }: { brand: Brand; size?: number }) {
  const initial = brand.name.trim()[0]?.toUpperCase() ?? '?'
  return (
    <span style={{
      width: size, height: size, borderRadius: '50%', flexShrink: 0, overflow: 'hidden',
      background: brand.color, color: '#FFFFFF', fontSize: size * 0.5, fontWeight: 800,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      {brand.logo_url
        // eslint-disable-next-line @next/next/no-img-element
        ? <img src={brand.logo_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        : initial}
    </span>
  )
}

const GridIcon = ({ fill }: { fill: string }) => (
  <svg width="17" height="17" viewBox="0 0 24 24" fill={fill} aria-hidden="true">
    <rect x="3" y="3" width="8" height="8" rx="2" /><rect x="13" y="3" width="8" height="8" rx="2" />
    <rect x="3" y="13" width="8" height="8" rx="2" /><rect x="13" y="13" width="8" height="8" rx="2" />
  </svg>
)

/** §6 chip geometry — 44 tall, 999 radius, 13.5px. */
const CHIP_BASE: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 9, height: 44,
  padding: '0 20px', borderRadius: 999, fontSize: 13.5,
  fontFamily: 'inherit', cursor: 'pointer', whiteSpace: 'nowrap',
  transition: 'background 140ms ease-out, border-color 140ms ease-out',
}

/** §6 view toggle — same height, 12 radius. */
const VIEW_BASE: React.CSSProperties = { ...CHIP_BASE, borderRadius: 12 }

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
  const usedOwnerIds = useMemo(() => new Set(tasks.map(t => t.task_owner_id)), [tasks])

  const memberName = (id: string) => members.find(m => m.id === id)?.name ?? 'Unknown'

  const count = activeFilterCount(filters)
  // The brand chips are their own control, so they do not count towards the
  // number on the Filter button — that button owns everything behind it.
  const behindButton = count - (filters.brandIds.length ? 1 : 0) - (filters.search.trim() ? 1 : 0)

  const dueText = filters.duePreset !== 'any'
    ? ({ overdue: 'Overdue', today: 'Due today', week: 'Next 7 days', none: 'No due date' } as const)[filters.duePreset]
    : filters.dueFrom || filters.dueTo
      ? `${filters.dueFrom || '…'} → ${filters.dueTo || '…'}`
      : null

  const allBrands = filters.brandIds.length === 0

  return (
    <div style={{ padding: '0 26px 0 38px', flexShrink: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
        {/* Brand chips — §6 left group */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, flexWrap: 'wrap', minWidth: 0 }}>
          <button
            type="button"
            onClick={() => set('brandIds', [])}
            aria-pressed={allBrands}
            style={{
              ...CHIP_BASE,
              background: allBrands ? PIPE.limePrimary : '#FFFFFF',
              border: allBrands ? '1px solid transparent' : `1px solid ${PIPE.borderInput}`,
              fontWeight: allBrands ? 700 : 600,
              color: allBrands ? PIPE.ink : PIPE.textPrimary,
            }}
          >
            <GridIcon fill={allBrands ? PIPE.ink : PIPE.textPrimary} />
            All brands
          </button>

          {/* Logo only. Five brands spelled out in full ate the whole row and
              pushed Board and Filter onto a second line; the logos are the
              part people actually recognise. The name is still on the button
              for anyone hovering, and for a screen reader it is all there is. */}
          {brands.map(b => {
            const on = filters.brandIds.includes(b.id)
            return (
              <button
                key={b.id}
                type="button"
                onClick={() => toggle('brandIds', b.id)}
                aria-pressed={on}
                aria-label={b.name}
                title={b.name}
                style={{
                  ...CHIP_BASE,
                  width: 44, padding: 0, borderRadius: '50%', justifyContent: 'center',
                  background: on ? PIPE.limePrimary : '#FFFFFF',
                  border: on ? '1px solid transparent' : `1px solid ${PIPE.borderInput}`,
                }}
              >
                <BrandMark brand={b} size={on ? 30 : 32} />
              </button>
            )
          })}
        </div>

        {/* View + filter — §6 right group */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{
            ...VIEW_BASE, background: PIPE.navy, color: '#FFFFFF',
            fontWeight: 700, cursor: 'default',
          }}>
            <GridIcon fill="#FFFFFF" />
            Board
          </div>

          <FieldPill
            label="Filter"
            value={behindButton > 0 ? `Filter · ${behindButton}` : null}
            active={behindButton > 0}
            width={260}
            variant="view"
          >
            {() => (
              <>
                <PillSection label="Search">
                  <PillInput
                    value={filters.search}
                    placeholder="Name, owner, campaign…"
                    onChange={e => set('search', e.target.value)}
                  />
                </PillSection>

                <PillSection label="Assignee">
                  {members.filter(m => usedOwnerIds.has(m.id)).map(m => (
                    <PillOption key={m.id} selected={filters.ownerIds.includes(m.id)}
                                onClick={() => toggle('ownerIds', m.id)}>
                      <Check on={filters.ownerIds.includes(m.id)} /> {memberName(m.id)}
                    </PillOption>
                  ))}
                </PillSection>

                <PillSection label="Content type">
                  {usedTypes.map(v => (
                    <PillOption key={v} selected={filters.contentTypes.includes(v)}
                                onClick={() => toggle('contentTypes', v)}>
                      <Check on={filters.contentTypes.includes(v)} /> {v}
                    </PillOption>
                  ))}
                </PillSection>

                {usedPlatforms.length > 0 && (
                  <PillSection label="Platform">
                    {usedPlatforms.map(v => (
                      <PillOption key={v} selected={filters.platforms.includes(v)}
                                  onClick={() => toggle('platforms', v)}>
                        <Check on={filters.platforms.includes(v)} /> {v}
                      </PillOption>
                    ))}
                  </PillSection>
                )}

                <PillSection label="Priority">
                  {PRIORITY_OPTIONS.map(v => (
                    <PillOption key={v} selected={filters.priorities.includes(v)}
                                onClick={() => toggle('priorities', v)}>
                      <Check on={filters.priorities.includes(v)} /> {v}
                    </PillOption>
                  ))}
                </PillSection>

                <PillSection label="SLA status">
                  {ALERT_OPTIONS.map(v => (
                    <PillOption key={v} selected={filters.alerts.includes(v)}
                                onClick={() => toggleAlert(v)}>
                      <Check on={filters.alerts.includes(v)} /> {v}
                    </PillOption>
                  ))}
                </PillSection>

                <PillSection label={`Due date${dueText ? ` · ${dueText}` : ''}`}>
                  {([
                    ['any', 'Any date'], ['overdue', 'Overdue'], ['today', 'Due today'],
                    ['week', 'Next 7 days'], ['none', 'No due date'],
                  ] as [DuePreset, string][]).map(([v, label]) => (
                    <PillOption key={v} selected={filters.duePreset === v}
                                onClick={() => set('duePreset', v)}>
                      <Check on={filters.duePreset === v} /> {label}
                    </PillOption>
                  ))}
                  <div style={{ display: 'grid', gap: 6, marginTop: 6 }}>
                    <PillInput type="date" value={filters.dueFrom}
                               onChange={e => set('dueFrom', e.target.value)} />
                    <PillInput type="date" value={filters.dueTo}
                               onChange={e => set('dueTo', e.target.value)} />
                  </div>
                </PillSection>

                <PillSection label="Only">
                  <PillOption selected={filters.onlyMine} onClick={() => set('onlyMine', !filters.onlyMine)}>
                    <Check on={filters.onlyMine} /> My tasks
                  </PillOption>
                  <PillOption selected={filters.withAttachments} onClick={() => set('withAttachments', !filters.withAttachments)}>
                    <Check on={filters.withAttachments} /> Has files
                  </PillOption>
                </PillSection>

                {count > 0 && (
                  <button
                    type="button"
                    onClick={() => onChange(EMPTY_FILTERS)}
                    style={{
                      width: '100%', marginTop: 8, padding: '8px 10px', borderRadius: 8,
                      border: `1px solid ${PIPE.borderInput}`, background: '#fff',
                      color: PIPE.textPrimary, fontSize: 12.5, fontWeight: 700,
                      cursor: 'pointer', fontFamily: 'inherit',
                    }}
                  >
                    Clear {count} filter{count === 1 ? '' : 's'}
                  </button>
                )}
              </>
            )}
          </FieldPill>
        </div>
      </div>

      {count > 0 && (
        <div style={{ marginTop: 8, fontSize: 12, color: PIPE.textFaint }}>
          Showing {shown} of {total} tasks
        </div>
      )}
    </div>
  )
}

function PillSection({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{
        fontSize: 10, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase',
        color: PIPE.textFaint, padding: '6px 8px 4px',
      }}>
        {label}
      </div>
      {children}
    </div>
  )
}
