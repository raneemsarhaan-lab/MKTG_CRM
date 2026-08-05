'use client'

import { useEffect, useMemo, useState, useTransition } from 'react'
import type { ProjectView, StepView } from '@/lib/projects'
import {
  statsOf, portfolioStats, horizon, weeksOf, spanOf, byBrand,
  isLate, todayISO, UNASSIGNED,
} from '@/lib/projects'
import {
  UI, TILE, font, card, control, input,
  trackOf, TRACK_STYLE, personColor, durationTone,
} from '@/lib/board-ui'
import { initials } from '@/lib/utils'
import {
  toggleProjectFocus, updateProject, updateStep, setStepDone,
  convertStepToTask, addStep, removeStep, createProject,
} from '@/actions/projects'

/**
 * Portfolio — Aspiring and Focus.
 *
 * Built to "Fluxo Portfolio - Design Spec.md". Every measurement here is from
 * that file; where a number looks arbitrary it is because the spec names it.
 *
 * Aspiring is the whole portfolio; Focus is the subset being worked on now.
 * One list with a flag rather than two plans, so a project cannot drift into
 * two versions of itself — the toggle switches which subset is shown and the
 * star moves a project between them.
 */

interface Props {
  projects: ProjectView[]
  brands:   { id: string; name: string; color: string; logo_url?: string | null }[]
  members:  { id: string; name: string }[]
  isAdmin:  boolean
}

type Tab  = 'overview' | 'projects' | 'timeline' | 'weeks'
type List = 'focus' | 'aspiring'

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
const fmt = (iso: string | null) => {
  if (!iso) return '—'
  const [, m, d] = iso.split('-')
  return `${+d} ${MONTHS[+m - 1]}`
}

