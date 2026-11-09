'use client'

/**
 * Several days at once (spec 014 US2, FR-016, FR-017; contracts/ui.md §2),
 * shared by the reminder window and "Log several days" on My Day.
 *
 * One line per day: hours, or Off. "Add another day" adds the next missing
 * working day, then any past day in the last 30. "Same for all" copies a value
 * to every empty line. Save sends every line in one call: all or nothing, and
 * a refused line keeps what was typed and says why.
 */
import { useId, useRef, useState, type ReactNode } from 'react'
import { useFormatter, useTranslations } from 'next-intl'
import { addDays, parseHours, MAX_BACK_DAYS } from '@/lib/hours'
import type { HoursApi, Line } from './types'

export interface DayLine { date: string; value: string; off: boolean; fixed?: boolean }

export function useDayName() {
  const f = useFormatter()
  return (d: string, style: 'long' | 'short' = 'long') =>
    f.dateTime(new Date(`${d}T12:00:00`), style === 'long' ? { weekday: 'long', day: 'numeric', month: 'short' } : { weekday: 'short', day: 'numeric' })
}

export function DaysForm({ api, today, initial, missing, onSaved, start, clear, saveLabel, autoFocus = true }: {
  api: HoursApi
  today: string
  initial: DayLine[]
  /** Working days with no entry, newest first, offered by "Add another day". */
  missing: string[]
  onSaved(saved: Line[]): void
  /** Buttons before Save: Later, I was off. */
  start?: ReactNode
  /** Offer Clear (a single day from the strip). */
  clear?: boolean
  saveLabel?: string
  autoFocus?: boolean
}) {
  const t = useTranslations('hours')
  const dayName = useDayName()
  const uid = useId()
  const [lines, setLines] = useState<DayLine[]>(initial)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [note, setNote] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [picking, setPicking] = useState(false)
  const lastFocus = useRef<string | null>(null)
  const root = useRef<HTMLDivElement>(null)

  const left = missing.filter(d => !lines.some(l => l.date === d))
  const errText = (e: string) => (t.has(`err.${e}`) ? t(`err.${e}`) : t('err.generic'))
  const set = (i: number, patch: Partial<DayLine>) => {
    setLines(ls => ls.map((l, j) => (j === i ? { ...l, ...patch } : l)))
    setErrors(e => { const n = { ...e }; delete n[lines[i].date]; return n })
    setNote(null)
  }
  const focusLine = (date: string) => requestAnimationFrame(() => root.current?.querySelector<HTMLInputElement>(`[data-day-line="${date}"] input`)?.focus())

  function addDay(date?: string) {
    const d = date ?? left[0]
    if (!d) { setPicking(true); return }
    if (lines.some(l => l.date === d)) { focusLine(d); return }
    setLines(ls => [...ls, { date: d, value: '', off: false }].sort((a, b) => (a.fixed ? -1 : b.fixed ? 1 : b.date.localeCompare(a.date))))
    setPicking(false)
    focusLine(d)
  }
  function sameForAll() {
    const src = lines.find(l => l.date === lastFocus.current && !l.off && l.value.trim()) ?? lines.find(l => !l.off && l.value.trim())
    if (!src) return
    setLines(ls => ls.map(l => (!l.off && !l.value.trim() ? { ...l, value: src.value } : l)))
  }

  async function save(clearing = false) {
    if (busy) return
    const errs: Record<string, string> = {}
    const out: Line[] = []
    for (const l of lines) {
      if (clearing) { out.push({ date: l.date, hours: null, off: false }); continue }
      if (l.off) { out.push({ date: l.date, hours: null, off: true }); continue }
      const p = parseHours(l.value)
      if (!p.ok) { errs[l.date] = errText(p.error); continue }
      if (p.hours === null) continue
      out.push({ date: l.date, hours: p.hours, off: false })
    }
    if (Object.keys(errs).length) { setErrors(errs); setNote(t('remind.notSaved')); focusLine(Object.keys(errs)[0]); return }
    if (!out.length) { focusLine(lines[0]?.date ?? ''); return }
    setBusy(true)
    const res = await api.saveDays(out)
    setBusy(false)
    if (res.success) { onSaved(out); return }
    if ('lines' in res) {
      setErrors(Object.fromEntries(res.lines.map(x => [x.date, errText(x.error)])))
      setNote(t('remind.notSaved'))
      focusLine(res.lines[0]?.date ?? '')
    } else setNote(errText(res.error))
  }

  return (
    <div ref={root} className="fx-hr-form" data-days-form="">
      <div className="fx-hr-lines">
        {lines.map((l, i) => {
          const id = `${uid}-${l.date}`, err = errors[l.date]
          return (
            <div key={l.date} className={`fx-hr-line${err ? ' is-bad' : ''}`} data-day-line={l.date}>
              <label htmlFor={id}>{dayName(l.date)}</label>
              <span className="fx-hr-field">
                <input id={id} inputMode="decimal" autoComplete="off" value={l.off ? '' : l.value} disabled={l.off}
                       autoFocus={autoFocus && i === 0}
                       aria-invalid={!!err || undefined} aria-describedby={err ? `${id}-e` : undefined}
                       aria-label={t('fieldDay', { day: dayName(l.date) })}
                       onFocus={() => { lastFocus.current = l.date }}
                       onChange={e => set(i, { value: e.target.value })}
                       onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); void save() } }} />
                <span aria-hidden="true">{t('unit')}</span>
              </span>
              <button type="button" className="fx-hr-tog" aria-pressed={l.off} data-line-off={l.date} onClick={() => set(i, { off: !l.off })}>{t('off')}</button>
              {l.fixed
                ? <span />
                : <button type="button" className="fx-hr-rm" aria-label={t('remind.remove', { day: dayName(l.date) })} data-line-remove={l.date}
                          onClick={() => { setLines(ls => ls.filter((_, j) => j !== i)); focusLine(lines[0].date) }}>×</button>}
              {err && <span className="fx-hr-lerr" id={`${id}-e`} role="alert">{err}</span>}
            </div>
          )
        })}
      </div>
      <div className="fx-hr-more">
        {picking
          ? (
            <label className="fx-hr-pick">
              <span>{t('remind.addPick')}</span>
              <input type="date" min={addDays(today, -MAX_BACK_DAYS)} max={today} data-add-pick=""
                     onChange={e => { if (e.target.value) addDay(e.target.value) }} />
            </label>
          )
          : <button type="button" className="fx-hr-link" data-add-day="" onClick={() => addDay()}>＋ {t('remind.add')}</button>}
        {left.length > 0 && <span className="fx-hr-pill">{t('remind.more', { n: left.length })}</span>}
        {lines.length > 1 && <button type="button" className="fx-hr-chip" data-same-all="" onClick={sameForAll}>{t('remind.same')}</button>}
      </div>
      {note && <p className="fx-hr-note" role="alert">{note}</p>}
      <div className="fx-hr-acts">
        {start}
        {clear && <button type="button" className="fx-hr-chip" data-days-clear="" onClick={() => void save(true)}>{t('clear')}</button>}
        <button type="button" className="fx-hr-save" data-days-save="" disabled={busy} onClick={() => void save()}>{busy ? t('saving') : saveLabel ?? t('save')}</button>
      </div>
    </div>
  )
}
