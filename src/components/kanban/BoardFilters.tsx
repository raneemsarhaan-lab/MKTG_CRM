'use client'

import { useCardFields } from '@/components/fields/CardFields'
import { TypeIcon } from '@/components/types/TypeIcon'
import { useTypeLook } from '@/components/types/TypePill'
import { useMemo } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { PillOption, PillInput } from '@/components/shared/FieldPill'
import { HeaderMenu } from '@/components/board/HeaderMenu'
import { COLORS } from '@/lib/tokens'
import { PIPE } from '@/lib/pipeline-tokens'
import { getAlertStatus } from '@/lib/alert-status'
import { featureOn, featureOnAny } from '@/lib/brand-features'
import { calDaysBetween } from '@/lib/utils'
import { cairoToday, daysBetween, isOverdue } from '@/lib/due-dates'
import { intlLocale } from '@/lib/sheet-format'
import type { AlertStatus, Member, SLAConfig, Task } from '@/types/index'

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
export type PublishPreset = 'any' | 'today' | 'week' | 'none'

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
  /** The publishing date, filtered the same way (overdue doesn't apply). */
  publishPreset?: PublishPreset
  publishFrom?:   string
  publishTo?:     string
  onlyMine:       boolean
  withAttachments: boolean
  /** QA 26 Nov 2026 (QF-13): the task's owner (who created it), apart from who is doing it. */
  creatorIds?:    string[]
  tagIds?:        string[]
  /** Theme (project) ids; '' is "No theme". */
  themeIds?:      string[]
  /** Pillar ids; '' is "No pillar". */
  pillarIds?:     string[]
  /** Choice and multi-choice fields (Channels and custom ones): field id → option ids. */
  fieldOptions?:  Record<string, string[]>
}

export const EMPTY_FILTERS: BoardFilterState = {
  search: '', brandIds: [], ownerIds: [], contentTypes: [], platforms: [],
  priorities: [], alerts: [], duePreset: 'any', dueFrom: '', dueTo: '', publishPreset: 'any', publishFrom: '', publishTo: '',
  onlyMine: false, withAttachments: false,
}

export const ALERT_OPTIONS: AlertStatus[] =
  ['Overdue', 'Stuck', 'Will Miss', 'At Risk', 'Idle', 'On Track']

const PRIORITY_OPTIONS = ['Urgent', 'High', 'Normal', 'Low', 'None']

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
    ((f.publishPreset ?? 'any') !== 'any' || f.publishFrom || f.publishTo ? 1 : 0) +
    (f.onlyMine        ? 1 : 0) +
    (f.withAttachments ? 1 : 0) +
    (f.creatorIds?.length ? 1 : 0) + (f.tagIds?.length ? 1 : 0) + (f.themeIds?.length ? 1 : 0) + (f.pillarIds?.length ? 1 : 0) +
    Object.values(f.fieldOptions ?? {}).filter(v => v.length).length
  )
}

// ─── In the address ──────────────────────────────────────────────────────────
// The board keeps its filters in the query string so a filtered view can be
// linked to and survives a reload. Lists repeat their key (&type=Reel&type=Post)
// rather than joining with commas, because a content type may contain one.

const DUE_PRESETS: DuePreset[] = ['any', 'overdue', 'today', 'week', 'none']
const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/

const LIST_PARAMS = {
  brandIds: 'brand', ownerIds: 'assignee', contentTypes: 'type',
  platforms: 'platform', priorities: 'priority', alerts: 'sla',
} as const
/** QA 26 Nov 2026 (QF-13): the new filters' query keys. A field's options are "field:option". */
const MORE_PARAMS = { creatorIds: 'owner', tagIds: 'tag', themeIds: 'theme', pillarIds: 'pillar' } as const

/** Every query key the filters own, and nothing else. */
const FILTER_PARAMS = ['q', ...Object.values(LIST_PARAMS), ...Object.values(MORE_PARAMS), 'fld', 'due', 'from', 'to', 'mine', 'files']

type ParamSource = Pick<URLSearchParams, 'get' | 'getAll'>

