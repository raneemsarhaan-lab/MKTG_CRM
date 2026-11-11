'use client'

/**
 * The notifications' shared state (spec 012 R7, contracts/ui.md §1, §3).
 *
 * One pulse for the whole app: it polls the unread count every 8 s while the
 * page is visible and every 60 s while it's hidden, and again straight after
 * the member's own actions. The bell, the panel, the toasts and the pages all
 * read it from here, so they never disagree.
 *
 * It also owns what happens when a notification is opened: mark it read, ask
 * the server where it points, then either hand the target to the Board (which
 * opens the task without reloading) or go to /board. A task that is gone
 * shows "This task is no longer available".
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { useLocale, useTranslations } from 'next-intl'
import type { AppNotification } from '@/types/index'
import type { NotifyApi, OpenTarget, NotificationActor } from './types'
import { NotificationToasts, type Toast } from './NotificationToasts'

const VISIBLE_MS = 8_000
const HIDDEN_MS = 60_000

export interface NotifyContextValue {
  api: NotifyApi
  meId: string
  unread: number
  dnd: boolean
  /** Goes up whenever something new arrives, so open lists reload. */
  version: number
  refresh(): void
  setUnread(n: number): void
  setDnd(on: boolean): void
  /** The task open in the task panel: no toasts for it (FR-037). */
  setOpenTaskId(id: string | null): void
  /** Open a notification: mark read, then go where it points. */
  open(id: string): Promise<void>
  /** The Board opens tasks in place; elsewhere the app goes to /board. */
  setNavigator(fn: ((target: OpenTarget) => void) | null): void
  showGone(): void
}

const Ctx = createContext<NotifyContextValue | null>(null)

export function useNotify(): NotifyContextValue | null {
  return useContext(Ctx)
}

export function boardHref(t: OpenTarget): string {
  const q = new URLSearchParams({ task: t.taskId })
  if (t.section) q.set('section', t.section)
  else if (t.commentId) q.set('comment', t.commentId)
  return `/board?${q.toString()}`
}

export function NotifyProvider({ api, meId, storedLocale, children }: {
  api: NotifyApi
  meId: string
  /** The member's stored language; corrected to the one in use if they differ (R13). */
  storedLocale?: 'en' | 'ar'
  children: ReactNode
}) {
  const router = useRouter()
  const t = useTranslations('notifications')
  const locale = useLocale() === 'ar' ? 'ar' : 'en'
  useEffect(() => {
    if (storedLocale && storedLocale !== locale) void api.setLocale(locale)
  }, [api, storedLocale, locale])
  const [unread, setUnread] = useState(0)
  const [dnd, setDnd] = useState(false)
  const [version, setVersion] = useState(0)
  const [gone, setGone] = useState(false)
  const [toast, setToast] = useState<Toast | null>(null)
  const navigator = useRef<((target: OpenTarget) => void) | null>(null)
  const openTask = useRef<string | null>(null)
  const dndRef = useRef(false)
  // What the last pulse showed: id plus time, so a group that grows is news again.
  const known = useRef<Set<string> | null>(null)
  const timer = useRef<number | null>(null)
  const inFlight = useRef(false)

  const announce = useCallback(async (fresh: string[]) => {
    if (dndRef.current || document.visibilityState !== 'visible') return
    const page = await api.list({ tab: 'unread', limit: 10 })
    if (!page.success) return
    const ids = new Set(fresh)
    const items = page.items.filter((n: AppNotification) => ids.has(n.id) && n.taskId !== openTask.current)
    if (!items.length) return
    const actors = new Map<string, NotificationActor>(page.actors.map(a => [a.id, a]))
    setToast({ key: `${items[0].id}:${items[0].lastEventAt}`, n: items[0], more: items.length - 1, actors, parents: page.parents })
  }, [api])

  const poll = useCallback(async () => {
    if (inFlight.current) return
    inFlight.current = true
    try {
      const active = document.visibilityState === 'visible' && document.hasFocus()
      const p = await api.pulse(active)
      if (!p) return
      setUnread(p.unread)
      setDnd(p.dnd)
      dndRef.current = p.dnd
      const keys = p.latest.map(l => `${l.id}|${l.last_event_at}`)
      const before = known.current
      known.current = new Set(keys)
      if (!before) return
      const fresh = p.latest.filter((l, i) => !before.has(keys[i])).map(l => l.id)
      if (fresh.length) {
        setVersion(v => v + 1)
        void announce(fresh)
      }
    } finally {
      inFlight.current = false
    }
  }, [api, announce])

  const schedule = useCallback(() => {
    if (timer.current) window.clearTimeout(timer.current)
    const ms = document.visibilityState === 'visible' ? VISIBLE_MS : HIDDEN_MS
    timer.current = window.setTimeout(async () => { await poll(); schedule() }, ms)
  }, [poll])

  useEffect(() => {
    void poll().then(schedule)
    function onVisible() { if (document.visibilityState === 'visible') void poll() ; schedule() }
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('focus', onVisible)
    return () => {
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('focus', onVisible)
      if (timer.current) window.clearTimeout(timer.current)
    }
  }, [poll, schedule])

  const refresh = useCallback(() => { void poll() }, [poll])
  const closeToast = useCallback(() => setToast(null), [])

  const open = useCallback(async (id: string) => {
    const r = await api.open(id)
    void poll()
    if (!r.success) return
    if (r.href) { router.push(r.href); return }
    if (!r.target) { setGone(true); return }
    if (navigator.current) navigator.current(r.target)
    else router.push(boardHref(r.target))
  }, [api, poll, router])

  const value = useMemo<NotifyContextValue>(() => ({
    api, meId, unread, dnd, version, refresh, setUnread,
    setDnd: on => { setDnd(on); dndRef.current = on },
    setOpenTaskId: id => { openTask.current = id },
    open,
    setNavigator: fn => { navigator.current = fn },
    showGone: () => setGone(true),
  }), [api, meId, unread, dnd, version, refresh, open])

  return (
    <Ctx.Provider value={value}>
      {children}
      <NotificationToasts toast={toast} meId={meId} onDone={closeToast} onOpen={id => { setToast(null); void open(id) }} />
      {gone && (
        <div className="fx-nt-gone" role="presentation" onClick={() => setGone(false)}>
          <div role="alertdialog" aria-modal="true" aria-labelledby="fx-nt-gone-t" aria-describedby="fx-nt-gone-s"
               data-nt-gone="" onClick={e => e.stopPropagation()}>
            <b id="fx-nt-gone-t">{t('gone')}</b>
            <span id="fx-nt-gone-s">{t('goneSub')}</span>
            <button type="button" autoFocus onClick={() => setGone(false)}
                    onKeyDown={e => { if (e.key === 'Escape') setGone(false) }}>{t('ok')}</button>
          </div>
        </div>
      )}
    </Ctx.Provider>
  )
}
