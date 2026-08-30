'use client'

import { useEffect, useMemo, useState, useTransition } from 'react'
import { initials } from '@/lib/utils'
import { setStepDone, convertStepToTask, updateStep, addStep, addSteps } from '@/actions/projects'
import { looksLikeList, parsePastedList } from '@/lib/paste-list'
import type { PersonLoad } from '@/lib/workload'
import { PersonWorkloadCard } from './PersonWorkloadCard'
import { isLate, todayISO } from '@/lib/projects'
import {
  UI, TILE, font, card, control, input,
  durationTone, personColor, segmentWidth,
} from '@/lib/board-ui'

/**
 * Team tasks — the plan's steps, grouped by the person doing them.
 *
 * Built to "Momentum Team Tasks - Design Spec.md". Every measurement is from that
 * file.
 *
 * The same records the Portfolio board shows by project. A member sees only
 * their own; an admin gets a chip per person. The filtering that matters
 * happens on the server — this component is only ever handed what the viewer
 * is allowed to see, and every action re-checks before writing.
 *
 * Editing is inline rather than behind a modal. These rows get worked through
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
  assigneeAvatar: string | null
  taskId: string | null
  projectId: string
  projectName: string
  brandName: string | null
  brandColor: string | null
  brandLogo: string | null
}

interface Props {
  /** The viewer's own workload, computed server-side from the same module the
   *  admin Workload tab uses, so the two cannot disagree about them. */
  myLoad?: PersonLoad
  hoursPerStepDay?: number
  steps:      TeamStep[]
  people:     { id: string; name: string; role: string; avatar: string | null }[]
  allMembers: { id: string; name: string }[]
  projects:   { id: string; name: string; brandName: string | null }[]
  brands:     { id: string; name: string; color: string }[]
  isAdmin:    boolean
  viewerId:   string
  canPush:    boolean
}

type State = 'open' | 'all' | 'over' | 'done'

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
const fmt = (iso: string | null) => {
  if (!iso) return '—'
  const [, m, d] = iso.split('-')
  return `${+d} ${MONTHS[+m - 1]}`
}
const monthKey   = (iso: string | null) => (iso ? iso.slice(0, 7) : 'zzzz')
const monthLabel = (k: string) =>
  k === 'zzzz' ? 'NO DATE' : `${MONTHS[+k.slice(5, 7) - 1].toUpperCase()} ${k.slice(0, 4)}`

