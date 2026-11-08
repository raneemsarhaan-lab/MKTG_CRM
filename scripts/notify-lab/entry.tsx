/**
 * Notifications lab (spec 012 T019 and on): mounts the real NotifyProvider,
 * bell, panel, toasts, settings page, history page and reply composer with a
 * stub server that behaves like src/actions/notifications.ts (cursor pages,
 * newest first, mark, mark all, open, mute, settings).
 *
 * Hash options, e.g. `#locale=ar&count=45&page=settings`:
 *   locale   en | ar
 *   page     board | settings | history | reply
 *   count    extra comment notifications for paging (default 0)
 *   unread   all | none | some (default some)
 *   dnd      1 to start with Do not disturb on
 *   push     unsupported | off | on | ios | blocked | notready (default off)
 *   email    0 when email isn't set up
 *   delay    ms for every call (default 30)
 * Everything scenarios assert on is on `window.__nt`.
 */
import React, { useEffect } from 'react'
import { createRoot } from 'react-dom/client'
import { NextIntlClientProvider } from 'next-intl'
import en from '../../messages/en.json'
import ar from '../../messages/ar.json'
import type { AppNotification, Member, NotificationKind } from '@/types/index'
import { NotifyProvider, useNotify } from '@/components/notifications/NotifyProvider'
import { NotificationBell } from '@/components/notifications/NotificationBell'
import { NotificationSettings } from '@/components/notifications/NotificationSettings'
import { NotificationsPage } from '@/components/notifications/NotificationsPage'
import { ReplyComposer } from '@/components/kanban/ReplyComposer'
import type { ListQuery, NotifyApi, NotificationActor, OpenTarget, SettingsView } from '@/components/notifications/types'
import { DEFAULT_SETTINGS, type KindSettings } from '@/lib/notify/settings'

const params = new URLSearchParams(location.hash.slice(1))
const locale = params.get('locale') === 'ar' ? 'ar' : 'en'
const page = params.get('page') ?? 'board'
const delay = Number(params.get('delay') ?? 30)
const extra = Number(params.get('count') ?? 0)
const unreadMode = params.get('unread') ?? 'some'
const pushMode = params.get('push') ?? 'off'
document.documentElement.lang = locale
document.documentElement.dir = locale === 'ar' ? 'rtl' : 'ltr'

// ── people ──────────────────────────────────────────────────────────────────
const ACTORS: NotificationActor[] = [
  { id: 'salma', name: locale === 'ar' ? 'سلمى' : 'Salma', avatar_url: null, gender: 'f' },
  { id: 'yosra', name: locale === 'ar' ? 'يسرا' : 'Yosra', avatar_url: null, gender: 'f' },
  { id: 'samaa', name: locale === 'ar' ? 'سماء' : 'Samaa', avatar_url: null, gender: 'f' },
  { id: 'nermin', name: locale === 'ar' ? 'نرمين' : 'Nermin', avatar_url: null, gender: 'f' },
  { id: 'omar', name: locale === 'ar' ? 'عمر' : 'Omar', avatar_url: null, gender: 'm' },
  { id: 'kai', name: 'Kai', avatar_url: null, gender: null },
]
const MEMBERS: Member[] = ACTORS.map(a => ({
  id: a.id, name: a.name, email: `${a.id}@forefront.consulting`, role: 'Content Creator', access: 'user', capacity_hrs_wk: 40, status: 'Available',
}))
const ME = 'raneem'

