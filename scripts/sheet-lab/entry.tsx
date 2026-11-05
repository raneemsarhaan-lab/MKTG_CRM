/**
 * Sheet lab: mounts the real VideoSheet with a stub host, so scenarios.mjs can
 * drive it in a browser without a database or a login (spec 008 quickstart §2).
 *
 * Modes come from the hash, e.g. `#me=lina&video=v1&locale=ar&storage=0`:
 *   me       raneem | yosra | mona | lina | omar | hadi | sara   (default raneem)
 *   video    v1 | v2 | v3 | all                                  (default v1)
 *   row      a task id to highlight
 *   storage  1 | 0                                                hasStorage
 *   locale   en | ar
 *   delay    ms for every api call (default 60)
 *
 * The stub decides moves with the real shared rule (src/lib/stage-moves.ts)
 * and celebrates under the board's rule, so the menu can be checked against
 * what the server would accept. Everything scenarios assert on is on
 * `window.__sheet`.
 */
import React, { useState } from 'react'
import { createRoot } from 'react-dom/client'
import { NextIntlClientProvider } from 'next-intl'
import en from '../../messages/en.json'
import ar from '../../messages/ar.json'
import type { MoveTaskResult, StageId, Task, TaskAttachment, BoardView } from '@/types/index'
import { VideoSheet } from '@/components/sheet/VideoSheet'
import type { SheetApi, SheetClipRow } from '@/components/sheet/types'
import { allowedStages, holdsStage } from '@/lib/stage-moves'
import { NINE_STAGE, EIGHT_STAGE } from '@/lib/stage-meta'
import { parseClipFileName, fileNameKey } from '@/lib/clip-file-name'
import { businessDaysBetween, subtractBusinessDays } from '@/lib/utils'
import { MEMBERS, makeTasks, sheetsHtml } from './fixtures'
import { ContentApp, type ContentLab } from './content-entry'
import { labWritePasted, useLabColumns } from './columns-stub'
import { columnFixtures, customClipText, customPlanText } from './column-fixtures'
import { CONTENT_MEMBERS, referenceHtml, referenceText } from './content-fixtures'

const params  = new URLSearchParams(location.hash.slice(1))
const locale  = params.get('locale') === 'ar' ? 'ar' : 'en'
const storage = params.get('storage') !== '0'
const meId    = params.get('me') ?? 'raneem'
const video0  = params.get('video') === 'all' ? null : (params.get('video') ?? 'v1')
const row0    = params.get('row')
const delay   = Number(params.get('delay') ?? 60)
export const withCols = params.get('cols') === '1'
document.documentElement.lang = locale
document.documentElement.dir = locale === 'ar' ? 'rtl' : 'ltr'

type Call = { fn: string; args: unknown[]; at: number }
type Lab = {
  tasks: Task[]
  calls: Call[]
  celebrations: { taskName: string; stage: StageId }[]
  opened: { id: string; opts?: unknown }[]
  views: BoardView[]
  /** Make the next call of this api function fail with this error code. */
  failNext: Record<string, string>
  /** Upload: fail at this percentage (0 = never). */
  uploadFailAt: number
  uploads: { name: string; size: number }[]
  /** Read bytes? Set when an upload reaches the reader (never for refused sizes). */
  bytesRead: number
  sheetsHtml: typeof sheetsHtml
  setTasks(fn: (t: Task[]) => Task[]): void
}
declare global { interface Window { __sheet: Lab } }

const contentView = params.get('view') === 'content'
const me = (contentView ? CONTENT_MEMBERS : MEMBERS).find(m => m.id === meId) ?? MEMBERS[0]
const wait = (ms = delay) => new Promise(r => setTimeout(r, ms))
const canAct = (t: Task) => t.task_owner_id === me.id || t.assignee_id === me.id || me.access === 'admin' || me.access === 'superuser'

const lab: Lab = window.__sheet = {
  tasks: makeTasks(), calls: [], celebrations: [], opened: [], views: [],
  failNext: {}, uploadFailAt: 0, uploads: [], bytesRead: 0, sheetsHtml,
  setTasks: () => {},
}
// The content mode's helpers, for scenarios: the reference rows as Sheets copies them.
Object.assign(lab, { themes: [], referenceHtml, referenceText, customPlanText, customClipText })

