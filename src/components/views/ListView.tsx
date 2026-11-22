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
import type { ViewTask } from './types'

type Group = 'brand' | 'stage'

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
  onOpen: (id: string) => void
}

export function ListView({ tasks, brands, members, slaConfig, today, canGroupByBrand = false, stageName, onOpen }: ListViewProps) {
  const t = useTranslations('spaces')
  const [group, setGroup] = useState<Group>(canGroupByBrand ? 'brand' : 'stage')
  const byId = useMemo(() => new Map(members.map(m => [m.id, m])), [members])
  const live = tasks.filter(x => !x.dropped_at)
  const name = (s: StageId) => stageName?.(s) ?? STAGE_META[s]?.label_en ?? s

  const groups: { key: string; head: React.ReactNode; rows: ViewTask[] }[] = group === 'brand'
    ? [...brands.map(b => ({ key: b.id, head: <Brand b={b} />, rows: live.filter(x => x.brand_id === b.id) })),
       { key: 'none', head: <span>{t('noBrand')}</span>, rows: live.filter(x => !x.brand_id) }]
    : NINE_STAGE.map(s => ({ key: s, head: <Pill stage={s} label={name(s)} />, rows: live.filter(x => x.status === s && x.kind !== 'simple') }))

  return (
    <div data-list-view style={{ padding: '14px 26px 30px 38px', display: 'flex', flexDirection: 'column', gap: 14 }}>
      {canGroupByBrand && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: PIPE.textMuted }}>
          {t('groupBy')}
          <div role="group" aria-label={t('groupBy')} style={{ display: 'inline-flex', border: `1px solid ${PIPE.border}`, borderRadius: 10, overflow: 'hidden' }}>
            {(['brand', 'stage'] as const).map(g => (
              <button key={g} type="button" data-group={g} aria-pressed={group === g} onClick={() => setGroup(g)}
                style={{ border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: 12, fontWeight: 600, padding: '5px 10px',
                  background: group === g ? PIPE.ink : '#FFFFFF', color: group === g ? '#FFFFFF' : PIPE.ink }}>
                {g === 'brand' ? t('groupBrand') : t('groupStatus')}
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
            const sla = task.kind !== 'simple' && featureOn(task.brand, 'sla') ? getAlertStatus(task, slaConfig, today) : 'On Track'
            const late = sla === 'Overdue' || sla === 'Stuck' || sla === 'Will Miss'
            return (
              <button key={task.id} type="button" data-row={task.id} onClick={() => onOpen(task.id)}
                style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) auto', gap: 12, alignItems: 'center', textAlign: 'start',
                  padding: '9px 12px', border: `1px solid ${PIPE.border}`, borderRadius: 12, background: '#FFFFFF', cursor: 'pointer', fontFamily: 'inherit' }}>
                <span style={{ minWidth: 0, display: 'grid', gap: 2 }}>
                  <span style={{ fontWeight: 600, fontSize: 13.5, color: PIPE.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{task.name}</span>
                  <span style={{ fontSize: 11.5, color: PIPE.textMuted }}>{task.brand?.name ?? t('noBrand')}{task.content_type_label && featureOn(task.brand, 'type') ? ` · ${task.content_type_label}` : ''}</span>
                </span>
                <span style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                  {late && <span style={{ fontSize: 10.5, fontWeight: 800, padding: '1px 6px', borderRadius: 6, background: ALERT_BADGE_STYLES[sla].bg, color: ALERT_BADGE_STYLES[sla].text }}>SLA</span>}
                  {group === 'brand' && task.kind !== 'simple' && <Pill stage={task.status} label={name(task.status)} />}
                  {who && <span title={who.name} style={{ width: 22, height: 22, borderRadius: '50%', background: avatarColor(who.name), color: '#FFFFFF', display: 'grid', placeItems: 'center', fontSize: 9.5, fontWeight: 800 }}>{initials(who.name)}</span>}
                  <span style={{ fontSize: 11.5, color: PIPE.textMuted, minWidth: 44, textAlign: 'end' }}>{task.due_date ? new Date(task.due_date).toLocaleDateString(undefined, { day: 'numeric', month: 'short' }) : '—'}</span>
                </span>
              </button>
            )
          })}
        </section>
      ))}
    </div>
  )
}

function Pill({ stage, label }: { stage: StageId; label: string }) {
  const c = STAGE_COLORS[stage] ?? PIPE.textMuted
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '2px 9px', borderRadius: 999, fontSize: 11.5, fontWeight: 700, color: PIPE.ink, background: `color-mix(in srgb, ${c} 16%, transparent)` }}>
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
