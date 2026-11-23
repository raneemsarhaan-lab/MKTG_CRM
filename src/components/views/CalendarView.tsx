'use client'

/**
 * Calendar view (spec 021 FR-014, design/teams-brands.html): one continuous
 * calendar, as a regular calendar is. Every task with a due date sits on its
 * day, past and future; finished work stays, marked ✓. Back and forward
 * through any month or week; Today returns. Dragging a task to a day sets its
 * due date (with Undo). Campaigns are a filter, not separate calendars.
 * Month or week is a per-device preference (`momentum.calendar.mode`).
 */
import { useEffect, useMemo, useState, useTransition } from 'react'
import { cairoToday, formatDay, isOverdue } from '@/lib/due-dates'
import { useRouter } from 'next/navigation'
import { useLocale, useTranslations } from 'next-intl'
import type { Brand, Milestone } from '@/types/index'
import { addMilestone, deleteMilestone, updateMilestone } from '@/actions/milestones'
import { updateTask } from '@/actions/tasks'
import { STAGE_COLORS } from '@/lib/tokens'
import { PIPE } from '@/lib/pipeline-tokens'
import { dayOf, isoOf, monthGrid, moveMonth, moveWeek, weekGrid } from '@/lib/calendar'
import type { ViewTask } from './types'
import { useCalendarLink, type MediaTaskLike } from '@/components/media/MediaLinks'

const BY_KEY = 'momentum.calendar.by'
const MODE_KEY = 'momentum.calendar.mode'
const done = (t: ViewTask) => t.status === 'publish'