/** The filters an address asks for. Anything unrecognised is ignored. */
export function filtersFromParams(p: ParamSource): BoardFilterState {
  const list = (k: string) => [...new Set(p.getAll(k).filter(Boolean))]
  const day  = (k: string) => { const v = p.get(k) ?? ''; return ISO_DAY.test(v) ? v : '' }
  const due  = p.get('due') as DuePreset | null
  return {
    search:          p.get('q') ?? '',
    brandIds:        list(LIST_PARAMS.brandIds),
    ownerIds:        list(LIST_PARAMS.ownerIds),
    contentTypes:    list(LIST_PARAMS.contentTypes),
    platforms:       list(LIST_PARAMS.platforms),
    priorities:      list(LIST_PARAMS.priorities).filter(v => PRIORITY_OPTIONS.includes(v)),
    alerts:          list(LIST_PARAMS.alerts).filter((v): v is AlertStatus => (ALERT_OPTIONS as string[]).includes(v)),
    duePreset:       due && DUE_PRESETS.includes(due) ? due : 'any',
    dueFrom:         day('from'),
    dueTo:           day('to'),
    onlyMine:        p.get('mine') === '1',
    withAttachments: p.get('files') === '1',
    creatorIds:      list(MORE_PARAMS.creatorIds),
    tagIds:          list(MORE_PARAMS.tagIds),
    themeIds:        p.getAll(MORE_PARAMS.themeIds),
    pillarIds:       p.getAll(MORE_PARAMS.pillarIds),
    fieldOptions:    p.getAll('fld').reduce<Record<string, string[]>>((o, v) => { const [f, opt] = v.split(':'); if (f && opt) (o[f] ??= []).push(opt); return o }, {}),
  }
}

/** Write the filters into `url`'s query. Returns whether anything changed. */
export function writeFiltersToUrl(url: URL, f: BoardFilterState): boolean {
  const want = new URLSearchParams()
  if (f.search) want.set('q', f.search)
  for (const [field, key] of Object.entries(LIST_PARAMS) as [keyof typeof LIST_PARAMS, string][]) {
    f[field].forEach(v => want.append(key, v))
  }
  if (f.duePreset !== 'any') want.set('due', f.duePreset)
  if (f.dueFrom) want.set('from', f.dueFrom)
  if (f.dueTo) want.set('to', f.dueTo)
  if (f.onlyMine) want.set('mine', '1')
  if (f.withAttachments) want.set('files', '1')
  for (const [field, key] of Object.entries(MORE_PARAMS) as [keyof typeof MORE_PARAMS, string][]) (f[field] ?? []).forEach(v => want.append(key, v))
  for (const [fid, opts] of Object.entries(f.fieldOptions ?? {})) opts.forEach(o => want.append('fld', `${fid}:${o}`))

  const sp = url.searchParams
  const same = FILTER_PARAMS.every(k => sp.getAll(k).join('\u0000') === want.getAll(k).join('\u0000'))
  if (same) return false
  FILTER_PARAMS.forEach(k => sp.delete(k))
  want.forEach((v, k) => sp.append(k, v))
  return true
}

