'use client'

import { useEffect, useMemo, useState, useTransition } from 'react'
import type { ProjectView } from '@/lib/projects'
import {
  statsOf, portfolioStats, horizon, weeksOf, spanOf, byBrand,
  isLate, isDueWithin, todayISO, UNASSIGNED,
} from '@/lib/projects'
import { COLORS } from '@/lib/tokens'
import {
  toggleProjectFocus, updateProject, updateStep, setStepDone,
  convertStepToTask, addStep, removeStep, createProject,
} from '@/actions/projects'

/**
 * Projects Overview — Aspiring and Focus.
 *
 * Aspiring is the whole portfolio; Focus is the subset being worked on now.
 * They are one list with a flag rather than two plans, so a project cannot
 * drift into two different versions of itself — the toggle at the top switches
 * which subset is shown, and the star on a card moves a project between them.
 */

interface Props {
  projects: ProjectView[]
  brands:   { id: string; name: string; color: string }[]
  members:  { id: string; name: string }[]
  isAdmin:  boolean
}

type Tab = 'overview' | 'projects' | 'timeline' | 'weeks'
type List = 'focus' | 'aspiring'

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
const fmt = (iso: string | null) => {
  if (!iso) return '—'
  const [y, m, d] = iso.split('-')
  return `${+d} ${MONTHS[+m - 1]}${+y !== new Date().getFullYear() ? ` ${y}` : ''}`
}

export function ProjectsView({ projects, brands, members, isAdmin }: Props) {
  const [list, setList] = useState<List>('focus')
  const [tab, setTab]   = useState<Tab>('overview')
  const [error, setError] = useState('')
  const today = todayISO()

  const shown = useMemo(
    () => (list === 'focus' ? projects.filter(p => p.focus) : projects),
    [projects, list],
  )
  const stats = useMemo(() => portfolioStats(shown, today), [shown, today])

  return (
    <div style={{ overflowY: 'auto', height: '100%', background: '#F6F6F4' }}>
      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '32px 40px 80px' }}>

        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', marginBottom: 22 }}>
          <div>
            <p style={EYEBROW}>Portfolio</p>
            <div style={{ height: 2, width: 32, background: '#C8F24E', borderRadius: 2, margin: '8px 0 12px' }} />
            <h1 style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: '1.5rem', color: 'var(--ink)', margin: 0 }}>
              {list === 'focus' ? 'Focus' : 'Aspiring'}
            </h1>
            <p style={{ fontSize: '0.85rem', color: 'var(--muted)', margin: '6px 0 0' }}>
              {list === 'focus'
                ? 'What the team is working on now.'
                : 'Everything planned — Focus is drawn from this list.'}
            </p>
          </div>

          {/* The switch between the two lists */}
          <div style={{ display: 'inline-flex', borderRadius: 10, padding: 4, background: '#EBEBEB', gap: 2 }}>
            {(['focus', 'aspiring'] as List[]).map(l => (
              <button
                key={l}
                onClick={() => setList(l)}
                aria-pressed={list === l}
                style={{
                  fontSize: '0.82rem', fontWeight: 700, padding: '8px 20px', borderRadius: 7,
                  border: 'none', cursor: 'pointer', fontFamily: 'inherit', textTransform: 'capitalize',
                  background: list === l ? '#fff' : 'transparent',
                  color: list === l ? 'var(--ink)' : 'var(--muted)',
                  boxShadow: list === l ? '0 1px 3px rgba(16,16,11,.12)' : 'none',
                }}
              >
                {l} · {l === 'focus' ? projects.filter(p => p.focus).length : projects.length}
              </button>
            ))}
          </div>
        </div>

        {error && (
          <p role="alert" style={{ fontSize: '0.8rem', color: COLORS.coral, margin: '0 0 14px' }}>{error}</p>
        )}

        {/* Portfolio at a glance */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(130px,1fr))', gap: 10, marginBottom: 14 }}>
          <Stat label="Projects"   value={String(stats.projects)} />
          <Stat label="Steps done" value={`${stats.done}/${stats.steps}`} note={`${stats.percent}%`} />
          <Stat label="Late"       value={String(stats.late)} bad={stats.late > 0} />
          <Stat label="Next 7 days" value={String(stats.dueThisWeek)} />
          <Stat label="Days planned" value={String(Math.round(stats.daysPlanned))}
                note={stats.runwayDays ? `${stats.runwayDays} working days left` : undefined}
                bad={stats.daysPlanned > stats.runwayDays && stats.runwayDays > 0} />
        </div>

        <Horizon projects={shown} today={today} />

        <div style={{ display: 'inline-flex', borderRadius: 10, padding: 4, background: '#EBEBEB', gap: 2, margin: '18px 0 20px' }}>
          {(['overview', 'projects', 'timeline', 'weeks'] as Tab[]).map(t => (
            <button key={t} onClick={() => setTab(t)} style={TAB(tab === t)}>
              {t === 'weeks' ? 'Weeks' : t[0].toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>

        {tab === 'overview' && (
          <Overview projects={shown} today={today} brands={brands} isAdmin={isAdmin} onError={setError} />
        )}
        {tab === 'projects' && (
          <ProjectList
            projects={shown} today={today} brands={brands} members={members}
            isAdmin={isAdmin} onError={setError}
          />
        )}
        {tab === 'timeline' && <Timeline projects={shown} today={today} />}
        {tab === 'weeks'    && <Weeks projects={shown} today={today} />}

        {isAdmin && tab === 'projects' && <NewProject onError={setError} />}
      </div>
    </div>
  )
}

/* ── pieces ──────────────────────────────────────────────────────────────── */

function Stat({ label, value, note, bad }: { label: string; value: string; note?: string; bad?: boolean }) {
  return (
    <div style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 12, padding: '12px 14px' }}>
      <div style={EYEBROW}>{label}</div>
      <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: '1.35rem', color: bad ? COLORS.coral : 'var(--ink)', marginTop: 4 }}>
        {value}
      </div>
      {note && <div style={{ fontSize: '0.68rem', color: 'var(--muted)', marginTop: 2 }}>{note}</div>}
    </div>
  )
}

