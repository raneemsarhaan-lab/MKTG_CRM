'use client'

/**
 * QA 26 Nov 2026 (F07): a sheet edit sent while the connection is down is kept and sent again when it's
 * back — never shown as "Saved" before the server has it. Shared by every sheet on the page; the
 * workbook's status reads it ("Offline — 2 edits will save when you're back").
 */
import { useSyncExternalStore } from 'react'

type Job = () => Promise<unknown>
let sending = 0
const waiting: Job[] = []
const subs = new Set<() => void>()
let snap = '0:0'
const emit = () => { snap = `${sending}:${waiting.length}`; subs.forEach(f => f()) }

/** A failure of the connection rather than a refusal by the server. */
export function isOffline(e: unknown): boolean {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return true
  return /failed to fetch|networkerror|load failed|network request failed|fetch failed/i.test(String((e as Error)?.message ?? e))
}

/** Sends now; if the connection is down, keeps the edit and answers as queued. */
export async function sendOrQueue<R>(job: () => Promise<R>): Promise<R | { success: true; queued: true }> {
  sending++; emit()
  try {
    return await job()
  } catch (e) {
    if (isOffline(e)) { waiting.push(job); return { success: true, queued: true } }
    throw e
  } finally {
    sending--; emit()
  }
}

let flushing = false
async function flush() {
  if (flushing) return
  flushing = true
  try {
    while (waiting.length) {
      try { await waiting[0](); waiting.shift(); emit() } catch (e) { if (isOffline(e)) return; waiting.shift(); emit() }
    }
  } finally { flushing = false }
}
if (typeof window !== 'undefined') {
  window.addEventListener('online', () => void flush())
  window.setInterval(() => { if (waiting.length && navigator.onLine !== false) void flush() }, 8000)
  window.addEventListener('beforeunload', e => { if (waiting.length) { e.preventDefault(); e.returnValue = '' } })
}

const subscribe = (f: () => void) => { subs.add(f); return () => { subs.delete(f) } }
/** { sending, waiting } — the edits on their way and the ones kept until the connection is back. */
export function useSaveQueue(): { sending: number; waiting: number } {
  const s = useSyncExternalStore(subscribe, () => snap, () => '0:0')
  const [a, b] = s.split(':').map(Number)
  return { sending: a, waiting: b }
}
