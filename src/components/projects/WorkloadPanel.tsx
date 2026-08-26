'use client'

import { useMemo, useState } from 'react'
import type { ProjectView } from '@/lib/projects'
import {
  assumptionsOf, brandLoads, capacityRows, personLoad, portfolioLoad,
  type MemberInput, type LevelRates, type CapacityRow,
} from '@/lib/workload'
import { UI, TILE, font, card, control, input, personColor } from '@/lib/board-ui'
import { initials } from '@/lib/utils'
import { PersonWorkloadCard } from './PersonWorkloadCard'
import { updateWorkloadAssumptions } from '@/actions/settings'

/**
 * Workload — where the plan's work actually sits.
 *
 * Two rollups over the same steps: by brand, and by person. Every figure comes
 * from src/lib/workload.ts, which the person card also reads, so the two
 * surfaces cannot disagree about the same human being.
 *
 * The panel shows two different quantities and says so. Plan days are what the
 * plan holds and always add up to the portfolio total. Effort days are what it
 * will cost once seniority and supervision are applied, and deliberately do
 * not. Any row where they differ can show its workings — see WorkingsRow.
 */

interface Props {
  projects: ProjectView[]        // already filtered by the board's Focus/Aspiring toggle
  scopeLabel: string
  members: MemberInput[]
  settings: {
    hoursPerStepDay: number
    capacityPeriodEnd: string | null
    complexityThresholdDays: number
    supervisingRole: string
  }
  levels: Record<string, LevelRates>
  isAdmin: boolean
  today: string
  onError: (s: string) => void
}

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
const fmtDate = (iso: string) => {
  const [, m, d] = iso.split('-')
  return `${+d} ${MONTHS[+m - 1]}`
}
const n0 = (n: number) => n.toLocaleString('en-GB', { maximumFractionDigits: 0 })
const nd = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1))