// ── notifications, newest first: every kind, grouped rows, a gone task ─────
const NOW = Date.now()
const ago = (min: number) => new Date(NOW - min * 60_000).toISOString()
let seq = 0
const mk = (kind: NotificationKind, actors: string[], min: number, o: Partial<AppNotification> & { task?: string } = {}): AppNotification => ({
  id: o.id ?? `n${++seq}`, kind, taskId: o.taskId === undefined ? `t-${o.task ?? 'brief'}` : o.taskId, commentId: o.commentId ?? null,
  attachmentId: null, stageId: o.stageId ?? null, actorIds: actors, count: o.count ?? 1,
  meta: { task_name: o.task ? o.task : 'Campaign Brief', ...(o.meta ?? {}) }, read: o.read ?? false, lastEventAt: ago(min),
})
const SEED: AppNotification[] = [
  mk('comment', ['salma', 'yosra', 'samaa', 'nermin'], 5, { id: 'g', task: 'Q4 LinkedIn Carousel', count: 5, commentId: 'c5', meta: { task_name: 'Q4 LinkedIn Carousel', snippet: 'Love the second frame. Can we try the lime background?' } }),
  mk('task_moved_to_stage', ['nermin'], 22, { id: 'move', task: 'Manifesto Post', stageId: 'c-final' }),
  mk('mention', ['omar'], 60, { id: 'mention', commentId: 'cm', meta: { task_name: 'Campaign Brief', snippet: '@Raneem can you check the hook before Thursday?' } }),
  mk('assigned', ['omar'], 120, { id: 'assigned', task: 'Omnisight Launch Teaser' }),
  mk('task_created_in_stage', ['nermin'], 180, { id: 'created', task: 'Event Recap Video', stageId: 'd-prog', read: true }),
  mk('attachment', ['samaa'], 60 * 26, { id: 'attach', task: 'Website Hero Visual', count: 5, read: true }),
  mk('reply', ['yosra'], 60 * 27, { id: 'reply', task: 'Retreat Banner', commentId: 'r-own', read: true, meta: { task_name: 'Retreat Banner', snippet: 'Agreed, I’ll swap the photo.' } }),
  mk('reply', ['kai'], 60 * 28, { id: 'thread', task: 'Retreat Banner', commentId: 'r-thread', read: true }),
  mk('due_soon', [], 60 * 30, { id: 'due', task: 'Newsletter Draft', read: true }),
  mk('overdue', [], 60 * 50, { id: 'overdue', task: 'Event Teaser', read: true }),
  mk('comment', ['kai'], 60 * 72, { id: 'gone', taskId: 't-gone', task: 'Deleted task', read: true }),
]
for (let i = 0; i < extra; i++) SEED.push(mk('comment', [ACTORS[i % ACTORS.length].id], 60 * 80 + i * 7, { id: `x${String(i).padStart(3, '0')}`, task: `Older task ${i + 1}`, read: true }))
if (unreadMode === 'all') SEED.forEach(n => { n.read = false })
if (unreadMode === 'none') SEED.forEach(n => { n.read = true })
const PARENTS: Record<string, string> = { 'r-own': ME, 'r-thread': 'salma' }

// ── the stub server ─────────────────────────────────────────────────────────
type Call = { fn: string; args: unknown[] }
type Lab = {
  items: AppNotification[]
  calls: Call[]
  opened: OpenTarget[]
  muted: string[]
  dnd: boolean
  settings: { kinds: KindSettings; emailMode: SettingsView['emailMode']; gender: SettingsView['gender']; locale: 'en' | 'ar' }
  push: { subscribed: boolean; permission: NotificationPermission }
  failNext: Record<string, string>
  /** A new notification arrives (the server made one). */
  arrive(n: Partial<AppNotification> & { kind: NotificationKind; actorIds: string[] }): string
  /** Run the pulse now instead of waiting 8 s. */
  poll(): void
  /** What the Board does when a task panel opens (no toasts for it). */
  setOpenTask(id: string | null): void
  ready: boolean
}
declare global { interface Window { __nt: Lab } }

const sorted = (xs: AppNotification[]) => [...xs].sort((a, b) => (a.lastEventAt < b.lastEventAt ? 1 : a.lastEventAt > b.lastEventAt ? -1 : a.id < b.id ? 1 : -1))
const wait = () => new Promise(r => setTimeout(r, delay))

