'use client'

/**
 * A list of notifications, a page at a time (spec 012 FR-030, FR-035): the
 * panel and the Notifications page share it. Pages come by cursor, so a
 * row never repeats or goes missing while new ones arrive. When the pulse
 * says something new came in, the first page reloads.
 *
 * Marking a row on the Unread tab leaves it in place, dimmed, until the tab
 * is opened again (T028): rows don't jump out from under the pointer.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import type { AppNotification } from '@/types/index'
import type { ListQuery, NotificationActor } from './types'
import { useNotify } from './NotifyProvider'

export const PAGE = 20

export interface NotificationListState {
  items: AppNotification[]
  actors: Map<string, NotificationActor>
  parents: Record<string, string>
  loading: boolean
  loaded: boolean
  hasMore: boolean
  error: boolean
  loadMore(): void
  setRead(id: string, read: boolean): Promise<void>
  markAll(): Promise<void>
  mute(taskId: string): Promise<boolean>
}

export function useNotificationList(query: ListQuery, enabled = true): NotificationListState {
  const ctx = useNotify()
  const api = ctx?.api
  const [items, setItems] = useState<AppNotification[]>([])
  const [actors, setActors] = useState<Map<string, NotificationActor>>(new Map())
  const [parents, setParents] = useState<Record<string, string>>({})
  const [next, setNext] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState(false)
  const sig = JSON.stringify(query)
  const gen = useRef(0)
  const busy = useRef(false)

  const fetchPage = useCallback(async (before: string | null, replace: boolean) => {
    if (!api) return
    const mine = replace ? ++gen.current : gen.current
    busy.current = true
    setLoading(true)
    const r = await api.list({ ...(JSON.parse(sig) as ListQuery), before, limit: PAGE })
    busy.current = false
    if (mine !== gen.current) return
    setLoading(false)
    setLoaded(true)
    if (!r.success) { setError(true); return }
    setError(false)
    setItems(prev => {
      if (replace) return r.items
      const seen = new Set(prev.map(p => p.id))
      return [...prev, ...r.items.filter(i => !seen.has(i.id))]
    })
    setActors(prev => {
      const m = replace ? new Map<string, NotificationActor>() : new Map(prev)
      for (const a of r.actors) m.set(a.id, a)
      return m
    })
    setParents(prev => (replace ? r.parents : { ...prev, ...r.parents }))
    setNext(r.next)
  }, [api, sig])

  // A new query (tab, filters) starts over.
  useEffect(() => {
    if (!enabled) return
    setItems([]); setNext(null); setLoaded(false)
    void fetchPage(null, true)
  }, [enabled, fetchPage])

  // Something new arrived: refresh the first page, keeping what's below it.
  const version = ctx?.version ?? 0
  const first = useRef(true)
  useEffect(() => {
    if (first.current) { first.current = false; return }
    if (!enabled || !api) return
    let cancelled = false
    void api.list({ ...(JSON.parse(sig) as ListQuery), before: null, limit: PAGE }).then(r => {
      if (cancelled || !r.success) return
      setItems(prev => {
        const fresh = new Map(r.items.map(i => [i.id, i]))
        const rest = prev.filter(p => !fresh.has(p.id))
        return [...r.items, ...rest].sort((a, b) => (a.lastEventAt < b.lastEventAt ? 1 : a.lastEventAt > b.lastEventAt ? -1 : a.id < b.id ? 1 : -1))
      })
      setActors(prev => { const m = new Map(prev); for (const a of r.actors) m.set(a.id, a); return m })
      setParents(prev => ({ ...prev, ...r.parents }))
    })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version])

  const loadMore = useCallback(() => {
    if (busy.current || !next) return
    void fetchPage(next, false)
  }, [fetchPage, next])

  const setRead = useCallback(async (id: string, read: boolean) => {
    if (!api) return
    setItems(prev => prev.map(i => (i.id === id ? { ...i, read } : i)))
    const r = await api.mark(id, read)
    if (r.success) ctx?.setUnread(r.unread)
    else setItems(prev => prev.map(i => (i.id === id ? { ...i, read: !read } : i)))
  }, [api, ctx])

  const markAll = useCallback(async () => {
    if (!api) return
    const before = items
    setItems(prev => prev.map(i => ({ ...i, read: true })))
    ctx?.setUnread(0)
    const r = await api.markAll()
    if (!r.success) { setItems(before); ctx?.refresh() }
  }, [api, ctx, items])

  const mute = useCallback(async (taskId: string) => {
    if (!api) return false
    const r = await api.mute(taskId)
    return r.success
  }, [api])

  return { items, actors, parents, loading, loaded, hasMore: !!next, error, loadMore, setRead, markAll, mute }
}