export function WorkloadPanel({
  projects, scopeLabel, members, settings, levels, isAdmin, today, onError,
}: Props) {
  const [open, setOpen] = useState<string | null>(null)   // memberId whose card is open
  const [workings, setWorkings] = useState<string | null>(null)

  const a = useMemo(
    () => assumptionsOf(projects, today, { ...settings, levels }),
    [projects, today, settings, levels],
  )
  const port   = useMemo(() => portfolioLoad(projects, a), [projects, a])
  const brands = useMemo(() => brandLoads(projects, a), [projects, a])
  const rows   = useMemo(() => capacityRows(projects, members, a), [projects, members, a])

  const openMember = members.find(m => m.id === open)
  const load = useMemo(
    () => (openMember ? personLoad(projects, openMember, a, today) : null),
    [projects, openMember, a, today],
  )

  if (!projects.length) {
    return (
      <div style={{ ...card, borderRadius: 18, padding: '40px 24px', textAlign: 'center' }}>
        <p style={{ fontSize: 14, color: UI.soft, margin: 0 }}>
          Nothing in <strong style={{ color: UI.textPrimary }}>{scopeLabel}</strong> to measure yet.
        </p>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

      {/* ── Assumptions header ─────────────────────────────────────────── */}
      <div style={{ ...card, borderRadius: 18, padding: '16px 20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
          <div>
            <span style={{ ...font.kpiLabel, textTransform: 'uppercase' }}>Portfolio at a glance</span>
            <p style={{ margin: '6px 0 0', fontSize: 12.5, color: UI.soft }}>
              {scopeLabel} · {a.workingDays} working days to {fmtDate(a.periodEnd)} ·{' '}
              {nd(a.hoursPerStepDay)}h per step-day · complex above {nd(a.complexityThresholdDays)}d
            </p>
          </div>
          {isAdmin && (
            <Assumptions settings={settings} onError={onError} />
          )}
        </div>
      </div>

      {/* ── KPI row ────────────────────────────────────────────────────── */}
      {/* Five tiles across — two on a phone, see .fx-kpi-row. */}
      <div className="fx-kpi-row" style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 14 }}>
        <Kpi tile={TILE.purple} stroke={UI.purple} icon="folder" label="Projects"
             value={String(port.projects)}
             caption={`${port.projects - port.projectsDone} active · ${port.projectsDone} done`} />
        <Kpi tile={TILE.indigo} stroke={UI.indigo} icon="clock" label="Expected hours"
             value={n0(port.expectedHours)}
             caption={`${nd(port.planDays)} step-days × ${nd(a.hoursPerStepDay)}h`} />
        <Kpi tile={TILE.lime} stroke={UI.green} icon="check" label="Consumed"
             value={n0(port.consumedHours)}
             caption={`${port.consumedPct}% of expected · ${nd(port.doneDays)} done days`}
             bar={port.consumedPct} />
        <Kpi tile={TILE.amber} stroke={UI.star} icon="star" label="Milestones"
             value={String(port.milestones)}
             caption={`${port.milestonesAhead} ahead · ${port.milestonesPassed} passed`} />
        <Kpi tile={TILE.red} stroke={UI.red} icon="alert" label="Unassigned"
             value={nd(port.unassignedDays)}
             caption={port.planDays > 0
               ? `${Math.round((port.unassignedDays / port.planDays) * 100)}% of the plan · nobody holds it`
               : 'nothing planned'}
             bar={port.planDays > 0 ? (port.unassignedDays / port.planDays) * 100 : 0}
             barColor={UI.redStrong} />
      </div>

      {/* ── By brand ───────────────────────────────────────────────────── */}
      <section style={{ ...card, borderRadius: 18, padding: '16px 20px 18px' }}>
        <Caption>By brand</Caption>
        <div className="fx-scroll-x" style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 620 }}>
            <thead>
              <tr>
                <Th align="left">Brand</Th><Th>Projects</Th><Th>Steps</Th>
                <Th>Planned</Th><Th>Hours</Th><Th>Milestones</Th>
                <Th style={{ width: 150 }}>Complete</Th><Th />
              </tr>
            </thead>
            <tbody>
              {brands.map(b => (
                <tr key={b.brandId ?? '__none__'} style={{ borderTop: `1px solid ${UI.groupLine}` }}>
                  <Td align="left">
                    <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <i style={{
                        width: 9, height: 9, borderRadius: '50%', flexShrink: 0,
                        background: b.brandColor ?? UI.faintest,
                      }} />
                      <span style={{ fontWeight: 700, color: UI.textPrimary }}>{b.brandName}</span>
                    </span>
                  </Td>
                  <Td>{b.projects}</Td>
                  <Td>{b.steps}</Td>
                  <Td>{nd(b.planDays)}d</Td>
                  <Td>{n0(b.hours)}h</Td>
                  <Td>{b.milestones}</Td>
                  <Td><Bar pct={b.completionPct} color={UI.limeDot} /></Td>
                  <Td style={{ fontWeight: 700, width: 52 }}>{b.completionPct}%</Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* ── Capacity ───────────────────────────────────────────────────── */}
      <section style={{ ...card, borderRadius: 18, padding: '16px 20px 18px' }}>
        <Caption>
          Capacity · {a.workingDays} working days to {fmtDate(a.periodEnd)} · each person&rsquo;s own weekly hours
        </Caption>
        <div className="fx-scroll-x" style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 680 }}>
            <thead>
              <tr>
                <Th align="left">Person</Th><Th>Plan</Th><Th>Effort</Th>
                <Th>Hours</Th><Th>Available</Th><Th style={{ width: 150 }}>Load</Th><Th /><Th />
              </tr>
            </thead>
            <tbody>
              {rows.map(r => {
                const adjusted = r.kind === 'member' && Math.abs(r.effortDays - r.planDays) > 0.05
                const key = r.memberId ?? r.kind
                return (
                  <>
                    <tr key={key} style={{ borderTop: `1px solid ${UI.groupLine}` }}>
                      <Td align="left">
                        <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          {r.kind === 'member' ? (
                            <Avatar name={r.name} />
                          ) : (
                            <i style={{ width: 9, height: 9, borderRadius: '50%', background: UI.checkbox, flexShrink: 0 }} />
                          )}
                          <span>
                            <span style={{ fontWeight: 700, color: r.kind === 'member' ? UI.textPrimary : UI.soft }}>
                              {r.name}
                            </span>
                            {r.role && <span style={{ fontSize: 12, color: UI.soft }}> · {r.role}</span>}
                            {r.seniority && r.seniority !== 'mid' && (
                              <Tag bg={TILE.amber} fg={UI.amberDeep}>{r.seniority} {nd(r.factor ?? 1)}×</Tag>
                            )}
                            {r.supervisionReceived > 0 && (
                              <Tag bg={UI.purpleTint} fg={UI.purple}>
                                incl. {nd(r.supervisionReceived)}d supervision
                                {r.supervisionShare ? ` · split ${r.supervisionShare.of} ways` : ''}
                              </Tag>
                            )}
                          </span>
                        </span>
                      </Td>
                      <Td>{r.kind === 'supervision-unowned' ? '—' : `${nd(r.planDays)}d`}</Td>
                      <Td>{r.kind === 'unassigned' ? '—' : `${nd(r.effortDays)}d`}</Td>
                      <Td>{n0(r.hours)}h</Td>
                      <Td style={{ color: r.availableHours > 0 ? undefined : UI.faintest }}>
                        {r.availableHours > 0 ? `${n0(r.availableHours)}h` : 'no team hours'}
                      </Td>
                      <Td>
                        <Bar pct={r.utilisationPct ?? 0}
                             color={r.over ? UI.redStrong : r.kind === 'member' ? personColor(r.name) : UI.checkbox} />
                      </Td>
                      <Td style={{ fontWeight: 700, width: 52, color: r.over ? UI.redStrong : undefined }}>
                        {r.utilisationPct === null ? '—' : `${r.utilisationPct}%`}
                      </Td>
                      <Td style={{ width: 108 }}>
                        <span style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                          {adjusted && (
                            <MiniButton
                              onClick={() => setWorkings(workings === key ? null : key)}
                              expanded={workings === key}
                              label={`Show how ${r.name}'s effort is calculated`}
                            >
                              Workings
                            </MiniButton>
                          )}
                          {r.kind === 'member' && (
                            <MiniButton
                              onClick={() => setOpen(open === r.memberId ? null : r.memberId!)}
                              expanded={open === r.memberId}
                              label={`Open ${r.name}'s workload card`}
                            >
                              Card
                            </MiniButton>
                          )}
                        </span>
                      </Td>
                    </tr>
                    {workings === key && <WorkingsRow row={r} a={a} />}
                  </>
                )
              })}
            </tbody>
          </table>
        </div>

        <p style={{ margin: '14px 0 0', fontSize: 11.5, color: UI.faintest, lineHeight: 1.5 }}>
          Plan days reconcile: every row plus unassigned sums to {nd(port.planDays)}d, the portfolio total.
          Effort days do not, and are not meant to — they carry the seniority factor and supervision,
          which is work that exists for a person but sits in nobody&rsquo;s plan.
        </p>
      </section>

      {load && (
        <PersonWorkloadCard load={load} hoursPerStepDay={a.hoursPerStepDay} onClose={() => setOpen(null)} />
      )}
    </div>
  )
}

