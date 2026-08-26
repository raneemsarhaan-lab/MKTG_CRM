'use client'

import { useEffect, useMemo, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { updateTask } from '@/actions/tasks'
import {
  planDay, rightNow, hhmm, durLabel, DEFAULTS, ASSUMED_MINS, MIN_CHUNK,
  type PlanTask, type DaySettings, type Slot,
} from '@/lib/day-plan'

/**
 * My Day — the working hours laid out, rather than a list of what is late.
 *
 * The tasks come from the database; the working hours live in this browser.
 * There is no per-member hours column yet and inventing one to hold a start
 * and an end time seemed the wrong way round — these are a preference about
 * how you like to work, not a fact about you the team needs.
 */

interface Props {
  tasks: PlanTask[]
  /** Anything already in the diary today, in minutes from midnight. */
  held?: { name: string; from: number; to: number }[]
  accentColor?: string
}

const KEY = 'momentum.day.settings'
const PANEL_KEY = 'momentum.day.panel'

const UI = {
  line:    '#EBEBE8',
  soft:    '#F4F5F7',
  ink:     '#1B1A13',
  muted:   '#6B7280',
  faint:   '#9AA0AC',
  late:    '#D2264B',
  lateBg:  '#FDECF0',
  cont:    '#2C57F0',
  contBg:  '#EAEFFE',
  rest:    '#8E97A8',
  restBg:  '#F2F4F8',
  now:     '#C7E22E',
  nowInk:  '#3F4A08',
}

const toMins = (t: string) => {
  const [h, m] = t.split(':').map(Number)
  return (h || 0) * 60 + (m || 0)
}

export function MyDayTimeline({ tasks, held = [], accentColor = '#6E5BE6' }: Props) {
  const [s, setS] = useState<DaySettings>(DEFAULTS)
  // Open by default: these are the knobs that decide what the day below looks
  // like, and a panel nobody can find is a panel nobody uses. Collapsing it
  // sticks, so anyone who has set their hours once need not see them again.
  const [open, setOpen] = useState(true)
  const [saveError, setSaveError] = useState('')
  const [, startTransition] = useTransition()
  const router = useRouter()

  /**
   * Set a task's estimate from the slot it produced.
   *
   * The panel spends its time telling you an estimate is missing, so the
   * place to fix it is the line making the complaint rather than three
   * clicks away on the board. updateTask carries the permission rule, and
   * these are the viewer's own tasks, so the owner check always passes.
   */
  function saveEstimate(taskId: string, hours: number) {
    setSaveError('')
    startTransition(async () => {
      const r = await updateTask(taskId, { hours_estimate: hours })
      if (r.success) router.refresh()
      else setSaveError(r.error ?? 'Could not save that estimate')
    })
  }

  // Read after mount, never during render — reading localStorage while
  // rendering makes the server and the client disagree about the first paint.
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(KEY)
      if (raw) setS({ ...DEFAULTS, ...JSON.parse(raw) })
      if (window.localStorage.getItem(PANEL_KEY) === 'closed') setOpen(false)
    } catch { /* a corrupt preference is not worth a crash */ }
  }, [])

  function togglePanel() {
    setOpen(o => {
      try { window.localStorage.setItem(PANEL_KEY, o ? 'closed' : 'open') } catch { /* private mode */ }
      return !o
    })
  }

  function update(patch: Partial<DaySettings>) {
    setS(prev => {
      const next = { ...prev, ...patch }
      try { window.localStorage.setItem(KEY, JSON.stringify(next)) } catch { /* private mode */ }
      return next
    })
  }

  // The clock ticks so the "you are here" band stays honest without a reload.
  const [now, setNow] = useState<number | null>(null)
  useEffect(() => {
    const read = () => { const d = new Date(); setNow(d.getHours() * 60 + d.getMinutes()) }
    read()
    const id = window.setInterval(read, 30_000)
    return () => window.clearInterval(id)
  }, [])

  const slots = useMemo(
    () => (now === null ? [] : planDay(tasks, s, now, held)),
    [tasks, s, now, held],
  )

  const work    = slots.filter(x => x.kind === 'work')
  const total   = work.reduce((a, x) => a + (x.to - x.from), 0)
  const assumed = work.filter(x => x.assumed).length
  const status  = now === null ? null : rightNow(slots, now, s)

  const badEnd = s.dayEnd <= s.dayStart

  return (
    <div style={{
      background: '#fff', borderRadius: 16, border: `1px solid ${UI.line}`,
      boxShadow: '0 1px 3px rgba(28,24,54,.04)', overflow: 'hidden',
    }}>
      {/* header */}
      <div style={{
        display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap',
        padding: '16px 20px 14px', borderBottom: `1px solid ${UI.line}`,
      }}>
        <span style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: '1rem', color: UI.ink }}>
          ☀️ My Day
        </span>
        <span style={{ fontSize: 12.5, color: UI.faint }} suppressHydrationWarning>
          {new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}
        </span>
        <span style={{ flex: 1 }} />
        <span style={{
          fontSize: 12, fontWeight: 700, background: `${accentColor}1A`, color: accentColor,
          padding: '3px 9px', borderRadius: 99, whiteSpace: 'nowrap',
        }}>
          {durLabel(total)} in {work.length} slot{work.length === 1 ? '' : 's'}
        </span>
        <button
          type="button"
          onClick={togglePanel}
          aria-expanded={open}
          style={{
            border: 'none', background: UI.soft, borderRadius: 8, cursor: 'pointer',
            padding: '5px 11px', fontFamily: 'inherit', fontSize: 12.5, color: UI.muted,
          }}
        >
          {hhmm(s.dayStart)}–{hhmm(s.dayEnd)}
        </button>
      </div>

      {open && (
        <div style={{
          padding: '14px 20px 16px', background: '#FBFBFC',
          borderBottom: `1px solid ${UI.line}`,
          display: 'flex', flexDirection: 'column', gap: 12,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px 18px', flexWrap: 'wrap' }}>
            <Field label="Day starts">
              {/* 132px, not 88 — narrower and the browser's own AM/PM marker is
                  clipped off the end of the field, which makes an afternoon
                  finish impossible to set or even read. */}
              <input type="time" value={hhmm(s.dayStart)} aria-label="Working day starts"
                     onChange={e => update({ dayStart: toMins(e.target.value) })} style={INPUT} />
            </Field>
            <Field label="ends">
              <input type="time" value={hhmm(s.dayEnd)} aria-label="Working day ends"
                     onChange={e => update({ dayEnd: toMins(e.target.value) })} style={INPUT} />
            </Field>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px 18px', flexWrap: 'wrap' }}>
            <Field label="Focus block">
              <input type="number" min={30} max={240} step={15} value={s.focus} aria-label="Focus block in minutes"
                     onChange={e => update({ focus: Math.max(30, Number(e.target.value) || 120) })}
                     style={{ ...INPUT, width: 84 }} />
              <span style={{ fontSize: 12.5, color: UI.faint }}>min</span>
            </Field>
            <Field label="Break">
              <input type="number" min={5} max={60} step={5} value={s.rest} aria-label="Break in minutes"
                     onChange={e => update({ rest: Math.max(5, Number(e.target.value) || 30) })}
                     style={{ ...INPUT, width: 84 }} />
              <span style={{ fontSize: 12.5, color: UI.faint }}>min</span>
            </Field>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px 22px', flexWrap: 'wrap' }}>
            <Toggle
              on={s.minChunk !== false}
              onChange={v => update({ minChunk: v })}
              label="Minimum chunk"
              hint={`Never split a task into less than ${MIN_CHUNK} minutes — break early instead`}
            />
            <Toggle
              on={s.ageUndated !== false}
              onChange={v => update({ ageUndated: v })}
              label="Age undated work"
              hint="Let work with no due date drift forward instead of sitting behind everything dated"
            />
            <Toggle
              on={s.holdMeetings !== false}
              onChange={v => update({ holdMeetings: v })}
              label="Hold meetings"
              hint={held.length
                ? 'Plan around what is already in today’s diary'
                : 'Plan around what is in the diary — nothing is in today’s'}
            />
          </div>

          <span style={{ fontSize: 12, color: UI.faint }}>Saved in this browser.</span>
        </div>
      )}

      {/* the day */}
      <div style={{ padding: '10px 12px 14px' }}>
        {badEnd ? (
          <p style={{ margin: 0, padding: '26px 8px', textAlign: 'center', fontSize: 13.5, color: UI.late }}>
            The day ends before it starts — check the hours above.
          </p>
        ) : slots.length === 0 ? (
          <p style={{ margin: 0, padding: '26px 8px', textAlign: 'center', fontSize: 13.5, color: UI.muted }}>
            {now === null ? 'Reading the clock…' : 'Nothing left to schedule today 🎉'}
          </p>
        ) : (
          slots.map((sl, i) => (
            <Row key={`${sl.from}-${i}`} slot={sl} now={now} onEstimate={saveEstimate} />
          ))
        )}

        {status && slots.length > 0 && (
          <div style={{
            marginTop: 12, padding: '11px 14px', borderRadius: 10,
            background: UI.soft, fontSize: 13.5, color: UI.muted,
          }}>
            {status.state === 'in' && status.slot && (
              <>Right now, {hhmm(now!)} — <strong style={{ color: UI.ink }}>{status.slot.name}</strong>
                {status.slot.kind === 'rest' ? '' : `, until ${hhmm(status.slot.to)}`}.</>
            )}
            {status.state === 'gap' && status.next && (
              <>It is {hhmm(now!)}. Next up at {hhmm(status.next.from)} —{' '}
                <strong style={{ color: UI.ink }}>{status.next.name}</strong>.</>
            )}
            {status.state === 'before' && (
              <>It is {hhmm(now!)}. Your day starts at {hhmm(s.dayStart)}.</>
            )}
            {status.state === 'after' && (
              <>It is {hhmm(now!)}. Your day ended at {hhmm(s.dayEnd)}.</>
            )}
            {status.state === 'empty' && <>Nothing else scheduled today.</>}
          </div>
        )}

        {saveError && (
          <p role="alert" style={{ margin: '8px 2px 0', fontSize: 12.5, color: UI.late }}>{saveError}</p>
        )}

        {assumed > 0 && (
          <p style={{ margin: '8px 2px 0', fontSize: 12, color: UI.faint }}>
            {assumed} of these have no estimate, so {ASSUMED_MINS} minutes was assumed —
            click a duration to set the real one.
          </p>
        )}
      </div>
    </div>
  )
}

