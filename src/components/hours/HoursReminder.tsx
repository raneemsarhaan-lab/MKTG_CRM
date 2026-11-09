'use client'

/**
 * The forgotten-day reminder (spec 014 US2, FR-010–FR-018; research R2;
 * contracts/ui.md §3). Mounted once in AppShell.
 *
 * After the page settles, it asks the server about the device's today. It
 * opens only when the last working day has no entry and the member hasn't
 * been asked today, and never over another dialog or the task form: it waits
 * until they close. Opening it counts as asking (`dismissReminder`), so it
 * shows at most once a day on any device; Later just closes it.
 */
import { useEffect, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import type { HoursStatus } from '@/types/index'
import { toISODate } from '@/lib/hours'
import { Modal } from '@/components/sheets/Dialogs'
import { DaysForm, useDayName } from './DaysForm'
import { announceHours } from './TodayHours'
import type { HoursApi } from './types'

const SETTLE_MS = 1200
/** Something else is asking for attention: a dialog, or the task form. */
const busyScreen = () => !!document.querySelector('[role="dialog"], [role="alertdialog"], [data-task-form]')

export function HoursReminder({ api, delay = SETTLE_MS }: { api: HoursApi; delay?: number }) {
  const t = useTranslations('hours')
  const dayName = useDayName()
  const [st, setSt] = useState<HoursStatus | null>(null)
  const [open, setOpen] = useState(false)
  const asked = useRef(false)

  useEffect(() => {
    if (asked.current) return
    asked.current = true
    let cancelled = false
    let obs: MutationObserver | null = null
    const timer = window.setTimeout(async () => {
      const today = toISODate(new Date())
      const res = await api.hoursStatus(today)
      if (cancelled || !res.success || !res.remindDay || res.prompted) return
      setSt(res)
      const show = () => {
        if (busyScreen()) return false
        obs?.disconnect()
        setOpen(true)
        void api.dismissReminder(res.localDate)
        return true
      }
      if (!show()) {
        obs = new MutationObserver(() => { show() })
        obs.observe(document.body, { childList: true, subtree: true })
      }
    }, delay)
    return () => { cancelled = true; window.clearTimeout(timer); obs?.disconnect() }
  }, [api, delay])

  if (!open || !st?.remindDay) return null
  const day = st.remindDay
  const close = () => setOpen(false)

  async function wasOff() {
    const res = await api.saveDays([{ date: day, hours: null, off: true }])
    if (res.success) { close(); announceHours() }
  }

  return (
    <Modal title={t('remind.title', { day: dayName(day) })} body={t('remind.body')} onCancel={close} attr="data-hours-reminder">
      <DaysForm
        api={api}
        today={st.localDate}
        initial={[{ date: day, value: '', off: false, fixed: true }]}
        missing={st.missing}
        start={
          <>
            <button type="button" className="fx-hr-later" data-hours-later="" onClick={close}>{t('remind.later')}</button>
            <button type="button" className="fx-hr-chip is-off" data-hours-wasoff="" onClick={() => void wasOff()}>{t('iWasOff')}</button>
          </>
        }
        onSaved={() => { close(); announceHours() }}
      />
    </Modal>
  )
}
