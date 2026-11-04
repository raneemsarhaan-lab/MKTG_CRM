'use client'

import { createContext, createElement, useContext, useEffect, useRef } from 'react'

/**
 * The editor's open overlays — menus, the "/" menu, the value prompt, the link
 * card in edit mode, the table menu, the leave-confirm bar — in the order they
 * opened. data-model §5, research R2.
 *
 * Esc and a click outside the editor both close only the top one. Only when
 * nothing is open does either reach the editor's own "leave editing". Before
 * this, Esc with the Insert menu open closed the whole editor (audit E1).
 */
export interface Overlay {
  id: string
  close: () => void
  /** Where focus goes back to once this closes — usually the button that opened it. */
  returnFocusTo?: HTMLElement | null
  /** The overlay's own element, so a click inside it is not a click outside. */
  root?: () => HTMLElement | null
}

export interface OverlayStack {
  /** Register an overlay; returns the function that unregisters it. */
  push: (o: Overlay) => () => void
  /** Close the top overlay and restore focus. False when nothing was open. */
  closeTop: () => boolean
  isEmpty: () => boolean
  /** Whether a DOM node belongs to an open overlay. */
  contains: (node: Node | null) => boolean
  /** Notified whenever the stack changes, for anything that renders off it. */
  subscribe: (fn: () => void) => () => void
}

export function createOverlayStack(): OverlayStack {
  let items: Overlay[] = []
  const subs = new Set<() => void>()
  const emit = () => subs.forEach(fn => fn())
  return {
    push(o) {
      items = [...items.filter(x => x.id !== o.id), o]
      emit()
      return () => { items = items.filter(x => x !== o); emit() }
    },
    closeTop() {
      const top = items[items.length - 1]
      if (!top) return false
      items = items.slice(0, -1)
      top.close()
      top.returnFocusTo?.focus?.()
      emit()
      return true
    },
    isEmpty: () => items.length === 0,
    contains(node) {
      if (!node) return false
      return items.some(o => { const el = o.root?.(); return !!el && el.contains(node) })
    },
    subscribe(fn) { subs.add(fn); return () => { subs.delete(fn) } },
  }
}

const Ctx = createContext<OverlayStack | null>(null)

export function OverlayStackProvider({ stack, children }: { stack: OverlayStack; children: React.ReactNode }) {
  return createElement(Ctx.Provider, { value: stack }, children)
}

export function useOverlayStack(): OverlayStack | null {
  return useContext(Ctx)
}

/**
 * Keep an overlay on the stack while `open` is true. `close` and the other
 * options are read when they run, so callers can pass fresh closures freely.
 */
export function useOverlay(id: string, open: boolean, close: () => void, opts: Omit<Overlay, 'id' | 'close'> = {}) {
  const stack = useContext(Ctx)
  const latest = useRef({ close, opts })
  latest.current = { close, opts }
  useEffect(() => {
    if (!open || !stack) return
    return stack.push({
      id,
      close: () => latest.current.close(),
      get returnFocusTo() { return latest.current.opts.returnFocusTo },
      root: () => latest.current.opts.root?.() ?? null,
    })
  }, [open, stack, id])
}