export function applyBoardFilters<T extends Task>(
  tasks: T[],
  f: BoardFilterState,
  ctx: { currentUserId: string; slaConfig: SLAConfig; today: Date; valueOf?: (taskId: string, fieldId: string) => unknown },
): T[] {
  const q = f.search.trim().toLowerCase()

  return tasks.filter(t => {
    if (q) {
      const hay = `${t.name} ${t.task_owner?.name ?? ''} ${t.project?.name ?? ''} ${t.brand?.name ?? ''}`
      if (!hay.toLowerCase().includes(q)) return false
    }
    if (f.onlyMine && (t.assignee_id ?? t.task_owner_id) !== ctx.currentUserId) return false
    if (f.brandIds.length     && !f.brandIds.includes(t.brand_id)) return false
    // The Assignee filter means who is doing it, which is what people mean
    // when they ask whose task it is. QA 26 Nov 2026 (QF-13): any of its assignees.
    if (f.ownerIds.length) {
      const doers = [...new Set([...(t.assignee_ids ?? []), ...(t.assignee_id ? [t.assignee_id] : [])])]
      if (!(doers.length ? doers : [t.task_owner_id]).some(id => f.ownerIds.includes(id))) return false
    }
    if (f.creatorIds?.length && !f.creatorIds.includes(t.task_owner_id)) return false
    if (f.tagIds?.length && !(t.tag_ids ?? []).some(id => f.tagIds!.includes(id))) return false
    if (f.themeIds?.length && !f.themeIds.includes(t.project_id ?? '')) return false
    if (f.pillarIds?.length && !f.pillarIds.includes(t.pillar_id ?? '')) return false
    for (const [fid, opts] of Object.entries(f.fieldOptions ?? {})) {
      if (!opts.length) continue
      const v = ctx.valueOf?.(t.id, fid)
      const have = Array.isArray(v) ? v as string[] : typeof v === 'string' ? [v] : []
      if (!have.some(x => opts.includes(x))) return false
    }
    // Spec 021 (US4): a value switched off for the task's brand is hidden, so it matches nothing.
    if (f.contentTypes.length && !(featureOn(t.brand, 'type') && f.contentTypes.includes(t.content_type_label))) return false
    if (f.platforms.length    && !(featureOn(t.brand, 'platform') && f.platforms.includes(t.platform ?? ''))) return false
    if (f.priorities.length   && !(featureOn(t.brand, 'priorities') && f.priorities.includes(t.priority))) return false
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
        // Cairo days (src/lib/due-dates.ts); published or done work is never overdue.
        const days = daysBetween(cairoToday(), t.due_date.slice(0, 10))
        if (f.duePreset === 'overdue' && !isOverdue(t)) return false
        if (f.duePreset === 'overdue' && days >= 0)          return false
        if (f.duePreset === 'today'   && days !== 0)         return false
        if (f.duePreset === 'week'    && (days < 0 || days > 7)) return false
      }
    }

    if (f.dueFrom && (!t.due_date || t.due_date < f.dueFrom)) return false
    if (f.dueTo   && (!t.due_date || t.due_date > f.dueTo))   return false

    const pp = f.publishPreset ?? 'any', pub = t.publish_date?.slice(0, 10) ?? null
    if (pp === 'none' && pub) return false
    if (pp !== 'any' && pp !== 'none') {
      if (!pub) return false
      const days = daysBetween(cairoToday(), pub)
      if (pp === 'today' && days !== 0) return false
      if (pp === 'week' && (days < 0 || days > 7)) return false
    }
    if (f.publishFrom && (!pub || pub < f.publishFrom)) return false
    if (f.publishTo   && (!pub || pub > f.publishTo))   return false

    return true
  })
}

// ─── UI ──────────────────────────────────────────────────────────────────────