/** 21 days, one column each. Bars show how much lands on a given day. */
function Horizon({ projects, today }: { projects: ProjectView[]; today: string }) {
  const cells = horizon(projects, today, 21)
  const max = Math.max(1, ...cells.map(c => c.steps.length))
  const late = projects.flatMap(p => p.steps).filter(s => isLate(s, today)).length

  return (
    <div style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 14, padding: '14px 16px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, flexWrap: 'wrap', gap: 8 }}>
        <span style={EYEBROW}>Horizon · next 21 days</span>
        {late > 0 && (
          <span style={{ fontSize: '0.7rem', fontWeight: 700, color: COLORS.coral }}>
            {late} step{late === 1 ? '' : 's'} already late
          </span>
        )}
      </div>
      <div style={{ display: 'flex', gap: 3, alignItems: 'flex-end', height: 62 }}>
        {cells.map(c => {
          const weekend = [0, 6].includes(new Date(c.date + 'T00:00:00').getDay())
          const h = c.steps.length ? 8 + (c.steps.length / max) * 44 : 3
          return (
            <div key={c.date} title={`${fmt(c.date)} — ${c.steps.length} step(s)`}
                 style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
              <div style={{
                width: '100%', height: h, borderRadius: 4,
                background: c.steps.length ? (c.date === today ? '#8FBF1F' : '#C8F24E') : '#EFEFEA',
                opacity: weekend && !c.steps.length ? 0.5 : 1,
              }} />
              <span style={{ fontSize: 8.5, color: c.date === today ? 'var(--ink)' : 'var(--muted)', fontWeight: c.date === today ? 700 : 400 }}>
                {c.date.slice(8)}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function Overview({ projects, today, brands, isAdmin, onError }: {
  projects: ProjectView[]; today: string
  brands: { id: string; name: string; color: string }[]
  isAdmin: boolean; onError: (s: string) => void
}) {
  const groups = byBrand(projects)
  if (!groups.length) return <Empty>No projects in this list yet.</Empty>

  return (
    <div style={{ display: 'grid', gap: 20 }}>
      {groups.map(([brandName, list]) => (
        <section key={brandName}>
          <BrandHeading name={brandName} count={list.length} brands={brands} />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(280px,1fr))', gap: 10 }}>
            {list.map(p => {
              const s = statsOf(p, today)
              return (
                <div key={p.id} style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 12, padding: '13px 15px' }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                    <span style={{ fontWeight: 700, fontSize: '0.87rem', color: 'var(--ink)', flex: 1, lineHeight: 1.35 }}>
                      {p.name}
                    </span>
                    <FocusStar project={p} isAdmin={isAdmin} onError={onError} />
                  </div>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 8, flexWrap: 'wrap' }}>
                    {p.standing && <Chip>standing</Chip>}
                    <span style={{ fontSize: '0.72rem', color: 'var(--muted)' }}>due {fmt(p.dueDate)}</span>
                    {s.late > 0 && <span style={{ fontSize: '0.72rem', fontWeight: 700, color: COLORS.coral }}>{s.late} late</span>}
                  </div>
                  <Progress percent={s.percent} />
                  <div style={{ fontSize: '0.7rem', color: 'var(--muted)', marginTop: 5 }}>
                    {s.done}/{s.total} steps · {Math.round(s.daysPlanned)}d planned
                    {s.nextDue && ` · next ${fmt(s.nextDue)}`}
                  </div>
                </div>
              )
            })}
          </div>
          {brandName === UNASSIGNED && (
            <p style={{ fontSize: '0.72rem', color: 'var(--muted)', marginTop: 8 }}>
              These have no brand. Open the Projects tab to set one.
            </p>
          )}
        </section>
      ))}
    </div>
  )
}

function ProjectList({ projects, today, brands, members, isAdmin, onError }: {
  projects: ProjectView[]; today: string
  brands: { id: string; name: string; color: string }[]
  members: { id: string; name: string }[]
  isAdmin: boolean; onError: (s: string) => void
}) {
  const groups = byBrand(projects)
  return (
    <div style={{ display: 'grid', gap: 20 }}>
      {groups.map(([brandName, list]) => (
        <section key={brandName}>
          <BrandHeading name={brandName} count={list.length} brands={brands} />
          <div style={{ display: 'grid', gap: 8 }}>
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
    <div style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 12, opacity: isPending ? 0.65 : 1 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 15px' }}>
        {/* Icon-only, so it needs a name of its own — a chevron tells a screen
            reader nothing, and it made this button indistinguishable from every
            other collapsible thing on the page. */}
        <button onClick={() => setOpen(!open)} aria-expanded={open}
                aria-label={`${open ? 'Collapse' : 'Expand'} ${p.name}`}
                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2, color: 'var(--muted)', lineHeight: 0 }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6"
               strokeLinecap="round" strokeLinejoin="round"
               style={{ transform: open ? 'rotate(90deg)' : 'none', transition: 'transform .15s' }}>
            <path d="M9 18l6-6-6-6" />
          </svg>
        </button>

        {isAdmin ? (
          <input defaultValue={p.name} aria-label={`Name of ${p.name}`}
                 onBlur={e => { const v = e.target.value.trim(); if (v && v !== p.name) act(() => updateProject(p.id, { name: v })) }}
                 style={{ ...INPUT, flex: 1, fontWeight: 700, fontSize: '0.87rem', background: 'transparent', border: '1px solid transparent' }} />
        ) : (
          <span style={{ flex: 1, fontWeight: 700, fontSize: '0.87rem' }}>{p.name}</span>
        )}

        {p.standing && <Chip>standing</Chip>}
        {s.late > 0 && <span style={{ fontSize: '0.72rem', fontWeight: 700, color: COLORS.coral }}>{s.late} late</span>}
        <span style={{ fontSize: '0.72rem', color: 'var(--muted)', whiteSpace: 'nowrap' }}>
          {s.done}/{s.total}
        </span>

        {isAdmin ? (
          <input type="date" defaultValue={p.dueDate ?? ''} aria-label={`Due date of ${p.name}`}
                 onChange={e => act(() => updateProject(p.id, { due_date: e.target.value || null }))}
                 style={{ ...INPUT, width: 138 }} />
        ) : (
          <span style={{ fontSize: '0.72rem', color: 'var(--muted)' }}>{fmt(p.dueDate)}</span>
        )}

        {isAdmin && (
          <select value={p.brandId ?? ''} aria-label={`Brand of ${p.name}`}
                  onChange={e => act(() => updateProject(p.id, { brand_id: e.target.value || null }))}
                  style={{ ...INPUT, width: 150 }}>
            <option value="">— no brand —</option>
            {brands.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        )}

        <FocusStar project={p} isAdmin={isAdmin} onError={onError} />
      </div>

      {open && (
        <div style={{ borderTop: '1px solid #F6F6F4', padding: '10px 15px 14px 40px', display: 'grid', gap: 5 }}>
          {p.steps.map(st => (
            <StepRow key={st.id} step={st} today={today} members={members} isAdmin={isAdmin} onError={onError} />
          ))}
          {!p.steps.length && <p style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>No steps yet.</p>}

          {isAdmin && (
            <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
              <input value={newStep} onChange={e => setNewStep(e.target.value)}
                     onKeyDown={e => { if (e.key === 'Enter' && newStep.trim()) { act(() => addStep(p.id, newStep)); setNewStep('') } }}
                     placeholder="Add a step…" style={{ ...INPUT, flex: 1 }} />
              <button onClick={() => { if (newStep.trim()) { act(() => addStep(p.id, newStep)); setNewStep('') } }}
                      style={BTN_DARK}>Add</button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function StepRow({ step, today, members, isAdmin, onError }: {
  step: import('@/lib/projects').StepView; today: string
  members: { id: string; name: string }[]
  isAdmin: boolean; onError: (s: string) => void
}) {
  const [isPending, start] = useTransition()
  // Optimistic, for the same reason as the team board: bound straight to the
  // server value the box appears not to respond until the round trip lands.
  const [done, setDone] = useState(step.done)
  useEffect(() => { setDone(step.done) }, [step.done])
  const late = isLate({ ...step, done }, today)
  const soon = isDueWithin({ ...step, done }, today, 7)

  function act(fn: () => Promise<{ success: boolean; error?: string }>) {
    onError('')
    start(async () => {
      const r = await fn()
      if (!r.success) onError(r.error ?? 'That change could not be saved')
    })
  }

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px', borderRadius: 8,
      background: late ? '#FDF3F2' : 'transparent', opacity: isPending ? 0.6 : 1,
    }}>
      <input type="checkbox" checked={done} aria-label={`${step.name} done`}
             onChange={e => {
               const next = e.target.checked
               setDone(next)
               onError('')
               start(async () => {
                 const r = await setStepDone(step.id, next)
                 if (!r.success) { setDone(!next); onError(r.error ?? 'Could not save that') }
               })
             }}
             style={{ width: 15, height: 15, cursor: 'pointer', accentColor: '#8FBF1F', flexShrink: 0 }} />

      {isAdmin ? (
        <input defaultValue={step.name} aria-label={`Name of ${step.name}`}
               onBlur={e => { const v = e.target.value.trim(); if (v && v !== step.name) act(() => updateStep(step.id, { name: v })) }}
               style={{ ...INPUT, flex: 1, background: 'transparent', border: '1px solid transparent',
                        textDecoration: done ? 'line-through' : 'none',
                        color: done ? 'var(--muted)' : 'var(--ink)' }} />
      ) : (
        <span style={{ flex: 1, fontSize: '0.8rem', textDecoration: done ? 'line-through' : 'none', color: done ? 'var(--muted)' : 'var(--ink)' }}>
          {step.name}
        </span>
      )}

      {isAdmin ? (
        <>
          <input type="number" min={0} step={0.5} defaultValue={step.durationDays}
                 aria-label={`Duration of ${step.name} in days`}
                 onBlur={e => { const v = parseFloat(e.target.value); if (!isNaN(v) && v !== step.durationDays) act(() => updateStep(step.id, { duration_days: v })) }}
                 style={{ ...INPUT, width: 58, textAlign: 'center' }} />
          <input type="date" defaultValue={step.dueDate ?? ''} aria-label={`Due date of ${step.name}`}
                 onChange={e => act(() => updateStep(step.id, { due_date: e.target.value || null }))}
                 style={{ ...INPUT, width: 134, color: late ? COLORS.coral : 'var(--ink)' }} />
          <select value={step.assigneeId ?? ''} aria-label={`Assignee of ${step.name}`}
                  onChange={e => act(() => updateStep(step.id, { assignee_id: e.target.value || null }))}
                  style={{ ...INPUT, width: 130 }}>
            <option value="">— unassigned —</option>
            {members.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
        </>
      ) : (
        <>
          <span style={{ fontSize: '0.72rem', color: 'var(--muted)' }}>{step.durationDays}d</span>
          <span style={{ fontSize: '0.72rem', fontWeight: late ? 700 : 400, color: late ? COLORS.coral : soon ? 'var(--ink)' : 'var(--muted)' }}>
            {fmt(step.dueDate)}
          </span>
          <span style={{ fontSize: '0.72rem', color: 'var(--muted)', width: 90, textAlign: 'right' }}>
            {step.assigneeName ?? '—'}
          </span>
        </>
      )}

      {/* Plan → board */}
      {step.taskId ? (
        <a href={`/board?task=${step.taskId}`} title="Open on the board"
           style={{ fontSize: '0.66rem', fontWeight: 700, color: '#6E5BE6', textDecoration: 'none', whiteSpace: 'nowrap' }}>
          on board ↗
        </a>
      ) : isAdmin ? (
        <button onClick={() => act(() => convertStepToTask(step.id))}
                title="Create a task on the pipeline board from this step"
                style={{ ...BTN_GHOST, whiteSpace: 'nowrap' }}>
          → board
        </button>
      ) : null}

      {isAdmin && (
        <button onClick={() => act(() => removeStep(step.id))} title={`Remove ${step.name}`}
                style={{ border: 'none', background: 'transparent', color: COLORS.coral, cursor: 'pointer', fontSize: '0.78rem', padding: 3 }}>
          ✕
        </button>
      )}
    </div>
  )
}

function Timeline({ projects, today }: { projects: ProjectView[]; today: string }) {
  const rows = projects
    .map(p => ({ p, span: spanOf(p) }))
    .filter((r): r is { p: ProjectView; span: { start: string; end: string } } => r.span !== null)

  if (!rows.length) return <Empty>Nothing in this list has dates yet.</Empty>

  const all = rows.flatMap(r => [r.span.start, r.span.end]).concat(today).sort()
  const min = all[0], max = all[all.length - 1]
  const ms = (d: string) => new Date(d + 'T00:00:00').getTime()
  const pct = (d: string) => ((ms(d) - ms(min)) / Math.max(1, ms(max) - ms(min))) * 100

  return (
    <div style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 14, padding: '16px 18px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.68rem', color: 'var(--muted)', marginBottom: 10 }}>
        <span>{fmt(min)}</span><span>{fmt(max)}</span>
      </div>
      <div style={{ position: 'relative', display: 'grid', gap: 6 }}>
        {/* today */}
        <div style={{ position: 'absolute', left: `${pct(today)}%`, top: 0, bottom: 0, width: 2, background: '#8FBF1F', zIndex: 1 }} />
        {rows.map(({ p, span }) => {
          const left = pct(span.start)
          const width = Math.max(1.5, pct(span.end) - left)
          return (
            <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ width: 190, fontSize: '0.74rem', color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {p.name}
              </span>
              <div style={{ position: 'relative', flex: 1, height: 18, background: '#F6F6F4', borderRadius: 5 }}>
                <div title={`${fmt(span.start)} → ${fmt(span.end)}`}
                     style={{
                       position: 'absolute', left: `${left}%`, width: `${width}%`, top: 3, bottom: 3,
                       background: p.brandColor ?? '#C8F24E', borderRadius: 4, minWidth: 4,
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
    <div style={{ display: 'grid', gap: 10 }}>
      {weeks.map(w => (
        <div key={w.start} style={{
          background: '#fff', borderRadius: 12, padding: '12px 15px',
          border: w.current ? '1.5px solid #8FBF1F' : '1px solid var(--line)',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, gap: 8 }}>
            <span style={{ fontWeight: 700, fontSize: '0.8rem' }}>
              {fmt(w.start)} – {fmt(w.end)} {w.current && <span style={{ color: '#6D8F16' }}>· this week</span>}
            </span>
            <span style={{ fontSize: '0.7rem', color: 'var(--muted)' }}>{w.items.length} step{w.items.length === 1 ? '' : 's'}</span>
          </div>
          <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 3 }}>
            {w.items.map(it => (
              <li key={it.id} style={{ display: 'flex', gap: 8, fontSize: '0.76rem', alignItems: 'baseline' }}>
                <span style={{ color: 'var(--muted)', width: 54, flexShrink: 0 }}>{fmt(it.dueDate)}</span>
                <span style={{ flex: 1, color: isLate(it, today) ? COLORS.coral : 'var(--ink)' }}>{it.name}</span>
                <span style={{ color: 'var(--muted)', fontSize: '0.7rem' }}>{it.project.name}</span>
                {it.assigneeName && <span style={{ color: 'var(--muted)', fontSize: '0.7rem' }}>· {it.assigneeName}</span>}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  )
}

function FocusStar({ project, isAdmin, onError }: { project: ProjectView; isAdmin: boolean; onError: (s: string) => void }) {
  const [isPending, start] = useTransition()
  if (!isAdmin) return project.focus ? <span title="In Focus" style={{ color: '#C8A21F' }}>★</span> : null
  return (
    <button
      onClick={() => start(async () => {
        const r = await toggleProjectFocus(project.id)
        if (!r.success) onError(r.error ?? 'Could not change that')
      })}
      title={project.focus ? 'Remove from Focus' : 'Add to Focus'}
      aria-pressed={project.focus}
      style={{
        border: 'none', background: 'transparent', cursor: 'pointer', padding: 2,
        fontSize: '1rem', lineHeight: 1, opacity: isPending ? 0.4 : 1,
        color: project.focus ? '#C8A21F' : '#D3D3CC',
      }}
    >
      ★
    </button>
  )
}

function BrandHeading({ name, count, brands }: { name: string; count: number; brands: { name: string; color: string }[] }) {
  const color = brands.find(b => b.name === name)?.color ?? '#B9B9B0'
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 9 }}>
      <span style={{ width: 9, height: 9, borderRadius: '50%', background: color }} />
      <span style={{ fontWeight: 700, fontSize: '0.82rem', color: name === UNASSIGNED ? 'var(--muted)' : 'var(--ink)' }}>
        {name}
      </span>
      <span style={{ fontSize: '0.7rem', color: 'var(--muted)' }}>{count}</span>
    </div>
  )
}

function NewProject({ onError }: { onError: (s: string) => void }) {
  const [name, setName] = useState('')
  const [isPending, start] = useTransition()
  return (
    <div style={{ display: 'flex', gap: 6, marginTop: 16 }}>
      <input value={name} onChange={e => setName(e.target.value)} placeholder="New project…"
             style={{ ...INPUT, width: 260 }} />
      <button
        disabled={!name.trim() || isPending}
        onClick={() => start(async () => {
          const r = await createProject(name)
          if (r.success) setName(''); else onError(r.error ?? 'Could not create that')
        })}
        style={{ ...BTN_DARK, opacity: name.trim() ? 1 : 0.4 }}
      >
        Add project
      </button>
    </div>
  )
}

function Progress({ percent }: { percent: number }) {
  return (
    <div style={{ height: 5, background: '#F0F0EB', borderRadius: 3, marginTop: 9, overflow: 'hidden' }}>
      <div style={{ width: `${percent}%`, height: '100%', background: '#C8F24E', borderRadius: 3 }} />
    </div>
  )
}

const Chip = ({ children }: { children: React.ReactNode }) => (
  <span style={{
    fontSize: '0.62rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em',
    background: '#F0F0EB', color: 'var(--muted)', padding: '2px 7px', borderRadius: 5,
  }}>{children}</span>
)

const Empty = ({ children }: { children: React.ReactNode }) => (
  <p style={{ fontSize: '0.82rem', color: 'var(--muted)', padding: '18px 0' }}>{children}</p>
)

const EYEBROW: React.CSSProperties = {
  fontWeight: 700, fontSize: '0.62rem', letterSpacing: '.14em',
  textTransform: 'uppercase', color: 'var(--muted)', margin: 0,
}
const INPUT: React.CSSProperties = {
  fontSize: '0.78rem', padding: '5px 8px', borderRadius: 7,
  border: '1px solid var(--line)', background: '#FCFCFB',
  color: 'var(--ink)', outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box',
}
const BTN_DARK: React.CSSProperties = {
  fontSize: '0.75rem', fontWeight: 700, padding: '6px 14px', borderRadius: 8,
  border: 'none', background: 'var(--ink)', color: '#fff', cursor: 'pointer', fontFamily: 'inherit',
}
const BTN_GHOST: React.CSSProperties = {
  fontSize: '0.66rem', fontWeight: 700, padding: '4px 8px', borderRadius: 6,
  border: '1px solid var(--line)', background: '#fff', color: 'var(--ink)', cursor: 'pointer', fontFamily: 'inherit',
}
const TAB = (active: boolean): React.CSSProperties => ({
  fontSize: '0.82rem', fontWeight: 700, padding: '8px 18px', borderRadius: 7,
  border: 'none', cursor: 'pointer', fontFamily: 'inherit',
  background: active ? '#fff' : 'transparent',
  color: active ? 'var(--ink)' : 'var(--muted)',
  boxShadow: active ? '0 1px 3px rgba(16,16,11,.12)' : 'none',
})
