'use client'

/**
 * The rows (spec 012 contracts/ui.md §2): avatar or two stacked for a group,
 * the kind's icon, the sentence with names and the task in bold, a snippet,
 * the time, and a blue dot and tint while unread. Each row has a ⋯ menu:
 * mark read or unread, and turn off notifications for the task.
 *
 * Keyboard: ↑↓ move between rows, Enter opens one, Shift+F10 or the ⋯ button
 * opens its menu, Esc closes the menu.
 */
import { useEffect, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import type { AppNotification } from '@/types/index'
import type { NotificationActor } from './types'
import { NotificationAvatar, useRelativeTime, useSentence } from './parts'
import type { NotificationListState } from './useNotificationList'

function sameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}

function useNow() {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 60_000)
    return () => window.clearInterval(id)
  }, [])
  return now
}

export function NotificationRow({ n, actors, ownParent, now, onOpen, onRead, onMute, muted }: {
  n: AppNotification
  actors: Map<string, NotificationActor>
  ownParent?: boolean
  now: Date
  onOpen(): void
  onRead(read: boolean): void
  onMute(): void
  muted: boolean
}) {
  const t = useTranslations('notifications')
  const sentence = useSentence()
  const ago = useRelativeTime()
  const [menu, setMenu] = useState(false)
  const rowRef = useRef<HTMLDivElement>(null)
  const moreRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!menu) return
    function onDown(e: MouseEvent) { if (!rowRef.current?.contains(e.target as Node)) setMenu(false) }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [menu])
  useEffect(() => {
    if (menu) rowRef.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus()
  }, [menu])

  const unread = !n.read
  const snip = (n.kind === 'comment' || n.kind === 'reply' || n.kind === 'mention') ? n.meta.snippet : undefined

  return (
    <div ref={rowRef} className={`fx-nt-row${unread ? ' is-unread' : ''}${menu ? ' is-menu' : ''}`}
         data-notification={n.id} data-kind={n.kind}>
      <button type="button" className="fx-nt-row-main" data-nt-open=""
              onClick={onOpen}
              onKeyDown={e => {
                if (e.key === 'F10' && e.shiftKey) { e.preventDefault(); setMenu(true) }
                if (e.key === 'ContextMenu') { e.preventDefault(); setMenu(true) }
              }}>
        <NotificationAvatar n={n} actors={actors} />
        <span className="fx-nt-msg">
          <span className="fx-nt-sentence">{sentence(n, actors, { ownParent })}</span>
          {snip && <q dir="auto">“{snip}”</q>}
          <time dateTime={n.lastEventAt}>{ago(n.lastEventAt, now)}</time>
          {unread && <span className="fx-sheet-sr">, {t('unread')}</span>}
        </span>
        {unread ? <span className="fx-nt-dot" aria-hidden="true" /> : <span aria-hidden="true" />}
      </button>
      <button ref={moreRef} type="button" className="fx-nt-more" aria-label={t('more')} aria-haspopup="menu"
              aria-expanded={menu} data-nt-more-menu="" onClick={() => setMenu(v => !v)}>⋯</button>
      {menu && (
        <div className="fx-nt-menu" role="menu"
             onKeyDown={e => {
               if (e.key === 'Escape') { e.stopPropagation(); setMenu(false); moreRef.current?.focus() }
               if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                 e.preventDefault(); e.stopPropagation()
                 const items = [...e.currentTarget.querySelectorAll<HTMLElement>('[role="menuitem"]')]
                 const i = items.indexOf(document.activeElement as HTMLElement)
                 items[(i + (e.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length]?.focus()
               }
             }}>
          <button type="button" role="menuitem" data-nt-toggle-read=""
                  onClick={() => { setMenu(false); onRead(unread) }}>
            <span aria-hidden="true">{unread ? '✓' : '●'}</span>{unread ? t('markRead') : t('markUnread')}
          </button>
          {n.taskId && (
            <button type="button" role="menuitem" data-nt-mute="" disabled={muted}
                    onClick={() => { setMenu(false); onMute() }}>
              <span aria-hidden="true">🔕</span>{t('mute')}
            </button>
          )}
        </div>
      )}
    </div>
  )
}

export function NotificationList({ list, meId, onOpen, sections = true, emptyText }: {
  list: NotificationListState
  meId: string
  onOpen(n: AppNotification): void
  sections?: boolean
  emptyText?: { title: string; sub?: string }
}) {
  const t = useTranslations('notifications')
  const now = useNow()
  const sentinel = useRef<HTMLDivElement>(null)
  const [mutedTasks, setMutedTasks] = useState<Set<string>>(new Set())
  const [note, setNote] = useState('')

  useEffect(() => {
    const el = sentinel.current
    if (!el || !list.hasMore) return
    const io = new IntersectionObserver(entries => { if (entries.some(e => e.isIntersecting)) list.loadMore() }, { rootMargin: '120px' })
    io.observe(el)
    return () => io.disconnect()
  }, [list, list.hasMore])

  function onKey(e: React.KeyboardEvent<HTMLDivElement>) {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return
    const rows = [...e.currentTarget.querySelectorAll<HTMLElement>('[data-nt-open]')]
    const i = rows.indexOf(document.activeElement as HTMLElement)
    if (i < 0) return
    e.preventDefault()
    rows[Math.max(0, Math.min(rows.length - 1, i + (e.key === 'ArrowDown' ? 1 : -1)))]?.focus()
  }

  async function mute(taskId: string) {
    const ok = await list.mute(taskId)
    if (ok) { setMutedTasks(s => new Set(s).add(taskId)); setNote(t('muted')) }
  }

  if (list.loaded && !list.items.length) {
    return (
      <div className="fx-nt-empty" data-nt-empty="">
        <b>{emptyText?.title ?? t('caught')}</b>
        {emptyText ? emptyText.sub : t('caughtSub')}
      </div>
    )
  }

  const today = list.items.filter(n => sameDay(new Date(n.lastEventAt), now))
  const earlier = list.items.filter(n => !sameDay(new Date(n.lastEventAt), now))
  const groups = sections
    ? [{ key: 'today', rows: today }, { key: 'earlier', rows: earlier }].filter(g => g.rows.length)
    : [{ key: 'all', rows: list.items }]

  const row = (n: AppNotification) => (
    <NotificationRow key={n.id} n={n} actors={list.actors} now={now}
                     ownParent={n.kind === 'reply' && n.commentId ? list.parents[n.commentId] === meId : undefined}
                     muted={!!n.taskId && mutedTasks.has(n.taskId)}
                     onOpen={() => onOpen(n)}
                     onRead={read => void list.setRead(n.id, read)}
                     onMute={() => n.taskId && void mute(n.taskId)} />
  )

  return (
    <div className="fx-nt-list" onKeyDown={onKey} data-nt-list="">
      {note && <p className="fx-nt-note" role="status">{note}</p>}
      {groups.map(g => (
        <section key={g.key} aria-label={g.key === 'all' ? undefined : t(g.key as 'today' | 'earlier')}>
          {g.key !== 'all' && <h3 className="fx-nt-sect">{t(g.key as 'today' | 'earlier')}</h3>}
          {g.rows.map(row)}
        </section>
      ))}
      {list.hasMore && <div ref={sentinel} className="fx-nt-sentinel" data-nt-more="" aria-hidden="true" />}
      {list.loading && <p className="fx-nt-loading" aria-hidden="true">…</p>}
    </div>
  )
}
