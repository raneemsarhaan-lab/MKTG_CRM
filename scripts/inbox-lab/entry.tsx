/**
 * Inbox lab: mounts the real InboxButton, InboxPanel and ViewMenu with a stub
 * host that mirrors KanbanBoard's wiring (spec 006 quickstart §1).
 *
 * Modes come from the hash, e.g. `#me=yosra&locale=ar&pinned=1`:
 *   me       raneem | yosra | mona | lina | sara   (default raneem)
 *   locale   en | ar
 *   now      a local time, default 2026-11-05T09:00
 *   pinned   1 to start pinned; week 1 to start with "Show your week" on
 *   empty    1 for a member with nothing waiting
 *   delay    ms for every api call (default 40)
 *
 * The stub decides moves with the real shared rule (src/lib/stage-moves.ts)
 * and celebrates under the board's rule. Everything scenarios assert on is on
 * `window.__inbox`.
 */
import React, { useMemo, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { NextIntlClientProvider } from 'next-intl'
import en from '../../messages/en.json'
import ar from '../../messages/ar.json'
import type { InboxState, InboxTab, MoveTaskResult, StageId, Task } from '@/types/index'
import { inboxModel, localDay, openingTab } from '@/lib/inbox'
import { allowedStages, holdsStage } from '@/lib/stage-moves'
import { NINE_STAGE, EIGHT_STAGE } from '@/lib/stage-meta'
import { InboxButton } from '@/components/inbox/InboxButton'
import { InboxPanel } from '@/components/inbox/InboxPanel'
import { ViewMenu } from '@/components/inbox/ViewMenu'
import type { InboxApi } from '@/components/inbox/types'
import { makeLab, MEMBERS } from './fixtures'

const params = new URLSearchParams(location.hash.slice(1))
const locale = params.get('locale') === 'ar' ? 'ar' : 'en'
const meId = params.get('me') ?? 'raneem'
const delay = Number(params.get('delay') ?? 40)
const NOW = new Date(params.get('now') ?? '2026-11-05T09:00')
document.documentElement.lang = locale
document.documentElement.dir = locale === 'ar' ? 'rtl' : 'ltr'

type Call = { fn: string; args: unknown[] }
type Lab = {
  tasks: Task[]
  state: InboxState
  calls: Call[]
  celebrations: { taskName: string; stage: StageId }[]
  opened: { id: string; opts?: unknown }[]
  upstream: boolean[]
  /** Make the next call of this api function fail with this error code. */
  failNext: Record<string, string>
  setTasks(fn: (t: Task[]) => Task[]): void
}
declare global { interface Window { __inbox: Lab } }

const seed = makeLab(NOW)
if (params.get('empty') === '1') seed.tasks = seed.tasks.filter(t => t.status === 'publish')
seed.state.pinned = params.get('pinned') === '1'
seed.state.showWeek = params.get('week') === '1'
const me = MEMBERS.find(m => m.id === meId) ?? MEMBERS[0]

const lab: Lab = {
  tasks: seed.tasks, state: seed.state, calls: [], celebrations: [], opened: [], upstream: [], failNext: {},
  setTasks: () => {},
}
window.__inbox = lab
const wait = () => new Promise(r => setTimeout(r, delay))
async function call<T>(fn: string, args: unknown[], run: () => T): Promise<T | { success: false; error: string; shouldCelebrate: false }> {
  lab.calls.push({ fn, args })
  await wait()
  const fail = lab.failNext[fn]
  if (fail) { delete lab.failNext[fn]; return { success: false, error: fail, shouldCelebrate: false } }
  return run()
}

function Host() {
  const [tasks, setTasksState] = useState<Task[]>(seed.tasks)
  const [inbox, setInboxState] = useState<InboxState>(seed.state)
  const setTasks = (fn: (t: Task[]) => Task[]) => setTasksState(prev => { const next = fn(prev); lab.tasks = next; return next })
  const setInbox = (fn: (s: InboxState) => InboxState) => setInboxState(prev => { const next = fn(prev); lab.state = next; return next })
  lab.setTasks = setTasks

  const live = useMemo(() => tasks.filter(t => !t.dropped_at), [tasks])
  const model = useMemo(() => inboxModel({ tasks: live, member: me, state: inbox, slaConfig: {}, now: NOW }), [live, inbox])
  const [open, setOpen] = useState(false)
  const [tab, setTab] = useState<InboxTab>('todo')
  const [upstream, setUpstreamState] = useState(true)
  const btn = useRef<HTMLButtonElement>(null)
  const shown = open || inbox.pinned

  async function withInbox(change: (s: InboxState) => InboxState, run: () => Promise<{ success: boolean; error?: string }>) {
    let before: InboxState | null = null
    setInbox(s => { before = s; return change(s) })
    const res = await run()
    if (!res.success && before) { const b = before; setInbox(() => b) }
    return res
  }
  async function savePrefs(p: { pinned?: boolean; showWeek?: boolean }) {
    return withInbox(s => ({ ...s, ...(p.pinned !== undefined ? { pinned: p.pinned } : {}), ...(p.showWeek !== undefined ? { showWeek: p.showWeek } : {}) }),
      () => call('setPrefs', [p], () => ({ success: true })))
  }
  function close() {
    setOpen(false)
    if (inbox.pinned) void savePrefs({ pinned: false })
    requestAnimationFrame(() => btn.current?.focus())
  }

  const api: InboxApi = {
    async move(taskId, to): Promise<MoveTaskResult> {
      const task = lab.tasks.find(t => t.id === taskId)
      if (!task) return { success: false, shouldCelebrate: false, error: 'not_found' }
      const from = { status: task.status, stage_date: task.stage_date }
      setTasks(ts => ts.map(t => (t.id === taskId ? { ...t, status: to, stage_date: localDay(NOW) } : t)))
      const res = await call('move', [taskId, to], () => {
        if (!allowedStages(task, me).includes(to)) return { success: false, shouldCelebrate: false, error: 'not_authorized' }
        const path = task.nine_stage ? NINE_STAGE : EIGHT_STAGE
        return { success: true, shouldCelebrate: holdsStage(task, me) && path.indexOf(to) > path.indexOf(task.status) }
      }) as MoveTaskResult
      if (!res.success) setTasks(ts => ts.map(t => (t.id === taskId ? { ...t, ...from } : t)))
      else if (res.shouldCelebrate) lab.celebrations.push({ taskName: task.name, stage: to })
      return res
    },
    comment: (taskId, body, mentions) => call('comment', [taskId, body, mentions], () => {
      setTasks(ts => ts.map(t => (t.id === taskId ? { ...t, comments: [...(t.comments ?? []), { id: `n${lab.calls.length}`, task_id: taskId, author_id: me.id, author: me, body, mentions, created_at: NOW.toISOString() }] } : t)))
      return { success: true }
    }),
    async setDate(taskId, iso) {
      const before = lab.tasks.find(t => t.id === taskId)
      setTasks(ts => ts.map(t => (t.id === taskId ? { ...t, due_date: iso } : t)))
      const res = await call('setDate', [taskId, iso], () => ({ success: true }))
      if (!res.success) setTasks(ts => ts.map(t => (t.id === taskId ? { ...t, due_date: before?.due_date ?? null } : t)))
      return res
    },
    snooze: (taskId, until) => withInbox(s => ({ ...s, snoozes: { ...s.snoozes, [taskId]: until } }), () => call('snooze', [taskId, until], () => ({ success: true }))),
    unsnooze: ids => withInbox(s => { const z = { ...s.snoozes }; ids.forEach(id => delete z[id]); return { ...s, snoozes: z } }, () => call('unsnooze', [ids], () => ({ success: true }))),
    setPrefs: savePrefs,
    openTask(taskId, opts) {
      lab.opened.push({ id: taskId, opts })
      if (!inbox.pinned) setOpen(false)
    },
  }

  return (
    <div data-lab-ready="">
      <div className="lab-head">
        <h1>Board</h1>
        <InboxButton ref={btn} counts={model.counts} ringKeys={model.ringKeys} open={shown}
                     onToggle={() => (shown ? close() : (setTab(openingTab(model.counts)), setOpen(true)))} />
        <button type="button" className="lab-new">+ New task</button>
      </div>
      {inbox.showWeek && <div className="lab-week" data-lab-week="">Week Momentum · Daily Spark</div>}
      <div className={inbox.pinned ? 'fx-board-split' : 'fx-board-main'}>
        <div className="fx-board-area">
          <div className="lab-filters">
            <ViewMenu showWeek={inbox.showWeek} onShowWeek={v => void savePrefs({ showWeek: v })}
                      upstream={upstream} onUpstream={v => { setUpstreamState(v); lab.upstream.push(v) }} />
          </div>
          <div className="lab-board" data-lab-board="">
            {['To Do', 'C-In Progress', 'C-Review', 'D-In Progress', 'Final check'].map(c => <div key={c} className="lab-col">{c}</div>)}
          </div>
        </div>
        {shown && (
          <InboxPanel model={model} me={me} members={MEMBERS} now={NOW} api={api} tab={tab} onTab={setTab}
                      pinned={inbox.pinned} onPin={() => (inbox.pinned ? close() : (setOpen(true), void savePrefs({ pinned: true })))}
                      onClose={close} buttonRef={btn} />
        )}
      </div>
    </div>
  )
}

createRoot(document.getElementById('root')!).render(
  <NextIntlClientProvider locale={locale} messages={locale === 'ar' ? ar : en} timeZone="Africa/Cairo"
                          onError={e => console.error(e.code === 'MISSING_MESSAGE' ? `MISSING_MESSAGE ${e.message}` : e.message)}>
    <Host />
  </NextIntlClientProvider>,
)