/* ── the workings, per contracts §4 ──────────────────────────────────── */

function WorkingsRow({ row, a }: { row: CapacityRow; a: { hoursPerStepDay: number } }) {
  const own = row.effortDays - row.supervisionReceived
  return (
    <tr>
      <td colSpan={8} style={{ background: UI.groupBg, borderTop: `1px solid ${UI.groupLine}`, padding: '10px 14px' }}>
        <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', fontSize: 12.5, color: UI.textSecond }}>
          <Fact label="Plan">{nd(row.planDays)}d</Fact>
          <Fact label="Simple">{nd(row.simpleDays)}d × 1 — the premium is for difficulty, not for existing</Fact>
          <Fact label="Complex">{nd(row.complexDays)}d × {nd(row.factor ?? 1)} = {nd(row.complexDays * (row.factor ?? 1))}d</Fact>
          <Fact label="Own effort">{nd(own)}d</Fact>
          {row.supervisionReceived > 0 && (
            <Fact label="Supervision received">
              {nd(row.supervisionReceived)}d
              {row.supervisionShare ? ` (an equal share between ${row.supervisionShare.of})` : ''}
            </Fact>
          )}
          <Fact label="Hours">{nd(row.effortDays)}d × {nd(a.hoursPerStepDay)}h = {n0(row.hours)}h</Fact>
        </div>
      </td>
    </tr>
  )
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <span>
      <span style={{ fontWeight: 800, fontSize: 10.5, letterSpacing: '.06em', textTransform: 'uppercase', color: UI.faint }}>
        {label}
      </span>
      <br />
      <span style={{ fontWeight: 600, color: UI.textPrimary }}>{children}</span>
    </span>
  )
}

/* ── assumption editors ──────────────────────────────────────────────── */

function Assumptions({ settings, onError }: {
  settings: Props['settings']
  onError: (s: string) => void
}) {
  const save = (patch: Parameters<typeof updateWorkloadAssumptions>[0]) => {
    onError('')
    void updateWorkloadAssumptions(patch).then(r => {
      if (!r.success) onError(r.error ?? 'Could not save that')
    })
  }
  return (
    <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
      <label style={{ ...control, height: 38, padding: '0 12px', gap: 8, fontSize: 12.5, color: UI.textSecond }}>
        Effort per step-day
        <select defaultValue={String(settings.hoursPerStepDay)}
                aria-label="Hours per step-day"
                onChange={e => save({ hoursPerStepDay: Number(e.target.value) })}
                style={{ ...input, padding: '3px 6px', width: 66, appearance: 'none' }}>
          {[4, 5, 6, 7, 8, 10, 12].map(h => <option key={h} value={h}>{h}h</option>)}
        </select>
      </label>
      <label style={{ ...control, height: 38, padding: '0 12px', gap: 8, fontSize: 12.5, color: UI.textSecond }}>
        Complex above
        <select defaultValue={String(settings.complexityThresholdDays)}
                aria-label="Complexity threshold in days"
                onChange={e => save({ complexityThresholdDays: Number(e.target.value) })}
                style={{ ...input, padding: '3px 6px', width: 66, appearance: 'none' }}>
          {[1, 2, 3, 4, 5].map(d => <option key={d} value={d}>{d}d</option>)}
        </select>
      </label>
    </div>
  )
}

