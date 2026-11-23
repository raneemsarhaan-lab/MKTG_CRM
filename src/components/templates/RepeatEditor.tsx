'use client'

/**
 * Repeat (spec 023 US8): a task's repeat rule in its panel. Every N days,
 * every N weeks on some weekdays, or monthly on a day, anchored on the
 * publishing date; ends never, on a date or after a count. The next task is
 * made a lead time (working days) before its due date — never less than the
 * type's total SLA working days. Skip next and Stop repeating.
 */
import { useEffect, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useLocale, useTranslations } from 'next-intl'
import { formatDay } from '@/lib/due-dates'
import { loadRepeat, setRepeat, skipNext, stopRepeat, type RepeatView } from '@/actions/recurrence'

const input: React.CSSProperties = { font: 'inherit', fontSize: 13, padding: '5px 8px', borderRadius: 7, border: '1px solid #D9D9D3', background: '#fff', color: '#1F1F1C', minWidth: 0 }
const btn = (primary = false): React.CSSProperties => ({
  font: 'inherit', fontSize: 12.5, fontWeight: 700, padding: '6px 12px', borderRadius: 7, cursor: 'pointer',
  border: primary ? 'none' : '1px solid #D9D9D3', background: primary ? '#1F1F1C' : '#fff', color: primary ? '#fff' : '#1F1F1C',
})

