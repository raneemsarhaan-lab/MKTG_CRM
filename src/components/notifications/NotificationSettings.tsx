'use client'

/**
 * Notification settings (spec 012 US8, contracts/ui.md §6).
 *
 * One row per kind, with In the app, Phone and Email switches. "In the app"
 * off turns the row off: a notification that isn't recorded can't reach a
 * phone or an inbox (FR-040). Then the email mode, Do not disturb, this
 * device's phone alerts, the language for alerts and emails, and how Arabic
 * notifications refer to the member. Every change saves straight away.
 */
import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useLocale, useTranslations } from 'next-intl'
import type { EmailMode, NotificationKind } from '@/types/index'
import type { KindSettings } from '@/lib/notify/settings'
import { useNotify } from './NotifyProvider'
import { PushOffer } from './PushOffer'
import type { SettingsView } from './types'
import { applyLocale } from '@/lib/locale-switch'

export const SETTINGS_ORDER: NotificationKind[] = [
  'mention', 'assigned', 'comment', 'reply', 'attachment',
  'task_created_in_stage', 'task_moved_to_stage', 'due_soon', 'overdue',
]
const CHANNELS = ['in_app', 'push', 'email'] as const

export function NotificationSettings() {
  const ctx = useNotify()
  const t = useTranslations('notifications')
  const tp = useTranslations('notifications.settingsPage')
  const router = useRouter()
  const locale = useLocale() === 'ar' ? 'ar' : 'en'
  const [view, setView] = useState<SettingsView | null>(null)
  const [failed, setFailed] = useState(false)
  const [status, setStatus] = useState<'' | 'saved' | 'error'>('')
  const timer = useRef<number | undefined>(undefined)
  // One save at a time, in the order they were made, so the last change wins.
  const queue = useRef<Promise<unknown>>(Promise.resolve())

  useEffect(() => {
    if (!ctx) return
    void ctx.api.getSettings().then(r => { if (r.success) setView(r); else setFailed(true) })
  }, [ctx])

  function flash(ok: boolean) {
    setStatus(ok ? 'saved' : 'error')
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => setStatus(''), 2500)
  }

  async function save(patch: Partial<Pick<SettingsView, 'kinds' | 'emailMode' | 'dnd'>>) {
    if (!ctx || !view) return
    const before = view
    setView({ ...view, ...patch })
    const run = queue.current.then(() => ctx.api.saveSettings(patch))
    queue.current = run.catch(() => {})
    const r = await run
    if (!r.success) setView(before)
    else if (patch.dnd !== undefined) ctx.setDnd(patch.dnd)
    flash(r.success)
  }

  function toggle(kind: NotificationKind, channel: typeof CHANNELS[number]) {
    if (!view) return
    const row = { ...view.kinds[kind] }
    row[channel] = !row[channel]
    // Off in the app is off everywhere; back on, the phone and email stay as they were left (off).
    if (channel === 'in_app' && !row.in_app) { row.push = false; row.email = false }
    void save({ kinds: { ...view.kinds, [kind]: row } as KindSettings })
  }

  async function setGender(g: 'f' | 'm' | null) {
    if (!ctx || !view) return
    const before = view
    setView({ ...view, gender: g })
    const r = await ctx.api.setGender(g)
    if (!r.success) setView(before)
    flash(r.success)
  }

  const head = (
    <>
      <Link href="/board" className="fx-nt-link fx-nt-back">← {t('back')}</Link>
      <h1>{tp('title')}</h1>
    </>
  )

  if (!view) {
    return (
      <div className="fx-nt-page" data-nt-settings-page="">
        {head}
        <p aria-busy={!failed}>{failed ? tp('error') : '…'}</p>
      </div>
    )
  }

  const modes: EmailMode[] = ['instant', 'daily', 'off']

  return (
    <div className="fx-nt-page" data-nt-settings-page="">
      {head}
      <p className={`fx-nt-saved${status === 'error' ? ' is-bad' : ''}`} role="status" aria-live="polite" data-nt-saved="">
        {status === 'saved' ? `✓ ${tp('saved')}` : status === 'error' ? tp('error') : ''}
      </p>

      <section className="fx-nt-card" aria-labelledby="nt-kinds">
        <div className="fx-nt-scroll">
          <table className="fx-nt-table">
            <caption className="fx-sheet-sr" id="nt-kinds">{tp('notifyAbout')}</caption>
            <thead>
              <tr>
                <th scope="col">{tp('notifyAbout')}</th>
                <th scope="col" className="is-c">{tp('inApp')}</th>
                <th scope="col" className="is-c">{tp('phone')}</th>
                <th scope="col" className="is-c">{tp('email')}</th>
              </tr>
            </thead>
            <tbody>
              {SETTINGS_ORDER.map(kind => {
                const row = view.kinds[kind]
                const name = t(`kinds.${kind}`)
                return (
                  <tr key={kind} data-setting-row={kind}>
                    <th scope="row" style={{ background: 'none', fontWeight: 400 }}>
                      <b>{name}</b>
                      {(kind === 'mention' || kind === 'assigned') && <span className="fx-nt-rec">{tp('recommended')}</span>}
                      <small>{t(`kindHelp.${kind}`)}</small>
                    </th>
                    {CHANNELS.map(ch => (
                      <td key={ch} className="is-c">
                        <button type="button" role="switch" className="fx-nt-sw"
                                aria-checked={row[ch]}
                                aria-label={`${name} · ${tp(ch === 'in_app' ? 'inApp' : ch === 'push' ? 'phone' : 'email')}`}
                                data-setting={`${kind}:${ch}`}
                                disabled={ch !== 'in_app' && !row.in_app}
                                onClick={() => toggle(kind, ch)} />
                      </td>
                    ))}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section className="fx-nt-card fx-nt-opts">
        <div className="fx-nt-opt">
          <span id="nt-email"><b>{tp('emailMode')}</b>
            <small>{tp(`${view.emailMode}Help` as 'instantHelp')}</small>
            {!view.emailReady && <> <span className="fx-nt-warn" data-email-not-ready="">{tp('emailNotReady')}</span></>}
          </span>
          <span className="fx-nt-pairs" role="group" aria-labelledby="nt-email">
            {modes.map(m => (
              <button key={m} type="button" aria-pressed={view.emailMode === m} data-email-mode={m}
                      onClick={() => view.emailMode !== m && void save({ emailMode: m })}>
                {tp(m)}
              </button>
            ))}
          </span>
        </div>
        <div className="fx-nt-opt">
          <span><b id="nt-dnd">{tp('dnd')}</b><small>{tp('dndHelp')}</small></span>
          <button type="button" role="switch" className="fx-nt-sw" aria-checked={view.dnd} aria-labelledby="nt-dnd"
                  data-dnd="" onClick={() => void save({ dnd: !view.dnd })} />
        </div>
        <div className="fx-nt-opt">
          <span><b>{tp('device')}</b></span>
          <PushOffer variant="settings" />
        </div>
        <div className="fx-nt-opt">
          <span id="nt-lang"><b>{tp('language')}</b><small>{tp('languageHelp')}</small></span>
          <span className="fx-nt-pairs" role="group" aria-labelledby="nt-lang">
            {(['en', 'ar'] as const).map(l => (
              <button key={l} type="button" aria-pressed={locale === l} data-nt-locale={l} lang={l}
                      onClick={() => {
                        if (locale === l || !ctx) return
                        applyLocale(l)
                        void ctx.api.setLocale(l)
                        router.refresh()
                      }}>
                {l === 'en' ? 'English' : 'العربية'}
              </button>
            ))}
          </span>
        </div>
        <div className="fx-nt-opt">
          <span id="nt-gender"><b>{tp('gender')}</b><small>{tp('genderHelp')}</small></span>
          <span className="fx-nt-pairs" role="group" aria-labelledby="nt-gender">
            {([['f', 'genderF'], ['m', 'genderM'], [null, 'genderNone']] as const).map(([g, key]) => (
              <button key={key} type="button" aria-pressed={view.gender === g} data-nt-gender={g ?? 'none'}
                      onClick={() => view.gender !== g && void setGender(g)}>
                {tp(key)}
              </button>
            ))}
          </span>
        </div>
      </section>
    </div>
  )
}