export function TeamBoard({
  steps, people, allMembers, projects, brands, isAdmin, viewerId, canPush, myLoad, hoursPerStepDay,
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
    <div style={{ overflowY: 'auto', height: '100%', background: '#FFFFFF' }}>
      <div className="fx-proj" style={{
        maxWidth: 1336, padding: '24px 26px 34px 38px',
        display: 'flex', flexDirection: 'column', gap: 20,
      }}>

        {/* ── §4 Header ───────────────────────────────────────────────── */}
        {/* The title, the person picker and the progress card beside them do
            not fit on a phone; globals.css lets them stack. */}
        <header className="fx-proj-head" style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 26 }}>
          <div>
            <div style={font.eyebrow}>Team</div>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginTop: 8 }}>
              <h1 style={{ ...font.title, margin: 0 }}>{isAdmin ? 'Team tasks' : 'My tasks'}</h1>
              <Ticks />
            </div>
            <p style={{ ...font.subtitle, margin: '7px 0 0' }}>
              {isAdmin ? 'Every planned step, by the person doing it.' : 'The planned steps assigned to you.'}
            </p>

            {isAdmin && people.length > 0 && (
              <div style={{ display: 'flex', gap: 12, marginTop: 20, flexWrap: 'wrap' }}>
                {people.map(p => {
                  const open = steps.filter(s => s.assigneeId === p.id && !s.done).length
                  const active = p.id === who
                  return (
                    <button key={p.id} onClick={() => setWho(p.id)} aria-pressed={active}
                            style={{
                              height: 46, padding: '0 18px 0 6px', borderRadius: 999, gap: 10,
                              display: 'flex', alignItems: 'center', cursor: 'pointer', fontFamily: 'inherit',
                              border: active ? `1.5px solid ${UI.limeCta}` : `1px solid ${UI.borderInput}`,
                              background: active ? UI.limeBg : '#FFFFFF',
                            }}>
                      <Avatar name={p.name} src={p.avatar} size={34} />
                      <span style={{ fontWeight: active ? 700 : 600, fontSize: 13.5, color: active ? UI.ink : UI.textPrimary }}>
                        {p.name}
                      </span>
                      <span style={{ fontWeight: active ? 700 : 600, fontSize: 12.5, color: active ? UI.muted : UI.faintest }}>
                        {open}
                      </span>
                    </button>
                  )
                })}
              </div>
            )}
          </div>

          {/* 150px of illustration plus a 320px card is 488 — wider than a
              phone, and the one thing on this page that left it draggable
              sideways. The illustration goes there (it is decoration, already
              aria-hidden) and the card takes the width. */}
          <div className="fx-team-aside" style={{ display: 'flex', alignItems: 'flex-start', gap: 18, flexShrink: 0 }}>
            <div className="fx-team-illus"><Illustration /></div>
            <ProgressCard percent={percent} done={stats.done} total={stats.total} />
          </div>
        </header>

        {/* ── §5 KPI row ──────────────────────────────────────────────── */}
        {/* Four tiles across is 80px each on a phone. Two across there. */}
        <div className="fx-kpi-row" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14 }}>
          <Kpi tile={TILE.purple} stroke={UI.purple} icon="user" label="Assigned"
               value={String(stats.total)} unit="tasks"
               fill={stats.total ? 42 : 0} fillColor={UI.purple} />
          <Kpi tile={TILE.lime} stroke={UI.green} icon="check" label="Done"
               value={`${stats.done}/${stats.total}`} unit="tasks"
               fill={percent} fillColor={UI.limeDot} />
          <Kpi tile={TILE.amber} stroke={UI.amber} icon="clock" label="Late"
               value={String(stats.late)} unit="tasks"
               fill={stats.total ? Math.round((stats.late / stats.total) * 100) : 0}
               fillColor={UI.amber} track={UI.trackAmber} />
          <Kpi tile={TILE.indigo} stroke={UI.indigo} icon="calendar" label="Days left"
               value={String(Math.round(stats.days))} unit="days"
               fill={27} fillColor={UI.purplePale} />
        </div>

        {/* Your own workload, month by month. Shown when you are looking at
            yourself — an admin flipping between people gets the full picture
            on the Workload tab instead, where it can be compared. */}
        {myLoad && who === viewerId && myLoad.steps > 0 && (
          <PersonWorkloadCard load={myLoad} hoursPerStepDay={hoursPerStepDay ?? 8} compact />
        )}

        {/* ── §6 Filter row ───────────────────────────────────────────── */}
        <div className="fx-filter-row" style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <label style={{ ...control, width: 232, padding: '0 16px', gap: 10 }}>
            <Icon name="table" size={17} stroke={UI.muted} width={2} />
            <select value={brand} onChange={e => setBrand(e.target.value)} aria-label="Filter by brand" style={BARE}>
              <option value="">All brands</option>
              {brands.map(b => <option key={b.id} value={b.name}>{b.name}</option>)}
            </select>
            <Icon name="chevron" size={16} stroke={UI.muted} width={2.4} />
          </label>

          <label style={{ ...control, width: 232, padding: '0 16px', gap: 10 }}>
            <Icon name="folder" size={17} stroke={UI.muted} width={2} />
            <select value={state} onChange={e => setState(e.target.value as State)} aria-label="Filter by state" style={BARE}>
              <option value="open">Open</option>
              <option value="all">All</option>
              <option value="over">Overdue only</option>
              <option value="done">Completed</option>
            </select>
            <Icon name="chevron" size={16} stroke={UI.muted} width={2.4} />
          </label>

          <label style={{ ...control, flex: 1, padding: '0 18px', gap: 11 }}>
            <Icon name="search" size={18} stroke={UI.faint} width={2.2} />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search tasks..."
                   aria-label="Search tasks" style={{ ...BARE, cursor: 'text', width: '100%' }} />
          </label>

          {canEdit && (
            <button onClick={() => setAdding(v => !v)}
                    style={{
                      ...control, padding: '0 20px', gap: 10, cursor: 'pointer',
                      fontFamily: 'inherit', fontWeight: 600, fontSize: 13.5, color: UI.textPrimary,
                    }}>
              <Icon name="sliders" size={17} stroke={UI.textPrimary} width={2.1} />
              New task
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

        {error && <p role="alert" style={{ fontSize: 13, color: UI.redStrong, margin: 0 }}>{error}</p>}

        {!shown.length && (
          <p style={{ fontSize: 14, color: UI.soft, padding: '18px 0' }}>
            {mine.length ? 'Nothing matches those filters.'
              : person ? `Nothing is assigned to ${person.name} yet.`
              : 'Nothing is assigned to you yet.'}
          </p>
        )}

        {/* ── §7–§9 Groups ────────────────────────────────────────────── */}
        {[...grouped.entries()].map(([mk, byBrandMap]) => (
          <div key={mk} style={{ display: 'contents' }}>
            <div style={font.eyebrow}>{monthLabel(mk)}</div>
            {[...byBrandMap.entries()].map(([bk, byProject]) => {
              const all = [...byProject.values()].flat()
              const key = mk + '|' + bk
              const collapsed = shut[key]
              const doneN = all.filter(s => s.done).length
              const sample = all[0]
              return (
                <BrandGroup
                  key={key}
                  name={bk}
                  color={sample?.brandColor ?? UI.faintest}
                  logo={sample?.brandLogo ?? null}
                  total={all.length}
                  done={doneN}
                  collapsed={!!collapsed}
                  onToggle={() => setShut(s => ({ ...s, [key]: !collapsed }))}
                >
                  {[...byProject.entries()].map(([proj, list]) => (
                    <div key={proj}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
                        <span style={{ width: 8, height: 8, borderRadius: '50%', background: UI.purpleSoft, flexShrink: 0 }} />
                        <span style={{ fontWeight: 700, fontSize: 14, color: UI.textPrimary }}>{proj}</span>
                        <span style={{
                          height: 21, padding: '0 9px', borderRadius: 999, background: UI.track,
                          fontWeight: 600, fontSize: 11, color: UI.muted,
                          display: 'flex', alignItems: 'center',
                        }}>
                          {list.length} task{list.length === 1 ? '' : 's'}
                        </span>
                      </div>
                      <div style={{
                        margin: '10px 0 0 19px', paddingLeft: 18,
                        borderLeft: `1.5px solid ${UI.purpleLine}`,
                        display: 'flex', flexDirection: 'column', gap: 8,
                      }}>
                        {list.map(s => (
                          <Row key={s.id} step={s} today={today} canPush={canPush}
                               canEdit={isAdmin || s.assigneeId === viewerId}
                               members={allMembers} isAdmin={isAdmin} onError={setError} />
                        ))}
                      </div>
                    </div>
                  ))}
                </BrandGroup>
              )
            })}
          </div>
        ))}
      </div>
    </div>
  )
}

