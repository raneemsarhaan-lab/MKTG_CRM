'use client'

/**
 * The workbook's outbox (spec 013 R6, FR-080–FR-083): blank-sheet changes are
 * applied on screen at once and queued here per sheet. The queue flushes 400 ms
 * after the last change, or at once on a tab switch or when the page is hidden,
 * in calls of at most 2,000 cells. A network failure is retried at 2, 4, 8 and
 * 16 s, then every 30 s; a refusal is handed back to the sheet, which reloads
 * from the server and says why. Leaving with changes waiting asks first.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import type { SheetChanges } from '@/types/index'
import { chunk, mergeServer } from '@/lib/sheet-doc'
import type { SheetsApi } from './types'

export type SaveStatus = 'saved' | 'saving' | 'retrying'
export interface Outbox {
  status: SaveStatus
  /** Changes waiting or in flight, for the "retrying (N)" count. */
  pending: number
  enqueue(sheetId: string, changes: SheetChanges): void
  flush(): Promise<void>
  /** Runs a tab-level call with the same status (rename, colour, move…). */
  track<T>(p: Promise<T>): Promise<T>
}

const DELAYS = [2000, 4000, 8000, 16000]

export function useOutbox(api: SheetsApi, handlers: {
  onRefused(sheetId: string, error: string): void
  onSaved?(sheetId: string, res: { positions?: { rows?: { id: string; position: number }[]; cols?: { id: string; position: number }[] }; skipped: unknown[] }): void
}): Outbox {
  const queue = useRef(new Map<string, SheetChanges>())
  const busy = useRef(false)
  const timer = useRef<number | undefined>(undefined)
  const attempt = useRef(0)
  const [status, setStatus] = useState<SaveStatus>('saved')
  const [pending, setPending] = useState(0)
  const [tracked, setTracked] = useState(0)
  const h = useRef(handlers)
  h.current = handlers

  const count = () => { let n = 0; for (const c of queue.current.values()) n += (c.cells?.length ?? 0) + (c.insertRows?.length ?? 0) + (c.deleteRows?.length ?? 0) + (c.insertCols?.length ?? 0) + (c.deleteCols?.length ?? 0) + (c.rowHeights?.length ?? 0) + (c.colWidths?.length ?? 0) + (c.formats?.length ?? 0) + (c.merges?.add?.length ?? 0) + (c.merges?.remove?.length ?? 0) + (c.view ? 1 : 0) + (c.rules ? 1 : 0) + (c.tables ? 1 : 0) + (c.rowPositions?.length ? 1 : 0); return n }

  const flush = useCallback(async () => {
    window.clearTimeout(timer.current)
    if (busy.current || !queue.current.size) return
    busy.current = true
    setStatus('saving')
    try {
      for (const [sheetId, changes] of [...queue.current.entries()]) {
        queue.current.delete(sheetId)
        const parts = chunk(changes)
        for (let i = 0; i < parts.length; i++) {
          const res = await api.applySheetChanges(sheetId, parts[i])
          if (res.success) { h.current.onSaved?.(sheetId, res); continue }
          if (res.error === 'network') {
            // Put back what didn't go, ahead of anything newer, and retry.
            const left = parts.slice(i).reduce((a, b) => mergeServer(a, b))
            const newer = queue.current.get(sheetId)
            queue.current.set(sheetId, newer ? mergeServer(left, newer) : left)
            throw new Error('network')
          }
          h.current.onRefused(sheetId, res.error)
          break
        }
      }
      attempt.current = 0
      setPending(count())
      setStatus(queue.current.size ? 'saving' : 'saved')
      busy.current = false
      if (queue.current.size) timer.current = window.setTimeout(() => void flush(), 50)
    } catch {
      busy.current = false
      setPending(count())
      setStatus('retrying')
      const d = DELAYS[Math.min(attempt.current, DELAYS.length)] ?? 30000
      attempt.current++
      timer.current = window.setTimeout(() => void flush(), d)
    }
  }, [api])

  const enqueue = useCallback((sheetId: string, changes: SheetChanges) => {
    const prev = queue.current.get(sheetId)
    queue.current.set(sheetId, prev ? mergeServer(prev, changes) : changes)
    setPending(count())
    if (status !== 'retrying') setStatus('saving')
    window.clearTimeout(timer.current)
    if (attempt.current === 0) timer.current = window.setTimeout(() => void flush(), 400)
  }, [flush, status])

  const track = useCallback(async <T,>(p: Promise<T>) => {
    setTracked(n => n + 1)
    try { return await p } finally { setTracked(n => n - 1) }
  }, [])

  useEffect(() => {
    const hide = () => { if (document.visibilityState === 'hidden') void flush() }
    const leave = (e: BeforeUnloadEvent) => { if (queue.current.size || busy.current) { e.preventDefault(); e.returnValue = '' } }
    const online = () => { attempt.current = 0; void flush() }
    document.addEventListener('visibilitychange', hide)
    window.addEventListener('pagehide', () => void flush())
    window.addEventListener('beforeunload', leave)
    window.addEventListener('online', online)
    return () => {
      document.removeEventListener('visibilitychange', hide)
      window.removeEventListener('beforeunload', leave)
      window.removeEventListener('online', online)
    }
  }, [flush])

  const shown: SaveStatus = status === 'retrying' ? 'retrying' : status === 'saving' || tracked > 0 ? 'saving' : 'saved'
  return { status: shown, pending, enqueue, flush, track }
}
