'use client'

/**
 * List view (spec 021 US2): rows grouped by status in pipeline order, or by
 * brand on a team Space (design/teams-brands.html). A row opens the task panel.
 */
import { useMemo, useState } from 'react'
import { useTranslations } from 'next-intl'
import type { Brand, Member, SLAConfig, StageId } from '@/types/index'
import { STAGE_META, NINE_STAGE } from '@/lib/stage-meta'
import { STAGE_COLORS, ALERT_BADGE_STYLES } from '@/lib/tokens'
import { PIPE } from '@/lib/pipeline-tokens'
import { getAlertStatus } from '@/lib/alert-status'
import { initials, avatarColor } from '@/lib/utils'
import { featureOn } from '@/lib/brand-features'
import { TaskDates } from '@/components/shared/DueDates'
import type { ViewTask } from './types'
import { STATUS_GROUPS, statusGroupOf } from '@/lib/status-groups'
import type { ContentType, TaskFieldDef, TaskTypeFieldLink } from '@/types/index'
import { useLocale } from 'next-intl'
import { applies, fieldName, formatValue, isEmpty } from '@/lib/task-fields'
import { typeName } from '@/lib/task-types'
import { TypeIcon } from '@/components/types/TypeIcon'
import { TagChip } from '@/components/tags/TagPicker'

type Group = 'brand' | 'stage' | 'statusGroup'

interface ListViewProps {
  tasks: ViewTask[]
  brands: Brand[]
  members: Member[]
  slaConfig: SLAConfig
  today: Date
  /** Offer "Group by Brand" (team Spaces, My tasks); brand pages group by status only. */
  canGroupByBrand?: boolean
  /** The shown name of a stage — a Space's own words, or the board's (US3). */
  stageName?: (s: StageId) => string
  /** Spec 022 (US4): a Space's stages — groups and pills per Space stage. */
  spaceStages?: import('@/components/spaces/useSpaceStages').SpaceStagesApi | null
  /** The shown name of a simple status — a Space's own words, or the default (US3). */
  /** A saved view's grouping. */
  initialGroup?: Group | null
  onOpen: (id: string) => void
  /** Spec 023: the Fields button's choice (standard keys and `f:<id>`); absent = every standard field. */
  fields?: string[]
  /** Spec 023: custom fields and their values, task id → field id → value. */
  custom?: { fields: TaskFieldDef[]; links: TaskTypeFieldLink[]; values: Map<string, Map<string, unknown>>; types: ContentType[]; tags?: import('@/types/index').Tag[] }
}