/* ── small pieces ────────────────────────────────────────────────────── */

const Caption = ({ children }: { children: React.ReactNode }) => (
  <div style={{
    fontSize: 11.5, fontWeight: 800, letterSpacing: '.08em',
    textTransform: 'uppercase', color: UI.soft, marginBottom: 12,
  }}>{children}</div>
)

const Th = ({ children, align = 'right', style }: {
  children?: React.ReactNode; align?: 'left' | 'right'; style?: React.CSSProperties
}) => (
  <th style={{
    textAlign: align, padding: '0 0 8px', fontWeight: 600, fontSize: 10.5,
    letterSpacing: '.06em', textTransform: 'uppercase', color: UI.faintest, ...style,
  }}>{children}</th>
)

const Td = ({ children, align = 'right', style }: {
  children?: React.ReactNode; align?: 'left' | 'right'; style?: React.CSSProperties
}) => (
  <td style={{
    textAlign: align, padding: '10px 0', color: UI.textSecond,
    fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap', ...style,
  }}>{children}</td>
)

function Bar({ pct, color }: { pct: number; color: string }) {
  return (
    <span style={{
      display: 'inline-block', width: 150, height: 7, borderRadius: 999,
      background: UI.track, overflow: 'hidden', verticalAlign: 'middle',
    }}>
      {/* Clamped at full width; the number beside it keeps telling the truth. */}
      <span style={{ display: 'block', width: `${Math.min(100, Math.max(0, pct))}%`, height: '100%', background: color, borderRadius: 999 }} />
    </span>
  )
}

const Tag = ({ bg, fg, children }: { bg: string; fg: string; children: React.ReactNode }) => (
  <span style={{
    display: 'inline-block', marginLeft: 8, padding: '2px 7px', borderRadius: 5,
    background: bg, color: fg, fontWeight: 700, fontSize: 10,
  }}>{children}</span>
)

function MiniButton({ children, onClick, expanded, label }: {
  children: React.ReactNode; onClick: () => void; expanded: boolean; label: string
}) {
  return (
    <button onClick={onClick} aria-expanded={expanded} aria-label={label}
            style={{
              border: `1px solid ${UI.borderInput}`, borderRadius: 7, padding: '4px 9px',
              background: expanded ? UI.limeTint2 : '#FFFFFF', color: UI.textPrimary,
              fontWeight: 700, fontSize: 11, cursor: 'pointer', fontFamily: 'inherit',
            }}>
      {children}
    </button>
  )
}

function Avatar({ name }: { name: string }) {
  return (
    <span style={{
      width: 26, height: 26, borderRadius: '50%', flexShrink: 0,
      background: personColor(name), color: '#FFFFFF', fontWeight: 800, fontSize: 10,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>{initials(name)}</span>
  )
}

function Kpi({ tile, stroke, icon, label, value, caption, bar, barColor }: {
  tile: string; stroke: string; icon: string
  label: string; value: string; caption: string
  bar?: number; barColor?: string
}) {
  return (
    <div style={{ ...card, padding: '16px 16px 18px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
        <span style={{
          width: 42, height: 42, borderRadius: 12, background: tile, flexShrink: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <Icon name={icon} stroke={stroke} />
        </span>
        <span style={{ ...font.kpiLabel, textTransform: 'uppercase' }}>{label}</span>
      </div>
      <div style={{ ...font.kpiValue, marginTop: 12, fontVariantNumeric: 'tabular-nums' }}>{value}</div>
      <div style={{ marginTop: 8, fontSize: 12.5, color: UI.soft, fontWeight: 500 }}>{caption}</div>
      {bar !== undefined && (
        <div style={{ marginTop: 9, height: 6, borderRadius: 999, background: UI.track, overflow: 'hidden' }}>
          <div style={{ width: `${Math.min(100, bar)}%`, height: '100%', background: barColor ?? UI.limeDot, borderRadius: 999 }} />
        </div>
      )}
    </div>
  )
}

function Icon({ name, stroke }: { name: string; stroke: string }) {
  const paths: Record<string, React.ReactNode> = {
    folder: <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />,
    clock:  <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3.5 2" /></>,
    check:  <><circle cx="12" cy="12" r="9" /><path d="m8.5 12 2.5 2.5L16 9.5" /></>,
    star:   <path d="M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1.1 5.9L12 16.9 6.7 19.7l1.1-5.9L3.5 9.7l5.9-.8z" />,
    alert:  <><circle cx="12" cy="12" r="9" /><path d="M12 7.5v5.5" /><circle cx="12" cy="16.5" r="1.1" fill={stroke} stroke="none" /></>,
  }
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={stroke}
         strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {paths[name]}
    </svg>
  )
}
