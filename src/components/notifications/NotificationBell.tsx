'use client'

/**
 * The bell beside the Inbox (spec 012 US1, contracts/ui.md §1–§2).
 *
 * A red count ("9+" above nine), hidden at zero. Clicking opens the panel:
 * All and Unread, Mark all as read, the rows a page at a time, the offer of
 * phone alerts, and the links to settings and the full history. Under the
 * bell on a computer; the whole screen on a phone. Esc closes it and puts
 * focus back on the bell.
 */
import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import type { AppNotification } from '@/types/index'
import { BellIcon } from './parts'
import { useNotify } from './NotifyProvider'
import { useNotificationList } from './useNotificationList'
import { NotificationList } from './NotificationList'
import { PushOffer } from './PushOffer'

export function NotificationBell() {
  const ctx = useNotify()
  const t = useTranslations('notifications')
  const [open, setOpen] = useState(false)
  const btn = useRef<HTMLButtonElement>(null)
  const unread = ctx?.unread ?? 0

  function close() {
    setOpen(false)
    requestAnimationFrame(() => btn.current?.focus())
  }

  return (
    <div className="fx-nt-wrap">
      <button ref={btn} type="button" className="fx-nt-bell" data-bell="" data-count={unread}
              aria-label={t('bellLabel', { n: unread })} title={t('bell')}
              aria-expanded={open} aria-controls="fx-nt-panel" aria-haspopup="dialog"
              onClick={() => (open ? close() : setOpen(true))}>
        <BellIcon />
        {unread > 0 && <span className="fx-nt-badge" data-bell-badge="" aria-hidden="true">{unread > 9 ? '9+' : unread}</span>}
      </button>
      {open && <NotificationPanel onClose={close} buttonRef={btn} />}
    </div>
  )
}

export function NotificationPanel({ onClose, buttonRef }: { onClose(): void; buttonRef: React.RefObject<HTMLButtonElement | null> }) {
  const ctx = useNotify()
  const t = useTranslations('notifications')
  const [tab, setTab] = useState<'all' | 'unread'>('all')
  const list = useNotificationList({ tab })
  const panel = useRef<HTMLDivElement>(null)

  // Just under the bell, so the bell stays in view; against the window's edge
  // so it never runs off screen, whatever sits beside the bell.
  const [top, setTop] = useState<number | null>(null)
  useEffect(() => {
    const place = () => {
      const r = buttonRef.current?.getBoundingClientRect()
      setTop(r && r.bottom > 0 ? Math.round(r.bottom + 10) : 16)
    }
    place()
    window.addEventListener('resize', place)
    window.addEventListener('scroll', place, { passive: true })
    return () => { window.removeEventListener('resize', place); window.removeEventListener('scroll', place) }
  }, [buttonRef])

  useEffect(() => {
    panel.current?.querySelector<HTMLElement>('[data-nt-tab][aria-selected="true"]')?.focus()
  }, [])

  useEffect(() => {
    function onDown(e: MouseEvent) {
      const target = e.target as Node
      if (panel.current?.contains(target) || buttonRef.current?.contains(target)) return
      // The "no longer available" dialog sits outside the panel.
      if ((target as Element).closest?.('.fx-nt-gone')) return
      onClose()
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && !e.defaultPrevented) { e.preventDefault(); onClose() }
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey) }
  }, [onClose, buttonRef])

  function openRow(n: AppNotification) {
    if (!n.read) void list.setRead(n.id, true)
    onClose()
    void ctx?.open(n.id)
  }

  const hasUnread = (ctx?.unread ?? 0) > 0 || list.items.some(i => !i.read)

  return (
    <div ref={panel} id="fx-nt-panel" className="fx-nt-panel" role="dialog" aria-label={t('title')} data-notification-panel=""
         style={top !== null ? ({ '--nt-top': `${top}px` } as React.CSSProperties) : undefined}>
      <div className="fx-nt-head">
        <h2>{t('title')}</h2>
        <span className="fx-nt-head-acts">
          <button type="button" className="fx-nt-link" data-mark-all="" disabled={!hasUnread} onClick={() => void list.markAll()}>
            {t('markAll')}
          </button>
          <button type="button" className="fx-nt-x" aria-label={t('close')} data-nt-close="" onClick={onClose}>×</button>
        </span>
      </div>
      <div className="fx-nt-tabs" role="tablist" aria-label={t('title')}
           onKeyDown={e => {
             if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
             e.preventDefault()
             const next = tab === 'all' ? 'unread' : 'all'
             setTab(next)
             requestAnimationFrame(() => panel.current?.querySelector<HTMLElement>(`[data-nt-tab="${next}"]`)?.focus())
           }}>
        {(['all', 'unread'] as const).map(x => (
          <button key={x} type="button" role="tab" className="fx-nt-tab" data-nt-tab={x}
                  aria-selected={tab === x} tabIndex={tab === x ? 0 : -1} onClick={() => setTab(x)}>
            {t(x)}
          </button>
        ))}
      </div>
      <div className="fx-nt-body">
        <PushOffer variant="panel" />
        <NotificationList list={list} meId={ctx?.meId ?? ''} onOpen={openRow} />
      </div>
      <div className="fx-nt-foot">
        <Link href="/notifications/settings" className="fx-nt-link" data-nt-settings="" onClick={onClose}>⚙ {t('settings')}</Link>
        <Link href="/notifications" className="fx-nt-link" data-nt-see-all="" onClick={onClose}>{t('seeAll')}</Link>
      </div>
    </div>
  )
}