/* ── §8/§9 brand group ───────────────────────────────────────────────── */

function BrandGroup({ name, color, logo, total, done, collapsed, onToggle, children }: {
  name: string; color: string; logo: string | null
  total: number; done: number; collapsed: boolean
  onToggle: () => void; children: React.ReactNode
}) {
  const segW = segmentWidth(total || 1)
  return (
    <section style={{ border: `1px solid ${UI.border}`, borderRadius: 18, overflow: 'hidden', background: '#FFFFFF' }}>
      <button onClick={onToggle} aria-expanded={!collapsed}
              style={{
                display: 'flex', alignItems: 'center', gap: 11, width: '100%',
                padding: '16px 18px', background: 'none', border: 'none',
                cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left',
              }}>
        <span style={{
          width: 28, height: 28, borderRadius: '50%', flexShrink: 0, overflow: 'hidden',
          background: color, color: '#FFFFFF', fontWeight: 800, fontSize: 13,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {logo ? <img src={logo} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                : name[0]?.toUpperCase()}
        </span>
        <span style={font.cardTitle}>{name}</span>
        <span style={{
          height: 22, padding: '0 9px', borderRadius: 999, background: UI.purpleTint,
          fontWeight: 700, fontSize: 11.5, color: UI.purple,
          display: 'flex', alignItems: 'center',
        }}>
          {total} task{total === 1 ? '' : 's'}
        </span>

        <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontWeight: 700, fontSize: 12.5, color: done ? UI.green : UI.faintest }}>
            {done}/{total} done
          </span>
          <span style={{ display: 'flex', gap: 4 }}>
            {Array.from({ length: total || 1 }, (_, i) => (
              <span key={i} style={{
                width: segW, height: 7, borderRadius: 999,
                background: i < done ? UI.green : UI.segEmpty,
              }} />
            ))}
          </span>
          <Icon name="chevron" size={18} stroke={UI.muted} width={2.3}
                style={{ transform: collapsed ? 'none' : 'rotate(180deg)' }} />
        </span>
      </button>

      {!collapsed && (
        <div style={{
          background: UI.groupBg, borderTop: `1px solid ${UI.groupLine}`,
          padding: '16px 18px 18px', display: 'flex', flexDirection: 'column', gap: 16,
        }}>
          {children}
        </div>
      )}
    </section>
  )
}

