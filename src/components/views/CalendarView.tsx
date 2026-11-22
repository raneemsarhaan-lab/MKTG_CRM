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
import { useRouter } from 'next/navigation'
import { useLocale, useTranslations } from 'next-intl'
import type { Brand } from '@/types/index'
import { updateTask } from '@/actions/tasks'
import { STAGE_COLORS } from '@/lib/tokens'
import { PIPE } from '@/lib/pipeline-tokens'
import { dayOf, isoOf, monthGrid, moveMonth, moveWeek, weekGrid } from '@/lib/calendar'
import type { ViewTask } from './types'

const MODE_KEY = 'momentum.calendar.mode'
const done = (t: ViewTask) => (t.kind === 'simple' ? t.simple_status === 's-done' : t.status === 'publish')

export function CalendarView({ tasks, brands, colorBy = 'brand', campaigns = [], onOpen }: {
  tasks: ViewTask[]
  brands: Brand[]
  colorBy?: 'brand' | 'stage'
  /** Projects to filter by (a brand's campaigns). */
  campaigns?: { id: string; name: string }[]
  onOpen: (id: string) => void
}) {
  const t = useTranslations('calendar')
  const locale = useLocale()
  const router = useRouter()
  const [, start] = useTransition()
  const today = isoOf(new Date())
  const [mode, setMode] = useState<'month' | 'week'>('month')
  const [ym, setYm] = useState(() => ({ year: new Date().getFullYear(), month: new Date().getMonth() }))
  const [anchor, setAnchor] = useState(today)
  const [campaign, setCampaign] = useState<string>('all')
  const [moved, setMoved] = useState<Record<string, string | null>>({})
  const [toast, setToast] = useState<{ text: string; undo?: () => void } | null>(null)
  const [over, setOver] = useState<string | null>(null)

  useEffect(() => {
    try { const v = window.localStorage.getItem(MODE_KEY); if (v === 'week' || v === 'month') setMode(v) } catch { /* preference */ }
  }, [])
  function chooseMode(m: 'month' | 'week') {
    setMode(m)
    try { window.localStorage.setItem(MODE_KEY, m) } catch { /* preference */ }
  }

  const brandOf = useMemo(() => new Map(brands.map(b => [b.id, b])), [brands])
  const live = tasks.filter(x => !x.dropped_at && (campaign === 'all' || x.project_id === campaign))
  const dueOf = (x: ViewTask) => (x.id in moved ? moved[x.id] : x.due_date ? x.due_date.slice(0, 10) : null)
  const byDay = useMemo(() => {
    const m = new Map<string, ViewTask[]>()
    for (const x of live) { const d = dueOf(x); if (d) m.set(d, [...(m.get(d) ?? []), x]) }
    return m
  }, [live, moved]) // eslint-disable-line react-hooks/exhaustive-deps
  const undated = live.filter(x => !dueOf(x))

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

  function drop(taskId: string, iso: string) {
    const task = tasks.find(x => x.id === taskId)
    if (!task) return
    const before = dueOf(task)
    if (before === iso) return
    setMoved(m => ({ ...m, [taskId]: iso }))
    start(async () => {
      const res = await updateTask(taskId, { due_date: iso }).catch(() => ({ success: false }))
      if (!res.success) { setMoved(m => { const n = { ...m }; delete n[taskId]; return n }); return }
      router.refresh()
      const label = dayOf(iso).toLocaleDateString(locale, { day: 'numeric', month: 'short' })
      setToast({
        text: t('moved', { name: task.name, date: label }),
        undo: () => start(async () => {
          setMoved(m => ({ ...m, [taskId]: before }))
          await updateTask(taskId, { due_date: before ?? null })
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
      title={x.name}
      style={{ display: 'block', width: '100%', textAlign: 'start', border: 'none', cursor: 'grab', fontFamily: 'inherit',
        fontSize: 11.5, fontWeight: 600, padding: '3px 6px', borderRadius: 7, color: PIPE.ink, opacity: done(x) ? 0.62 : 1,
        background: `color-mix(in srgb, ${color(x)} 18%, #FFFFFF)`, borderInlineStart: `3px solid ${color(x)}`,
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
      <div style={{ overflowX: 'auto' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(110px, 1fr))', minWidth: 770, border: `1px solid ${PIPE.border}`, borderRadius: 12, overflow: 'hidden' }}>
          {dow.map((d, i) => <div key={i} style={{ fontSize: 11, fontWeight: 700, color: PIPE.textMuted, padding: '6px 8px', background: PIPE.surface, borderBottom: `1px solid ${PIPE.border}`, textTransform: 'uppercase', letterSpacing: '.06em' }}>{d}</div>)}
          {days.map((d, i) => (
            <div key={d.iso} data-day={d.iso}
              onDragOver={e => { e.preventDefault(); setOver(d.iso) }}
              onDragLeave={() => setOver(o => (o === d.iso ? null : o))}
              onDrop={e => { e.preventDefault(); setOver(null); drop(e.dataTransfer.getData('text/plain'), d.iso) }}
              style={{ minHeight: mode === 'week' ? 240 : 96, padding: 5, display: 'flex', flexDirection: 'column', gap: 4,
                borderInlineEnd: (i + 1) % 7 ? `1px solid ${PIPE.border}` : 'none', borderBottom: `1px solid ${PIPE.border}`,
                background: over === d.iso ? '#F4FBD6' : d.inMonth ? '#FFFFFF' : PIPE.surface }}>
              <span style={{ fontSize: 11, alignSelf: 'flex-start', padding: d.iso === today ? '0 5px' : 0, borderRadius: 6,
                background: d.iso === today ? '#C8F24E' : 'transparent', fontWeight: d.iso === today ? 800 : 500,
                color: d.inMonth ? PIPE.textMuted : PIPE.textFaintest, fontVariantNumeric: 'tabular-nums' }}>
                {d.day === 1 ? dayOf(d.iso).toLocaleDateString(locale, { day: 'numeric', month: 'short' }) : d.day}
              </span>
              {(byDay.get(d.iso) ?? []).map(chip)}
            </div>
          ))}
        </div>
      </div>
      {undated.length > 0 && (
        <div data-cal-undated style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
          <span style={{ fontSize: 12, color: PIPE.textMuted }}>{t('noDate')}:</span>
          {undated.map(x => <span key={x.id} style={{ maxWidth: 220 }}>{chip(x)}</span>)}
        </div>
      )}
      <p style={{ margin: 0, fontSize: 12, color: PIPE.textMuted }}>{t('note')}</p>
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