export function ListView({ tasks, brands, members, slaConfig, today, canGroupByBrand = false, stageName, spaceStages, initialGroup, onOpen, fields, custom }: ListViewProps) {
  const locale = useLocale()
  const shows = (k: string) => !fields || fields.includes(k)
  const shownCustom = (custom?.fields ?? []).filter(f => !f.retired && fields?.includes(`f:${f.id}`))
  const typeOf = (label: string | null | undefined) => custom?.types.find(x => x.label === label)
  const t = useTranslations('spaces')
  const tSheet = useTranslations('taskSheet')
  const tg = useTranslations('statusGroups')
  const [group, setGroup] = useState<Group>(initialGroup ?? (canGroupByBrand ? 'brand' : 'stage'))
  const byId = useMemo(() => new Map(members.map(m => [m.id, m])), [members])
  const live = tasks.filter(x => !x.dropped_at)
  const name = (s: StageId) => stageName?.(s) ?? STAGE_META[s]?.label_en ?? s

  const groups: { key: string; head: React.ReactNode; rows: ViewTask[] }[] = group === 'statusGroup'
    ? STATUS_GROUPS.map(g => ({ key: g, head: <span data-status-group={g}>{tg(g)}</span>, rows: live.filter(x => statusGroupOf(x.status) === g) }))
    : group === 'brand'
    ? [...brands.map(b => ({ key: b.id, head: <Brand b={b} />, rows: live.filter(x => x.brand_id === b.id) })),
       { key: 'none', head: <span>{t('noBrand')}</span>, rows: live.filter(x => !x.brand_id) }]
    : [
        ...(spaceStages?.own
          ? spaceStages.entries.map(e => ({ key: e.id, head: <Pill stage={e.stage_id} label={e.name} board={STAGE_META[e.stage_id]?.label_en} />, rows: live.filter(x => spaceStages.of(x)?.id === e.id) }))
          : NINE_STAGE.map(s => ({ key: s, head: <Pill stage={s} label={name(s)} board={STAGE_META[s]?.label_en} />, rows: live.filter(x => x.status === s) }))),
      ]

  return (
    <div data-list-view style={{ padding: '14px 26px 30px 38px', display: 'flex', flexDirection: 'column', gap: 14 }}>
      {canGroupByBrand && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: PIPE.textMuted }}>
          {t('groupBy')}
          <div role="group" aria-label={t('groupBy')} style={{ display: 'inline-flex', border: `1px solid ${PIPE.border}`, borderRadius: 10, overflow: 'hidden' }}>
            {(['brand', 'stage', 'statusGroup'] as const).map(g => (
              <button key={g} type="button" data-group={g} aria-pressed={group === g} onClick={() => setGroup(g)}
                style={{ border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: 12, fontWeight: 600, padding: '5px 10px',
                  background: group === g ? PIPE.ink : '#FFFFFF', color: group === g ? '#FFFFFF' : PIPE.ink }}>
                {g === 'brand' ? t('groupBrand') : g === 'stage' ? t('groupStatus') : t('groupStatusGroup')}
              </button>
            ))}
          </div>
        </div>
      )}
      {live.length === 0 && <p style={{ color: PIPE.textMuted, fontSize: 13 }}>{t('empty')}</p>}
      {groups.filter(g => g.rows.length).map(g => (
        <section key={g.key} data-group-key={g.key} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <h2 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, fontWeight: 700, color: PIPE.ink }}>
            {g.head}<span style={{ fontSize: 12, fontWeight: 500, color: PIPE.textMuted }}>{g.rows.length}</span>
          </h2>
          {g.rows.map(task => {
            const who = task.assignee_id ? byId.get(task.assignee_id) : undefined
            // Published work can't be late; simple tasks have no SLA.
            const sla = task.status !== 'publish' && featureOn(task.brand, 'sla') ? getAlertStatus(task, slaConfig, today) : 'On Track'
            const late = sla === 'Overdue' || sla === 'Stuck' || sla === 'Will Miss'
            return (
              <button key={task.id} type="button" data-row={task.id} onClick={() => onOpen(task.id)}
                style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) auto', gap: 12, alignItems: 'center', textAlign: 'start',
                  padding: '9px 12px', border: `1px solid ${PIPE.border}`, borderRadius: 12, background: '#FFFFFF', cursor: 'pointer', fontFamily: 'inherit' }}>
                <span style={{ minWidth: 0, display: 'grid', gap: 2 }}>
                  <span style={{ fontWeight: 600, fontSize: 13.5, color: PIPE.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{task.name}</span>
                  <span style={{ fontSize: 11.5, color: PIPE.textMuted, display: 'inline-flex', alignItems: 'center', gap: 4, minWidth: 0 }}>
                    {shows('brand') && (task.brand?.name ?? t('noBrand'))}
                    {task.content_type_label && featureOn(task.brand, 'type') && shows('type') && (() => {
                      const ty = typeOf(task.content_type_label)
                      return <>{shows('brand') && ' · '}<TypeIcon icon={ty?.icon} color={ty?.color} size={11} />{ty ? typeName(ty, locale) : task.content_type_label}</>
                    })()}
                  </span>
                  {(task.tag_ids?.length ?? 0) > 0 && featureOn(task.brand, 'tags') && shows('tags') && custom?.tags && (
                    <span data-list-tags style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>{task.tag_ids!.map(id => custom.tags!.find(g => g.id === id)).filter(Boolean).slice(0, 4).map(g => <TagChip key={g!.id} tag={g!} small />)}</span>
                  )}
                  {shownCustom.length > 0 && <FieldChips task={task} list={shownCustom} custom={custom!} members={members} locale={locale} />}
                </span>
                <span style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                  {late && <span style={{ fontSize: 10.5, fontWeight: 800, padding: '1px 6px', borderRadius: 6, background: ALERT_BADGE_STYLES[sla].bg, color: ALERT_BADGE_STYLES[sla].text }}>SLA</span>}
                  {shows('priority') && task.priority && (task.priority as string) !== 'None' && <span data-list-priority style={{ fontSize: 11, fontWeight: 700, color: ['High', 'Urgent'].includes(task.priority) ? '#D22040' : PIPE.textMuted }}>{(task.priority as string) === 'Medium' ? 'Normal' : task.priority}</span>}
                  {group === 'brand' && shows('status') && <Pill stage={task.status} label={spaceStages?.name(task) ?? name(task.status)} board={STAGE_META[task.status]?.label_en} />}
                  {who && shows('assignee') && <span title={who.name} style={{ width: 22, height: 22, borderRadius: '50%', background: avatarColor(who.name), color: '#FFFFFF', display: 'grid', placeItems: 'center', fontSize: 9.5, fontWeight: 800 }}>{initials(who.name)}</span>}
                  {/* Publishing and due dates, each labelled (spec: both on every task). */}
                  {(shows('publish') || shows('due')) && (() => {
                    const d = { ...task, publish_date: shows('publish') ? task.publish_date : null, due_date: shows('due') ? task.due_date : null } as typeof task
                    return <span style={{ minWidth: 44, textAlign: 'end' }}>{d.publish_date || d.due_date ? <TaskDates task={d} /> : <span style={{ fontSize: 11.5, color: PIPE.textMuted }}>—</span>}</span>
                  })()}
                </span>
              </button>
            )
          })}
        </section>
      ))}
    </div>
  )
}