function App() {
  const [tasks, setTasksState] = useState<Task[]>(lab.tasks)
  const [videoId, setVideoId] = useState<string | null>(video0)
  const [rowId, setRowId] = useState<string | null>(row0)
  const setTasks = (fn: (t: Task[]) => Task[]) => setTasksState(prev => { const next = fn(prev); lab.tasks = next; return next })
  lab.setTasks = setTasks
  const patch = (id: string, p: Partial<Task>) => setTasks(ts => ts.map(t => (t.id === id ? { ...t, ...p } : t)))
  const find = (id: string) => lab.tasks.find(t => t.id === id)
  const record = (fn: string, ...args: unknown[]) => lab.calls.push({ fn, args, at: performance.now() })
  const failed = (fn: string) => { const e = lab.failNext[fn]; if (e) { delete lab.failNext[fn]; return e } return null }

  const api: SheetApi = {
    async move(taskId, to): Promise<MoveTaskResult> {
      record('move', taskId, to)
      const t = find(taskId)!
      const from = { status: t.status, stage_date: t.stage_date }
      patch(taskId, { status: to, stage_date: new Date().toISOString().slice(0, 10) })
      await wait()
      const forced = failed('move')
      const path = t.nine_stage ? NINE_STAGE : EIGHT_STAGE
      const ok = !forced && allowedStages(t, me).includes(to)
      if (!ok) { patch(taskId, from); return { success: false, shouldCelebrate: false, error: forced ?? 'not_authorized' } }
      const celebrate = holdsStage(t, me) && path.indexOf(to) > path.indexOf(t.status as StageId)
      if (celebrate) lab.celebrations.push({ taskName: t.name, stage: to })
      return { success: true, shouldCelebrate: celebrate }
    },
    async update(taskId, p) {
      record('update', taskId, p)
      const t = find(taskId)!
      const before = { name: t.name, assignee_id: t.assignee_id, content_type_label: t.content_type_label }
      patch(taskId, { ...p, ...(p.assignee_id !== undefined ? { assignee_id: p.assignee_id || null, assignee: MEMBERS.find(m => m.id === p.assignee_id) } : {}) })
      await wait()
      const e = failed('update') ?? (canAct(t) ? null : 'not_authorized')
      if (e) { patch(taskId, before); return { success: false, error: e } }
      return { success: true }
    },
    async updateClip(taskId, p) {
      record('updateClip', taskId, p)
      const t = find(taskId)!
      const { published_url, ...cp } = p
      const base = t.clip ?? { clip_no: null, source: null, file_name: null, in_ms: null, out_ms: null, video_id: t.parent_task_id ?? null }
      const next = { ...base, ...cp }
      patch(taskId, { clip: next, ...(published_url !== undefined ? { published_url } : {}) })
      await wait()
      let e = failed('updateClip') ?? (canAct(t) ? null : 'not_authorized')
      if (!e && next.in_ms != null && next.out_ms != null && !(next.out_ms > next.in_ms)) e = 'bad_times'
      if (e) { patch(taskId, { clip: t.clip, published_url: t.published_url }); return { success: false, error: e } }
      return { success: true }
    },
    async addClips(vid, rows: SheetClipRow[]) {
      record('addClips', vid, rows)
      await wait()
      const e = failed('addClips')
      if (e) return { success: false, error: e }
      const seen = new Set(lab.tasks.filter(t => t.parent_task_id === vid).map(t => fileNameKey(t.clip?.file_name)).filter(Boolean))
      const created: Task[] = [], skipped: string[] = []
      const now = new Date().toISOString()
      let values = 0
      for (const r of rows) {
        const file = r.file_name?.trim() || null
        if (file) {
          const k = fileNameKey(file)
          if (seen.has(k)) {
            skipped.push(file)
            const had = lab.tasks.find(t => t.parent_task_id === vid && fileNameKey(t.clip?.file_name) === k)
            if (had && !had.dropped_at && canAct(had)) values += labWritePasted(had.id, r.custom, true)
            continue
          }
          seen.add(k)
        }
        const p = parseClipFileName(file)
        const id = `n${Math.random().toString(36).slice(2, 8)}`
        values += labWritePasted(id, r.custom, false)
        created.push({
          ...find(vid)!, id, name: r.title, parent_task_id: vid, content_type_label: 'Reel', status: 'todo',
          task_owner_id: me.id, task_owner: me, assignee_id: null, assignee: undefined, created_at: now, updated_at: now,
          published_url: null, dropped_at: null, subtasks: [], comments: [],
          clip: { clip_no: p?.clip_no ?? null, source: p?.source ?? null, file_name: file, in_ms: p?.in_ms ?? null, out_ms: p?.out_ms ?? null, video_id: vid, created_at: now },
          attachments: r.link ? [{ id: `att-${id}`, task_id: id, filename: 'Google Drive', url: r.link, content_type: 'text/uri-list', uploaded_at: now }] : [],
        })
      }
      setTasks(ts => [...created, ...ts])
      return { success: true, created: created.map(c => ({ id: c.id })), skipped, values }
    },
    async addLink(taskId, url) {
      record('addLink', taskId, url)
      await wait()
      const e = failed('addLink') ?? (canAct(find(taskId)!) ? null : 'not_authorized')
      if (e) return { success: false, error: e }
      const a: TaskAttachment = { id: `att-${Math.random().toString(36).slice(2, 8)}`, task_id: taskId, filename: /google\.com/.test(url) ? 'Google Drive' : new URL(url).hostname, url, content_type: 'text/uri-list', uploaded_at: new Date().toISOString() }
      patch(taskId, { attachments: [...(find(taskId)!.attachments ?? []), a] })
      return { success: true }
    },
    upload: taskId => async (file, name, onProgress) => {
      record('upload', taskId, name, file.size)
      lab.uploads.push({ name, size: file.size })
      lab.bytesRead += 1
      for (let pct = 20; pct <= 100; pct += 20) {
        await wait(80)
        if (lab.uploadFailAt && pct >= lab.uploadFailAt) {
          lab.uploadFailAt = 0
          return { ok: false, retryable: true, error: 'Connection lost' }
        }
        onProgress(Math.min(99, pct))
      }
      const a: TaskAttachment = { id: `att-${Math.random().toString(36).slice(2, 8)}`, task_id: taskId, filename: name, content_type: file.type, size_bytes: file.size, uploaded_at: new Date().toISOString() }
      patch(taskId, { attachments: [...(find(taskId)!.attachments ?? []), a] })
      onProgress(100)
      return { ok: true, attachment: a }
    },
    async drop(taskId) {
      record('drop', taskId)
      patch(taskId, { dropped_at: new Date().toISOString() })
      await wait()
      return { success: true }
    },
    async restore(taskId) {
      record('restore', taskId)
      const t = find(taskId)!
      const spent = t.dropped_at ? businessDaysBetween(new Date(t.stage_date), new Date(t.dropped_at)) : 0
      patch(taskId, { dropped_at: null, stage_date: subtractBusinessDays(new Date(), spent).toISOString().slice(0, 10) })
      await wait()
      return { success: true }
    },
  }

  const cols = useLabColumns({
    me, members: MEMBERS, lab, seed: withCols ? columnFixtures() : { records: [], values: {} },
    types: ['Post', 'Video', 'Reel', 'Design', 'Story'].map(l => ({ id: l, label: l })),
  })
  return (
    <VideoSheet
      tasks={tasks}
      me={me}
      members={MEMBERS}
      contentTypes={cols.types}
      columns={cols.bundle}
      hasStorage={storage}
      videoId={videoId}
      highlightId={rowId}
      onOpenVideo={id => { setVideoId(id); setRowId(null) }}
      onOpenTask={(id, opts) => lab.opened.push({ id, opts })}
      onView={v => lab.views.push(v)}
      api={api}
    />
  )
}

createRoot(document.getElementById('root')!).render(
  <NextIntlClientProvider locale={locale} messages={locale === 'ar' ? ar : en} timeZone="UTC">
    {contentView ? <ContentApp me={me} lab={lab as unknown as ContentLab} /> : <App />}
  </NextIntlClientProvider>,
)
