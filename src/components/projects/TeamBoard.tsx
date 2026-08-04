'use client'

import { useEffect, useMemo, useState, useTransition } from 'react'
import { COLORS } from '@/lib/tokens'
import { initials, avatarColor } from '@/lib/utils'
import { setStepDone, convertStepToTask } from '@/actions/projects'
import { isLate, todayISO } from '@/lib/projects'

/**
 * Team tasks — the plan's steps, grouped by the person doing them.
 *
 * The same records the Projects board shows by project. A member sees only
 * their own; an admin gets a tab per person. The filtering that matters
 * happens on the server — this component is only ever handed what the viewer
 * is allowed to see, and setStepDone refuses a step that is not yours even if
 * the request is made directly.
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
  projectName: string
  brandName: string | null
  brandColor: string | null
}

interface Props {
  steps:   TeamStep[]
  people:  { id: string; name: string; role: string }[]
  brands:  { id: string; name: string; color: string }[]
  isAdmin: boolean
  viewerId: string
  canPush: boolean
}

type State = 'open' | 'all' | 'over' | 'done'

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
const fmt = (iso: string | null) => {
  if (!iso) return '—'
  const [, m, d] = iso.split('-')
  return `${+d} ${MONTHS[+m - 1]}`
}
const monthKey = (iso: string | null) => (iso ? iso.slice(0, 7) : 'no-date')
const monthLabel = (k: string) => (k === 'no-date' ? 'No date' : `${MONTHS[+k.slice(5, 7) - 1]} ${k.slice(0, 4)}`)

export function TeamBoard({ steps, people, brands, isAdmin, viewerId, canPush }: Props) {
  const [who, setWho]       = useState(isAdmin ? (people[0]?.id ?? viewerId) : viewerId)
  const [brand, setBrand]   = useState('')
  const [state, setState]   = useState<State>('open')
  const [search, setSearch] = useState('')
  const [error, setError]   = useState('')
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
      const bm = months.get(mk)!
      if (!bm.has(bk)) bm.set(bk, new Map())
      const pm = bm.get(bk)!
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

  const person = people.find(p => p.id === who)

  return (
    <div style={{ overflowY: 'auto', height: '100%', background: '#F6F6F4' }}>
      <div style={{ maxWidth: 1000, margin: '0 auto', padding: '32px 40px 80px' }}>

        <div style={{ marginBottom: 20 }}>
          <p style={EYEBROW}>Team</p>
          <div style={{ height: 2, width: 32, background: '#C8F24E', borderRadius: 2, margin: '8px 0 12px' }} />
          <h1 style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: '1.5rem', color: 'var(--ink)', margin: 0 }}>
            {isAdmin ? 'Team tasks' : 'My tasks'}
          </h1>
          <p style={{ fontSize: '0.85rem', color: 'var(--muted)', margin: '6px 0 0' }}>
            {isAdmin
              ? 'Every planned step, by the person doing it.'
              : 'The planned steps assigned to you.'}
          </p>
        </div>

        {/* Person tabs — admins only; everyone else has exactly one */}
        {isAdmin && people.length > 0 && (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 16 }}>
            {people.map(p => {
              const n = steps.filter(s => s.assigneeId === p.id && !s.done).length
              const active = p.id === who
              return (
                <button key={p.id} onClick={() => setWho(p.id)} aria-pressed={active}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 8, padding: '7px 13px 7px 7px',
                          borderRadius: 999, cursor: 'pointer', fontFamily: 'inherit',
                          border: active ? '1.5px solid var(--ink)' : '1px solid var(--line)',
                          background: '#fff', color: 'var(--ink)',
                        }}>
                  <span style={{
                    width: 22, height: 22, borderRadius: '50%', flexShrink: 0,
                    background: avatarColor(p.name), color: '#fff',
                    fontSize: '0.6rem', fontWeight: 800,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>{initials(p.name)}</span>
                  <span style={{ fontSize: '0.78rem', fontWeight: active ? 700 : 500 }}>{p.name}</span>
                  <span style={{ fontSize: '0.68rem', color: 'var(--muted)' }}>{n}</span>
                </button>
              )
            })}
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(120px,1fr))', gap: 10, marginBottom: 14 }}>
          <Stat label="Assigned"  value={String(stats.total)} />
          <Stat label="Done"      value={`${stats.done}/${stats.total}`} />
          <Stat label="Late"      value={String(stats.late)} bad={stats.late > 0} />
          <Stat label="Days left" value={String(Math.round(stats.days))} />
        </div>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
          <select value={brand} onChange={e => setBrand(e.target.value)} aria-label="Filter by brand" style={{ ...INPUT, width: 190 }}>
            <option value="">All brands</option>
            {brands.map(b => <option key={b.id} value={b.name}>{b.name}</option>)}
          </select>
          <select value={state} onChange={e => setState(e.target.value as State)} aria-label="Filter by state" style={{ ...INPUT, width: 150 }}>
            <option value="open">Open</option>
            <option value="all">All</option>
            <option value="over">Overdue only</option>
            <option value="done">Completed</option>
          </select>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search tasks"
                 aria-label="Search tasks" style={{ ...INPUT, flex: 1, minWidth: 170 }} />
        </div>

        {error && <p role="alert" style={{ fontSize: '0.8rem', color: COLORS.coral, margin: '0 0 12px' }}>{error}</p>}

        {!shown.length && (
          <p style={{ fontSize: '0.84rem', color: 'var(--muted)', padding: '24px 0' }}>
            {mine.length
              ? 'Nothing matches those filters.'
              : person
                ? `Nothing is assigned to ${person.name} yet.`
                : 'Nothing is assigned to you yet.'}
          </p>
        )}

        <div style={{ display: 'grid', gap: 18 }}>
          {[...grouped.entries()].map(([mk, byBrandMap]) => (
            <section key={mk}>
              <div style={{ ...EYEBROW, marginBottom: 8 }}>{monthLabel(mk)}</div>
              <div style={{ display: 'grid', gap: 10 }}>
                {[...byBrandMap.entries()].map(([bk, byProject]) => (
                  <div key={bk} style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 12, padding: '12px 15px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 8 }}>
                      <span style={{ width: 8, height: 8, borderRadius: '50%', background: brands.find(b => b.name === bk)?.color ?? '#B9B9B0' }} />
                      <span style={{ fontWeight: 700, fontSize: '0.78rem' }}>{bk}</span>
                    </div>
                    {[...byProject.entries()].map(([proj, list]) => (
                      <div key={proj} style={{ marginBottom: 8 }}>
                        <div style={{ fontSize: '0.72rem', color: 'var(--muted)', marginBottom: 3 }}>{proj}</div>
                        <div style={{ display: 'grid', gap: 3 }}>
                          {list.map(s => (
                            <Row key={s.id} step={s} today={today} canPush={canPush} onError={setError} />
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      </div>
    </div>
  )
}

function Row({ step, today, canPush, onError }: {
  step: TeamStep; today: string; canPush: boolean; onError: (s: string) => void
}) {
  const [isPending, start] = useTransition()
  // Ticked immediately, then reconciled. A controlled checkbox bound straight
  // to the server value snaps back until the round trip lands, which reads as
  // the click not having registered — the exact complaint this app already had
  // once, for a different reason.
  const [done, setDone] = useState(step.done)
  useEffect(() => { setDone(step.done) }, [step.done])
  const late = isLate({ ...step, done }, today)

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 9, padding: '6px 8px', borderRadius: 8,
      background: late ? '#FDF3F2' : '#FCFCFB', opacity: isPending ? 0.75 : 1,
    }}>
      <input
        type="checkbox" checked={done} aria-label={`${step.name} done`}
        onChange={e => {
          onError('')
          const next = e.target.checked
          setDone(next)
          start(async () => {
            const r = await setStepDone(step.id, next)
            if (!r.success) {
              setDone(!next)
              onError(r.error === 'not_authorized'
                ? 'That step is assigned to someone else.'
                : r.error ?? 'Could not save that')
            }
          })
        }}
        style={{ width: 15, height: 15, cursor: 'pointer', accentColor: '#8FBF1F', flexShrink: 0 }}
      />
      <span style={{
        flex: 1, fontSize: '0.8rem',
        textDecoration: done ? 'line-through' : 'none',
        color: done ? 'var(--muted)' : 'var(--ink)',
      }}>
        {step.name}
      </span>
      <span style={{ fontSize: '0.7rem', color: 'var(--muted)' }}>{step.durationDays}d</span>
      <span style={{ fontSize: '0.72rem', fontWeight: late ? 700 : 400, color: late ? COLORS.coral : 'var(--muted)', width: 52, textAlign: 'right' }}>
        {fmt(step.dueDate)}
      </span>
      {step.taskId ? (
        <a href={`/board?task=${step.taskId}`} style={{ fontSize: '0.64rem', fontWeight: 700, color: '#6E5BE6', textDecoration: 'none', whiteSpace: 'nowrap' }}>
          on board ↗
        </a>
      ) : canPush ? (
        <button
          onClick={() => { onError(''); start(async () => {
            const r = await convertStepToTask(step.id)
            if (!r.success) onError(r.error ?? 'Could not add that to the board')
          }) }}
          title="Create a task on the pipeline board from this step"
          style={{
            fontSize: '0.64rem', fontWeight: 700, padding: '3px 7px', borderRadius: 6,
            border: '1px solid var(--line)', background: '#fff', color: 'var(--ink)',
            cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap',
          }}
        >
          → board
        </button>
      ) : null}
    </div>
  )
}

function Stat({ label, value, bad }: { label: string; value: string; bad?: boolean }) {
  return (
    <div style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 12, padding: '11px 14px' }}>
      <div style={EYEBROW}>{label}</div>
      <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: '1.3rem', color: bad ? COLORS.coral : 'var(--ink)', marginTop: 3 }}>
        {value}
      </div>
    </div>
  )
}

const EYEBROW: React.CSSProperties = {
  fontWeight: 700, fontSize: '0.62rem', letterSpacing: '.14em',
  textTransform: 'uppercase', color: 'var(--muted)', margin: 0,
}
const INPUT: React.CSSProperties = {
  fontSize: '0.78rem', padding: '7px 9px', borderRadius: 8,
  border: '1px solid var(--line)', background: '#fff',
  color: 'var(--ink)', outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box',
}
