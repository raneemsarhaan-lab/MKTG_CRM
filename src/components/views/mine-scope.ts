'use client'

/**
 * QA 26 Nov 2026 (F12): one "Mine" per page, shared by its Board, Sheet, List and Calendar views. It lives
 * in this browser (as the board's always did) under `momentum.scope.<page>`; a change in one view reaches
 * the others on the page at once.
 */
import { useCallback, useEffect, useState } from 'react'

export type Scope = 'me' | 'team'
const EVT = 'momentum:scope'

export function useMineScope(storageKey: string, fallback: Scope = 'team'): [Scope, (next: Scope) => void] {
  const [scope, setScope] = useState<Scope>(fallback)
  useEffect(() => {
    try { const v = window.localStorage.getItem(storageKey); if (v === 'me' || v === 'team') setScope(v) } catch { /* private mode */ }
    const on = (e: Event) => { const d = (e as CustomEvent<{ key: string; value: Scope }>).detail; if (d?.key === storageKey) setScope(d.value) }
    window.addEventListener(EVT, on)
    return () => window.removeEventListener(EVT, on)
  }, [storageKey])
  const choose = useCallback((next: Scope) => {
    setScope(next)
    try { window.localStorage.setItem(storageKey, next) } catch { /* private mode */ }
    window.dispatchEvent(new CustomEvent(EVT, { detail: { key: storageKey, value: next } }))
  }, [storageKey])
  return [scope, choose]
}

/** A task is mine when I'm its lead (else its owner) or one of its assignees — as on the board. */
export const isMine = (t: { assignee_id?: string | null; task_owner_id: string; assignee_ids?: string[] | null }, me: string) =>
  (t.assignee_id ?? t.task_owner_id) === me || !!t.assignee_ids?.includes(me)
