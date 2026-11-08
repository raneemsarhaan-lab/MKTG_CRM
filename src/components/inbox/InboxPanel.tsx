'use client'

/**
 * The Inbox panel (spec 006 FR-015–FR-019, contracts/inbox-ui.md §3).
 *
 * Two tabs: To do and Done. Mentions and the team's updates moved to the
 * notification bell (spec 012 R12, FR-080). Opens over the board on the
 * inline-end side, or beside it when pinned. Esc, ✕ or a click outside close
 * it (outside clicks only when not pinned), and focus goes back to the button.
 * Every row's main button opens the task; its actions sit after it.
 */
import { useEffect, useRef, useState, type ReactNode, type RefObject } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import type { InboxTab, Member, StageId } from '@/types/index'
import { STAGE_META } from '@/lib/stage-meta'
import { allowedStages, nextOnPath } from '@/lib/stage-moves'
import {
  ageOf, dateWords, nextMidnight, previousOnPath,
  type InboxModel, type InboxTask, type ReviewRow, type YourRow,
} from '@/lib/inbox'
import { StagePill } from '@/components/sheet/StatusCell'
import { PersonAvatar } from '@/components/sheet/PersonChip'
import type { InboxApi } from './types'

const TABS: InboxTab[] = ['todo', 'done']

interface Props {
  model: InboxModel
  me: Member
  members: Member[]
  now: Date
  api: InboxApi
  tab: InboxTab
  onTab(tab: InboxTab): void
  pinned: boolean
  onPin(): void
  onClose(): void
  /** The Inbox button: clicks on it are not "outside". */
  buttonRef: RefObject<HTMLButtonElement | null>
}

/** Who may set a due date: the board's edit rule (owner, assignee, admin, superuser). */
const canEdit = (t: InboxTask, me: Member) =>
  t.task_owner_id === me.id || t.assignee_id === me.id || me.access === 'admin' || me.access === 'superuser'

function Icon({ d, size = 15 }: { d: ReactNode; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"
         strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{d}</svg>
  )
}
const ICONS = {
  check: <path d="M20 6 9 17l-5-5" />,
  cal: <><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" /></>,
  bubble: <path d="M21 12a8 8 0 0 1-11.6 7.1L4 21l1.9-5.4A8 8 0 1 1 21 12z" />,
  clip: <path d="m21 11-8.5 8.5a5 5 0 0 1-7-7L14 4a3.5 3.5 0 0 1 5 5l-8.5 8.5a2 2 0 0 1-3-3L15 7" />,
  arrow: <path d="M5 12h14M13 6l6 6-6 6" />,
  pin: <><path d="M12 17v5" /><path d="M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1z" /></>,
  x: <path d="M18 6 6 18M6 6l12 12" />,
}

/** A row's main button: opens the task, at the comment when there is one (FR-019, FR-042). */
function Main({ task, children, commentId, open }: {
  task: InboxTask; children: ReactNode; commentId?: string
  open: InboxApi['openTask']
}) {
  return (
    <button type="button" className="fx-inbox-main" onClick={() => open(task.id, commentId ? { commentId } : undefined)}>
      {children}
    </button>
  )
}