export function CalendarView({ tasks, brands, colorBy = 'brand', campaigns = [], statusName, onOpen, defaultBy = 'due', link, milestones }: {
  /** Spec 023 (R6): brands' calendar markers — not tasks. Admins and superusers add, rename, move and delete. */
  milestones?: { list: Milestone[]; brandIds: string[]; canEdit: boolean }
  /** Spec 022 (R19): Link task on a day — on content Spaces' calendars. */
  link?: { spaceId: string; media: MediaTaskLike[] }
  /** Which date places a task on a day until the person picks: a brand's Calendar starts on publishing dates. */
  defaultBy?: 'publish' | 'due'
  tasks: ViewTask[]
  brands: Brand[]
  colorBy?: 'brand' | 'stage'
  /** Projects to filter by (a brand's campaigns). */
  campaigns?: { id: string; name: string }[]
  /** Spec 021 (US3): a task's status in the Space's words, added to a chip's tooltip. */
  statusName?: (x: ViewTask) => string
  onOpen: (id: string) => void
}) {
  const t = useTranslations('calendar')
  const locale = useLocale()
  const router = useRouter()
  const [, start] = useTransition()
  const today = cairoToday()
  const [mode, setMode] = useState<'month' | 'week'>('month')
  const [ym, setYm] = useState(() => ({ year: new Date().getFullYear(), month: new Date().getMonth() }))
  const [anchor, setAnchor] = useState(today)
  const [campaign, setCampaign] = useState<string>('all')
  const [moved, setMoved] = useState<Record<string, string | null>>({})
  const [toast, setToast] = useState<{ text: string; undo?: () => void } | null>(null)
  const [over, setOver] = useState<string | null>(null)
  // The No date panel (user, 2026-11-22): undated tasks beside the calendar, to drag onto a day.
  const [find, setFind] = useState('')
  const [showDone, setShowDone] = useState(false)
  // Publishing date or due date: both are on every task, labelled; the person picks which places it.
  const [by, setBy] = useState<'publish' | 'due'>(defaultBy)
  const tDates = useTranslations('dates')
  const tMedia = useTranslations('media')
  const tm = useTranslations('milestones')
  // Spec 023: milestones shown on their day (optimistic copy while saving).
  const [marks, setMarks] = useState<Milestone[]>(milestones?.list ?? [])
  useEffect(() => { setMarks(milestones?.list ?? []) }, [milestones?.list])
  const [markPop, setMarkPop] = useState<{ day: string; edit?: Milestone; at: DOMRect } | null>(null)
  const marksOn = (iso: string) => marks.filter(m => m.day === iso && (milestones?.brandIds ?? []).includes(m.brand_id))
  const cal = useCalendarLink({ spaceId: link?.spaceId ?? null, media: link?.media ?? [], say: text => setToast({ text }) })

  useEffect(() => {
    try { const v = window.localStorage.getItem(MODE_KEY); if (v === 'week' || v === 'month') setMode(v) } catch { /* preference */ }
    try { const b = window.localStorage.getItem(`${BY_KEY}.${defaultBy}`); if (b === 'publish' || b === 'due') setBy(b) } catch { /* preference */ }
  }, [defaultBy])
  function chooseBy(b: 'publish' | 'due') {
    setBy(b); setMoved({})
    try { window.localStorage.setItem(`${BY_KEY}.${defaultBy}`, b) } catch { /* preference */ }
  }
  function chooseMode(m: 'month' | 'week') {
    setMode(m)
    try { window.localStorage.setItem(MODE_KEY, m) } catch { /* preference */ }
  }

  const brandOf = useMemo(() => new Map(brands.map(b => [b.id, b])), [brands])
  const live = tasks.filter(x => !x.dropped_at && (campaign === 'all' || x.project_id === campaign))
  const field = by === 'publish' ? 'publish_date' : 'due_date'
  const dueOf = (x: ViewTask) => (x.id in moved ? moved[x.id] : x[field] ? x[field]!.slice(0, 10) : null)
  const byDay = useMemo(() => {
    const m = new Map<string, ViewTask[]>()
    for (const x of live) { const d = dueOf(x); if (d) m.set(d, [...(m.get(d) ?? []), x]) }
    // A steady order inside a day, so chips don't shuffle under the pointer after a save.
    for (const list of m.values()) list.sort((a, b) => a.name.localeCompare(b.name))
    return m
  }, [live, moved]) // eslint-disable-line react-hooks/exhaustive-deps
  const undatedAll = live.filter(x => !dueOf(x))
  const undatedDone = undatedAll.filter(done).length
  const undated = undatedAll
    .filter(x => showDone || !done(x))
    .filter(x => !find.trim() || x.name.toLowerCase().includes(find.trim().toLowerCase()))

  const days = mode === 'month' ? monthGrid(ym.year, ym.month) : weekGrid(anchor)
  const heading = mode === 'month'
    ? new Date(ym.year, ym.month, 1).toLocaleDateString(locale, { month: 'long', year: 'numeric' })
    : `${dayOf(days[0].iso).toLocaleDateString(locale, { day: 'numeric', month: 'short' })} – ${dayOf(days[6].iso).toLocaleDateString(locale, { day: 'numeric', month: 'short', year: 'numeric' })}`
  const color = (x: ViewTask) => (colorBy === 'brand' ? brandOf.get(x.brand_id)?.color ?? PIPE.textFaint : STAGE_COLORS[x.status] ?? PIPE.textFaint)

  function step(by: number) {
    if (mode === 'month') setYm(v => moveMonth(v.year, v.month, by))
    else setAnchor(a => moveWeek(a, by))
  }
  function goToday() { const n = new Date(); setYm({ year: n.getFullYear(), month: n.getMonth() }); setAnchor(today) }

  /** A day's date, or null to clear it (dropped on the No date panel). */
  function drop(taskId: string, iso: string | null) {
    const task = tasks.find(x => x.id === taskId)
    if (!task) return
    const before = dueOf(task)
    if (before === iso) return
    setMoved(m => ({ ...m, [taskId]: iso }))
    start(async () => {
      const res = await updateTask(taskId, { [field]: iso }).catch(() => ({ success: false }))
      if (!res.success) { setMoved(m => { const n = { ...m }; delete n[taskId]; return n }); return }
      router.refresh()
      const label = iso ? dayOf(iso).toLocaleDateString(locale, { day: 'numeric', month: 'short' }) : ''
      setToast({
        text: iso ? t(by === 'publish' ? 'movedPublish' : 'moved', { name: task.name, date: label }) : t('cleared', { name: task.name }),
        undo: () => start(async () => {
          setMoved(m => ({ ...m, [taskId]: before }))
          await updateTask(taskId, { [field]: before ?? null })
          router.refresh()
          setToast(null)
        }),
      })
    })
  }

  const dow = Array.from({ length: 7 }, (_, i) => new Date(2026, 10, 16 + i).toLocaleDateString(locale, { weekday: 'short' }))
  const chip = (x: ViewTask) => (
    <button key={x.id} type="button" draggable data-cal-task={x.id}
      onDragStart={e => e.dataTransfer.setData('text/plain', x.id)}
      onClick={() => onOpen(x.id)}
      data-overdue={isOverdue(x) ? 'true' : undefined}
      title={[x.name, statusName?.(x), x.publish_date ? `${tDates('publishShort')} ${formatDay(x.publish_date, locale)}` : '', x.due_date ? `${tDates('dueShort')} ${formatDay(x.due_date, locale)}${x.due_manual ? ' ✎' : ''}` : ''].filter(Boolean).join(' · ')}
      style={{ display: 'block', width: '100%', textAlign: 'start', border: 'none', cursor: 'grab', fontFamily: 'inherit',
        fontSize: 11.5, fontWeight: 600, padding: '3px 6px', borderRadius: 7, color: PIPE.ink, opacity: done(x) ? 0.62 : 1,
        background: `color-mix(in srgb, ${color(x)} 18%, #FFFFFF)`, borderInlineStart: `3px solid ${color(x)}`,
        ...(isOverdue(x) ? { boxShadow: 'inset 0 0 0 1px #D22040' } : {}),
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
      {done(x) ? '✓ ' : ''}{x.name}
    </button>
  )
  const btn: React.CSSProperties = { border: `1px solid ${PIPE.border}`, background: '#FFFFFF', borderRadius: 9, padding: '5px 10px', fontFamily: 'inherit', fontSize: 13, fontWeight: 600, cursor: 'pointer', color: PIPE.ink }

  return (
    <div data-calendar-view style={{ padding: '14px 26px 30px 38px', display: 'grid', gap: 12 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
        <button type="button" style={btn} aria-label={t('prev')} data-cal="prev" onClick={() => step(-1)}>‹</button>
        <span data-cal-heading style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 16, minWidth: 150, textAlign: 'center', color: PIPE.ink }}>{heading}</span>
        <button type="button" style={btn} aria-label={t('next')} data-cal="next" onClick={() => step(1)}>›</button>
        <button type="button" style={btn} data-cal="today" onClick={goToday}>{t('today')}</button>
        <div role="group" style={{ display: 'inline-flex', border: `1px solid ${PIPE.border}`, borderRadius: 9, overflow: 'hidden' }}>
          {(['month', 'week'] as const).map(m => (
            <button key={m} type="button" data-cal-mode={m} aria-pressed={mode === m} onClick={() => chooseMode(m)}
              style={{ border: 'none', padding: '5px 10px', fontFamily: 'inherit', fontSize: 12.5, fontWeight: 600, cursor: 'pointer', background: mode === m ? PIPE.ink : '#FFFFFF', color: mode === m ? '#FFFFFF' : PIPE.ink }}>
              {t(m)}
            </button>
          ))}
        </div>
        <div role="group" aria-label={t('by')} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: PIPE.textMuted }}>
          {t('by')}
          <span style={{ display: 'inline-flex', border: `1px solid ${PIPE.border}`, borderRadius: 9, overflow: 'hidden' }}>
            {(['publish', 'due'] as const).map(b => (
              <button key={b} type="button" data-cal-by={b} aria-pressed={by === b} onClick={() => chooseBy(b)}
                style={{ border: 'none', padding: '5px 10px', fontFamily: 'inherit', fontSize: 12.5, fontWeight: 600, cursor: 'pointer', background: by === b ? PIPE.ink : '#FFFFFF', color: by === b ? '#FFFFFF' : PIPE.ink }}>
                {t(b === 'publish' ? 'byPublish' : 'byDue')}
              </button>
            ))}
          </span>
        </div>
        {campaigns.length > 0 && (
          <label style={{ display: 'inline-flex', gap: 6, alignItems: 'center', fontSize: 12.5, color: PIPE.textMuted }}>
            {t('campaign')}
            <select data-cal-campaign value={campaign} onChange={e => setCampaign(e.target.value)} style={{ ...btn, fontWeight: 500 }}>
              <option value="all">{t('all')}</option>
              {campaigns.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </label>
        )}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, alignItems: 'flex-start' }}>
      <div style={{ overflowX: 'auto', flex: '1 1 640px', minWidth: 0 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(110px, 1fr))', minWidth: 770, border: `1px solid ${PIPE.border}`, borderRadius: 12, overflow: 'hidden' }}>
          {dow.map((d, i) => <div key={i} style={{ fontSize: 11, fontWeight: 700, color: PIPE.textMuted, padding: '6px 8px', background: PIPE.surface, borderBottom: `1px solid ${PIPE.border}`, textTransform: 'uppercase', letterSpacing: '.06em' }}>{d}</div>)}
          {days.map((d, i) => (
            <div key={d.iso} data-day={d.iso} className="fx-cal-day"
              tabIndex={link ? 0 : undefined}
              onKeyDown={link ? e => {
                if (e.target !== e.currentTarget) return
                if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) { e.preventDefault(); cal.open(d.iso, e.currentTarget, e.key) }
                else if (e.key === 'Enter') { e.preventDefault(); cal.open(d.iso, e.currentTarget) }
              } : undefined}
              onDragOver={e => { e.preventDefault(); setOver(d.iso) }}
              onDragLeave={() => setOver(o => (o === d.iso ? null : o))}
              onDrop={e => { e.preventDefault(); setOver(null); drop(e.dataTransfer.getData('text/plain'), d.iso) }}
              style={{ minHeight: mode === 'week' ? 240 : 96, padding: 5, display: 'flex', flexDirection: 'column', gap: 4,
                borderInlineEnd: (i + 1) % 7 ? `1px solid ${PIPE.border}` : 'none', borderBottom: `1px solid ${PIPE.border}`,
                background: over === d.iso ? '#F4FBD6' : d.inMonth ? '#FFFFFF' : PIPE.surface }}>
              <span style={{ fontSize: 11, alignSelf: 'flex-start', padding: d.iso === today ? '0 5px' : 0, borderRadius: 6,
                background: d.iso === today ? '#C8F24E' : 'transparent', fontWeight: d.iso === today ? 800 : 500,
                color: d.inMonth ? PIPE.textSecondary : PIPE.textMuted, fontVariantNumeric: 'tabular-nums' }}>
                {d.day === 1 ? dayOf(d.iso).toLocaleDateString(locale, { day: 'numeric', month: 'short' }) : d.day}
              </span>
              {marksOn(d.iso).map(m => (
                <button key={m.id} type="button" data-milestone={m.id} draggable={false}
                  title={`${tm('flag')}: ${m.name} · ${brandOf.get(m.brand_id)?.name ?? ''}`}
                  onClick={e => { if (milestones?.canEdit) setMarkPop({ day: d.iso, edit: m, at: e.currentTarget.getBoundingClientRect() }) }}
                  style={{ display: 'flex', alignItems: 'center', gap: 4, width: '100%', border: 'none', cursor: milestones?.canEdit ? 'pointer' : 'default', fontFamily: 'inherit',
                    fontSize: 11.5, fontWeight: 800, padding: '3px 6px', borderRadius: 7, color: '#7A2E0E', background: '#FFF1E3', textAlign: 'start',
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  <span aria-hidden="true" style={{ color: brandOf.get(m.brand_id)?.color ?? '#E8772E' }}>⚑</span>{m.name}
                </button>
              ))}
              {(byDay.get(d.iso) ?? []).map(chip)}
              {milestones?.canEdit && milestones.brandIds.length > 0 && (
                <button type="button" className="fx-cal-mark" data-milestone-add={d.iso} aria-label={`${tm('add')} · ${d.iso}`}
                  onClick={e => setMarkPop({ day: d.iso, at: e.currentTarget.getBoundingClientRect() })}
                  style={{ alignSelf: 'flex-start', border: 'none', background: 'transparent', color: PIPE.textMuted, fontFamily: 'inherit', fontSize: 11, fontWeight: 600, cursor: 'pointer', padding: '1px 4px', borderRadius: 6 }}>
                  ⚑ ＋
                </button>
              )}
              {link && (
                <button type="button" className="fx-cal-link" data-cal-link={d.iso} aria-label={`${tMedia('linkTask')} · ${d.iso}`}
                  onClick={e => cal.open(d.iso, e.currentTarget.parentElement as HTMLElement)}
                  style={{ marginTop: 'auto', alignSelf: 'flex-start', border: 'none', background: 'transparent', color: PIPE.textSecondary, fontFamily: 'inherit', fontSize: 11, fontWeight: 600, cursor: 'pointer', padding: '1px 4px', borderRadius: 6 }}>
                  ＋ {tMedia('linkTask')}
                </button>
              )}
            </div>
          ))}
        </div>
      </div>
      <aside data-cal-undated aria-label={t('noDate')}
        onDragOver={e => { e.preventDefault(); setOver('none') }}
        onDragLeave={() => setOver(o => (o === 'none' ? null : o))}
        onDrop={e => { e.preventDefault(); setOver(null); drop(e.dataTransfer.getData('text/plain'), null) }}
        style={{ flex: '0 1 260px', minWidth: 220, position: 'sticky', top: 12, display: 'flex', flexDirection: 'column', gap: 8,
          border: `1px ${over === 'none' ? 'dashed' : 'solid'} ${over === 'none' ? '#9DBF35' : PIPE.border}`, borderRadius: 12, padding: 10,
          background: over === 'none' ? '#F4FBD6' : PIPE.surface, maxHeight: 'calc(100vh - 40px)' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
          <h3 style={{ margin: 0, fontSize: 13, fontWeight: 800, color: PIPE.ink }}>{t('noDate')}</h3>
          <span style={{ fontSize: 12, color: PIPE.textMuted }}>{undatedAll.length - (showDone ? 0 : undatedDone)}</span>
        </div>
        <input type="search" data-cal-find value={find} onChange={e => setFind(e.target.value)} placeholder={t('find')} aria-label={t('find')}
          style={{ border: `1px solid ${PIPE.border}`, borderRadius: 8, padding: '6px 9px', fontFamily: 'inherit', fontSize: 12.5, background: '#FFFFFF' }} />
        {undatedDone > 0 && (
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: PIPE.textMuted, cursor: 'pointer' }}>
            <input type="checkbox" data-cal-show-done checked={showDone} onChange={e => setShowDone(e.target.checked)} />
            {t('showDone', { n: undatedDone })}
          </label>
        )}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, overflowY: 'auto', minHeight: 0 }}>
          {undated.map(x => <span key={x.id} data-undated-task={x.id}>{chip(x)}</span>)}
          {!undated.length && <p style={{ margin: 0, fontSize: 12, color: PIPE.textMuted }}>{undatedAll.length ? t('noMatch') : t('allDated')}</p>}
        </div>
        <p style={{ margin: 0, fontSize: 11.5, color: PIPE.textMuted }}>{t('dragHint')}</p>
      </aside>
      </div>
      <p style={{ margin: 0, fontSize: 12, color: PIPE.textMuted }}>{t('note')}</p>
      {cal.layer}
      <style>{`.fx-cal-mark{opacity:0;transition:opacity .12s}.fx-cal-day:hover .fx-cal-mark,.fx-cal-mark:focus-visible{opacity:1}@media (hover:none){.fx-cal-mark{opacity:1}}`}</style>
      {markPop && milestones && (
        <MilestonePopover pop={markPop} brands={brands.filter(b => milestones.brandIds.includes(b.id))} onClose={() => setMarkPop(null)}
          onSave={async (name, day, brandId) => {
            const edit = markPop.edit
            setMarkPop(null)
            if (edit) {
              setMarks(ms => ms.map(m => (m.id === edit.id ? { ...m, name, day } : m)))
              const r = await updateMilestone(edit.id, { name, day })
              if (!r.success) { setMarks(milestones.list); setToast({ text: tm('failed') }); return }
            } else {
              const r = await addMilestone({ brand_id: brandId, name, day })
              if (!r.success) { setToast({ text: tm('failed') }); return }
              setMarks(ms => [...ms, r.milestone])
            }
            router.refresh()
          }}
          onDelete={markPop.edit ? async () => {
            const gone = markPop.edit!
            setMarkPop(null)
            setMarks(ms => ms.filter(m => m.id !== gone.id))
            const r = await deleteMilestone(gone.id)
            if (!r.success) { setMarks(milestones.list); setToast({ text: tm('failed') }); return }
            setToast({ text: tm('deleted', { name: gone.name }), undo: () => void addMilestone({ brand_id: gone.brand_id, name: gone.name, day: gone.day }).then(r2 => { if (r2.success) { setMarks(ms => [...ms, r2.milestone]); router.refresh() }; setToast(null) }) })
            router.refresh()
          } : undefined} />
      )}
      {toast && (
        <div role="status" style={{ position: 'fixed', bottom: 22, insetInlineStart: '50%', transform: 'translateX(-50%)', zIndex: 300, background: '#17181A', color: '#F1F1EC', borderRadius: 12, padding: '10px 14px', display: 'flex', gap: 12, alignItems: 'center', fontSize: 13 }}>
          {toast.text}
          {toast.undo && <button type="button" data-cal-undo onClick={toast.undo} style={{ border: 'none', background: '#C8F24E', color: '#111111', borderRadius: 8, padding: '3px 10px', fontWeight: 700, cursor: 'pointer' }}>{t('undo')}</button>}
          <button type="button" aria-label="×" onClick={() => setToast(null)} style={{ border: 'none', background: 'transparent', color: '#F1F1EC', cursor: 'pointer' }}>×</button>
        </div>
      )}
    </div>
  )
}

