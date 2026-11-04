'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

export type SaveStatus = 'saved' | 'saving' | 'error'

/** Automatic retries after a failed save: 2 s, 5 s, 15 s, then every 30 s. */
const BACKOFF_MS = [2_000, 5_000, 15_000, 30_000]
/** A save that has not settled by now is treated as failed. */
export const SAVE_WATCHDOG_MS = 20_000

/**
 * The brief's autosave, with failure handling. data-model §3, research R1.
 *
 * Two things went wrong before (audit E7, plus what research found):
 *  1. The text was marked saved *before* the request returned, so a failed
 *     save never retried and the status went back to "Saved".
 *  2. If the host's save threw, its promise never settled, the request stayed
 *     "in flight" forever, and every later keystroke queued behind it.
 *
 * Now `confirmed` only advances when `onSave` resolves `true`. At most one
 * request is in flight and it always carries the newest text, so an older save
 * can never land after a newer one. A failure shows "Couldn't save" and retries
 * on a backoff, on Retry, or on the next keystroke; a call that has not settled
 * after 20 s counts as failed.
 *
 * Invariant: `status === 'saved'` exactly when nothing is in flight and the
 * newest text is the confirmed text.
 */
export function useSaveQueue(
  initial: string,
  onSave: (markdown: string) => Promise<boolean>,
) {
  const [status, setStatus] = useState<SaveStatus>('saved')
  const latest    = useRef(initial)
  const confirmed = useRef(initial)
  const inFlight  = useRef(false)
  const failures  = useRef(0)
  const retryTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const alive     = useRef(true)
  const saveRef   = useRef(onSave)
  saveRef.current = onSave

  const set = useCallback((s: SaveStatus) => { if (alive.current) setStatus(s) }, [])

  const send = useCallback(function send() {
    if (inFlight.current) return
    if (retryTimer.current) { clearTimeout(retryTimer.current); retryTimer.current = null }
    const text = latest.current
    if (text === confirmed.current) { failures.current = 0; set('saved'); return }

    inFlight.current = true
    set('saving')
    let settled = false
    const finish = (ok: boolean) => {
      if (settled) return
      settled = true
      clearTimeout(watchdog)
      inFlight.current = false
      if (ok) {
        confirmed.current = text
        failures.current = 0
        if (latest.current !== confirmed.current) send()
        else set('saved')
        return
      }
      failures.current += 1
      set('error')
      if (!alive.current) return
      const wait = BACKOFF_MS[Math.min(failures.current - 1, BACKOFF_MS.length - 1)]
      retryTimer.current = setTimeout(() => { retryTimer.current = null; send() }, wait)
    }
    // A hung request is abandoned, not cancelled: a server action can't be
    // aborted. If it does land later it carries older text, and the next
    // successful send (always the newest text) overwrites it.
    const watchdog = setTimeout(() => finish(false), SAVE_WATCHDOG_MS)
    Promise.resolve()
      .then(() => saveRef.current(text))
      .then(ok => finish(ok === true), () => finish(false))
  }, [set])

  /** The editor's text changed: remember it and send it (one at a time). */
  const update = useCallback((text: string) => {
    latest.current = text
    send()
  }, [send])

  /** "Retry" in the toolbar: send the newest text now. */
  const retry = useCallback(() => send(), [send])

  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
      if (retryTimer.current) clearTimeout(retryTimer.current)
      // Catch whatever never got a chance to start a save at all if the editor
      // unmounts out from under it — closing the panel mid-keystroke, say. A
      // save already in flight keeps going and, if it succeeds while newer text
      // is waiting, sends that too from its own completion.
      if (!inFlight.current && latest.current !== confirmed.current) {
        void Promise.resolve().then(() => saveRef.current(latest.current)).catch(() => {})
      }
    }
  }, [])

  return { status, update, retry }
}