/* ── §8 task row ─────────────────────────────────────────────────────── */

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
      background: '#FFFFFF', border: `1px solid ${late ? '#F6D9DE' : UI.border}`,
      borderRadius: 12, opacity: isPending ? 0.75 : 1,
    }}>
      {/* Checkbox, name, avatar, duration, due date, board, Edit. On a phone
          the last two were off the edge — the two controls on the row that do
          anything. It wraps there: the name takes the first line, everything
          that describes or acts on it takes the second. */}
      <div className="fx-step-row" style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '11px 12px 11px 14px' }}>
        <input
          type="checkbox" checked={done} aria-label={`${step.name} done`}
          onChange={e => {
            const next = e.target.checked
            setDone(next); onError('')
            start(async () => {
              const r = await setStepDone(step.id, next)
              if (!r.success) {
                setDone(!next)
                onError(r.error === 'not_authorized' ? 'That task is assigned to someone else.' : r.error ?? 'Could not save that')
              }
            })
          }}
          style={{ width: 18, height: 18, borderRadius: 5, accentColor: UI.purple, cursor: 'pointer', flexShrink: 0 }}
        />

        <span className="fx-step-name" style={{
          flex: 1, fontWeight: 600, fontSize: 13.5,
          color: done ? UI.soft : UI.textPrimary,
          textDecoration: done ? 'line-through' : 'none',
        }}>
          {step.name}
        </span>

        {step.assigneeName && <Avatar name={step.assigneeName} src={step.assigneeAvatar} size={28} />}

        <span style={{ width: 34, textAlign: 'right', fontWeight: 700, fontSize: 12, color: durationTone(step.durationDays) }}>
          {step.durationDays}d
        </span>

        <span style={{
          width: 62, textAlign: 'right', fontWeight: 500, fontSize: 12.5,
          color: late ? UI.redStrong : UI.soft,
        }}>
          {fmt(step.dueDate)}
        </span>

        {step.taskId ? (
          <a href={`/board?task=${step.taskId}`} style={{ ...PILL, textDecoration: 'none' }}>
            <Icon name="arrow" size={14} stroke={UI.purple} width={2.4} /> board
          </a>
        ) : canPush ? (
          <button onClick={() => act(() => convertStepToTask(step.id))}
                  title="Create a task on the pipeline board from this step" style={PILL}>
            <Icon name="arrow" size={14} stroke={UI.purple} width={2.4} /> board
          </button>
        ) : null}

        {canEdit && (
          <button onClick={() => setOpen(v => !v)} aria-expanded={open}
                  aria-label={`${open ? 'Close' : 'Edit'} ${step.name}`}
                  style={{ ...PILL, padding: '0 12px' }}>
            {open ? 'Close' : 'Edit'}
          </button>
        )}
      </div>

      {open && canEdit && (
        <div style={{
          borderTop: `1px solid ${UI.groupLine}`, padding: 12,
          display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end',
        }}>
          <Labelled label="Task name" grow>
            <input defaultValue={step.name}
                   onBlur={e => { const v = e.target.value.trim(); if (v && v !== step.name) act(() => updateStep(step.id, { name: v })) }}
                   style={{ ...input, width: '100%' }} />
          </Labelled>
          <Labelled label="Duration (days)">
            <input type="number" min={0} step={0.5} defaultValue={step.durationDays}
                   onBlur={e => { const v = parseFloat(e.target.value); if (!isNaN(v) && v !== step.durationDays) act(() => updateStep(step.id, { duration_days: v })) }}
                   style={{ ...input, width: 100 }} />
          </Labelled>
          <Labelled label="Due date">
            <input type="date" defaultValue={step.dueDate ?? ''}
                   onChange={e => act(() => updateStep(step.id, { due_date: e.target.value || null }))}
                   style={{ ...input, width: 158 }} />
          </Labelled>
          <Labelled label={isAdmin ? 'Assigned to' : 'Hand over to'}>
            <select defaultValue={step.assigneeId ?? ''}
                    onChange={e => act(() => updateStep(step.id, { assignee_id: e.target.value || null }))}
                    style={{ ...input, width: 172 }}>
              <option value="">— unassigned —</option>
              {members.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
          </Labelled>
          <span style={{ fontSize: 11.5, color: UI.faintest, paddingBottom: 10 }}>
            Saved as you go · {step.projectName}
          </span>
        </div>
      )}
    </div>
  )
}