interface FiltersButtonProps {
  /** QA 26 Nov 2026 (QF-13): themes and their pillars, for the Theme and Pillar filters. */
  themes?: { id: string; name: string; pillars: { id: string; name: string }[] }[]
  filters:  BoardFilterState
  onChange: (next: BoardFilterState) => void
  tasks:    Task[]          // unfiltered — the source of the option lists
  members:  Member[]
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

function FilterIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" aria-hidden="true">
      <path d="M3 5h18l-7 8v6l-4-2v-4L3 5z" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

/**
 * Filters (spec 011 FR-032): the Board toolbar's filter menu. What is inside
 * is unchanged from the old Filter pill; only the button moved into the
 * header's toolbar. Brands and search have their own controls, so they do
 * not count towards the number on the button.
 */
export function FiltersButton({ filters, onChange, tasks, members, themes = [] }: FiltersButtonProps) {
  const t = useTranslations('header')
  const tf = useTranslations('filters')
  const tPri = useTranslations('priority')
  const typeLook = useTypeLook()
  const card = useCardFields()
  const locale = useLocale()
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
    () => [...new Set(tasks.filter(t => featureOn(t.brand, 'type')).map(t => t.content_type_label).filter(Boolean))].sort(),
    [tasks])
  // QA 26 Nov 2026 (F13): Brand is a Standard field — filter by it wherever more than one brand is in view.
  const usedBrands = useMemo(() => [...new Map(tasks.filter(t => t.brand_id && t.brand).map(t => [t.brand_id as string, (t.brand as { name: string }).name])).entries()]
    .sort((a, b) => a[1].localeCompare(b[1])), [tasks])
  const usedPlatforms = useMemo(
    () => [...new Set(tasks.filter(t => featureOn(t.brand, 'platform')).map(t => t.platform).filter((p): p is string => Boolean(p)))].sort(),
    [tasks])
  // Spec 021 (US4): Priority and SLA status are offered while any brand on the board uses them.
  const anyPriority = useMemo(() => featureOnAny(tasks.map(t => t.brand), 'priorities'), [tasks])
  const anySla = useMemo(() => featureOnAny(tasks.map(t => t.brand), 'sla'), [tasks])
  const usedOwnerIds = useMemo(() => new Set(tasks.map(t => t.assignee_id ?? t.task_owner_id)), [tasks])
  // QA 26 Nov 2026 (QF-13): only values that exist on the page are offered.
  const flip = (cur: string[] | undefined, v: string) => (cur ?? []).includes(v) ? (cur ?? []).filter(x => x !== v) : [...(cur ?? []), v]
  const usedCreators = useMemo(() => [...new Set(tasks.map(t => t.task_owner_id).filter(Boolean))].sort((a, b) => memberNameOf(a).localeCompare(memberNameOf(b))), [tasks]) // eslint-disable-line react-hooks/exhaustive-deps
  function memberNameOf(id: string) { return members.find(m => m.id === id)?.name ?? '' }
  const usedThemes = useMemo(() => {
    const m = new Map<string, string>()
    for (const t of tasks) m.set(t.project_id ?? '', t.project?.name ?? tf('noTheme'))
    return [...m.entries()].sort((a, b) => (a[0] ? 0 : 1) - (b[0] ? 0 : 1) || a[1].localeCompare(b[1]))
  }, [tasks]) // eslint-disable-line react-hooks/exhaustive-deps
  const usedPillars = useMemo(() => {
    const names = new Map(themes.flatMap(th => th.pillars.map(p => [p.id, p.name] as const)))
    const ids = [...new Set(tasks.filter(t => t.project_id).map(t => t.pillar_id ?? ''))]
    return ids.length > 1 || (ids.length === 1 && ids[0]) ? ids.map(id => [id, id ? names.get(id) ?? '…' : tf('noPillar')] as [string, string]).sort((a, b) => (a[0] ? 0 : 1) - (b[0] ? 0 : 1) || a[1].localeCompare(b[1])) : []
  }, [tasks, themes]) // eslint-disable-line react-hooks/exhaustive-deps
  const usedTags = useMemo(() => { const ids = new Set(tasks.flatMap(t => t.tag_ids ?? [])); return (card?.tags ?? []).filter(tg => ids.has(tg.id)) }, [tasks, card?.tags])
  const choiceFields = useMemo(() => (card?.fields ?? []).filter(fd => (fd.kind === 'choice' || fd.kind === 'multi') && !fd.retired && tasks.some(t => card?.values.get(t.id)?.has(fd.id))), [card?.fields, card?.values, tasks])

  const memberName = (id: string) => members.find(m => m.id === id)?.name ?? tf('unknown')

  const count = activeFilterCount(filters)
  const behindButton = count - (filters.search.trim() ? 1 : 0)

