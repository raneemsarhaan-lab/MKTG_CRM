'use client'

import { useEffect, useMemo, useState, useTransition } from 'react'
import { initials } from '@/lib/utils'
import { setStepDone, convertStepToTask, updateStep, addStep } from '@/actions/projects'
import { isLate, todayISO } from '@/lib/projects'
import { UI, font, card, input, durationTone, personColor, segments } from '@/lib/board-ui'

/**
 * Team tasks — the plan's steps, grouped by the person doing them.
 *
 * The same records the Projects board shows by project. A member sees only
 * their own; an admin gets a tab per person. The filtering that matters happens
 * on the server — this component is only ever handed what the viewer is allowed
 * to see, and every action re-checks before writing.
 *
 * Editing is inline rather than behind a modal. These rows are worked through
 * in sequence — a dozen dates nudged, a duration corrected — and a dialog per
 * change turns five seconds of work into a minute of clicking.
 */

export interface TeamStep {
  id: string
  name: string
  durationDays: number
  dueDate: string | null
  done: boolean
  assigneeId: string | null
  assigneeName: string | null
  taskId: string | null
  projectId: string
  projectName: string
  brandName: string | null
  brandColor: string | null
}

interface Props {
  steps:    TeamStep[]
  people:   { id: string; name: string; role: string }[]
  allMembers: { id: string; name: string }[]
  projects: { id: string; name: string; brandName: string | null }[]
  brands:   { id: string; name: string; color: string }[]
  isAdmin:  boolean
  viewerId: string
  canPush:  boolean
}

type State = 'open' | 'all' | 'over' | 'done'

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
const fmt = (iso: string | null) => {
  if (!iso) return '—'
  const [, m, d] = iso.split('-')
  return `${+d} ${MONTHS[+m - 1]}`
}
const monthKey = (iso: string | null) => (iso ? iso.slice(0, 7) : 'zzzz')
const monthLabel = (k: string) =>
  k === 'zzzz' ? 'NO DATE' : `${MONTHS[+k.slice(5, 7) - 1].toUpperCase()} ${k.slice(0, 4)}`