/* ── new task ────────────────────────────────────────────────────────── */

function NewTaskForm({ projects, members, defaultAssignee, onDone, onError }: {
  projects: { id: string; name: string; brandName: string | null }[]
  members: { id: string; name: string }[]
  defaultAssignee: string
  onDone: () => void
  onError: (s: string) => void
}) {
  const [name, setName] = useState('')
  const [proj, setProj] = useState(projects[0]?.id ?? '')
  const [who, setWho]   = useState(defaultAssignee)
  const [due, setDue]   = useState('')
  const [days, setDays] = useState('1')
  const [pasted, setPasted] = useState<string[] | null>(null)
  const [isPending, start] = useTransition()

  const extra = () => ({
    assignee_id: who || null,
    due_date: due || null,
    duration_days: parseFloat(days) || 1,
  })

  function submit() {
    if (!proj) return
    onError('')

    if (pasted) {
      const names = pasted.filter(n => n.trim())
      if (!names.length) return
      start(async () => {
        const r = await addSteps(proj, names, extra())
        if (r.success) { setPasted(null); setName(''); setDue(''); onDone() }
        else onError(r.error ?? 'Could not add those tasks')
      })
      return
    }

    if (!name.trim()) return
    start(async () => {
      const r = await addStep(proj, name, extra())
      if (r.success) { setName(''); setDue(''); onDone() }
      else onError(r.error ?? 'Could not add that task')
    })
  }

  /** A list on the clipboard becomes one task per line — see paste-list.ts
   *  for why this has to happen in the paste event rather than in onChange. */
  function handlePaste(e: React.ClipboardEvent<HTMLInputElement>) {
    const text = e.clipboardData.getData('text/plain')
    if (!text || !looksLikeList(text)) return
    e.preventDefault()
    const { names } = parsePastedList(text)
    setPasted(names)
    setName('')
    onError('')
  }

  return (
    <div style={{ ...card, borderRadius: 18, padding: 16, display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
      <Labelled label="Task" grow>
        {pasted ? (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 10, ...input,
            width: '100%', background: UI.limeBg, borderColor: UI.limeCta,
          }}>
            <span style={{ fontWeight: 700, fontSize: 13.5, color: UI.ink }}>
              {pasted.filter(n => n.trim()).length} tasks pasted
            </span>
            <span style={{ flex: 1, minWidth: 0, fontSize: 12.5, color: UI.soft,
                           overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {pasted.slice(0, 3).join(' · ')}{pasted.length > 3 ? ' …' : ''}
            </span>
            <button onClick={() => setPasted(null)} aria-label="Clear the pasted list"
                    style={{ border: 'none', background: 'transparent', color: UI.redStrong,
                             cursor: 'pointer', fontSize: 13, padding: 2 }}>
              ✕
            </button>
          </div>
        ) : (
          <input value={name} onChange={e => setName(e.target.value)} autoFocus
                 onKeyDown={e => { if (e.key === 'Enter') submit() }}
                 onPaste={handlePaste}
                 aria-label="Task name"
                 placeholder="What needs doing? — or paste a list" style={{ ...input, width: '100%' }} />
        )}
      </Labelled>
      <Labelled label="Project">
        <select value={proj} onChange={e => setProj(e.target.value)} style={{ ...input, width: 220 }}>
          {projects.map(p => (
            <option key={p.id} value={p.id}>{p.brandName ? `${p.brandName} — ` : ''}{p.name}</option>
          ))}
        </select>
      </Labelled>
      <Labelled label="Assigned to">
        <select value={who} onChange={e => setWho(e.target.value)} style={{ ...input, width: 168 }}>
          {members.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
        </select>
      </Labelled>
      <Labelled label="Due">
        <input type="date" value={due} onChange={e => setDue(e.target.value)} style={{ ...input, width: 158 }} />
      </Labelled>
      <Labelled label="Days">
        <input type="number" min={0} step={0.5} value={days} onChange={e => setDays(e.target.value)} style={{ ...input, width: 84 }} />
      </Labelled>
      <button onClick={submit} disabled={!name.trim() || isPending}
              style={{
                height: 42, padding: '0 22px', borderRadius: 10, border: 'none',
                background: UI.purple, color: '#FFFFFF', fontWeight: 700, fontSize: 13.5,
                cursor: 'pointer', fontFamily: 'inherit',
                opacity: name.trim() && !isPending ? 1 : 0.45,
              }}>
        Add task
      </button>
      <button onClick={onDone} style={{ ...PILL, height: 42, padding: '0 16px' }}>Cancel</button>
    </div>
  )
}

/* ── §4 right cluster ────────────────────────────────────────────────── */

function ProgressCard({ percent, done, total }: { percent: number; done: number; total: number }) {
  // A seven-point line whose last point is today's figure, so the card moves
  // with the number beside it instead of drawing a fixed decoration.
  const pts = [18, 26, 22, 34, 30, 42, Math.max(6, Math.min(48, percent * 0.48 + 6))]
  const d = pts.map((y, i) => `${i === 0 ? 'M' : 'L'}${6 + i * 23},${52 - y}`).join(' ')

  return (
    <div className="fx-progress-card" style={{ width: 320, border: `1px solid ${UI.border}`, borderRadius: 18, padding: '16px 18px 18px' }}>
      <div style={{ fontWeight: 700, fontSize: 14, color: UI.textPrimary }}>Today&apos;s progress</div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginTop: 6 }}>
        <span style={{ fontFamily: 'var(--font-accent)', fontWeight: 700, fontSize: 50, lineHeight: 1, color: UI.purple }}>
          {percent}%
        </span>
        <svg width="150" height="52" viewBox="0 0 150 52" fill="none" aria-hidden="true">
          <path d={d} stroke={UI.purpleStroke} strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
          <circle cx={6 + 6 * 23} cy={52 - pts[6]} r="5" fill={UI.purple} />
        </svg>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginTop: 12 }}>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={UI.green}
             strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M12 19V5M5 12l7-7 7 7" />
        </svg>
        <span style={{ fontWeight: 700, fontSize: 12.5, color: UI.green }}>{done}</span>
        <span style={{ fontWeight: 500, fontSize: 12.5, color: UI.soft }}>of {total} steps complete</span>
      </div>
    </div>
  )
}