  const pp = filters.publishPreset ?? 'any'
  const publishText = pp !== 'any'
    ? ({ today: tf('publishToday'), week: tf('next7'), none: tf('noPublish') })[pp]
    : filters.publishFrom || filters.publishTo ? `${filters.publishFrom || '…'} → ${filters.publishTo || '…'}` : ''
  // The range reads as dates, in the reader's language, not as ISO strings.
  // The values are calendar days, so they are formatted at UTC midnight to
  // keep a time zone from moving them a day.
  const dayFmt = new Intl.DateTimeFormat(intlLocale(locale), { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
  const showDay = (d: string) => (d ? dayFmt.format(new Date(`${d}T00:00:00Z`)) : '…')
  const dueText = filters.duePreset !== 'any'
    ? ({ overdue: tf('overdue'), today: tf('dueToday'), week: tf('next7'), none: tf('noDue') })[filters.duePreset]
    : filters.dueFrom || filters.dueTo
      ? `${showDay(filters.dueFrom)} → ${showDay(filters.dueTo)}`
      : null

  return (
    <HeaderMenu
      label={t('filters')}
      data="data-filters"
      width={280}
      className={behindButton > 0 ? 'is-active' : ''}
      trigger={<><FilterIcon /><span className="fx-hd-lbl-keep">{behindButton > 0 ? t('filtersN', { n: behindButton }) : t('filters')}</span></>}
    >
      <div className="fx-hd-filters">
        <PillSection label={tf('search')}>
          <PillInput
            name="q"
            aria-label={tf('searchTasks')}
            autoComplete="off"
            value={filters.search}
            placeholder={tf('searchPlaceholder')}
            onChange={e => set('search', e.target.value)}
          />
        </PillSection>

        <PillSection label={tf('assignee')}>
          {members.filter(m => usedOwnerIds.has(m.id)).map(m => (
            <PillOption key={m.id} selected={filters.ownerIds.includes(m.id)} pressed={filters.ownerIds.includes(m.id)}
                        onClick={() => toggle('ownerIds', m.id)}>
              <Check on={filters.ownerIds.includes(m.id)} /> {memberName(m.id)}
            </PillOption>
          ))}
        </PillSection>

        {usedBrands.length > 1 && <PillSection label={tf('brand')}>
          {usedBrands.map(([id, name]) => (
            <PillOption key={id} selected={filters.brandIds.includes(id)} pressed={filters.brandIds.includes(id)}
                        onClick={() => toggle('brandIds', id)} data-filter-brand={id}>
              <Check on={filters.brandIds.includes(id)} /> {name}
            </PillOption>
          ))}
        </PillSection>}

        {/* QA 26 Nov 2026 (QF-13): Owner, Theme, Pillar, Tags and each choice field (Channels…) can filter too. */}
        {usedCreators.length > 0 && <PillSection label={tf('owner')}>
          {usedCreators.map(id => (
            <PillOption key={id} selected={!!filters.creatorIds?.includes(id)} pressed={!!filters.creatorIds?.includes(id)} data-filter-owner={id}
                        onClick={() => onChange({ ...filters, creatorIds: flip(filters.creatorIds, id) })}>
              <Check on={!!filters.creatorIds?.includes(id)} /> {memberName(id)}
            </PillOption>
          ))}
        </PillSection>}
        {usedThemes.length > 0 && <PillSection label={tf('theme')}>
          {usedThemes.map(([id, name]) => (
            <PillOption key={id || 'none'} selected={!!filters.themeIds?.includes(id)} pressed={!!filters.themeIds?.includes(id)} data-filter-theme={id}
                        onClick={() => onChange({ ...filters, themeIds: flip(filters.themeIds, id) })}>
              <Check on={!!filters.themeIds?.includes(id)} /> {name}
            </PillOption>
          ))}
        </PillSection>}
        {usedPillars.length > 0 && <PillSection label={tf('pillar')}>
          {usedPillars.map(([id, name]) => (
            <PillOption key={id || 'none'} selected={!!filters.pillarIds?.includes(id)} pressed={!!filters.pillarIds?.includes(id)} data-filter-pillar={id}
                        onClick={() => onChange({ ...filters, pillarIds: flip(filters.pillarIds, id) })}>
              <Check on={!!filters.pillarIds?.includes(id)} /> {name}
            </PillOption>
          ))}
        </PillSection>}
        {choiceFields.map(fd => (
          <PillSection key={fd.id} label={locale.startsWith('ar') && fd.name_ar ? fd.name_ar : fd.name_en}>
            {(fd.options.choices ?? []).map(c => {
              const on = !!filters.fieldOptions?.[fd.id]?.includes(c.id)
              return (
                <PillOption key={c.id} selected={on} pressed={on} data-filter-field={`${fd.id}:${c.id}`}
                            onClick={() => onChange({ ...filters, fieldOptions: { ...(filters.fieldOptions ?? {}), [fd.id]: flip(filters.fieldOptions?.[fd.id], c.id) } })}>
                  <Check on={on} /> <span aria-hidden="true" style={{ width: 8, height: 8, borderRadius: '50%', background: c.color ?? '#6B7280', display: 'inline-block' }} /> {locale.startsWith('ar') && c.ar ? c.ar : c.en}
                </PillOption>
              )
            })}
          </PillSection>
        ))}
        {usedTags.length > 0 && <PillSection label={tf('tags')}>
          {usedTags.map(tg => (
            <PillOption key={tg.id} selected={!!filters.tagIds?.includes(tg.id)} pressed={!!filters.tagIds?.includes(tg.id)} data-filter-tag={tg.id}
                        onClick={() => onChange({ ...filters, tagIds: flip(filters.tagIds, tg.id) })}>
              <Check on={!!filters.tagIds?.includes(tg.id)} /> {tg.name}
            </PillOption>
          ))}
        </PillSection>}

        {usedTypes.length > 0 && <PillSection label={tf('type')}>
          {usedTypes.map(v => (
            <PillOption key={v} selected={filters.contentTypes.includes(v)} pressed={filters.contentTypes.includes(v)}
                        onClick={() => toggle('contentTypes', v)}>
              <Check on={filters.contentTypes.includes(v)} /> <TypeIcon icon={typeLook(v).icon} color={typeLook(v).color} size={11} /> {typeLook(v).name}
            </PillOption>
          ))}
        </PillSection>}

        {/* QA 26 Nov 2026 (F13): Platform is retired behind Channels — no longer offered here (values kept). */}
        {false && usedPlatforms.length > 0 && (
          <PillSection label="Platform">
            {usedPlatforms.map(v => (
              <PillOption key={v} selected={filters.platforms.includes(v)} pressed={filters.platforms.includes(v)}
                          onClick={() => toggle('platforms', v)}>
                <Check on={filters.platforms.includes(v)} /> {v}
              </PillOption>
            ))}
          </PillSection>
        )}

        {anyPriority && <PillSection label={tf('priority')}>
          {PRIORITY_OPTIONS.map(v => (
            <PillOption key={v} selected={filters.priorities.includes(v)} pressed={filters.priorities.includes(v)}
                        onClick={() => toggle('priorities', v)}>
              <Check on={filters.priorities.includes(v)} /> {tPri.has(v) ? tPri(v) : v}
            </PillOption>
          ))}
        </PillSection>}

        {anySla && <PillSection label={tf('sla')}>
          {ALERT_OPTIONS.map(v => (
            <PillOption key={v} selected={filters.alerts.includes(v)} pressed={filters.alerts.includes(v)}
                        onClick={() => toggleAlert(v)}>
              <Check on={filters.alerts.includes(v)} /> {tf(`alert.${v.replace(/ /g, '')}`)}
            </PillOption>
          ))}
        </PillSection>}

        <PillSection label={`${tf('due')}${dueText ? ` · ${dueText}` : ''}`}>
          {([
            ['any', tf('anyDate')], ['overdue', tf('overdue')], ['today', tf('dueToday')],
            ['week', tf('next7')], ['none', tf('noDue')],
          ] as [DuePreset, string][]).map(([v, label]) => (
            <PillOption key={v} selected={filters.duePreset === v} pressed={filters.duePreset === v}
                        onClick={() => set('duePreset', v)}>
              <Check on={filters.duePreset === v} /> {label}
            </PillOption>
          ))}
          <div style={{ display: 'grid', gap: 6, marginTop: 6 }}>
            <PillInput type="date" name="from" aria-label={tf('dueFrom')} value={filters.dueFrom}
                       onChange={e => set('dueFrom', e.target.value)} />
            <PillInput type="date" name="to" aria-label={tf('dueTo')} value={filters.dueTo}
                       onChange={e => set('dueTo', e.target.value)} />
          </div>
        </PillSection>

        <PillSection label={`${tf('publish')}${publishText ? ` · ${publishText}` : ''}`}>
          {([
            ['any', tf('anyDate')], ['today', tf('publishToday')], ['week', tf('next7')], ['none', tf('noPublish')],
          ] as [PublishPreset, string][]).map(([v, label]) => (
            <PillOption key={v} selected={(filters.publishPreset ?? 'any') === v}
                        onClick={() => onChange({ ...filters, publishPreset: v })}>
              <Check on={(filters.publishPreset ?? 'any') === v} /> {label}
            </PillOption>
          ))}
          <div style={{ display: 'grid', gap: 6, marginTop: 6 }}>
            <PillInput type="date" value={filters.publishFrom ?? ''} data-filter-publish-from=""
                       onChange={e => onChange({ ...filters, publishFrom: e.target.value })} />
            <PillInput type="date" value={filters.publishTo ?? ''} data-filter-publish-to=""
                       onChange={e => onChange({ ...filters, publishTo: e.target.value })} />
          </div>
        </PillSection>

        <PillSection label={tf('only')}>
          {/* QA 26 Nov 2026 (F12): "My tasks" is the avatar Mine button now. */}
          <PillOption selected={filters.withAttachments} pressed={filters.withAttachments} onClick={() => set('withAttachments', !filters.withAttachments)}>
            <Check on={filters.withAttachments} /> {tf('hasFiles')}
          </PillOption>
        </PillSection>

        {count > 0 && (
          <button
            type="button"
            onClick={() => onChange(EMPTY_FILTERS)}
            className="fx-hov-tint"
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
      </div>
    </HeaderMenu>
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