export function ProjectsView({ projects, brands, members, isAdmin }: Props) {
  const [list, setList]   = useState<List>('focus')
  const [tab, setTab]     = useState<Tab>('overview')
  const [error, setError] = useState('')
  const today = todayISO()

  const shown = useMemo(
    () => (list === 'focus' ? projects.filter(p => p.focus) : projects),
    [projects, list],
  )
  const stats = useMemo(() => portfolioStats(shown, today), [shown, today])

  return (
    <div style={{ overflowY: 'auto', height: '100%', background: '#FFFFFF' }}>
      {/* §2 — main padding and the 20px rhythm between every top-level section */}
      <div style={{
        maxWidth: 1336, padding: '24px 26px 34px 38px',
        display: 'flex', flexDirection: 'column', gap: 20,
      }}>

        {/* ── §4 Header ───────────────────────────────────────────────── */}
        <header style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 24 }}>
          <div>
            <div style={font.eyebrow}>Projects</div>
            <svg width="46" height="7" viewBox="0 0 46 7" fill="none" aria-hidden="true"
                 style={{ display: 'block', margin: '5px 0 8px' }}>
              <path d="M2 4.5C12 2 34 2 44 4" stroke={UI.lime} strokeWidth="4" strokeLinecap="round" />
            </svg>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
              <h1 style={{ ...font.title, margin: 0 }}>
                {list === 'focus' ? 'Focus' : 'Aspiring'}
              </h1>
              <TitleSparkle />
            </div>
            <p style={{ ...font.subtitle, margin: '7px 0 0' }}>
              {list === 'focus'
                ? 'What the team is working on now.'
                : 'Everything planned — Focus is drawn from this list.'}
            </p>
          </div>

          {/* Segmented toggle */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 4,
            background: UI.surface, borderRadius: 999, padding: 5, flexShrink: 0,
          }}>
            {(['focus', 'aspiring'] as List[]).map(l => {
              const active = list === l
              const n = l === 'focus' ? projects.filter(p => p.focus).length : projects.length
              return (
                <button key={l} onClick={() => setList(l)} aria-pressed={active}
                        style={{
                          height: 40, padding: '0 26px', borderRadius: 999, border: 'none',
                          cursor: 'pointer', fontFamily: 'inherit', fontSize: 14,
                          background: active ? UI.lime : 'transparent',
                          fontWeight: active ? 700 : 600,
                          color: active ? UI.ink : UI.soft,
                        }}>
                  {l === 'focus' ? 'Focus' : 'Aspiring'} · {n}
                </button>
              )
            })}
          </div>
        </header>

        {error && (
          <p role="alert" style={{ fontSize: 13, color: UI.redStrong, margin: 0 }}>{error}</p>
        )}

        {/* ── §5 KPI row ──────────────────────────────────────────────── */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 14 }}>
          <Kpi tile={TILE.purple} stroke={UI.purple} icon="folder"
               label="Projects" value={String(stats.projects)} caption="Active projects" />
          <Kpi tile={TILE.lime} stroke={UI.green} icon="check"
               label="Steps done" value={`${stats.done}/${stats.steps}`}
               caption={`${stats.percent}% completed`} bar={stats.percent} />
          <Kpi tile={TILE.amber} stroke={UI.amber} icon="clock"
               label="Late" value={String(stats.late)}
               caption={stats.late === 0 ? 'No late steps' : `${stats.late} behind`}
               captionTone={stats.late === 0 ? UI.green : UI.redStrong} />
          <Kpi tile={TILE.indigo} stroke={UI.indigo} icon="calendar"
               label="Next 7 days" value={String(stats.dueThisWeek)} caption="Steps coming up" />
          <Kpi tile={TILE.red} stroke={UI.red} icon="calendarDot"
               label="Days planned" value={String(Math.round(stats.daysPlanned))}
               caption={`${stats.runwayDays} working days left`} />
        </div>

        {/* ── §6 Workload Horizon ─────────────────────────────────────── */}
        <Horizon projects={shown} today={today} />

        {/* ── §7 View tabs ────────────────────────────────────────────── */}
        <div style={{
          display: 'inline-flex', alignSelf: 'flex-start', alignItems: 'center', gap: 4,
          border: `1px solid ${UI.border}`, borderRadius: 14, padding: 6, background: '#FFFFFF',
        }}>
          {(['overview', 'projects', 'timeline', 'weeks'] as Tab[]).map(t => {
            const active = tab === t
            return (
              <button key={t} onClick={() => setTab(t)} aria-pressed={active}
                      style={{
                        height: 42, padding: '0 20px', borderRadius: 10, border: 'none',
                        display: 'flex', alignItems: 'center', gap: 9, cursor: 'pointer',
                        fontFamily: 'inherit', fontSize: 13.5,
                        background: active ? UI.limeTint2 : 'transparent',
                        fontWeight: active ? 700 : 600,
                        color: active ? UI.ink : UI.textSecond,
                      }}>
                <TabIcon name={t} active={active} />
                {t === 'overview' ? 'Overview' : t === 'projects' ? 'Projects' : t === 'timeline' ? 'Timeline' : 'Weeks'}
              </button>
            )
          })}
        </div>

        {tab === 'overview' && (
          <Overview projects={shown} today={today} brands={brands} isAdmin={isAdmin} onError={setError} />
        )}
        {tab === 'projects' && (
          <ProjectList projects={shown} today={today} brands={brands} members={members}
                       isAdmin={isAdmin} onError={setError} />
        )}
        {tab === 'timeline' && <Timeline projects={shown} today={today} />}
        {tab === 'weeks'    && <Weeks projects={shown} today={today} />}

        {isAdmin && tab === 'projects' && <NewProject onError={setError} />}
      </div>
    </div>
  )
}

/* ── §5 KPI card ─────────────────────────────────────────────────────── */

