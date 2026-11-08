'use client'

/**
 * The pop-up for something new while the member is working (spec 012 US6,
 * contracts/ui.md §3): one at a time, "and N more" when several arrive
 * together, 5 seconds, paused while the pointer is on it. Announced politely
 * and never takes focus. The provider decides whether to show one at all
 * (not with Do not disturb, not for the open task).
 */
import { useEffect, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import type { AppNotification } from '@/types/index'
import type { NotificationActor } from './types'
import { NotificationAvatar, useSentence } from './parts'

export interface Toast {
  key: string
  n: AppNotification
  more: number
  actors: Map<string, NotificationActor>
  parents: Record<string, string>
}

export const TOAST_MS = 5_000

export function NotificationToasts({ toast, onDone, onOpen, meId }: {
  toast: Toast | null
  onDone(): void
  onOpen(id: string): void
  meId?: string
}) {
  const t = useTranslations('notifications')
  const sentence = useSentence()
  const [paused, setPaused] = useState(false)
  const left = useRef(TOAST_MS)
  const started = useRef(0)

  useEffect(() => { left.current = TOAST_MS; setPaused(false) }, [toast?.key])

  useEffect(() => {
    if (!toast || paused) return
    started.current = Date.now()
    const id = window.setTimeout(onDone, left.current)
    return () => {
      window.clearTimeout(id)
      left.current = Math.max(0, left.current - (Date.now() - started.current))
    }
  }, [toast, paused, onDone])

  return (
    <div className="fx-nt-toasts" role="status" aria-live="polite">
      {toast && (
        <div className="fx-nt-toast" data-nt-toast={toast.n.id} key={toast.key}
             onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)}>
          <button type="button" className="fx-nt-toast-main" onClick={() => onOpen(toast.n.id)}>
            <NotificationAvatar n={toast.n} actors={toast.actors} />
            <span className="fx-nt-toast-txt">
              <span>{sentence(toast.n, toast.actors, { ownParent: toast.n.commentId ? toast.parents[toast.n.commentId] === meId : undefined })}</span>
              {(toast.n.meta.snippet || toast.more > 0) && (
                <small dir="auto">
                  {toast.n.meta.snippet ? `“${toast.n.meta.snippet}”` : ''}
                  {toast.n.meta.snippet && toast.more > 0 ? ' · ' : ''}
                  {toast.more > 0 ? t('andMore', { n: toast.more }) : ''}
                </small>
              )}
            </span>
          </button>
          <button type="button" className="fx-nt-toast-x" aria-label={t('close')} onClick={onDone}>×</button>
          <span className={`fx-nt-toast-bar${paused ? ' is-paused' : ''}`} aria-hidden="true" />
        </div>
      )}
    </div>
  )
}
