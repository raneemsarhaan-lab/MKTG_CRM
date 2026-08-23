'use client'

import { useEffect, useState } from 'react'

/**
 * "This page is older than the server — reload."
 *
 * A server action is a POST to the current URL carrying an action id that was
 * baked into the page's JavaScript. Deploy a new build and those ids change,
 * so a tab that was open across the deploy sends ids the new server has never
 * heard of and Next answers 404. React turns that into an unhandled rejection
 * reading "An unexpected response was received from the server", which nobody
 * sees, and the interface does nothing at all: buttons stop working, saves
 * vanish, an upload appears to be ignored.
 *
 * That is indistinguishable from a broken feature, and it is how "the attach
 * button does nothing" gets reported when the real answer is "reload the tab".
 * So: catch exactly that failure and say so.
 *
 * Deliberately narrow. It listens for the rejection React already emits rather
 * than wrapping every action, and it only speaks for this one message — a
 * banner that appeared on any error would be worse than none, because people
 * would learn to reload at random and it would stop meaning anything.
 */

/** The message React raises when a POST to an action comes back as anything else. */
const STALE = 'An unexpected response was received from the server'

export function StaleBuildNotice() {
  const [stale, setStale] = useState(false)

  useEffect(() => {
    const onRejection = (e: PromiseRejectionEvent) => {
      const message = e.reason instanceof Error ? e.reason.message : String(e.reason ?? '')
      if (message.includes(STALE)) setStale(true)
    }
    window.addEventListener('unhandledrejection', onRejection)
    return () => window.removeEventListener('unhandledrejection', onRejection)
  }, [])

  if (!stale) return null

  return (
    <div
      role="alert"
      style={{
        position: 'fixed', left: '50%', bottom: 24, transform: 'translateX(-50%)',
        zIndex: 9999, display: 'flex', alignItems: 'center', gap: 14,
        background: '#1C1836', color: '#fff', borderRadius: 12,
        padding: '13px 16px 13px 18px', fontSize: 14, fontWeight: 600,
        boxShadow: '0 8px 28px rgba(28,24,54,.28)', maxWidth: 'min(92vw, 560px)',
      }}
    >
      <span aria-hidden="true" style={{ fontSize: 17 }}>♻️</span>
      <span style={{ flex: 1, lineHeight: 1.4 }}>
        This tab is running an older version of Momentum, so that last action
        did not save. Reload to pick up the current one.
      </span>
      <button
        type="button"
        onClick={() => window.location.reload()}
        style={{
          flexShrink: 0, border: 'none', borderRadius: 8, cursor: 'pointer',
          background: '#D9F24B', color: '#1C1836',
          padding: '8px 14px', fontFamily: 'inherit', fontSize: 13.5, fontWeight: 800,
        }}
      >
        Reload
      </button>
    </div>
  )
}