export function RepeatEditor({ taskId, repeating, canEdit, spaceId }: { taskId: string; repeating: boolean; canEdit: boolean; spaceId?: string | null }) {
  const t = useTranslations('repeat')
  const locale = useLocale()
  const router = useRouter()
  const [view, setView] = useState<RepeatView | null>(null)
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState<RepeatView | null>(null)
  const [endMode, setEndMode] = useState<'never' | 'on' | 'after'>('never')
  const [err, setErr] = useState('')
  const [pending, start] = useTransition()
  const box = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let live = true
    loadRepeat(taskId).then(r => { if (live && r.success) setView(r.repeat) }).catch(() => null)
    return () => { live = false }
  }, [taskId, repeating])
  useEffect(() => {
    if (!open) return
    const off = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', off)
    return () => document.removeEventListener('mousedown', off)
  }, [open])

  const days = Array.from({ length: 7 }, (_, i) => new Date(Date.UTC(2026, 10, 22 + i)).toLocaleDateString(locale, { weekday: 'short', timeZone: 'UTC' }))
  const summary = (v: RepeatView) => {
    const every = v.freq === 'days' ? t('everyDays', { n: v.interval })
      : v.freq === 'weeks' ? t('everyWeeks', { n: v.interval, days: (v.weekdays.length ? v.weekdays : []).map(d => days[d]).join(', ') || '—' })
      : t('everyMonth', { n: v.interval, day: v.month_day ?? 1 })
    return every
  }
  const fail = (e: string, min?: number) => setErr(
    e === 'lead_too_short' ? t('leadTooShort', { min: min ?? 0 })
      : e === 'needs_publish' ? t('needsPublish')
      : e === 'not_authorized' ? t('notAllowed') : t('failed'))

  function edit() {
    if (!view) return
    setErr('')
    const d = { ...view }
    if (!d.id && d.freq === 'weeks' && !d.weekdays.length && d.publish_date) d.weekdays = [new Date(`${d.publish_date}T00:00:00Z`).getUTCDay()]
    setDraft(d)
    setEndMode(d.ends_on ? 'on' : d.max_count ? 'after' : 'never')
    setOpen(true)
  }
  function save() {
    if (!draft) return
    start(async () => {
      const r = await setRepeat(taskId, {
        freq: draft.freq, interval: draft.interval, weekdays: draft.weekdays, month_day: draft.month_day,
        ends_on: endMode === 'on' ? draft.ends_on : null, max_count: endMode === 'after' ? draft.max_count : null,
        lead: draft.lead, space_id: spaceId ?? null,
      })
      if (!r.success) { fail(r.error, r.min); return }
      setView(r.repeat); setOpen(false); router.refresh()
    })
  }
  const skip = () => start(async () => { const r = await skipNext(taskId); if (r.success) { setView(r.repeat); router.refresh() } else fail(r.error) })
  const stop = () => start(async () => { const r = await stopRepeat(taskId); if (r.success) { setOpen(false); router.refresh(); const v = await loadRepeat(taskId); if (v.success) setView(v.repeat) } else fail(r.error) })

  const on = !!view?.id
  return (
    <div ref={box} data-repeat="" data-repeat-on={on ? 'true' : 'false'} style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', minWidth: 0 }}>
      <button type="button" data-repeat-open disabled={!canEdit || !view} onClick={edit}
        style={{ border: 'none', background: 'transparent', padding: 0, font: 'inherit', fontSize: 14, color: on ? '#1F1F1C' : '#8A8A84', cursor: canEdit ? 'pointer' : 'default', textAlign: 'start' }}>
        {on && view ? <>↻ {summary(view)}{view.next_publish && <span data-repeat-next={view.next_publish} style={{ color: '#8A8A84' }}> · {t('next', { day: formatDay(view.next_publish, locale) })}</span>}</> : t('none')}
      </button>
      {on && canEdit && <>
        <button type="button" data-repeat-skip style={{ ...btn(), padding: '3px 8px', fontSize: 12 }} disabled={pending} onClick={skip}>{t('skip')}</button>
      </>}
      {err && !open && <span role="alert" style={{ fontSize: 12.5, color: '#B42318' }}>{err}</span>}
      {open && draft && (
        <div role="dialog" aria-label={t('title')} data-repeat-dialog
          style={{ position: 'absolute', top: 'calc(100% + 6px)', insetInlineStart: 0, zIndex: 20, width: 320, background: '#fff', border: '1px solid #E4E4DF', borderRadius: 12, padding: 12, boxShadow: '0 12px 30px rgba(0,0,0,.14)', display: 'grid', gap: 10 }}>
          {!draft.publish_date && <p style={{ margin: 0, fontSize: 12.5, color: '#B42318' }}>{t('needsPublish')}</p>}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
            {t('every')}
            <input type="number" min={1} max={99} style={{ ...input, width: 56 }} data-repeat-interval value={draft.interval}
              onChange={e => setDraft({ ...draft, interval: Math.max(1, Math.trunc(Number(e.target.value) || 1)) })} />
            <select style={input} data-repeat-freq value={draft.freq} onChange={e => setDraft({ ...draft, freq: e.target.value as RepeatView['freq'] })}>
              <option value="days">{t('days')}</option>
              <option value="weeks">{t('weeks')}</option>
              <option value="monthly">{t('months')}</option>
            </select>
          </div>
          {draft.freq === 'weeks' && (
            <div role="group" aria-label={t('onDays')} style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
              {days.map((d, i) => {
                const sel = draft.weekdays.includes(i)
                return <button key={i} type="button" aria-pressed={sel} data-repeat-day={i}
                  onClick={() => setDraft({ ...draft, weekdays: sel ? draft.weekdays.filter(x => x !== i) : [...draft.weekdays, i].sort() })}
                  style={{ ...btn(sel), padding: '4px 7px', fontSize: 11.5 }}>{d}</button>
              })}
            </div>
          )}
          {draft.freq === 'monthly' && (
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>{t('onDay')}
              <input type="number" min={1} max={31} style={{ ...input, width: 60 }} value={draft.month_day ?? ''} placeholder={draft.publish_date?.slice(8, 10)}
                onChange={e => setDraft({ ...draft, month_day: e.target.value ? Math.trunc(Number(e.target.value)) : null })} />
            </label>
          )}
          <div style={{ display: 'grid', gap: 6, fontSize: 13 }}>
            <span style={{ fontWeight: 700, fontSize: 12, color: '#6B6B66' }}>{t('ends')}</span>
            <label style={{ display: 'flex', gap: 6, alignItems: 'center' }}><input type="radio" checked={endMode === 'never'} onChange={() => setEndMode('never')} />{t('never')}</label>
            <label style={{ display: 'flex', gap: 6, alignItems: 'center' }}><input type="radio" checked={endMode === 'on'} onChange={() => setEndMode('on')} />{t('onDate')}
              <input type="date" style={input} disabled={endMode !== 'on'} value={draft.ends_on ?? ''} onChange={e => setDraft({ ...draft, ends_on: e.target.value || null })} /></label>
            <label style={{ display: 'flex', gap: 6, alignItems: 'center' }}><input type="radio" checked={endMode === 'after'} onChange={() => setEndMode('after')} />{t('after')}
              <input type="number" min={1} style={{ ...input, width: 60 }} disabled={endMode !== 'after'} value={draft.max_count ?? ''} onChange={e => setDraft({ ...draft, max_count: e.target.value ? Math.trunc(Number(e.target.value)) : null })} />{t('times')}</label>
          </div>
          <label style={{ display: 'grid', gap: 4, fontSize: 13 }}>
            <span style={{ fontWeight: 700, fontSize: 12, color: '#6B6B66' }}>{t('lead')}</span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <input type="number" min={0} style={{ ...input, width: 64 }} data-repeat-lead value={draft.lead}
                onChange={e => setDraft({ ...draft, lead: Math.trunc(Number(e.target.value) || 0) })} />
              {t('leadUnit')}
            </span>
            <span style={{ fontSize: 11.5, color: '#8A8A84' }}>{t('leadHint', { min: draft.minLead })}</span>
          </label>
          {err && <p role="alert" data-repeat-error style={{ margin: 0, fontSize: 12.5, color: '#B42318' }}>{err}</p>}
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <button type="button" style={btn(true)} data-repeat-save disabled={pending || !draft.publish_date} onClick={save}>{t('save')}</button>
            <button type="button" style={btn()} onClick={() => setOpen(false)}>{t('cancel')}</button>
            {on && <button type="button" style={{ ...btn(), color: '#B42318', marginInlineStart: 'auto' }} data-repeat-stop disabled={pending} onClick={stop}>{t('stop')}</button>}
          </div>
        </div>
      )}
    </div>
  )
}