/** Add, rename, move or delete a milestone (admins and superusers). */
function MilestonePopover({ pop, brands, onClose, onSave, onDelete }: {
  pop: { day: string; edit?: Milestone; at: DOMRect }; brands: Brand[]
  onClose: () => void; onSave: (name: string, day: string, brandId: string) => void; onDelete?: () => void
}) {
  const t = useTranslations('milestones')
  const [name, setName] = useState(pop.edit?.name ?? '')
  const [day, setDay] = useState(pop.edit?.day ?? pop.day)
  const [brand, setBrand] = useState(pop.edit?.brand_id ?? brands[0]?.id ?? '')
  const field: React.CSSProperties = { border: `1px solid ${PIPE.border}`, borderRadius: 8, padding: '6px 8px', fontFamily: 'inherit', fontSize: 13, background: '#FFFFFF', width: '100%', boxSizing: 'border-box' }
  const top = Math.min(pop.at.bottom + 6, (typeof window !== 'undefined' ? window.innerHeight : 800) - 260)
  const left = Math.max(12, Math.min(pop.at.left, (typeof window !== 'undefined' ? window.innerWidth : 1200) - 280))
  return (
    <div role="presentation" onMouseDown={e => { if (e.target === e.currentTarget) onClose() }} style={{ position: 'fixed', inset: 0, zIndex: 400 }}>
      <form role="dialog" aria-label={pop.edit ? t('edit') : t('add')} data-milestone-form="" onKeyDown={e => { if (e.key === 'Escape') onClose() }}
        onSubmit={e => { e.preventDefault(); if (name.trim() && day && brand) onSave(name.trim(), day, brand) }}
        style={{ position: 'fixed', top, left, width: 260, background: '#FFFFFF', border: `1px solid ${PIPE.border}`, borderRadius: 12, boxShadow: '0 12px 30px rgba(0,0,0,.14)', padding: 12, display: 'grid', gap: 8 }}>
        <strong style={{ fontSize: 13, color: PIPE.ink }}>⚑ {pop.edit ? t('edit') : t('add')}</strong>
        <input autoFocus value={name} onChange={e => setName(e.target.value)} placeholder={t('namePh')} aria-label={t('name')} maxLength={80} style={field} data-milestone-name="" />
        <input type="date" value={day} onChange={e => setDay(e.target.value)} aria-label={t('day')} style={field} data-milestone-day="" />
        {!pop.edit && brands.length > 1 && (
          <select value={brand} onChange={e => setBrand(e.target.value)} aria-label={t('brand')} style={field} data-milestone-brand="">
            {brands.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        )}
        <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
          {onDelete && <button type="button" onClick={onDelete} data-milestone-delete="" style={{ marginInlineEnd: 'auto', border: 'none', background: 'none', color: '#D22040', fontFamily: 'inherit', fontSize: 12.5, fontWeight: 700, cursor: 'pointer' }}>{t('delete')}</button>}
          <button type="button" onClick={onClose} style={{ border: `1px solid ${PIPE.border}`, background: '#FFFFFF', borderRadius: 8, padding: '5px 10px', fontFamily: 'inherit', fontSize: 12.5, cursor: 'pointer' }}>{t('cancel')}</button>
          <button type="submit" disabled={!name.trim()} data-milestone-save="" style={{ border: 'none', background: '#C8F24E', borderRadius: 8, padding: '5px 10px', fontFamily: 'inherit', fontSize: 12.5, fontWeight: 800, cursor: 'pointer' }}>{t('save')}</button>
        </div>
      </form>
    </div>
  )
}