export function InboxPanel(p: Props) {
  const t = useTranslations('inbox')
  const locale = useLocale()
  const ref = useRef<HTMLElement>(null)
  const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({})
  const c = p.model.counts

  // Per-row UI: which row's note or date editor is open, drafts, errors, busy.
  const [noteFor, setNoteFor] = useState<string | null>(null)
  const [note, setNote] = useState('')
  const [dateFor, setDateFor] = useState<string | null>(null)
  const [date, setDate] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState<Record<string, boolean>>({})

  // Unpinned, the panel opens just under the Inbox button, so the button stays
  // in view (it shows the open state and closes the panel again).
  const [top, setTop] = useState<number | null>(null)
  useEffect(() => {
    if (p.pinned) { setTop(null); return }
    const place = () => {
      const r = p.buttonRef.current?.getBoundingClientRect()
      setTop(r && r.bottom > 0 ? Math.round(r.bottom + 10) : 16)
    }
    place()
    window.addEventListener('resize', place)
    window.addEventListener('scroll', place, { passive: true })
    return () => { window.removeEventListener('resize', place); window.removeEventListener('scroll', place) }
  }, [p.pinned, p.buttonRef])

  // Focus the selected tab on open, as the design does.
  useEffect(() => {
    requestAnimationFrame(() => tabRefs.current[p.tab]?.focus())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Esc closes; a click outside closes unless pinned (FR-018, FR-060).
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== 'Escape' || p.pinned) return
      // A celebration or the task panel over the board takes Esc first.
      if (document.querySelector('[aria-modal="true"]')) return
      e.preventDefault()
      p.onClose()
    }
    function onDown(e: MouseEvent) {
      if (p.pinned || document.querySelector('[aria-modal="true"]')) return
      const tgt = e.target as Node
      if (ref.current?.contains(tgt) || p.buttonRef.current?.contains(tgt)) return
      p.onClose()
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('mousedown', onDown)
    return () => { document.removeEventListener('keydown', onKey); document.removeEventListener('mousedown', onDown) }
  }, [p])

  const stageName = (s: StageId) => (locale === 'ar' ? STAGE_META[s]?.label_ar : STAGE_META[s]?.label_en) ?? s
  const memberName = (id?: string | null) => p.members.find(m => m.id === id)?.name ?? ''
  const first = (name: string) => name.split(' ')[0]

  function whenText(at: string, dateOnly: boolean): string {
    if (dateOnly) {
      const w = dateWords(at, p.now)
      return 'word' in w ? t(`when.${w.word}`) : t('when.days', { n: w.days })
    }
    const a = ageOf(at, p.now)
    return a.unit === 'now' ? t('when.now') : t(`when.${a.unit}`, { n: a.n })
  }

  /** Run a row action: busy while it runs, a message under the row if it fails (FR-029). */
  async function act(key: string, run: () => Promise<{ success: boolean; error?: string }>) {
    setBusy(b => ({ ...b, [key]: true }))
    setErrors(e => { const n = { ...e }; delete n[key]; return n })
    let res: { success: boolean; error?: string }
    try { res = await run() } catch { res = { success: false, error: 'generic' } }
    setBusy(b => { const n = { ...b }; delete n[key]; return n })
    if (!res.success) {
      const msg = res.error === 'not_authorized' ? t('errors.denied')
        : res.error === 'not_found' || res.error === 'dropped' || res.error === 'moved' ? t('errors.moved')
        : t('errors.generic')
      setErrors(e => ({ ...e, [key]: msg }))
    }
    return res.success
  }

  const move = (row: ReviewRow | YourRow, to: StageId | null) =>
    to ? act(`t:${row.task.id}`, () => p.api.move(row.task.id, to)) : Promise.resolve(false)

  async function sendBack(row: ReviewRow) {
    const to = previousOnPath(row.task)
    const text = note.trim()
    const ok = await move(row, to)
    if (!ok) return
    setNoteFor(null); setNote('')
    if (text) {
      const owner = p.members.find(m => m.id === row.task.task_owner_id)
      const body = owner ? `@${first(owner.name)} ${text}` : text
      await act(`t:${row.task.id}`, () => p.api.comment(row.task.id, body, owner ? [owner.id] : []))
    }
  }

  async function saveDate(row: YourRow) {
    if (!date) return
    const ok = await act(`t:${row.task.id}`, () => p.api.setDate(row.task.id, date))
    if (ok) { setDateFor(null); setDate('') }
  }

  function onTabKey(e: React.KeyboardEvent, i: number) {
    const go = (j: number) => { e.preventDefault(); const next = TABS[(j + TABS.length) % TABS.length]; p.onTab(next); tabRefs.current[next]?.focus() }
    const rtl = getComputedStyle(e.currentTarget).direction === 'rtl'
    if (e.key === (rtl ? 'ArrowLeft' : 'ArrowRight')) go(i + 1)
    else if (e.key === (rtl ? 'ArrowRight' : 'ArrowLeft')) go(i - 1)
    else if (e.key === 'Home') go(0)
    else if (e.key === 'End') go(TABS.length - 1)
  }

  const errorOf = (key: string) => errors[key] ? <p className="fx-inbox-err" role="alert">{errors[key]}</p> : null

  // ── rows ──────────────────────────────────────────────────────────────────

  function reviewRow(r: ReviewRow) {
    const key = `t:${r.task.id}`
    const moves = allowedStages(r.task, p.me)
    const next = nextOnPath(r.task)
    const prev = previousOnPath(r.task)
    const owner = p.members.find(m => m.id === r.task.task_owner_id)
    return (
      <div key={key} role="group" aria-label={r.task.name} className="fx-inbox-row" data-row={`review:${r.task.id}`} aria-busy={busy[key] || undefined}>
        <Main open={p.api.openTask} task={r.task}>
          <span className="fx-inbox-ic is-review"><Icon d={ICONS.check} /></span>
          <span className="fx-inbox-body">
            <span className="fx-inbox-name">{r.task.name}</span>
            <span className="fx-inbox-meta">
              <StagePill stage={r.task.status} name={stageName(r.task.status)} />
              {r.sla && <span className="fx-inbox-chip is-today">{t(`row.${r.sla === 'At Risk' ? 'atRisk' : r.sla === 'Will Miss' ? 'willMiss' : 'stuck'}`)}</span>}
              <span className="fx-inbox-why">{r.waitingDays === 0 ? t('row.arrivedToday') : t('row.waiting', { n: r.waitingDays })}</span>
              {r.dueDays !== null && (
                <span className={r.dueDays < 0 ? 'fx-inbox-late' : r.dueDays === 0 ? 'fx-inbox-today' : undefined}>
                  · {r.dueDays < 0 ? t('row.late', { n: -r.dueDays }) : r.dueDays === 0 ? t('row.dueToday') : t('row.dueIn', { n: r.dueDays })}
                </span>
              )}
            </span>
          </span>
        </Main>
        {(next && moves.includes(next)) || (prev && moves.includes(prev)) ? (
          noteFor === r.task.id ? (
            <div className="fx-inbox-acts">
              <input className="fx-inbox-input" value={note} onChange={e => setNote(e.target.value)} autoFocus
                     placeholder={t('actions.note', { name: owner ? first(owner.name) : '' })}
                     aria-label={t('actions.note', { name: owner ? first(owner.name) : '' })}
                     onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); void sendBack(r) } if (e.key === 'Escape') { e.stopPropagation(); e.preventDefault(); setNoteFor(null) } }} />
              <button type="button" className="fx-inbox-act is-go" disabled={busy[key]} onClick={() => void sendBack(r)}>{t('actions.sendBack')}</button>
              <button type="button" className="fx-inbox-act" onClick={() => { setNoteFor(null); setNote('') }}>{t('actions.cancel')}</button>
            </div>
          ) : (
            <div className="fx-inbox-acts">
              {next && moves.includes(next) && <button type="button" className="fx-inbox-act is-go" disabled={busy[key]} data-act="approve" onClick={() => void move(r, next)}>{t('actions.approve')}</button>}
              {prev && moves.includes(prev) && <button type="button" className="fx-inbox-act" disabled={busy[key]} data-act="sendBack" onClick={() => { setNoteFor(r.task.id); setNote('') }}>{t('actions.sendBack')}</button>}
            </div>
          )
        ) : null}
        {errorOf(key)}
      </div>
    )
  }

  function yourRow(r: YourRow) {
    const key = `t:${r.task.id}`
    const next = nextOnPath(r.task)
    const mayMove = !!next && allowedStages(r.task, p.me).includes(next)
    const mayDate = canEdit(r.task, p.me)
    return (
      <div key={key} role="group" aria-label={r.task.name} className="fx-inbox-row" data-row={`yours:${r.task.id}`} aria-busy={busy[key] || undefined}>
        <Main open={p.api.openTask} task={r.task}>
          <span className={`fx-inbox-ic is-${r.reason}`}><Icon d={ICONS.cal} /></span>
          <span className="fx-inbox-body">
            <span className="fx-inbox-name">{r.task.name}</span>
            <span className="fx-inbox-meta">
              <StagePill stage={r.task.status} name={stageName(r.task.status)} />
              <span className={`fx-inbox-why${r.reason === 'late' ? ' fx-inbox-late' : r.reason === 'today' ? ' fx-inbox-today' : ''}`}>
                {r.reason === 'late' ? t('row.late', { n: r.days }) : r.reason === 'today' ? t('row.dueToday') : t('row.undated')}
              </span>
            </span>
          </span>
        </Main>
        {dateFor === r.task.id ? (
          <div className="fx-inbox-acts">
            <input type="date" className="fx-inbox-input is-date" value={date} onChange={e => setDate(e.target.value)} autoFocus
                   aria-label={t('actions.dueDate', { name: r.task.name })}
                   onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); void saveDate(r) } if (e.key === 'Escape') { e.stopPropagation(); e.preventDefault(); setDateFor(null) } }} />
            <button type="button" className="fx-inbox-act is-go" disabled={!date || busy[key]} onClick={() => void saveDate(r)}>{t('actions.save')}</button>
            <button type="button" className="fx-inbox-act" onClick={() => setDateFor(null)}>{t('actions.cancel')}</button>
          </div>
        ) : (
          <div className="fx-inbox-acts">
            {mayDate && <button type="button" className="fx-inbox-act" data-act="setDate" disabled={busy[key]}
                                onClick={() => { setDateFor(r.task.id); setDate(r.task.due_date?.slice(0, 10) ?? '') }}>{t('actions.setDate')}</button>}
            {mayMove && <button type="button" className="fx-inbox-act is-go" data-act="moveOn" disabled={busy[key]} onClick={() => void move(r, next)}>{t('actions.moveOn')}</button>}
            <button type="button" className="fx-inbox-act" data-act="tomorrow" disabled={busy[key]}
                    onClick={() => void act(key, () => p.api.snooze(r.task.id, nextMidnight(p.now).toISOString()))}>{t('actions.tomorrow')}</button>
          </div>
        )}
        {errorOf(key)}
      </div>
    )
  }

  // ── tabs ──────────────────────────────────────────────────────────────────

  function todoBody() {
    const m = p.model
    if (!m.reviews.length && !m.yours.length && !m.snoozed.length) return <p className="fx-inbox-empty">{t('empty.todo')}</p>
    return (
      <>
        {m.reviews.length > 0 && <h4 className="fx-inbox-group">{t('groups.reviews', { n: m.reviews.length })}</h4>}
        {m.reviews.map(reviewRow)}
        {m.yours.length > 0 && <h4 className="fx-inbox-group">{t('groups.yours', { n: m.yours.length })}</h4>}
        {m.yours.map(yourRow)}
        {m.snoozed.length > 0 && (
          <p className="fx-inbox-group is-line" data-inbox-snoozed="">
            {t('groups.snoozed', { n: m.snoozed.length })} ·{' '}
            <button type="button" className="fx-inbox-link" disabled={busy.unsnooze}
                    onClick={() => void act('unsnooze', () => p.api.unsnooze(m.snoozed))}>{t('groups.bringBack')}</button>
          </p>
        )}
        {errorOf('unsnooze')}
      </>
    )
  }

  function doneBody() {
    const d = p.model.done
    return (
      <>
        {d.week.length === 0 && <p className="fx-inbox-empty">{t('done.emptyWeek')}</p>}
        {d.week.map(r => (
          <div key={r.task.id} className="fx-inbox-row" data-row={`done:${r.task.id}`}>
            <Main open={p.api.openTask} task={r.task}>
              <span className="fx-inbox-ic is-done"><Icon d={ICONS.check} /></span>
              <span className="fx-inbox-body">
                <span className="fx-inbox-name">{r.task.name}</span>
                <span className="fx-inbox-meta">{t('done.published', { when: whenText(r.at, true) })}</span>
              </span>
            </Main>
          </div>
        ))}
        <p className="fx-inbox-total" data-inbox-total="">{t('done.total', { n: d.total })}</p>
      </>
    )
  }

  const body = p.tab === 'done' ? doneBody() : todoBody()

  const tabCount = (tab: InboxTab) =>
    tab === 'todo' ? <span className="fx-inbox-cnt">{c.todo}</span>
    : tab === 'done' ? <span className="fx-inbox-cnt">{p.model.done.week.length}</span>
    : null

  return (
    <section ref={ref} id="fx-inbox-panel" className={`fx-inbox-panel${p.pinned ? ' is-pinned' : ''}`}
             style={top !== null ? ({ '--inbox-top': `${top}px` } as React.CSSProperties) : undefined}
             role="dialog" aria-label={t('panel.title')} data-inbox-panel="" data-pinned={p.pinned || undefined}>
      <div className="fx-inbox-head">
        <div>
          <h3>{t('panel.title')}</h3>
          <p data-inbox-counts="">{c.total ? t('summary.todo', { n: c.todo }) : t('panel.allClear')}</p>
        </div>
        <div className="fx-inbox-tools">
          <button type="button" className="fx-inbox-icon" aria-pressed={p.pinned} data-inbox-pin=""
                  aria-label={p.pinned ? t('panel.unpin') : t('panel.pin')} title={p.pinned ? t('panel.unpin') : t('panel.pin')}
                  onClick={p.onPin}><Icon d={ICONS.pin} size={16} /></button>
          <button type="button" className="fx-inbox-icon" aria-label={t('panel.close')} title={t('panel.close')} data-inbox-close=""
                  onClick={p.onClose}><Icon d={ICONS.x} size={18} /></button>
        </div>
      </div>
      <div className="fx-inbox-tabs" role="tablist" aria-label={t('tabs.label')}>
        {TABS.map((tab, i) => (
          <button key={tab} ref={el => { tabRefs.current[tab] = el }} type="button" role="tab" id={`fx-inbox-tab-${tab}`}
                  aria-selected={p.tab === tab} aria-controls="fx-inbox-tabpanel" tabIndex={p.tab === tab ? 0 : -1}
                  className="fx-inbox-tab" data-tab={tab} onClick={() => p.onTab(tab)} onKeyDown={e => onTabKey(e, i)}>
            {t(`tabs.${tab}`)} {tabCount(tab)}
          </button>
        ))}
      </div>
      <div className="fx-inbox-scroll" role="tabpanel" id="fx-inbox-tabpanel" aria-labelledby={`fx-inbox-tab-${p.tab}`} tabIndex={0}>
        {body}
      </div>
    </section>
  )
}