function Kpi({ tile, stroke, icon, label, value, caption, captionTone, bar }: {
  tile: string; stroke: string; icon: string
  label: string; value: string; caption: string
  captionTone?: string; bar?: number
}) {
  return (
    <div style={{ ...card, padding: '16px 16px 18px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
        <span style={{
          width: 42, height: 42, borderRadius: 12, background: tile, flexShrink: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <Icon name={icon} size={20} stroke={stroke} width={2.1} />
        </span>
        <span style={{ ...font.kpiLabel, textTransform: 'uppercase' }}>{label}</span>
      </div>
      <div style={{ ...font.kpiValue, marginTop: 12 }}>{value}</div>
      <div style={{
        marginTop: 8, fontSize: 12.5,
        fontWeight: captionTone ? 700 : 500,
        color: captionTone ?? UI.soft,
      }}>
        {caption}
      </div>
      {bar !== undefined && (
        <div style={{ marginTop: 9, height: 6, borderRadius: 999, background: UI.track, overflow: 'hidden' }}>
          <div style={{ width: `${Math.min(100, bar)}%`, height: '100%', background: UI.limeDot, borderRadius: 999 }} />
        </div>
      )}
    </div>
  )
}

/* ── §6 Workload Horizon ─────────────────────────────────────────────── */

function Horizon({ projects, today }: { projects: ProjectView[]; today: string }) {
  const cells = horizon(projects, today, 21)
  const counts = cells.map(c => c.steps.length)
  const peak = Math.max(...counts, 1)

  // §6: the axis runs in steps of 5 and 15 units = 108px. Keep that scale when
  // the real peak is under 15; beyond it the axis grows so nothing is clipped.
  const axisTop = Math.max(15, Math.ceil(peak / 5) * 5)
  const PLOT = 116
  const height = (n: number) => (n === 0 ? 3 : Math.max(4, Math.round((n / axisTop) * 108)))

  const [hover, setHover] = useState<number | null>(null)

  return (
    <div style={{ ...card, borderRadius: 18, padding: '18px 22px 14px', position: 'relative' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
          <Icon name="bars" size={19} stroke={UI.purple} width={2.2} />
          <span style={{ fontWeight: 800, fontSize: 12.5, letterSpacing: '0.06em', color: UI.textPrimary }}>
            WORKLOAD HORIZON · NEXT 21 DAYS
          </span>
        </div>
        <span style={{ ...control, height: 38, padding: '0 14px', borderRadius: 10, gap: 9 }}>
          <Icon name="calendar" size={16} stroke={UI.muted} width={2.1} />
          <span style={{ fontWeight: 600, fontSize: 13, color: UI.textPrimary }}>Daily view</span>
          <Icon name="chevron" size={15} stroke={UI.muted} width={2.4} style={{ marginLeft: 2 }} />
        </span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '28px 1fr', gap: 8, marginTop: 20 }}>
        <div style={{
          height: PLOT, display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
          textAlign: 'right', paddingBottom: 1, fontWeight: 600, fontSize: 11, color: UI.faintest,
        }}>
          {[axisTop, Math.round(axisTop * 2 / 3), Math.round(axisTop / 3), 0].map((n, i) => <span key={i}>{n}</span>)}
        </div>

        <div>
          <div style={{ position: 'relative', height: PLOT }}>
            {[0, 38.6, 77.3].map(t => (
              <div key={t} style={{ position: 'absolute', left: 0, right: 0, top: t, borderTop: `1px dashed ${UI.gridLine}` }} />
            ))}
            <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, borderTop: `1px solid ${UI.axisLine}` }} />

            <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'flex-end', gap: 10 }}>
              {cells.map((c, i) => {
                const zero = c.steps.length === 0
                const isToday = c.date === today
                return (
                  <div
                    key={c.date}
                    onMouseEnter={() => setHover(i)}
                    onMouseLeave={() => setHover(null)}
                    style={{
                      flex: 1, height: height(c.steps.length),
                      background: zero ? UI.zeroBar : isToday ? UI.limeDeep : UI.lime,
                      borderRadius: zero ? '2px 2px 0 0' : '3px 3px 0 0',
                    }}
                  />
                )
              })}
            </div>
          </div>

          <div style={{ display: 'flex', gap: 10, marginTop: 9 }}>
            {cells.map(c => {
              const isToday = c.date === today
              return (
                <span key={c.date} style={{
                  flex: 1, textAlign: 'center', fontSize: 11.5,
                  fontWeight: isToday ? 800 : 600,
                  color: isToday ? UI.ink : UI.faintest,
                }}>
                  {c.date.slice(8)}
                </span>
              )
            })}
          </div>
        </div>
      </div>

      {hover !== null && (
        <div style={{
          // Centred on the hovered column: the plot starts after the 28px axis
          // and its 8px gap, so the bar's midpoint is (i + 0.5) / n across it.
          position: 'absolute',
          left: `calc(22px + 36px + ${((hover + 0.5) / cells.length) * 100}% - ${((36 + 22) * (hover + 0.5)) / cells.length}px)`,
          bottom: -18,
          background: UI.ink, color: '#FFFFFF', borderRadius: 8, padding: '8px 13px',
          fontWeight: 600, fontSize: 12, whiteSpace: 'nowrap', zIndex: 2,
          boxShadow: '0 6px 16px rgba(20,19,26,0.22)', transform: 'translateX(-50%)',
        }}>
          {fmt(cells[hover].date)} — {cells[hover].steps.length} step(s)
        </div>
      )}
    </div>
  )
}

/* ── §8 Overview: brand groups of project cards ──────────────────────── */