function Row({ slot: sl, now, onEstimate }: {
  slot: Slot; now: number | null; onEstimate: (taskId: string, hours: number) => void
}) {
  const live = now !== null && now >= sl.from && now < sl.to
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  return (
    <div className="fx-slot" style={{
      display: 'grid', gridTemplateColumns: '104px minmax(0, 1fr) auto',
      gap: 12, alignItems: 'start', padding: '9px 10px', borderRadius: 10,
      background: live ? UI.now : sl.kind === 'rest' ? UI.restBg : 'transparent',
    }}>
      <span style={{
        fontFamily: 'var(--font-mono, ui-monospace), ui-monospace, monospace',
        fontSize: 12.5, fontVariantNumeric: 'tabular-nums',
        color: live ? UI.nowInk : UI.faint, paddingTop: 1,
      }}>
        {hhmm(sl.from)} – {hhmm(sl.to)}
      </span>

      <span style={{ minWidth: 0 }}>
        {sl.taskId ? (
          <Link href={`/board?task=${sl.taskId}`} style={{
            fontSize: 14, fontWeight: 600, textDecoration: 'none',
            color: live ? UI.nowInk : UI.ink,
          }}>
            {sl.name}
          </Link>
        ) : (
          <span style={{
            fontSize: 14, fontWeight: 600,
            color: live ? UI.nowInk : sl.kind === 'rest' ? UI.rest : UI.ink,
          }}>
            {sl.name}
          </span>
        )}
        {sl.late && <Tag bg={UI.lateBg} fg={UI.late}>overdue</Tag>}
        {sl.cont && <Tag bg={UI.contBg} fg={UI.cont}>cont.</Tag>}
        {sl.assumed && <Tag bg={UI.soft} fg={UI.faint}>no estimate</Tag>}
        {(sl.kind === 'held' || sl.due !== undefined) && (
          <span style={{
            display: 'block', marginTop: 2, fontSize: 12,
            color: live ? UI.nowInk : UI.faint,
          }}>
            {sl.kind === 'held'
              ? 'in the diary'
              : sl.due === null ? 'no date'
              : sl.due! < 0 ? `${Math.abs(sl.due!)} days past its date`
              : sl.due === 0 ? 'due today'
              : `due in ${sl.due} days`}
          </span>
        )}
      </span>

      {sl.taskId && editing ? (
        <input
          type="number" min={0.25} max={40} step={0.25} autoFocus
          value={draft}
          aria-label={`Estimate for ${sl.name} in hours`}
          onChange={e => setDraft(e.target.value)}
          onBlur={() => {
            setEditing(false)
            const v = parseFloat(draft)
            if (!isNaN(v) && v > 0) onEstimate(sl.taskId!, v)
          }}
          onKeyDown={e => {
            if (e.key === 'Enter')  e.currentTarget.blur()
            if (e.key === 'Escape') { setDraft(''); setEditing(false) }
          }}
          style={{
            width: 62, padding: '2px 6px', borderRadius: 6, border: `1px solid ${UI.line}`,
            background: '#fff', fontFamily: 'inherit', fontSize: 12.5, textAlign: 'right',
            outline: 'none', boxSizing: 'border-box',
          }}
        />
      ) : sl.taskId ? (
        <button
          type="button"
          onClick={() => { setDraft(String(((sl.to - sl.from) / 60).toFixed(2).replace(/\.?0+$/, ''))); setEditing(true) }}
          title={sl.assumed ? 'No estimate yet — click to set one' : 'Click to change the estimate'}
          style={{
            fontFamily: 'var(--font-mono, ui-monospace), ui-monospace, monospace',
            fontSize: 12.5, whiteSpace: 'nowrap', padding: '1px 5px', borderRadius: 6,
            border: 'none', background: 'transparent', cursor: 'pointer',
            color: live ? UI.nowInk : sl.assumed ? UI.faint : UI.muted,
            textDecoration: sl.assumed ? 'underline dotted' : 'none',
            textUnderlineOffset: 3,
          }}
          onMouseEnter={e => { e.currentTarget.style.background = live ? 'rgba(0,0,0,.06)' : UI.soft }}
          onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
        >
          {durLabel(sl.to - sl.from)}
        </button>
      ) : (
        <span style={{
          fontFamily: 'var(--font-mono, ui-monospace), ui-monospace, monospace',
          fontSize: 12.5, whiteSpace: 'nowrap', paddingTop: 1,
          color: live ? UI.nowInk : UI.muted,
        }}>
          {durLabel(sl.to - sl.from)}
        </span>
      )}
    </div>
  )
}