/** Custom field values on a row (spec 023): the fields the page shows that the task's type has. */
function FieldChips({ task, list, custom, members, locale }: { task: ViewTask; list: TaskFieldDef[]; custom: NonNullable<ListViewProps['custom']>; members: Member[]; locale: string }) {
  const vals = custom.values.get(task.id)
  const items = list.filter(f => applies(task.content_type_label, f.id, custom.links)).map(f => {
    const v = vals?.get(f.id)
    return { f, text: isEmpty(v) ? '' : formatValue(f, v, { locale, memberName: id => members.find(m => m.id === id)?.name }) }
  }).filter(x => x.text)
  if (!items.length) return null
  return (
    <span data-list-fields style={{ display: 'flex', flexWrap: 'wrap', gap: '2px 10px', fontSize: 11.5 }}>
      {items.map(({ f, text }) => (
        <span key={f.id} data-list-field={f.id} style={{ display: 'inline-flex', gap: 4, minWidth: 0, maxWidth: 260 }}>
          <span style={{ color: PIPE.textMuted }}>{fieldName(f, locale)}</span>
          <span style={{ color: PIPE.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{text}</span>
        </span>
      ))}
    </span>
  )
}

/** A stage pill. A Space's word shows alone; the board name is on hover (design decision, 2026-11-22). */
function Pill({ stage, label, board }: { stage: StageId; label: string; board?: string }) {
  const c = STAGE_COLORS[stage] ?? PIPE.textMuted
  return (
    <span data-stage-pill={stage} title={board && board !== label ? board : undefined} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '2px 9px', borderRadius: 999, fontSize: 11.5, fontWeight: 700, color: PIPE.ink, background: `color-mix(in srgb, ${c} 16%, transparent)` }}>
      <span aria-hidden="true" style={{ width: 7, height: 7, borderRadius: '50%', background: c }} />{label}
    </span>
  )
}

function Brand({ b }: { b: Brand }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
      <span aria-hidden="true" style={{ width: 16, height: 16, borderRadius: 5, background: b.color, color: '#FFFFFF', display: 'grid', placeItems: 'center', fontSize: 9, fontWeight: 800 }}>{b.name[0]}</span>
      {b.name}
    </span>
  )
}
