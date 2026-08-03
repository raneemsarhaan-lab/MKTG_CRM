'use client'

import { useEffect } from 'react'

/**
 * Proof that React actually started.
 *
 * Paired with the inline watchdog in the root layout: that script is written
 * into the HTML itself, so it runs even when every external chunk fails to
 * load. This component sets the flag the watchdog is waiting for. If the flag
 * never appears, the watchdog puts a banner on the page naming what went
 * wrong.
 *
 * The whole point is that it needs no bundle to deliver its message — a
 * diagnostic that depends on the thing it is diagnosing reports nothing.
 */
export function BootCheck() {
  useEffect(() => {
    ;(window as unknown as { __fluxoHydrated?: boolean }).__fluxoHydrated = true
  }, [])
  return null
}