const Tag = ({ bg, fg, children }: { bg: string; fg: string; children: React.ReactNode }) => (
  <span style={{
    display: 'inline-block', marginInlineStart: 7, padding: '1px 6px', borderRadius: 5,
    background: bg, color: fg, fontSize: 10.5, fontWeight: 700, verticalAlign: 1,
  }}>
    {children}
  </span>
)

const Field = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
    <span style={{ fontSize: 12.5, color: UI.muted, whiteSpace: 'nowrap' }}>{label}</span>
    {children}
  </span>
)

/**
 * A switch, not a checkbox.
 *
 * Three of these decide how the day is laid out rather than what is in it, so
 * they read better as settings that are on than as boxes that are ticked.
 */
const Toggle = ({ on, onChange, label, hint }: {
  on: boolean
  onChange: (v: boolean) => void
  label: string
  hint: string
}) => (
  <button
    type="button"
    role="switch"
    aria-checked={on}
    title={hint}
    onClick={() => onChange(!on)}
    style={{
      display: 'inline-flex', alignItems: 'center', gap: 9, padding: 0,
      border: 'none', background: 'none', cursor: 'pointer', fontFamily: 'inherit',
    }}
  >
    <span aria-hidden="true" style={{
      width: 40, height: 22, borderRadius: 999, flexShrink: 0, position: 'relative',
      background: on ? UI.cont : '#D5D8DF', transition: 'background .15s ease',
    }}>
      <span style={{
        position: 'absolute', top: 3, insetInlineStart: on ? 21 : 3,
        width: 16, height: 16, borderRadius: '50%', background: '#fff',
        boxShadow: '0 1px 2px rgba(16,18,26,.25)', transition: 'inset-inline-start .15s ease',
      }} />
    </span>
    <span style={{ fontSize: 13, color: UI.ink, whiteSpace: 'nowrap' }}>{label}</span>
  </button>
)

const INPUT: React.CSSProperties = {
  width: 132, padding: '6px 9px', borderRadius: 8, border: `1px solid ${UI.line}`,
  background: '#fff', color: UI.ink, fontFamily: 'inherit', fontSize: 13,
  fontVariantNumeric: 'tabular-nums', outline: 'none', boxSizing: 'border-box',
}
