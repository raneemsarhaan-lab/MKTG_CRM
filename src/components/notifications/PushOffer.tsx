'use client'

/**
 * Phone alerts for this device (spec 012 US11, FR-090–FR-095).
 *
 * In the panel it's an offer at the top, until alerts are on or the member
 * says "Not now". In settings it's the device row: on, off, blocked, or not
 * possible here. Permission is only asked after a tap. An iPhone only gets
 * alerts from the Home Screen app, so outside it the steps to add it show
 * instead.
 */
import { useCallback, useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { useNotify } from './NotifyProvider'

const DISMISS_KEY = 'momentum.push.offer'

type State = 'loading' | 'unsupported' | 'ios' | 'not-ready' | 'blocked' | 'off' | 'on'

function keyBytes(base64: string): Uint8Array {
  const pad = '='.repeat((4 - (base64.length % 4)) % 4)
  const raw = atob((base64 + pad).replace(/-/g, '+').replace(/_/g, '/'))
  const out = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i)
  return out
}

export function isIosOutsideHomeScreen(): boolean {
  const ua = navigator.userAgent
  const ios = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)
  const standalone = (navigator as Navigator & { standalone?: boolean }).standalone === true
    || window.matchMedia?.('(display-mode: standalone)').matches
  return ios && !standalone
}

/** On sign-out: stop alerts to this device (T043). Never throws. */
export async function unsubscribeThisDevice(): Promise<void> {
  try {
    const reg = await navigator.serviceWorker?.getRegistration('/push-sw.js')
    const sub = await reg?.pushManager.getSubscription()
    if (!sub) return
    await fetch('/api/notifications/push', {
      method: 'DELETE', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin',
      body: JSON.stringify({ endpoint: sub.endpoint }),
    }).catch(() => {})
    await sub.unsubscribe().catch(() => {})
  } catch { /* nothing to undo */ }
}

export function PushOffer({ variant }: { variant: 'panel' | 'settings' }) {
  const ctx = useNotify()
  const t = useTranslations('notifications')
  const [state, setState] = useState<State>('loading')
  const [dismissed, setDismissed] = useState(true)
  const [busy, setBusy] = useState(false)
  const [key, setKey] = useState<string | null>(null)

  const check = useCallback(async () => {
    try { setDismissed(window.localStorage.getItem(DISMISS_KEY) === '1') } catch { setDismissed(false) }
    if (isIosOutsideHomeScreen()) { setState('ios'); return }
    if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) { setState('unsupported'); return }
    const k = await ctx?.api.pushKey()
    if (!k) { setState('not-ready'); return }
    setKey(k)
    if (Notification.permission === 'denied') { setState('blocked'); return }
    const reg = await navigator.serviceWorker.getRegistration('/push-sw.js')
    const sub = await reg?.pushManager.getSubscription()
    setState(sub && Notification.permission === 'granted' ? 'on' : 'off')
  }, [ctx])

  useEffect(() => { void check() }, [check])

  async function turnOn() {
    if (!key || !ctx) return
    setBusy(true)
    try {
      const permission = await Notification.requestPermission()
      if (permission !== 'granted') { setState(permission === 'denied' ? 'blocked' : 'off'); return }
      const reg = await navigator.serviceWorker.register('/push-sw.js', { scope: '/' })
      await navigator.serviceWorker.ready
      const sub = await reg.pushManager.getSubscription()
        ?? await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(key) as BufferSource })
      const ok = await ctx.api.pushSave(sub.toJSON())
      setState(ok ? 'on' : 'off')
    } catch {
      setState('off')
    } finally {
      setBusy(false)
    }
  }

  async function turnOff() {
    if (!ctx) return
    setBusy(true)
    try {
      const reg = await navigator.serviceWorker.getRegistration('/push-sw.js')
      const sub = await reg?.pushManager.getSubscription()
      if (sub) { await ctx.api.pushDelete(sub.endpoint); await sub.unsubscribe() }
      setState('off')
    } finally {
      setBusy(false)
    }
  }

  function dismiss() {
    setDismissed(true)
    try { window.localStorage.setItem(DISMISS_KEY, '1') } catch { /* private mode */ }
  }

  const ios = (
    <div className="fx-nt-ios" data-push-ios="">
      <b>{t('push.iosTitle')}</b>
      <span>{t('push.iosText')}</span>
      <ol><li>{t('push.ios1')}</li><li>{t('push.ios2')}</li><li>{t('push.ios3')}</li></ol>
      {variant === 'panel' && <button type="button" className="fx-nt-link" onClick={dismiss}>{t('push.dismiss')}</button>}
    </div>
  )

  if (variant === 'panel') {
    if (dismissed) return null
    if (state === 'ios') return ios
    if (state !== 'off') return null
    return (
      <div className="fx-nt-offer" data-push-offer="">
        <span className="fx-nt-offer-ico" aria-hidden="true">📱</span>
        <span><b>{t('push.offerTitle')}</b>{t('push.offerText')}</span>
        <span className="fx-nt-offer-acts">
          <button type="button" className="fx-nt-go" disabled={busy} data-push-on="" onClick={() => void turnOn()}>{t('push.turnOn')}</button>
          <button type="button" className="fx-nt-link" data-push-dismiss="" onClick={dismiss}>{t('push.dismiss')}</button>
        </span>
      </div>
    )
  }

  if (state === 'loading') return <p className="fx-nt-device" data-push-device="loading" aria-busy="true">…</p>
  if (state === 'ios') return ios
  const text = {
    unsupported: t('push.unsupported'), 'not-ready': t('push.notReady'), blocked: t('push.blocked'),
    off: t('push.off'), on: t('push.on'),
  }[state]
  return (
    <p className="fx-nt-device" data-push-device={state}>
      <span>{text}</span>
      {state === 'on' && <button type="button" className="fx-nt-link" disabled={busy} data-push-off="" onClick={() => void turnOff()}>{t('push.turnOff')}</button>}
      {state === 'off' && <button type="button" className="fx-nt-go" disabled={busy} data-push-on="" onClick={() => void turnOn()}>{t('push.turnOn')}</button>}
    </p>
  )
}