const lab: Lab = {
  items: sorted(SEED),
  calls: [],
  opened: [],
  muted: [],
  dnd: params.get('dnd') === '1',
  settings: { kinds: structuredClone(DEFAULT_SETTINGS), emailMode: 'daily', gender: null, locale },
  push: { subscribed: pushMode === 'on', permission: pushMode === 'blocked' ? 'denied' : pushMode === 'on' ? 'granted' : 'default' },
  failNext: {},
  arrive(n) {
    const id = n.id ?? `new${++seq}`
    lab.items = sorted([{ ...mk(n.kind, n.actorIds, 0, { id, task: n.meta?.task_name ?? 'Fresh task', ...n }), lastEventAt: new Date().toISOString() }, ...lab.items.filter(i => i.id !== id)])
    return id
  },
  poll: () => {},
  setOpenTask: () => {},
  ready: false,
}
window.__nt = lab

async function call<T>(fn: string, args: unknown[], run: () => T): Promise<T | { success: false; error: string }> {
  lab.calls.push({ fn, args })
  await wait()
  const fail = lab.failNext[fn]
  if (fail) { delete lab.failNext[fn]; return { success: false, error: fail } }
  return run()
}
const unread = () => lab.items.filter(i => !i.read).length

const api: NotifyApi = {
  async pulse() {
    await wait()
    const latest = lab.items.filter(i => !i.read).slice(0, 5).map(i => ({ id: i.id, last_event_at: i.lastEventAt }))
    return { unread: unread(), latest, dnd: lab.dnd }
  },
  list: (q: ListQuery) => call('list', [q], () => {
    let xs = lab.items
    if (q.tab === 'unread') xs = xs.filter(i => !i.read)
    if (q.kinds?.length) xs = xs.filter(i => q.kinds!.includes(i.kind))
    if (q.from) xs = xs.filter(i => i.lastEventAt >= q.from!)
    if (q.before) {
      const [at, id] = q.before.split('|')
      xs = xs.filter(i => i.lastEventAt < at || (i.lastEventAt === at && i.id < id))
    }
    const limit = q.limit ?? 20
    const page = xs.slice(0, limit).map(i => ({ ...i }))
    const last = page[page.length - 1]
    return {
      success: true as const, items: page, actors: ACTORS,
      parents: Object.fromEntries(Object.entries(PARENTS).filter(([c]) => page.some(p => p.commentId === c))),
      next: xs.length > limit && last ? `${last.lastEventAt}|${last.id}` : null,
    }
  }),
  mark: (id, read) => call('mark', [id, read], () => {
    lab.items = lab.items.map(i => (i.id === id ? { ...i, read } : i))
    return { success: true as const, unread: unread() }
  }),
  markAll: () => call('markAll', [], () => {
    lab.items = lab.items.map(i => ({ ...i, read: true }))
    return { success: true as const, unread: 0 as const }
  }),
  open: id => call('open', [id], () => {
    const n = lab.items.find(i => i.id === id)
    if (!n) return { success: false as const, error: 'not_found' }
    lab.items = lab.items.map(i => (i.id === id ? { ...i, read: true } : i))
    if (!n.taskId || n.taskId === 't-gone') return { success: true as const, target: null }
    if (n.kind === 'attachment') return { success: true as const, target: { taskId: n.taskId, section: 'attachments' as const } }
    return { success: true as const, target: n.commentId ? { taskId: n.taskId, commentId: n.commentId } : { taskId: n.taskId } }
  }),
  mute: taskId => call('mute', [taskId], () => { lab.muted.push(taskId); return { success: true as const } }),
  getFollow: taskId => call('getFollow', [taskId], () => ({ success: true as const, following: true })),
  setFollow: (taskId, following) => call('setFollow', [taskId, following], () => ({ success: true as const, following })),
  getSettings: () => call('getSettings', [], () => ({
    success: true as const, kinds: structuredClone(lab.settings.kinds), emailMode: lab.settings.emailMode, dnd: lab.dnd,
    emailReady: params.get('email') !== '0', devices: [], locale: lab.settings.locale, gender: lab.settings.gender,
  })),
  saveSettings: input => call('saveSettings', [input], () => {
    if (input.kinds) lab.settings.kinds = structuredClone(input.kinds)
    if (input.emailMode) lab.settings.emailMode = input.emailMode
    if (input.dnd !== undefined) lab.dnd = input.dnd
    return { success: true as const }
  }),
  setLocale: l => call('setLocale', [l], () => { lab.settings.locale = l; return { success: true as const } }),
  setGender: g => call('setGender', [g], () => { lab.settings.gender = g; return { success: true as const } }),
  pushKey: async () => (pushMode === 'notready' ? null : 'BElabKeyBElabKeyBElabKeyBElabKey'),
  pushSave: async sub => { lab.calls.push({ fn: 'pushSave', args: [sub] }); lab.push.subscribed = true; return true },
  pushDelete: async endpoint => { lab.calls.push({ fn: 'pushDelete', args: [endpoint] }); lab.push.subscribed = false; return true },
}

