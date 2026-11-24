'use client'

import { useEffect, useRef } from 'react'
import type React from 'react'

const FOCUSABLE = [
  'a[href]', 'button:not([disabled])', 'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])', 'textarea:not([disabled])', 'iframe', 'video[controls]',
  '[contenteditable="true"]', '[tabindex]:not([tabindex="-1"])',
].join(',')

function focusables(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE))
    .filter(el => el.getClientRects().length > 0 && !el.closest('[inert]'))
}

/**
 * Keyboard focus for a modal panel: moves focus in when it opens, keeps Tab
 * inside it, and hands focus back to whatever opened it when it closes.
 *
 * `returnTo` is a selector to fall back on when the element that opened the
 * panel is gone by then (a board refresh can replace the card's node).
 *
 * Returns the ref for the panel and the onKeyDown handler that wraps Tab.
 */
export function useDialogFocus<T extends HTMLElement>(returnTo?: string) {
  const ref = useRef<T>(null)
  const opener = useRef<HTMLElement | null>(null)
  const returnToRef = useRef(returnTo)
  returnToRef.current = returnTo

  useEffect(() => {
    const panel = ref.current
    const active = document.activeElement
    // Kept from the first run only: React's dev double-run of effects would
    // otherwise record the panel itself as the opener.
    if (!opener.current && active instanceof HTMLElement && !panel?.contains(active)) opener.current = active
    // Something inside may already have taken focus on mount (an autoFocus
    // field, the attachment preview) — leave it there.
    if (panel && !panel.contains(active)) panel.focus({ preventScroll: true })
    return () => {
      // After React has removed the panel, so focus isn't lost with it.
      window.setTimeout(() => {
        if (panel?.isConnected) return  // not really closed (dev double-run)
        const o = opener.current
        const target = o?.isConnected && o !== document.body
          ? o
          : returnToRef.current ? document.querySelector<HTMLElement>(returnToRef.current) : null
        target?.focus({ preventScroll: true })
      }, 0)
    }
  }, [])

  function onKeyDown(e: React.KeyboardEvent<T>) {
    // Something inside (the attachment preview, a table cell in the brief)
    // has already dealt with Tab.
    if (e.key !== 'Tab' || e.defaultPrevented || !ref.current) return
    const list = focusables(ref.current)
    if (!list.length) { e.preventDefault(); return }
    const first = list[0], last = list[list.length - 1]
    const active = document.activeElement
    if (e.shiftKey && (active === first || active === ref.current)) { e.preventDefault(); last.focus() }
    else if (!e.shiftKey && active === last) { e.preventDefault(); first.focus() }
  }

  return { ref, onKeyDown }
}