function Illustration() {
  return (
    <div style={{ position: 'relative', width: 150, height: 130, flexShrink: 0 }} aria-hidden="true">
      <div style={{
        position: 'absolute', left: 10, top: 26, width: 104, height: 82,
        borderRadius: 12, background: '#F1EDFE', transform: 'rotate(-8deg)',
      }} />
      <div style={{
        position: 'absolute', left: 20, top: 18, width: 104, height: 86,
        borderRadius: 12, background: '#FFFFFF', border: '1px solid #E7E1FB',
        boxShadow: '0 8px 18px rgba(124,58,237,0.12)', padding: '14px 14px 0', boxSizing: 'border-box',
      }}>
        <div style={{ width: '62%', height: 6, borderRadius: 999, background: '#E4DCFB' }} />
        <div style={{ width: '46%', height: 6, borderRadius: 999, background: '#EDE8FC', marginTop: 9 }} />
        <div style={{ width: '54%', height: 6, borderRadius: 999, background: '#EDE8FC', marginTop: 9 }} />
      </div>
      <div style={{
        position: 'absolute', right: 8, top: 6, width: 22, height: 22, borderRadius: '50%',
        background: UI.purple, display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" strokeWidth="3" strokeLinecap="round">
          <path d="M12 5v14M5 12h14" />
        </svg>
      </div>
      <div style={{
        position: 'absolute', right: 14, bottom: 14, width: 52, height: 52, borderRadius: '50%',
        background: UI.purple, boxShadow: '0 10px 20px rgba(124,58,237,0.32)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
          <path d="M20 6 9 17l-5-5" />
        </svg>
      </div>
      <svg width="26" height="20" viewBox="0 0 26 20" fill="none" style={{ position: 'absolute', left: 0, top: 4 }}>
        <path d="M2 10h5M5 3l3 4M5 17l3-4" stroke="#C4B5FD" strokeWidth="2.4" strokeLinecap="round" />
      </svg>
    </div>
  )
}

/* ── small pieces ────────────────────────────────────────────────────── */

function Kpi({ tile, stroke, icon, label, value, unit, fill, fillColor, track }: {
  tile: string; stroke: string; icon: string; label: string
  value: string; unit: string; fill: number; fillColor: string; track?: string
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
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 7, marginTop: 12 }}>
        <span style={font.kpiValue}>{value}</span>
        <span style={{ fontWeight: 600, fontSize: 13, color: UI.soft }}>{unit}</span>
      </div>
      <div style={{ marginTop: 14, height: 7, borderRadius: 999, background: track ?? UI.track, overflow: 'hidden' }}>
        <div style={{ width: `${Math.min(100, fill)}%`, height: 7, borderRadius: 999, background: fillColor }} />
      </div>
    </div>
  )
}

function Avatar({ name, src, size }: { name: string; src?: string | null; size: number }) {
  return (
    <span title={name} style={{
      width: size, height: size, borderRadius: '50%', flexShrink: 0, overflow: 'hidden',
      background: personColor(name), color: '#FFFFFF',
      fontWeight: 800, fontSize: size * 0.36,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {src ? <img src={src} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : initials(name)}
    </span>
  )
}

function Labelled({ label, children, grow }: { label: string; children: React.ReactNode; grow?: boolean }) {
  return (
    <label style={{ display: 'grid', gap: 5, flex: grow ? '1 1 220px' : '0 0 auto' }}>
      <span style={{ ...font.eyebrow, fontSize: 9.5, letterSpacing: '0.1em' }}>{label}</span>
      {children}
    </label>
  )
}

function Ticks() {
  return (
    <svg width="34" height="26" viewBox="0 0 34 26" fill="none" aria-hidden="true" style={{ marginTop: 4 }}>
      <path d="M3 16L8 3M14 18l5-13M25 16l5-13" stroke={UI.limeDot} strokeWidth="3" strokeLinecap="round" />
    </svg>
  )
}

function Icon({ name, size, stroke, width, style }: {
  name: string; size: number; stroke: string; width: number; style?: React.CSSProperties
}) {
  const paths: Record<string, React.ReactNode> = {
    user:     <><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></>,
    check:    <><circle cx="12" cy="12" r="9" /><path d="m8.5 12 2.5 2.5L16 9.5" /></>,
    clock:    <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3.5 2" /></>,
    calendar: <><rect x="3" y="4.5" width="18" height="17" rx="2.5" /><path d="M16 2.5v4M8 2.5v4M3 10h18" /></>,
    table:    <><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M3 10h18M9 10v10" /></>,
    folder:   <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />,
    search:   <><circle cx="11" cy="11" r="7.5" /><path d="m20 20-4.2-4.2" /></>,
    sliders:  <><path d="M4 6h11M19 6h1M4 12h4M12 12h8M4 18h9M17 18h3" /><circle cx="17" cy="6" r="2" /><circle cx="10" cy="12" r="2" /><circle cx="15" cy="18" r="2" /></>,
    chevron:  <path d="M6 9l6 6 6-6" />,
    arrow:    <><path d="M5 12h13" /><path d="m12 5 7 7-7 7" /></>,
  }
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={stroke}
         strokeWidth={width} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
         style={{ flexShrink: 0, ...style }}>
      {paths[name]}
    </svg>
  )
}

const BARE: React.CSSProperties = {
  border: 'none', background: 'transparent', outline: 'none', flex: 1, minWidth: 0,
  fontFamily: 'inherit', fontWeight: 600, fontSize: 13.5, color: UI.textPrimary, cursor: 'pointer',
  // The spec draws its own chevron; without this the browser adds a second one.
  appearance: 'none', WebkitAppearance: 'none', MozAppearance: 'none',
}
const PILL: React.CSSProperties = {
  height: 32, padding: '0 14px', border: `1px solid ${UI.borderInput}`, borderRadius: 999,
  display: 'inline-flex', alignItems: 'center', gap: 7, background: '#FFFFFF',
  fontWeight: 600, fontSize: 12.5, color: UI.textPrimary, cursor: 'pointer',
  fontFamily: 'inherit', whiteSpace: 'nowrap', flexShrink: 0,
}