function Overview({ projects, today, brands, isAdmin, onError }: {
  projects: ProjectView[]; today: string
  brands: { id: string; name: string; color: string; logo_url?: string | null }[]
  isAdmin: boolean; onError: (s: string) => void
}) {
  const groups = byBrand(projects)
  if (!groups.length) return <Empty>No projects in this list yet.</Empty>

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {groups.map(([brandName, list]) => (
        <section key={brandName} style={{ ...card, borderRadius: 18, padding: '16px 18px 18px' }}>
          <BrandHeader name={brandName} count={list.length} brands={brands} />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14, marginTop: 16 }}>
            {list.map(p => (
              <ProjectCard key={p.id} project={p} today={today} isAdmin={isAdmin} onError={onError} />
            ))}
          </div>
          {brandName === UNASSIGNED && (
            <p style={{ fontSize: 12.5, color: UI.soft, margin: '12px 0 0' }}>
              These have no brand. Set one on the Projects tab.
            </p>
          )}
        </section>
      ))}
    </div>
  )
}

function ProjectCard({ project: p, today, isAdmin, onError }: {
  project: ProjectView; today: string; isAdmin: boolean; onError: (s: string) => void
}) {
  const s = statsOf(p, today)
  const track = TRACK_STYLE[trackOf(p, today)]
  const tile = p.standing ? TILE.purple : s.late ? TILE.red : TILE.lime
  const stroke = p.standing ? UI.purple : s.late ? UI.red : '#4C8C1F'

  return (
    <div style={{ border: `1px solid ${UI.border}`, borderRadius: 14, padding: 14 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 13 }}>
        <span style={{
          width: 52, height: 52, borderRadius: 14, background: tile, flexShrink: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <Icon name={p.standing ? 'pencil' : 'rocket'} size={24} stroke={stroke} width={2} />
        </span>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
            <span style={{
              flex: 1, fontWeight: 700, fontSize: 14.5, letterSpacing: '-0.01em',
              color: UI.textPrimary, textWrap: 'pretty' as React.CSSProperties['textWrap'],
            }}>
              {p.name}
            </span>
            <FocusStar project={p} isAdmin={isAdmin} onError={onError} />
          </div>

          {p.standing ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginTop: 7 }}>
              <span style={{
                padding: '4px 8px', borderRadius: 6, background: UI.purpleTint,
                fontWeight: 800, fontSize: 10, letterSpacing: '0.04em', color: UI.purple,
              }}>
                STANDING
              </span>
              <span style={{ fontWeight: 500, fontSize: 12.5, color: UI.soft }}>due {fmt(p.dueDate)}</span>
            </div>
          ) : (
            <div style={{ marginTop: 6, fontWeight: 500, fontSize: 12.5, color: UI.soft }}>
              due {fmt(p.dueDate)}
            </div>
          )}
        </div>
      </div>

      <div style={{ marginTop: 14, height: 6, borderRadius: 999, background: UI.track, overflow: 'hidden' }}>
        <div style={{ width: `${s.percent}%`, height: '100%', background: UI.limeDot, borderRadius: 999 }} />
      </div>

      <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <span style={{ fontWeight: 500, fontSize: 11.5, color: UI.soft }}>
          {s.done}/{s.total} steps · {Math.round(s.daysPlanned)}d planned
          {s.nextDue && ` · next ${fmt(s.nextDue)}`}
        </span>
        <span style={{
          padding: '4px 9px', borderRadius: 6, fontWeight: 700, fontSize: 10.5,
          background: track.bg, color: track.fg, whiteSpace: 'nowrap',
        }}>
          {track.label}
        </span>
      </div>
    </div>
  )
}