// ── the browser's push APIs, stubbed per `push=` ───────────────────────────
if (pushMode === 'unsupported') {
  delete (window as unknown as Record<string, unknown>).PushManager
} else if (pushMode === 'ios') {
  Object.defineProperty(navigator, 'userAgent', { value: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1' })
} else {
  const sub = { endpoint: 'https://push.example/lab', toJSON: () => ({ endpoint: 'https://push.example/lab', keys: { p256dh: 'p', auth: 'a' } }), unsubscribe: async () => { lab.push.subscribed = false; return true } }
  const reg = { pushManager: { getSubscription: async () => (lab.push.subscribed ? sub : null), subscribe: async () => { lab.push.subscribed = true; return sub } } }
  ;(window as unknown as Record<string, unknown>).PushManager = function PushManager() {}
  Object.defineProperty(navigator, 'serviceWorker', { value: { getRegistration: async () => reg, register: async () => reg, ready: Promise.resolve(reg) } })
  ;(window as unknown as Record<string, unknown>).Notification = {
    get permission() { return lab.push.permission },
    requestPermission: async () => { lab.calls.push({ fn: 'requestPermission', args: [] }); lab.push.permission = 'granted'; return 'granted' },
  }
}

// ── the host: what KanbanBoard and the pages do with the provider ──────────
function Host() {
  const ctx = useNotify()
  useEffect(() => {
    if (!ctx) return
    ctx.setNavigator(target => { lab.opened.push(target) })
    lab.poll = () => ctx.refresh()
    lab.setOpenTask = id => ctx.setOpenTaskId(id)
    lab.ready = true
    document.body.setAttribute('data-lab-ready', '')
  }, [ctx])
  return (
    <>
      <div className="lab-top">
        <h1>{page === 'board' ? 'Pipeline' : 'Momentum'}</h1>
        <div className="fx-hd-inbox"><NotificationBell /></div>
      </div>
      {page === 'board' && <div className="lab-board">Board</div>}
      {page === 'settings' && <NotificationSettings />}
      {page === 'history' && <NotificationsPage />}
      {page === 'reply' && (
        <div style={{ maxWidth: 420, margin: '60px 26px' }}>
          <ReplyComposer members={MEMBERS} meId={ME} replyingTo="Salma"
                         onSend={(body, mentions) => call('reply', [body, mentions], () => ({ success: true }))}
                         onCancel={() => lab.calls.push({ fn: 'cancel', args: [] })} />
        </div>
      )}
    </>
  )
}

createRoot(document.getElementById('root')!).render(
  <NextIntlClientProvider locale={locale} messages={locale === 'ar' ? ar : en} timeZone="Africa/Cairo"
                          onError={e => console.error(`${e.code}: ${e.message}`)}>
    <NotifyProvider api={api} meId={ME} storedLocale={locale}>
      <Host />
    </NotifyProvider>
  </NextIntlClientProvider>,
)