export function TeamBoard({
  steps, people, allMembers, projects, brands, isAdmin, viewerId, canPush,
}: Props) {
  const [who, setWho]       = useState(isAdmin ? (people[0]?.id ?? viewerId) : viewerId)
  const [brand, setBrand]   = useState('')
  const [state, setState]   = useState<State>('open')
  const [search, setSearch] = useState('')
  const [error, setError]   = useState('')
  const [adding, setAdding] = useState(false)
  const [shut, setShut]     = useState<Record<string, boolean>>({})
  const today = todayISO()

  const mine = useMemo(() => steps.filter(s => s.assigneeId === who), [steps, who])

  const shown = useMemo(() => mine.filter(s => {
    if (brand && s.brandName !== brand) return false
    if (state === 'open' && s.done) return false
    if (state === 'done' && !s.done) return false
    if (state === 'over' && !isLate(s, today)) return false
    if (search && !`${s.name} ${s.projectName}`.toLowerCase().includes(search.toLowerCase())) return false
    return true
  }), [mine, brand, state, search, today])

  // month → brand → project, which is how the plan is actually discussed
  const grouped = useMemo(() => {
    const months = new Map<string, Map<string, Map<string, TeamStep[]>>>()
    for (const s of [...shown].sort((a, b) => (a.dueDate ?? '9999').localeCompare(b.dueDate ?? '9999'))) {
      const mk = monthKey(s.dueDate)
      const bk = s.brandName ?? 'No brand'
      if (!months.has(mk)) months.set(mk, new Map())
      if (!months.get(mk)!.has(bk)) months.get(mk)!.set(bk, new Map())
      const pm = months.get(mk)!.get(bk)!
      if (!pm.has(s.projectName)) pm.set(s.projectName, [])
      pm.get(s.projectName)!.push(s)
    }
    return months
  }, [shown])

  const stats = {
    total: mine.length,
    done:  mine.filter(s => s.done).length,
    late:  mine.filter(s => isLate(s, today)).length,
    days:  mine.filter(s => !s.done).reduce((n, s) => n + s.durationDays, 0),
  }
  const percent = stats.total ? Math.round((stats.done / stats.total) * 100) : 0
  const person  = people.find(p => p.id === who)
  const canEdit = isAdmin || who === viewerId

  return (
    <div style={{ overflowY: 'auto', height: '100%', background: UI.bg }}>
      <div style={{ maxWidth: 1180, margin: '0 auto', padding: '34px 40px 90px' }}>

        {/* Masthead */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 24, flexWrap: 'wrap' }}>
          <div>
            <p style={{ ...font.eyebrow, margin: 0 }}>Team</p>
            <h1 style={{ ...font.h1, margin: '6px 0 0', position: 'relative', display: 'inline-block' }}>
              {isAdmin ? 'Team tasks' : 'My tasks'}
              <Sparkle />
            </h1>
            <p style={{ fontSize: 14, color: UI.muted, margin: '8px 0 0' }}>
              {isAdmin ? 'Every planned step, by the person doing it.' : 'The planned steps assigned to you.'}
            </p>
          </div>
          <ProgressCard percent={percent} done={stats.done} total={stats.total} />
        </div>

        {/* People */}
        {isAdmin && people.length > 0 && (
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', margin: '22px 0 0' }}>
            {people.map(p => {
              const open = steps.filter(s => s.assigneeId === p.id && !s.done).length
              const active = p.id === who
              return (
                <button key={p.id} onClick={() => setWho(p.id)} aria-pressed={active}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 10, padding: '8px 16px 8px 8px',
                          borderRadius: 999, cursor: 'pointer', fontFamily: 'inherit',
                          border: `1.5px solid ${active ? UI.violet : UI.line}`,
                          background: active ? UI.violetSoft : UI.card,
                          boxShadow: active ? 'none' : UI.shadowSm,
                        }}>
                  <Avatar name={p.name} size={28} />
                  <span style={{ fontSize: 13.5, fontWeight: active ? 700 : 500, color: UI.ink }}>{p.name}</span>
                  <span style={{ fontSize: 12, color: UI.faint }}>{open}</span>
                </button>
              )
            })}
          </div>
        )}

        {/* Stats */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(210px,1fr))', gap: 14, margin: '18px 0 0' }}>
          <StatCard icon="person" tone={UI.violet} soft={UI.violetSoft} label="Assigned"
                    value={String(stats.total)} unit="tasks" fill={1} />
          <StatCard icon="check" tone={UI.green} soft={UI.greenSoft} label="Done"
                    value={`${stats.done}/${stats.total}`} unit="tasks" fill={stats.total ? stats.done / stats.total : 0} />
          <StatCard icon="clock" tone={UI.amber} soft={UI.amberSoft} label="Late"
                    value={String(stats.late)} unit="tasks" fill={stats.total ? stats.late / stats.total : 0} bad={stats.late > 0} />
          <StatCard icon="cal" tone={UI.blue} soft={UI.blueSoft} label="Days left"
                    value={String(Math.round(stats.days))} unit="days" fill={0.45} />
        </div>

        {/* Filters */}
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', margin: '20px 0 0', alignItems: 'center' }}>
          <Field icon="grid">
            <select value={brand} onChange={e => setBrand(e.target.value)} aria-label="Filter by brand" style={BARE}>
              <option value="">All brands</option>
              {brands.map(b => <option key={b.id} value={b.name}>{b.name}</option>)}
            </select>
          </Field>
          <Field icon="folder">
            <select value={state} onChange={e => setState(e.target.value as State)} aria-label="Filter by state" style={BARE}>
              <option value="open">Open</option>
              <option value="all">All</option>
              <option value="over">Overdue only</option>
              <option value="done">Completed</option>
            </select>
          </Field>
          <Field icon="search" grow>
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search tasks…"
                   aria-label="Search tasks" style={{ ...BARE, width: '100%' }} />
          </Field>
          {canEdit && (
            <button onClick={() => setAdding(v => !v)} style={{
              display: 'flex', alignItems: 'center', gap: 7, padding: '10px 18px', borderRadius: 12,
              border: 'none', background: UI.violet, color: '#fff', fontWeight: 700, fontSize: 13,
              cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap',
            }}>
              <span style={{ fontSize: 15, lineHeight: 1 }}>+</span> New task
            </button>
          )}
        </div>

        {adding && canEdit && (
          <NewTaskForm
            projects={projects}
            members={isAdmin ? allMembers : [{ id: viewerId, name: person?.name ?? 'me' }]}
            defaultAssignee={who}
            onDone={() => setAdding(false)}
            onError={setError}
          />
        )}

        {error && (
          <p role="alert" style={{ fontSize: 13, color: UI.rose, margin: '14px 0 0' }}>{error}</p>
        )}

        {!shown.length && (
          <p style={{ fontSize: 14, color: UI.muted, padding: '34px 0' }}>
            {mine.length ? 'Nothing matches those filters.'
              : person ? `Nothing is assigned to ${person.name} yet.`
              : 'Nothing is assigned to you yet.'}
          </p>
        )}

        {/* Groups */}
        <div style={{ display: 'grid', gap: 24, marginTop: 26 }}>
          {[...grouped.entries()].map(([mk, byBrandMap]) => (
            <section key={mk}>
              <div style={{ ...font.eyebrow, marginBottom: 10 }}>{monthLabel(mk)}</div>
              <div style={{ display: 'grid', gap: 12 }}>
                {[...byBrandMap.entries()].map(([bk, byProject]) => {
                  const all = [...byProject.values()].flat()
                  const key = mk + '|' + bk
                  const collapsed = shut[key]
                  const doneN = all.filter(s => s.done).length
                  const colour = brands.find(b => b.name === bk)?.color ?? UI.faint
                  return (
                    <div key={bk} style={{ ...card, overflow: 'hidden' }}>
                      <button
                        onClick={() => setShut(s => ({ ...s, [key]: !collapsed }))}
                        aria-expanded={!collapsed}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 12, width: '100%',
                          padding: '15px 18px', background: 'none', border: 'none',
                          cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left',
                        }}
                      >
                        <span style={{
                          width: 30, height: 30, borderRadius: '50%', background: colour, color: '#fff',
                          fontSize: 12, fontWeight: 800, flexShrink: 0,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}>{bk[0]?.toUpperCase()}</span>
                        <span style={{ fontWeight: 700, fontSize: 15, color: UI.ink }}>{bk}</span>
                        <Pill>{all.length} task{all.length === 1 ? '' : 's'}</Pill>
                        <span style={{ flex: 1 }} />
                        <span style={{ fontSize: 12.5, fontWeight: 600, color: doneN ? UI.green : UI.faint }}>
                          {doneN}/{all.length} done
                        </span>
                        <span style={{ display: 'flex', gap: 3 }}>
                          {segments(doneN, all.length).map((on, i) => (
                            <span key={i} style={{ width: 15, height: 5, borderRadius: 3, background: on ? UI.green : UI.lineSoft }} />
                          ))}
                        </span>
                        <Chevron open={!collapsed} />
                      </button>

                      {!collapsed && (
                        <div style={{ padding: '0 18px 14px' }}>
                          {[...byProject.entries()].map(([proj, list]) => (
                            <div key={proj} style={{ borderLeft: `2px solid ${UI.lineSoft}`, paddingLeft: 14, marginBottom: 12 }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '4px 0 7px' }}>
                                <span style={{ width: 5, height: 5, borderRadius: '50%', background: UI.violet, marginLeft: -17 }} />
                                <span style={{ fontSize: 13.5, fontWeight: 600, color: UI.ink }}>{proj}</span>
                                <Pill>{list.length} task{list.length === 1 ? '' : 's'}</Pill>
                              </div>
                              <div style={{ display: 'grid', gap: 4 }}>
                                {list.map(s => (
                                  <Row key={s.id} step={s} today={today} canPush={canPush}
                                       canEdit={isAdmin || s.assigneeId === viewerId}
                                       members={allMembers} isAdmin={isAdmin} onError={setError} />
                                ))}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </section>
          ))}
        </div>
      </div>
    </div>
  )
}

/* ── a task row ──────────────────────────────────────────────────────────── */

function Row({ step, today, canPush, canEdit, members, isAdmin, onError }: {
  step: TeamStep; today: string; canPush: boolean; canEdit: boolean
  members: { id: string; name: string }[]; isAdmin: boolean
  onError: (s: string) => void
}) {
  const [isPending, start] = useTransition()
  const [open, setOpen] = useState(false)
  // Ticked immediately, then reconciled. Bound straight to the server value the
  // box snaps back until the round trip lands, which reads as the click not
  // having registered.
  const [done, setDone] = useState(step.done)
  useEffect(() => { setDone(step.done) }, [step.done])

  const late = isLate({ ...step, done }, today)
  const tone = durationTone(step.durationDays)

  function act(fn: () => Promise<{ success: boolean; error?: string }>) {
    onError('')
    start(async () => {
      const r = await fn()
      if (!r.success) {
        onError(r.error === 'not_authorized' ? 'That task is assigned to someone else.'
              : r.error ?? 'Could not save that')
      }
    })
  }

  return (
    <div style={{
      border: `1px solid ${late ? UI.roseSoft : UI.lineSoft}`, borderRadius: UI.radiusSm,
      background: late ? UI.roseSoft : UI.card, opacity: isPending ? 0.72 : 1,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '9px 12px' }}>
        <input
          type="checkbox" checked={done} aria-label={`${step.name} done`}
          onChange={e => {
            const next = e.target.checked
            setDone(next)
            onError('')
            start(async () => {
              const r = await setStepDone(step.id, next)
              if (!r.success) {
                setDone(!next)
                onError(r.error === 'not_authorized' ? 'That task is assigned to someone else.' : r.error ?? 'Could not save that')
              }
            })
          }}
          style={{ width: 17, height: 17, cursor: 'pointer', accentColor: UI.violet, flexShrink: 0 }}
        />

        <span style={{
          flex: 1, fontSize: 14, color: done ? UI.faint : UI.ink,
          textDecoration: done ? 'line-through' : 'none',
        }}>
          {step.name}
        </span>

        {step.assigneeName && <Avatar name={step.assigneeName} size={26} />}

        <span title="Planned duration" style={{
          fontSize: 12, fontWeight: 700, padding: '3px 9px', borderRadius: 7,
          background: tone.bg, color: tone.fg, whiteSpace: 'nowrap',
        }}>
          {step.durationDays}d
        </span>

        <span style={{ fontSize: 12.5, fontWeight: late ? 700 : 500, color: late ? UI.rose : UI.muted, width: 52, textAlign: 'right' }}>
          {fmt(step.dueDate)}
        </span>

        {step.taskId ? (
          <a href={`/board?task=${step.taskId}`} style={{
            fontSize: 11.5, fontWeight: 700, color: UI.violet, textDecoration: 'none',
            border: `1px solid ${UI.line}`, borderRadius: 8, padding: '5px 10px', whiteSpace: 'nowrap',
          }}>on board ↗</a>
        ) : canPush ? (
          <button onClick={() => act(() => convertStepToTask(step.id))}
                  title="Create a task on the pipeline board from this step"
                  style={GHOST}>→ board</button>
        ) : null}

        {canEdit && (
          <button onClick={() => setOpen(v => !v)} aria-expanded={open}
                  aria-label={`${open ? 'Close' : 'Edit'} ${step.name}`}
                  style={{ ...GHOST, padding: '5px 8px' }}>
            {open ? '✕' : 'Edit'}
          </button>
        )}
      </div>

      {open && canEdit && (
        <div style={{
          borderTop: `1px solid ${UI.lineSoft}`, padding: '12px', display: 'flex',
          gap: 10, flexWrap: 'wrap', alignItems: 'flex-end',
        }}>
          <Labelled label="Task name" grow>
            <input defaultValue={step.name}
                   onBlur={e => { const v = e.target.value.trim(); if (v && v !== step.name) act(() => updateStep(step.id, { name: v })) }}
                   style={{ ...input, width: '100%' }} />
          </Labelled>
          <Labelled label="Duration (days)">
            <input type="number" min={0} step={0.5} defaultValue={step.durationDays}
                   onBlur={e => { const v = parseFloat(e.target.value); if (!isNaN(v) && v !== step.durationDays) act(() => updateStep(step.id, { duration_days: v })) }}
                   style={{ ...input, width: 96 }} />
          </Labelled>
          <Labelled label="Due date">
            <input type="date" defaultValue={step.dueDate ?? ''}
                   onChange={e => act(() => updateStep(step.id, { due_date: e.target.value || null }))}
                   style={{ ...input, width: 156 }} />
          </Labelled>
          <Labelled label={isAdmin ? 'Assigned to' : 'Hand over to'}>
            <select defaultValue={step.assigneeId ?? ''}
                    onChange={e => act(() => updateStep(step.id, { assignee_id: e.target.value || null }))}
                    style={{ ...input, width: 168 }}>
              <option value="">— unassigned —</option>
              {members.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
          </Labelled>
          <span style={{ fontSize: 11.5, color: UI.faint, paddingBottom: 9 }}>
            Saved as you go · {step.projectName}
          </span>
        </div>
      )}
    </div>
  )
}

/* ── new task ────────────────────────────────────────────────────────────── */

function NewTaskForm({ projects, members, defaultAssignee, onDone, onError }: {
  projects: { id: string; name: string; brandName: string | null }[]
  members: { id: string; name: string }[]
  defaultAssignee: string
  onDone: () => void
  onError: (s: string) => void
}) {
  const [name, setName]   = useState('')
  const [proj, setProj]   = useState(projects[0]?.id ?? '')
  const [who, setWho]     = useState(defaultAssignee)
  const [due, setDue]     = useState('')
  const [days, setDays]   = useState('1')
  const [isPending, start] = useTransition()

  function submit() {
    if (!name.trim() || !proj) return
    onError('')
    start(async () => {
      const r = await addStep(proj, name, {
        assignee_id: who || null,
        due_date: due || null,
        duration_days: parseFloat(days) || 1,
      })
      if (r.success) { setName(''); setDue(''); onDone() }
      else onError(r.error ?? 'Could not add that task')
    })
  }

  return (
    <div style={{ ...card, padding: 16, marginTop: 14, display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
      <Labelled label="Task" grow>
        <input value={name} onChange={e => setName(e.target.value)} autoFocus
               onKeyDown={e => { if (e.key === 'Enter') submit() }}
               placeholder="What needs doing?" style={{ ...input, width: '100%' }} />
      </Labelled>
      <Labelled label="Project">
        <select value={proj} onChange={e => setProj(e.target.value)} style={{ ...input, width: 210 }}>
          {projects.map(p => (
            <option key={p.id} value={p.id}>{p.brandName ? `${p.brandName} — ` : ''}{p.name}</option>
          ))}
        </select>
      </Labelled>
      <Labelled label="Assigned to">
        <select value={who} onChange={e => setWho(e.target.value)} style={{ ...input, width: 160 }}>
          {members.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
        </select>
      </Labelled>
      <Labelled label="Due">
        <input type="date" value={due} onChange={e => setDue(e.target.value)} style={{ ...input, width: 152 }} />
      </Labelled>
      <Labelled label="Days">
        <input type="number" min={0} step={0.5} value={days} onChange={e => setDays(e.target.value)} style={{ ...input, width: 78 }} />
      </Labelled>
      <button onClick={submit} disabled={!name.trim() || isPending}
              style={{
                padding: '10px 20px', borderRadius: 11, border: 'none', background: UI.violet,
                color: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit',
                opacity: name.trim() && !isPending ? 1 : 0.45,
              }}>
        Add task
      </button>
      <button onClick={onDone} style={{ ...GHOST, padding: '9px 14px' }}>Cancel</button>
    </div>
  )
}

/* ── small pieces ────────────────────────────────────────────────────────── */

function ProgressCard({ percent, done, total }: { percent: number; done: number; total: number }) {
  const pts = [8, 22, 18, 34, 30, 46, 58]
  const d = pts.map((y, i) => `${i === 0 ? 'M' : 'L'}${8 + i * 16},${60 - y}`).join(' ')
  return (
    <div style={{ ...card, padding: '16px 20px', minWidth: 260 }}>
      <div style={{ fontSize: 13, color: UI.muted, marginBottom: 4 }}>Today&apos;s progress</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        <div style={{ ...font.stat, color: UI.violet, fontSize: 32 }}>{percent}%</div>
        <svg width="120" height="46" viewBox="0 0 120 60" fill="none" aria-hidden="true">
          <path d={d} stroke={UI.violet} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
          <circle cx={8 + 6 * 16} cy={60 - pts[6]} r="4" fill={UI.violet} />
        </svg>
      </div>
      <div style={{ fontSize: 12, color: UI.muted, marginTop: 6 }}>
        {done} of {total} planned steps complete
      </div>
    </div>
  )
}

function StatCard({ icon, tone, soft, label, value, unit, fill, bad }: {
  icon: 'person' | 'check' | 'clock' | 'cal'
  tone: string; soft: string; label: string; value: string; unit: string; fill: number; bad?: boolean
}) {
  return (
    <div style={{ ...card, padding: '16px 18px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <span style={{
          width: 38, height: 38, borderRadius: 12, background: soft, color: tone,
          display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
        }}>
          <Icon name={icon} />
        </span>
        <div>
          <div style={{ ...font.eyebrow, color: UI.faint }}>{label}</div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginTop: 2 }}>
            <span style={{ ...font.stat, color: bad ? UI.rose : UI.ink }}>{value}</span>
            <span style={{ fontSize: 12.5, color: UI.faint }}>{unit}</span>
          </div>
        </div>
      </div>
      <div style={{ height: 6, background: UI.lineSoft, borderRadius: 4, marginTop: 13, overflow: 'hidden' }}>
        <div style={{ width: `${Math.min(100, Math.max(3, fill * 100))}%`, height: '100%', background: tone, borderRadius: 4 }} />
      </div>
    </div>
  )
}

function Avatar({ name, size }: { name: string; size: number }) {
  return (
    <span title={name} style={{
      width: size, height: size, borderRadius: '50%', flexShrink: 0,
      background: personColor(name), color: '#fff',
      fontSize: size * 0.36, fontWeight: 800,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>{initials(name)}</span>
  )
}

function Labelled({ label, children, grow }: { label: string; children: React.ReactNode; grow?: boolean }) {
  return (
    <label style={{ display: 'grid', gap: 5, flex: grow ? '1 1 220px' : '0 0 auto' }}>
      <span style={{ ...font.eyebrow, fontSize: 9.5 }}>{label}</span>
      {children}
    </label>
  )
}

function Field({ icon, children, grow }: { icon: 'grid' | 'folder' | 'search'; children: React.ReactNode; grow?: boolean }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 9, padding: '0 14px',
      border: `1px solid ${UI.line}`, borderRadius: 12, background: UI.card,
      height: 42, flex: grow ? '1 1 220px' : '0 0 auto', boxShadow: UI.shadowSm,
    }}>
      <span style={{ color: UI.faint, display: 'flex' }}><Icon name={icon} /></span>
      {children}
    </div>
  )
}

const Pill = ({ children }: { children: React.ReactNode }) => (
  <span style={{
    fontSize: 11.5, fontWeight: 600, color: UI.muted,
    background: UI.lineSoft, padding: '2px 9px', borderRadius: 7,
  }}>{children}</span>
)

function Chevron({ open }: { open: boolean }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={UI.faint} strokeWidth="2.4"
         strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
         style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .15s', flexShrink: 0 }}>
      <path d="M6 9l6 6 6-6" />
    </svg>
  )
}

function Sparkle() {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" aria-hidden="true"
         style={{ position: 'absolute', top: -8, right: -26 }}>
      <path d="M12 3v5M18 6l-3 3M21 13h-5" stroke="#C8F24E" strokeWidth="2.4" strokeLinecap="round" />
    </svg>
  )
}

function Icon({ name }: { name: string }) {
  const p: Record<string, React.ReactNode> = {
    person: <><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></>,
    check:  <><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><path d="m9 11 3 3L22 4" /></>,
    clock:  <><circle cx="12" cy="12" r="10" /><path d="M12 6v6l4 2" /></>,
    cal:    <><rect width="18" height="18" x="3" y="4" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" /></>,
    grid:   <><rect width="7" height="7" x="3" y="3" rx="1" /><rect width="7" height="7" x="14" y="3" rx="1" />
              <rect width="7" height="7" x="14" y="14" rx="1" /><rect width="7" height="7" x="3" y="14" rx="1" /></>,
    folder: <path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z" />,
    search: <><circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" /></>,
  }
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor"
         strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {p[name]}
    </svg>
  )
}

const BARE: React.CSSProperties = {
  border: 'none', background: 'transparent', outline: 'none',
  fontFamily: 'inherit', fontSize: 13.5, color: UI.ink, cursor: 'pointer',
}
const GHOST: React.CSSProperties = {
  fontSize: 11.5, fontWeight: 700, padding: '5px 10px', borderRadius: 8,
  border: `1px solid ${UI.line}`, background: UI.card, color: UI.ink,
  cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap',
}
