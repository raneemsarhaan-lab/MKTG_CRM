'use client'

/**
 * "Today's hours" on My Day (spec 014 US1, US3; contracts/ui.md §1):
 * one field, quick choices, Save, the last 7 days, and the week's total
 * against the member's weekly capacity.
 *
 * Today is the device's calendar day (research R1). The page renders with the
 * server's day; on the first client render the card asks again with the
 * device's, which only differs around midnight in far time zones.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { useFormatter, useTranslations } from 'next-intl'
import type { HoursStatus } from '@/types/index'
import { parseHours, toISODate, addDays, MAX_BACK_DAYS } from '@/lib/hours'
import { Modal } from '@/components/sheets/Dialogs'
import { DaysForm, useDayName, type DayLine } from './DaysForm'
import type { HoursApi } from './types'

/** Saved somewhere else (the reminder, another card): refresh. */
export const HOURS_CHANGED = 'momentum:hours-changed'
export const announceHours = () => window.dispatchEvent(new Event(HOURS_CHANGED))

const QUICK = [4, 6, 8]

export function TodayHours({ api, initial }: { api: HoursApi; initial: HoursStatus | null }) {
  const t = useTranslations('hours')
  const f = useFormatter()
  const dayName = useDayName()
  const [st, setSt] = useState<HoursStatus | null>(initial)
  const todayEntry = st?.recent[st.recent.length - 1]
  const savedValue = todayEntry && 'hours' in todayEntry && typeof todayEntry.hours === 'number' ? String(todayEntry.hours) : ''
  const [value, setValue] = useState(savedValue)
  const [status, setStatus] = useState<{ text: string; bad?: boolean } | null>(null)
  const [busy, setBusy] = useState(false)
  const [dialog, setDialog] = useState<{ title: string; lines: DayLine[]; clear: boolean } | null>(null)
  const typed = useRef(false)

  const refresh = useCallback(async () => {
    const res = await api.hoursStatus(toISODate(new Date()))
    if (res.success) setSt(res)
  }, [api])
  useEffect(() => { void refresh() }, [refresh])
  useEffect(() => {
    const on = () => { void refresh() }
    window.addEventListener(HOURS_CHANGED, on)
    return () => window.removeEventListener(HOURS_CHANGED, on)
  }, [refresh])
  // Show the saved value unless the member is typing.
  useEffect(() => { if (!typed.current) setValue(savedValue) }, [savedValue])

  if (!st) return null
  const today = st.localDate
  const errText = (e: string) => (t.has(`err.${e}`) ? t(`err.${e}`) : t('err.generic'))
  const num = (n: number) => f.number(n, { maximumFractionDigits: 2 })

  async function save(raw: string | 'off') {
    if (busy) return
    let line
    if (raw === 'off') line = { date: today, hours: null, off: true }
    else {
      const p = parseHours(raw)
      if (!p.ok) { setStatus({ text: errText(p.error), bad: true }); return }
      line = { date: today, hours: p.hours, off: false }
    }
    setBusy(true)
    setStatus({ text: t('saving') })
    const res = await api.saveDays([line])
    setBusy(false)
    if (!res.success) {
      setStatus({ text: 'lines' in res ? errText(res.lines[0]?.error ?? 'generic') : errText(res.error), bad: true })
      return
    }
    typed.current = false
    setStatus({ text: line.off ? `${t('saved')} · ${t('off')}` : line.hours === null ? t('cleared') : t('saved') })
    if (line.off) setValue('')
    announceHours()
  }

  const openDay = (d: string) => {
    const e = st.recent.find(x => x.date === d)
    const v = e && typeof e.hours === 'number' ? String(e.hours) : ''
    setDialog({ title: t('fieldDay', { day: dayName(d) }), lines: [{ date: d, value: v, off: !!e?.off, fixed: true }], clear: !!e && (e.off || typeof e.hours === 'number') })
  }
  const openSeveral = () => {
    const missing = st.missing.slice(0, 5)
    const first = st.remindDay ?? missing[0] ?? addDays(today, -1)
    setDialog({ title: t('remind.severalTitle'), lines: [first, ...missing.filter(d => d !== first).slice(0, 1)].map((d, i) => ({ date: d, value: '', off: false, fixed: i === 0 })), clear: false })
  }
  const offToday = !!todayEntry?.off

  return (
    <section className="fx-hr-card" aria-labelledby="fx-hr-title" data-today-hours="">
      <div className="fx-hr-top">
        <h2 id="fx-hr-title">{t('today')}</h2>
        <span className="fx-hr-date">{dayName(today)}</span>
        <span className="fx-hr-week" data-hours-week="">{t('week', { total: num(st.weekTotal), capacity: num(st.capacity) })}</span>
      </div>
      <form className="fx-hr-entry" onSubmit={e => { e.preventDefault(); void save(value) }}>
        <label className={`fx-hr-field is-big${status?.bad ? ' is-bad' : ''}`}>
          <input inputMode="decimal" autoComplete="off" value={value} placeholder={offToday ? t('off') : '0'} data-hours-input=""
                 aria-label={t('field')} aria-invalid={status?.bad || undefined} aria-describedby="fx-hr-status"
                 onChange={e => { typed.current = true; setValue(e.target.value); if (status?.bad) setStatus(null) }} />
          <span aria-hidden="true">{t('unit')}</span>
        </label>
        <div className="fx-hr-quick" role="group" aria-label={t('today')}>
          {QUICK.map(n => (
            <button key={n} type="button" className="fx-hr-chip" data-hours-quick={n} onClick={() => { typed.current = false; setValue(String(n)); void save(String(n)) }}>
              {t('quick', { n: num(n) })}
            </button>
          ))}
          <button type="button" className={`fx-hr-chip is-off${offToday ? ' is-on' : ''}`} aria-pressed={offToday} data-hours-quick="off"
                  onClick={() => void save('off')}>{t('off')}</button>
        </div>
        <button type="submit" className="fx-hr-save" data-hours-save="" disabled={busy}>{t('save')}</button>
      </form>
      <p className={`fx-hr-status${status?.bad ? ' is-bad' : ''}`} id="fx-hr-status" role="status" aria-live="polite">{status?.text ?? ''}</p>

      <div className="fx-hr-striphead"><span>{t('last7')}</span></div>
      <div className="fx-hr-strip">
        {st.recent.map(e => {
          const isToday = e.date === today
          const missing = 'missing' in e && e.missing
          const state = e.off ? t('off') : typeof e.hours === 'number' ? num(e.hours) : missing ? t('missing') : t('notYet')
          const editable = e.date >= addDays(today, -MAX_BACK_DAYS) && e.date <= today
          return (
            <button key={e.date} type="button" data-hours-day={e.date} disabled={!editable}
                    className={`fx-hr-day${isToday ? ' is-today' : ''}${missing ? ' is-miss' : ''}${e.off ? ' is-off' : ''}${!missing && !e.off && e.hours === null && !isToday ? ' is-rest' : ''}`}
                    title={t('dayLabel', { day: dayName(e.date), state })}
                    aria-current={isToday ? 'date' : undefined}
                    onClick={() => (isToday ? document.querySelector<HTMLInputElement>('[data-hours-input]')?.focus() : openDay(e.date))}>
              <small>{dayName(e.date, 'short')}</small>
              <b>{missing && <span aria-hidden="true">⚠ </span>}{state}</b>
            </button>
          )
        })}
      </div>
      <div className="fx-hr-foot">
        <button type="button" className="fx-hr-link" data-hours-several="" onClick={openSeveral}>{t('several')}</button>
      </div>

      {dialog && (
        <Modal title={dialog.title} onCancel={() => setDialog(null)} attr="data-hours-dialog">
          <DaysForm api={api} today={today} initial={dialog.lines} missing={st.missing.concat(st.remindDay ? [st.remindDay] : [])}
                    clear={dialog.clear}
                    start={<button type="button" className="fx-hr-later" onClick={() => setDialog(null)}>{t('remind.close')}</button>}
                    onSaved={() => { setDialog(null); setStatus({ text: t('saved') }); announceHours() }} />
        </Modal>
      )}
    </section>
  )
}