function BrandHeader({ name, count, brands, right }: {
  name: string; count: number
  brands: { name: string; color: string; logo_url?: string | null }[]
  right?: React.ReactNode
}) {
  const b = brands.find(x => x.name === name)
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
      <span style={{
        width: 28, height: 28, borderRadius: '50%', flexShrink: 0, overflow: 'hidden',
        background: b?.color ?? UI.faintest, color: '#FFFFFF',
        fontWeight: 800, fontSize: 13,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        {b?.logo_url
          // eslint-disable-next-line @next/next/no-img-element
          ? <img src={b.logo_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          : name[0]?.toUpperCase()}
      </span>
      <span style={font.cardTitle}>{name}</span>
      <span style={{
        minWidth: 24, height: 22, padding: '0 7px', borderRadius: 999,
        background: UI.purpleTint, color: UI.purple, fontWeight: 700, fontSize: 11.5,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        {count}
      </span>
      {right ?? null}
    </div>
  )
}

/* ── Projects tab — the editable list ────────────────────────────────── */

function ProjectList({ projects, today, brands, members, isAdmin, onError }: {
  projects: ProjectView[]; today: string
  brands: { id: string; name: string; color: string; logo_url?: string | null }[]
  members: { id: string; name: string }[]
  isAdmin: boolean; onError: (s: string) => void
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {byBrand(projects).map(([brandName, list]) => (
        <section key={brandName} style={{ ...card, borderRadius: 18, padding: '16px 18px 18px' }}>
          <BrandHeader name={brandName} count={list.length} brands={brands} />
          <div style={{ display: 'grid', gap: 8, marginTop: 14 }}>
            {list.map(p => (
              <ProjectRow key={p.id} project={p} today={today} brands={brands}
                          members={members} isAdmin={isAdmin} onError={onError} />
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}

function ProjectRow({ project: p, today, brands, members, isAdmin, onError }: {
  project: ProjectView; today: string
  brands: { id: string; name: string; color: string }[]
  members: { id: string; name: string }[]
  isAdmin: boolean; onError: (s: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [isPending, start] = useTransition()
  const [newStep, setNewStep] = useState('')
  const s = statsOf(p, today)

  function act(fn: () => Promise<{ success: boolean; error?: string }>) {
    onError('')
    start(async () => {
      const r = await fn()
      if (!r.success) onError(r.error ?? 'That change could not be saved')
    })
  }

  return (
    <div style={{ border: `1px solid ${UI.border}`, borderRadius: 14, opacity: isPending ? 0.7 : 1 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px' }}>
        <button onClick={() => setOpen(!open)} aria-expanded={open}
                aria-label={`${open ? 'Collapse' : 'Expand'} ${p.name}`}
                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2, lineHeight: 0 }}>
          <Icon name="chevron" size={15} stroke={UI.muted} width={2.4}
                style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .15s' }} />
        </button>

        {isAdmin ? (
          <input defaultValue={p.name} aria-label={`Name of ${p.name}`}
                 onBlur={e => { const v = e.target.value.trim(); if (v && v !== p.name) act(() => updateProject(p.id, { name: v })) }}
                 style={{ ...input, flex: 1, fontWeight: 700, fontSize: 14.5, border: '1px solid transparent', background: 'transparent' }} />
        ) : (
          <span style={{ flex: 1, fontWeight: 700, fontSize: 14.5, color: UI.textPrimary }}>{p.name}</span>
        )}

        {p.standing && (
          <span style={{
            padding: '4px 8px', borderRadius: 6, background: UI.purpleTint,
            fontWeight: 800, fontSize: 10, letterSpacing: '0.04em', color: UI.purple,
          }}>STANDING</span>
        )}
        <span style={{ fontWeight: 500, fontSize: 11.5, color: UI.soft, whiteSpace: 'nowrap' }}>
          {s.done}/{s.total} steps
        </span>

        {isAdmin ? (
          <>
            <input type="date" defaultValue={p.dueDate ?? ''} aria-label={`Due date of ${p.name}`}
                   onChange={e => act(() => updateProject(p.id, { due_date: e.target.value || null }))}
                   style={{ ...input, width: 150 }} />
            <select value={p.brandId ?? ''} aria-label={`Brand of ${p.name}`}
                    onChange={e => act(() => updateProject(p.id, { brand_id: e.target.value || null }))}
                    style={{ ...input, width: 168 }}>
              <option value="">— no brand —</option>
              {brands.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </>
        ) : (
          <span style={{ fontWeight: 500, fontSize: 12.5, color: UI.soft }}>due {fmt(p.dueDate)}</span>
        )}

        <FocusStar project={p} isAdmin={isAdmin} onError={onError} />
      </div>

      {open && (
        <div style={{ borderTop: `1px solid ${UI.groupLine}`, background: UI.groupBg, padding: '12px 14px 14px 40px', display: 'grid', gap: 6 }}>
          {p.steps.map(st => (
            <StepRow key={st.id} step={st} today={today} members={members} isAdmin={isAdmin} onError={onError} />
          ))}
          {!p.steps.length && <p style={{ fontSize: 13, color: UI.soft }}>No steps yet.</p>}

          {isAdmin && (
            <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
              <input value={newStep} onChange={e => setNewStep(e.target.value)}
                     onKeyDown={e => { if (e.key === 'Enter' && newStep.trim()) { act(() => addStep(p.id, newStep)); setNewStep('') } }}
                     placeholder="Add a step…" style={{ ...input, flex: 1 }} />
              <button onClick={() => { if (newStep.trim()) { act(() => addStep(p.id, newStep)); setNewStep('') } }}
                      style={PRIMARY}>Add</button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function StepRow({ step, today, members, isAdmin, onError }: {
  step: StepView; today: string
  members: { id: string; name: string }[]
  isAdmin: boolean; onError: (s: string) => void
}) {
  const [isPending, start] = useTransition()
  const [done, setDone] = useState(step.done)
  useEffect(() => { setDone(step.done) }, [step.done])

  const late = isLate({ ...step, done }, today)

  function act(fn: () => Promise<{ success: boolean; error?: string }>) {
    onError('')
    start(async () => {
      const r = await fn()
      if (!r.success) onError(r.error ?? 'That change could not be saved')
    })
  }

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 12, padding: '9px 12px',
      background: '#FFFFFF', border: `1px solid ${late ? '#F6D9DE' : UI.border}`,
      borderRadius: 12, opacity: isPending ? 0.7 : 1,
    }}>
      <input type="checkbox" checked={done} aria-label={`${step.name} done`}
             onChange={e => {
               const next = e.target.checked
               setDone(next); onError('')
               start(async () => {
                 const r = await setStepDone(step.id, next)
                 if (!r.success) { setDone(!next); onError(r.error ?? 'Could not save that') }
               })
             }}
             style={{ width: 18, height: 18, accentColor: UI.purple, cursor: 'pointer', flexShrink: 0 }} />

      {isAdmin ? (
        <input defaultValue={step.name} aria-label={`Name of ${step.name}`}
               onBlur={e => { const v = e.target.value.trim(); if (v && v !== step.name) act(() => updateStep(step.id, { name: v })) }}
               style={{ ...input, flex: 1, border: '1px solid transparent', background: 'transparent',
                        textDecoration: done ? 'line-through' : 'none', color: done ? UI.soft : UI.textPrimary }} />
      ) : (
        <span style={{ flex: 1, fontWeight: 600, fontSize: 13.5, textDecoration: done ? 'line-through' : 'none', color: done ? UI.soft : UI.textPrimary }}>
          {step.name}
        </span>
      )}

      {isAdmin ? (
        <>
          <input type="number" min={0} step={0.5} defaultValue={step.durationDays}
                 aria-label={`Duration of ${step.name} in days`}
                 onBlur={e => { const v = parseFloat(e.target.value); if (!isNaN(v) && v !== step.durationDays) act(() => updateStep(step.id, { duration_days: v })) }}
                 style={{ ...input, width: 68, textAlign: 'center' }} />
          <input type="date" defaultValue={step.dueDate ?? ''} aria-label={`Due date of ${step.name}`}
                 onChange={e => act(() => updateStep(step.id, { due_date: e.target.value || null }))}
                 style={{ ...input, width: 148 }} />
          <select value={step.assigneeId ?? ''} aria-label={`Assignee of ${step.name}`}
                  onChange={e => act(() => updateStep(step.id, { assignee_id: e.target.value || null }))}
                  style={{ ...input, width: 150 }}>
            <option value="">— unassigned —</option>
            {members.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
        </>
      ) : (
        <>
          <span style={{ width: 34, textAlign: 'right', fontWeight: 700, fontSize: 12, color: durationTone(step.durationDays) }}>
            {step.durationDays}d
          </span>
          <span style={{ width: 62, textAlign: 'right', fontWeight: 500, fontSize: 12.5, color: late ? UI.redStrong : UI.soft }}>
            {fmt(step.dueDate)}
          </span>
          {step.assigneeName && <Avatar name={step.assigneeName} size={28} />}
        </>
      )}

      {step.taskId ? (
        <a href={`/board?task=${step.taskId}`} style={{ ...PILL, textDecoration: 'none', color: UI.textPrimary }}>
          <Icon name="arrow" size={14} stroke={UI.purple} width={2.4} /> board
        </a>
      ) : isAdmin ? (
        <button onClick={() => act(() => convertStepToTask(step.id))} style={PILL}>
          <Icon name="arrow" size={14} stroke={UI.purple} width={2.4} /> board
        </button>
      ) : null}

      {isAdmin && (
        <button onClick={() => act(() => removeStep(step.id))} aria-label={`Remove ${step.name}`}
                style={{ border: 'none', background: 'transparent', color: UI.redStrong, cursor: 'pointer', fontSize: 13, padding: 3 }}>
          ✕
        </button>
      )}
    </div>
  )
}

/* ── Timeline & Weeks ────────────────────────────────────────────────── */

function Timeline({ projects, today }: { projects: ProjectView[]; today: string }) {
  const rows = projects
    .map(p => ({ p, span: spanOf(p) }))
    .filter((r): r is { p: ProjectView; span: { start: string; end: string } } => r.span !== null)

  if (!rows.length) return <Empty>Nothing in this list has dates yet.</Empty>

  const all = rows.flatMap(r => [r.span.start, r.span.end]).concat(today).sort()
  const min = all[0], max = all[all.length - 1]
  const ms  = (d: string) => new Date(d + 'T00:00:00').getTime()
  const pct = (d: string) => ((ms(d) - ms(min)) / Math.max(1, ms(max) - ms(min))) * 100

  return (
    <div style={{ ...card, borderRadius: 18, padding: '18px 22px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 600, fontSize: 11, color: UI.faintest, marginBottom: 12 }}>
        <span>{fmt(min)}</span><span>{fmt(max)}</span>
      </div>
      <div style={{ position: 'relative', display: 'grid', gap: 8 }}>
        <div style={{ position: 'absolute', left: `${pct(today)}%`, top: 0, bottom: 0, width: 2, background: UI.limeDeep, zIndex: 1 }} />
        {rows.map(({ p, span }) => {
          const left = pct(span.start)
          const width = Math.max(1.5, pct(span.end) - left)
          return (
            <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <span style={{
                width: 200, fontWeight: 600, fontSize: 12.5, color: UI.textPrimary,
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>{p.name}</span>
              <div style={{ position: 'relative', flex: 1, height: 20, background: UI.track, borderRadius: 6 }}>
                <div title={`${fmt(span.start)} → ${fmt(span.end)}`}
                     style={{
                       position: 'absolute', left: `${left}%`, width: `${width}%`, top: 3, bottom: 3,
                       background: p.brandColor ?? UI.lime, borderRadius: 5, minWidth: 5,
                     }} />
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function Weeks({ projects, today }: { projects: ProjectView[]; today: string }) {
  const weeks = weeksOf(projects, today)
  if (!weeks.length) return <Empty>Nothing outstanding has a date.</Empty>

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {weeks.map(w => (
        <div key={w.start} style={{
          ...card, borderRadius: 18, padding: '16px 18px',
          border: w.current ? `1.5px solid ${UI.limeCta}` : `1px solid ${UI.border}`,
          background: w.current ? UI.limeBg : '#FFFFFF',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, gap: 8 }}>
            <span style={{ ...font.cardTitle, fontSize: 14 }}>
              {fmt(w.start)} – {fmt(w.end)}
              {w.current && <span style={{ color: UI.purple, fontWeight: 700 }}> · this week</span>}
            </span>
            <span style={{
              height: 21, padding: '0 9px', borderRadius: 999, background: UI.track,
              fontWeight: 600, fontSize: 11, color: UI.muted,
              display: 'flex', alignItems: 'center',
            }}>
              {w.items.length} step{w.items.length === 1 ? '' : 's'}
            </span>
          </div>
          <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 6 }}>
            {w.items.map(it => (
              <li key={it.id} style={{ display: 'flex', gap: 12, alignItems: 'center', fontSize: 13 }}>
                <span style={{ width: 62, fontWeight: 500, fontSize: 12.5, color: UI.soft }}>{fmt(it.dueDate)}</span>
                <span style={{ flex: 1, fontWeight: 600, color: isLate(it, today) ? UI.redStrong : UI.textPrimary }}>{it.name}</span>
                <span style={{ fontWeight: 500, fontSize: 11.5, color: UI.soft }}>{it.project.name}</span>
                {it.assigneeName && <Avatar name={it.assigneeName} size={24} />}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  )
}

/* ── shared bits ─────────────────────────────────────────────────────── */

function FocusStar({ project, isAdmin, onError }: {
  project: ProjectView; isAdmin: boolean; onError: (s: string) => void
}) {
  const [isPending, start] = useTransition()
  if (!isAdmin) return project.focus ? <span title="In Focus" style={{ color: UI.star, fontSize: 15 }}>★</span> : null
  return (
    <button
      onClick={() => start(async () => {
        const r = await toggleProjectFocus(project.id)
        if (!r.success) onError(r.error ?? 'Could not change that')
      })}
      title={project.focus ? 'Remove from Focus' : 'Add to Focus'}
      aria-pressed={project.focus}
      style={{
        border: 'none', background: 'transparent', cursor: 'pointer', padding: 0,
        fontSize: 15, lineHeight: 1, opacity: isPending ? 0.4 : 1, flexShrink: 0,
        color: project.focus ? UI.star : '#D8D8DF',
      }}
    >★</button>
  )
}

function NewProject({ onError }: { onError: (s: string) => void }) {
  const [name, setName] = useState('')
  const [isPending, start] = useTransition()
  return (
    <div style={{ display: 'flex', gap: 10 }}>
      <input value={name} onChange={e => setName(e.target.value)} placeholder="New project…"
             style={{ ...input, width: 280 }} />
      <button
        disabled={!name.trim() || isPending}
        onClick={() => start(async () => {
          const r = await createProject(name)
          if (r.success) setName(''); else onError(r.error ?? 'Could not create that')
        })}
        style={{ ...PRIMARY, opacity: name.trim() ? 1 : 0.45 }}
      >
        Add project
      </button>
    </div>
  )
}

function Avatar({ name, size }: { name: string; size: number }) {
  return (
    <span title={name} style={{
      width: size, height: size, borderRadius: '50%', flexShrink: 0,
      background: personColor(name), color: '#FFFFFF',
      fontWeight: 800, fontSize: size * 0.4,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>{initials(name)}</span>
  )
}

const Empty = ({ children }: { children: React.ReactNode }) => (
  <p style={{ fontSize: 14, color: UI.soft, padding: '26px 0' }}>{children}</p>
)

function TitleSparkle() {
  return (
    <svg width="30" height="30" viewBox="0 0 30 30" fill="none" aria-hidden="true" style={{ marginTop: 4 }}>
      {[[15,2,15,7],[15,23,15,28],[2,15,7,15],[23,15,28,15],[6,6,9.5,9.5],[20.5,20.5,24,24],[20.5,9.5,24,6],[6,24,9.5,20.5]]
        .map(([x1,y1,x2,y2], i) => (
          <path key={i} d={`M${x1} ${y1}L${x2} ${y2}`} stroke={UI.limeDot} strokeWidth="2.6" strokeLinecap="round" />
        ))}
    </svg>
  )
}

function TabIcon({ name, active }: { name: Tab; active: boolean }) {
  const stroke = active ? UI.ink : UI.muted
  const map: Record<Tab, React.ReactNode> = {
    overview: <><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" />
               <rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /></>,
    projects: <><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /></>,
    timeline: <><path d="M4 6h10M4 12h16M4 18h7" /></>,
    weeks:    <><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" /></>,
  }
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill={active && name === 'overview' ? UI.ink : 'none'}
         stroke={stroke} strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {map[name]}
    </svg>
  )
}

function Icon({ name, size, stroke, width, style }: {
  name: string; size: number; stroke: string; width: number; style?: React.CSSProperties
}) {
  const paths: Record<string, React.ReactNode> = {
    folder:   <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />,
    check:    <><circle cx="12" cy="12" r="9" /><path d="m8.5 12 2.5 2.5L16 9.5" /></>,
    clock:    <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3.5 2" /></>,
    calendar: <><rect x="3" y="4.5" width="18" height="17" rx="2.5" /><path d="M16 2.5v4M8 2.5v4M3 10h18" /></>,
    calendarDot: <><rect x="3" y="4.5" width="18" height="17" rx="2.5" /><path d="M16 2.5v4M8 2.5v4M3 10h18" /><circle cx="12" cy="15.5" r="1.6" fill={stroke} stroke="none" /></>,
    bars:     <><path d="M4 20V10M10 20V4M16 20v-7M22 20v-4" /></>,
    chevron:  <path d="M6 9l6 6 6-6" />,
    arrow:    <><path d="M5 12h13" /><path d="m12 5 7 7-7 7" /></>,
    rocket:   <><path d="M12 3c3.5 2.5 5 6 5 9l-5 4-5-4c0-3 1.5-6.5 5-9z" /><circle cx="12" cy="10" r="2" /><path d="M7 15l-2 4 4-1.5M17 15l2 4-4-1.5" /></>,
    pencil:   <><path d="M4 20h4L20 8a2.8 2.8 0 0 0-4-4L4 16z" /><path d="M14 6l4 4" /></>,
  }
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={stroke}
         strokeWidth={width} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={style}>
      {paths[name]}
    </svg>
  )
}

const PILL: React.CSSProperties = {
  height: 32, padding: '0 14px', border: `1px solid ${UI.borderInput}`, borderRadius: 999,
  display: 'inline-flex', alignItems: 'center', gap: 7, background: '#FFFFFF',
  fontWeight: 600, fontSize: 12.5, color: UI.textPrimary, cursor: 'pointer',
  fontFamily: 'inherit', whiteSpace: 'nowrap', flexShrink: 0,
}
const PRIMARY: React.CSSProperties = {
  height: 42, padding: '0 20px', borderRadius: 10, border: 'none',
  background: UI.purple, color: '#FFFFFF', fontWeight: 700, fontSize: 13.5,
  cursor: 'pointer', fontFamily: 'inherit',
}
