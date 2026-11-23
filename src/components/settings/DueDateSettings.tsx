'use client'

/**
 * Settings › Due Dates (admins). The rule that works out a task's due date
 * from its publishing date: how many days before, which days are the weekend,
 * and which way a weekend due date moves. A live example shows the result.
 *
 * Saving asks first, with how many open tasks will get a new due date; due
 * dates set by hand and published or done tasks are never touched.
 */
import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useLocale, useTranslations } from 'next-intl'
import { addDays, cairoToday, calcDueDate, cleanRule, formatDay, weekday, type DueRule } from '@/lib/due-dates'
import { previewDueRule, saveDueRule } from '@/actions/settings'
import { Modal } from '@/components/sheets/Dialogs'

const DAYS = [6, 0, 1, 2, 3, 4, 5] // Saturday first, as the week is read in Egypt

export function DueDateSettings({ rule: saved }: { rule: DueRule }) {
  const t = useTranslations('dates.settings')
  const locale = useLocale()
  const router = useRouter()
  const [days, setDays] = useState(String(saved.daysBefore))
  const [weekend, setWeekend] = useState<number[]>(saved.weekend)
  const [shift, setShift] = useState<DueRule['shift']>(saved.shift)
  const [confirm, setConfirm] = useState<number | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const [busy, start] = useTransition()

  const checked = cleanRule({ daysBefore: days.trim() === '' ? NaN : Number(days), weekend, shift })
  const error = checked.error === 'weekend_all' ? t('allWeekend') : checked.error === 'days' ? t('badDays') : null
  const rule = checked.rule
  const changed = !!rule && (rule.daysBefore !== saved.daysBefore || rule.shift !== saved.shift || rule.weekend.join() !== [...saved.weekend].sort().join())

  // Two examples: the next publishing day two weeks out, and one whose due date lands on a weekend day.
  const examples = useMemo(() => {
    if (!rule) return []
    const today = cairoToday()
    const out: { publish: string; due: string; raw: string }[] = []
    const first = addDays(today, 14)
    out.push({ publish: first, due: calcDueDate(first, rule), raw: addDays(first, -rule.daysBefore) })
    if (rule.weekend.length) {
      for (let i = 1; i <= 7; i++) {
        const p = addDays(first, i)
        const raw = addDays(p, -rule.daysBefore)
        if (rule.weekend.includes(weekday(raw))) { out.push({ publish: p, due: calcDueDate(p, rule), raw }); break }
      }
    }
    return out
  }, [rule])

  const dayName = (d: number) => t(`days.${d}` as 'days.0')

  function ask() {
    if (!rule) return
    setMsg(null)
    start(async () => {
      const r = await previewDueRule(rule).catch(() => ({ success: false as const, error: 'generic' }))
      if (r.success) setConfirm(r.count)
      else setMsg(t('failed', { reason: r.error }))
    })
  }
  function apply() {
    if (!rule) return
    start(async () => {
      const r = await saveDueRule(rule).catch(() => ({ success: false as const, error: 'generic' }))
      setConfirm(null)
      if (!r.success) { setMsg(t('failed', { reason: r.error })); return }
      setMsg(t('saved', { n: r.updated }))
      router.refresh()
    })
  }

  const box: React.CSSProperties = { borderRadius: 16, border: '1px solid var(--line)', background: '#fff', padding: '16px 18px', maxWidth: 640, display: 'grid', gap: 14 }
  const label: React.CSSProperties = { fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--muted)' }

  return (
    <section data-due-settings="" style={box}>
      <div>
        <h3 style={{ margin: 0, fontSize: '0.95rem' }}>{t('title')}</h3>
        <p style={{ margin: '4px 0 0', fontSize: '0.8rem', color: 'var(--muted)' }}>{t('help')} {t('timezone')}</p>
      </div>

      <label style={{ display: 'grid', gap: 6 }}>
        <span style={label}>{t('daysBefore')}</span>
        <input type="number" min={0} max={365} step={1} value={days} data-due-days="" onChange={e => setDays(e.target.value)}
               style={{ width: 110, fontSize: '0.9rem', padding: '7px 10px', borderRadius: 8, border: '1px solid var(--line)', fontFamily: 'inherit' }} />
      </label>

      <div style={{ display: 'grid', gap: 6 }} role="group" aria-label={t('weekend')}>
        <span style={label}>{t('weekend')}</span>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {DAYS.map(d => {
            const on = weekend.includes(d)
            return (
              <button key={d} type="button" role="checkbox" aria-checked={on} data-due-weekend={d}
                      onClick={() => setWeekend(w => (on ? w.filter(x => x !== d) : [...w, d]))}
                      style={{ minWidth: 58, padding: '6px 10px', borderRadius: 999, cursor: 'pointer', fontFamily: 'inherit', fontSize: '0.8rem', fontWeight: 600,
                        border: `1px solid ${on ? 'var(--ink)' : 'var(--line)'}`, background: on ? 'var(--ink)' : '#fff', color: on ? '#fff' : 'var(--ink)' }}>
                {dayName(d)}
              </button>
            )
          })}
        </div>
      </div>

      <div style={{ display: 'grid', gap: 6 }} role="radiogroup" aria-label={t('shift')}>
        <span style={label}>{t('shift')}</span>
        <div style={{ display: 'flex', gap: 14, fontSize: '0.85rem' }}>
          {(['earlier', 'later'] as const).map(k => (
            <label key={k} style={{ display: 'inline-flex', gap: 6, alignItems: 'center', cursor: 'pointer' }}>
              <input type="radio" name="due-shift" value={k} checked={shift === k} data-due-shift={k} onChange={() => setShift(k)} />
              {t(k)}
            </label>
          ))}
        </div>
      </div>

      <div data-due-example="" style={{ borderRadius: 10, background: '#F6F6F4', padding: '10px 12px', fontSize: '0.85rem', display: 'grid', gap: 4 }}>
        <span style={label}>{t('example')}</span>
        {examples.map((x, i) => (
          <span key={i} data-due-example-line={i}>
            {t('exampleLine', { publish: formatDay(x.publish, locale), due: formatDay(x.due, locale) })}
            {x.raw !== x.due && <span style={{ color: 'var(--muted)' }}> · {t('exampleShift', { day: formatDay(x.raw, locale), due: formatDay(x.due, locale) })}</span>}
          </span>
        ))}
      </div>

      {error && <p role="alert" data-due-error="" style={{ margin: 0, fontSize: '0.8rem', fontWeight: 600, color: '#C2353A' }}>{error}</p>}
      {msg && <p role="status" data-due-msg="" style={{ margin: 0, fontSize: '0.8rem', color: 'var(--muted)' }}>{msg}</p>}

      <div>
        <button type="button" data-due-save="" disabled={!rule || !changed || busy} onClick={ask}
                style={{ fontSize: '0.8rem', fontWeight: 700, padding: '8px 16px', borderRadius: 9, border: 'none', fontFamily: 'inherit',
                  background: 'var(--ink)', color: '#fff', cursor: rule && changed && !busy ? 'pointer' : 'default', opacity: rule && changed && !busy ? 1 : 0.4 }}>
          {busy ? t('saving') : t('save')}
        </button>
      </div>

      {confirm !== null && (
        <Modal title={t('confirmTitle')} body={t('confirmBody', { n: confirm })} onCancel={() => setConfirm(null)} attr="data-due-confirm">
          <div className="fx-sh-dialog-row">
            <button type="button" onClick={() => setConfirm(null)}>{t('cancel')}</button>
            <button type="button" className="is-go" data-due-confirm-go="" disabled={busy} onClick={apply}>{t('confirm')}</button>
          </div>
        </Modal>
      )}
    </section>
  )
}
