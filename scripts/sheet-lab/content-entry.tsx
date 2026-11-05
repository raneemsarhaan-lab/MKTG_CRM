/**
 * The sheet lab's content mode (`#view=content`, spec 009): the real
 * ContentSheet with a stub host. The stub decides moves with the shared rule,
 * adds plans with the same readers the server uses, and records every call on
 * `window.__sheet`.
 */
import React, { useState } from 'react'
import type { ContentTheme, Member, MoveTaskResult, StageId, Task } from '@/types/index'
import { ContentSheet } from '@/components/content/ContentSheet'
import type { ContentApi, PlanRowInput } from '@/components/content/types'
import { allowedStages, holdsStage } from '@/lib/stage-moves'
import { NINE_STAGE, EIGHT_STAGE } from '@/lib/stage-meta'
import { businessDaysBetween, subtractBusinessDays } from '@/lib/utils'
import { isWebLink, norm, readFrequency, readAudience, readStatus, readType, siteName, taskIdFromLink } from '@/lib/content-plan'
import { mayAddTo } from '@/components/content/parse-plan'
import { useLabColumns } from './columns-stub'
import { columnFixtures } from './column-fixtures'
import { CONTENT_MEMBERS, makeContent } from './content-fixtures'

type Call = { fn: string; args: unknown[]; at: number }
export interface ContentLab {
  tasks: Task[]; themes: ContentTheme[]; calls: Call[]; celebrations: { taskName: string; stage: StageId }[]
  opened: { id: string; opts?: unknown }[]; views: string[]; failNext: Record<string, string>
  setTasks(fn: (t: Task[]) => Task[]): void
}

const delay = (ms = 40) => new Promise(r => setTimeout(r, ms))
const today = () => new Date().toISOString().slice(0, 10)

export function ContentApp({ me, lab }: { me: Member; lab: ContentLab }) {
  const init = React.useMemo(() => makeContent(), [])
  const [tasks, setTasksState] = useState<Task[]>(() => { lab.tasks = init.tasks; return init.tasks })
  const [themes, setThemesState] = useState<ContentTheme[]>(() => { lab.themes = init.themes; return init.themes })
  const setTasks = (fn: (t: Task[]) => Task[]) => setTasksState(prev => { const n = fn(prev); lab.tasks = n; return n })
  const setThemes = (fn: (t: ContentTheme[]) => ContentTheme[]) => setThemesState(prev => { const n = fn(prev); lab.themes = n; return n })
  lab.setTasks = setTasks
  const find = (id: string) => lab.tasks.find(t => t.id === id)
  const patch = (id: string, p: Partial<Task>) => setTasks(ts => ts.map(t => (t.id === id ? { ...t, ...p } : t)))
  const record = (fn: string, ...args: unknown[]) => lab.calls.push({ fn, args, at: performance.now() })
  const failed = (fn: string) => { const e = lab.failNext[fn]; if (e) { delete lab.failNext[fn]; return e } return null }
  const admin = me.access === 'admin' || me.access === 'superuser'
  const canAct = (t: Task) => t.task_owner_id === me.id || t.assignee_id === me.id || admin
  const ctx = () => ({ tasks: lab.tasks, themes: lab.themes, members: CONTENT_MEMBERS, me })
  /** As addPiece: the theme's owner owns a new piece; a member who is not becomes its assignee. */
  const pieceOwner = (themeId: string) => {
    const owner = lab.themes.find(x => x.id === themeId)?.owner_id ?? me.id
    return { task_owner_id: owner, assignee_id: owner !== me.id && !admin ? me.id : null }
  }

  const api: ContentApi = {
    async move(taskId, to): Promise<MoveTaskResult> {
      record('move', taskId, to)
      const t = find(taskId)!
      const from = { status: t.status, stage_date: t.stage_date }
      patch(taskId, { status: to, stage_date: today() })
      await delay()
      const forced = failed('move')
      if (forced || !allowedStages(t, me).includes(to)) { patch(taskId, from); return { success: false, shouldCelebrate: false, error: forced ?? 'not_authorized' } }
      const path = t.nine_stage ? NINE_STAGE : EIGHT_STAGE
      const celebrate = holdsStage(t, me) && path.indexOf(to) > path.indexOf(t.status as StageId)
      if (celebrate) lab.celebrations.push({ taskName: t.name, stage: to })
      return { success: true, shouldCelebrate: celebrate }
    },
    async update(taskId, p) {
      record('update', taskId, p)
      const t = find(taskId)!
      const before = { name: t.name, assignee_id: t.assignee_id, content_type_label: t.content_type_label }
      patch(taskId, { ...p, ...(p.assignee_id !== undefined ? { assignee_id: p.assignee_id || null } : {}) })
      await delay()
      if (!canAct(t)) { patch(taskId, before); return { success: false, error: 'not_authorized' } }
      return { success: true }
    },
    async updateClip() { return { success: true } },
    async addClips() { return { success: true, created: [], skipped: [] } },
    async addLink() { return { success: true } },
    upload: () => async () => ({ ok: false, retryable: false, error: 'not in this lab' }),
    async drop(taskId) { record('drop', taskId); patch(taskId, { dropped_at: new Date().toISOString() }); await delay(); return { success: true } },
    async restore(taskId) {
      record('restore', taskId)
      const t = find(taskId)!
      const spent = t.dropped_at ? businessDaysBetween(new Date(t.stage_date), new Date(t.dropped_at)) : 0
      patch(taskId, { dropped_at: null, stage_date: subtractBusinessDays(new Date(), spent).toISOString().slice(0, 10) })
      await delay(); return { success: true }
    },
    async addPlan(rows: PlanRowInput[], opts) {
      record('addPlan', rows, opts)
      await delay()
      const res = { success: true, created: [] as string[], updated: [] as string[], skipped: [] as string[], themesCreated: [] as string[], pillarsCreated: [] as string[], problems: [] as { row: number; code: string }[] }
      let ths = [...lab.themes]
      let ts = [...lab.tasks]
      rows.forEach((r, i) => {
        const status = readStatus(r.status)
        if (!r.title || !status) { res.problems.push({ row: i + 1, code: 'bad' }); return }
        let th = ths.find(x => norm(x.name) === norm(r.theme))
        if (!th) {
          if (!admin) { res.problems.push({ row: i + 1, code: 'newThemeAdmin' }); return }
          const owner = CONTENT_MEMBERS.find(x => norm(x.name) === norm(r.owner))?.id ?? null
          const f = readFrequency(r.frequency)
          th = { id: `th-${norm(r.theme)}`, name: r.theme, brand_id: null, owner_id: owner, frequency_count: f?.count ?? null, frequency_period: f?.period ?? null, audience: readAudience(r.audience), pillars: [] }
          ths = [...ths, th]; res.themesCreated.push(r.theme)
        }
        if (!mayAddTo(th, { ...ctx(), tasks: ts, themes: ths })) { res.problems.push({ row: i + 1, code: 'mayNotAdd' }); return }
        let pillarId: string | null = null
        if (r.pillar) {
          let pl = th.pillars.find(x => norm(x.name) === norm(r.pillar))
          if (!pl) {
            pl = { id: `pl-${norm(r.pillar)}`, name: r.pillar, sort_order: th.pillars.length }
            const id = th.id
            ths = ths.map(x => (x.id === id ? { ...x, pillars: [...x.pillars, pl!] } : x))
            th = ths.find(x => x.id === id)!
            res.pillarsCreated.push(`${r.theme} · ${r.pillar}`)
          }
          pillarId = pl.id
        }
        const link = (v?: string) => (isWebLink(v) ? v!.trim() : null)
        const roleLinks = (id: string) => [
          ...(link(r.working_doc) ? [{ id: `att-${id}-doc`, task_id: id, filename: siteName(r.working_doc), url: link(r.working_doc)!, content_type: 'text/uri-list', link_role: 'working_doc' as const, uploaded_at: new Date().toISOString() }] : []),
          ...(link(r.design) ? [{ id: `att-${id}-des`, task_id: id, filename: siteName(r.design), url: link(r.design)!, content_type: 'text/uri-list', link_role: 'design' as const, uploaded_at: new Date().toISOString() }] : []),
        ]
        const tid = taskIdFromLink(r.task_link)
        const themeId = th.id
        if (tid) {
          const t = ts.find(x => x.id === tid)
          if (!t) { res.problems.push({ row: i + 1, code: 'missingTask' }); return }
          ts = ts.map(x => (x.id !== tid ? x : {
            ...x, project_id: themeId, pillar_id: pillarId ?? x.pillar_id, content_type_label: readType(r.type) ?? x.content_type_label,
            post_url: x.post_url || link(r.post), published_url: x.published_url || link(r.published),
            attachments: [...(x.attachments ?? []), ...roleLinks(tid).filter(a => !(x.attachments ?? []).some(b => b.link_role === a.link_role))],
            ...(opts.useSheetTitleStatus ? { name: r.title, ...(status.archived ? { dropped_at: new Date().toISOString() } : { status: status.stage, stage_date: today() }) } : {}),
          }))
          res.updated.push(tid); return
        }
        if (ts.some(x => x.project_id === themeId && norm(x.name) === norm(r.title))) { res.skipped.push(r.title); return }
        const id = `new-${ts.length}-${i}`
        const owner = CONTENT_MEMBERS.find(x => norm(x.name) === norm(r.owner))?.id ?? me.id
        const base = ts.find(x => x.id === 'p1')!
        ts = [{
          ...base, id, name: r.title, project_id: themeId, pillar_id: pillarId, content_type_label: readType(r.type) ?? 'Post',
          status: status.stage, stage_date: today(), dropped_at: status.archived ? new Date().toISOString() : null,
          task_owner_id: owner, assignee_id: null, post_url: link(r.post), published_url: link(r.published), attachments: roleLinks(id),
          created_at: new Date().toISOString(), updated_at: new Date().toISOString(), due_date: null, parent_task_id: null,
        }, ...ts]
        res.created.push(id)
      })
      setThemes(() => ths); setTasks(() => ts)
      return res
    },
    async addPiece(themeId, input) {
      record('addPiece', themeId, input)
      await delay()
      const th = lab.themes.find(x => x.id === themeId)
      if (!th || !mayAddTo(th, ctx())) return { success: false, error: 'may_not_add' }
      const id = `piece-${lab.tasks.length}`
      const base = lab.tasks.find(x => x.id === 'p1')!
      setTasks(ts => [{ ...base, id, name: input.title, project_id: themeId, pillar_id: input.pillarId ?? null, content_type_label: 'Post', status: 'todo', ...pieceOwner(themeId), attachments: [], created_at: new Date().toISOString(), due_date: null }, ...ts])
      return { success: true, id }
    },
    async updatePiece(taskId, p) {
      record('updatePiece', taskId, p)
      const t = find(taskId)!
      await delay()
      if (!canAct(t)) return { success: false, error: 'not_authorized' }
      if ((p.post_url && !isWebLink(p.post_url)) || (p.published_url && !isWebLink(p.published_url))) return { success: false, error: 'bad_link' }
      patch(taskId, p as Partial<Task>)
      return { success: true }
    },
    async setPieceLink(taskId, role, url) {
      record('setPieceLink', taskId, role, url)
      const t = find(taskId)!
      await delay()
      if (!canAct(t)) return { success: false, error: 'not_authorized' }
      if (url && !isWebLink(url)) return { success: false, error: 'bad_link' }
      patch(taskId, { attachments: [...(t.attachments ?? []).filter(a => a.link_role !== role), ...(url ? [{ id: `att-${taskId}-${role}`, task_id: taskId, filename: siteName(url), url, content_type: 'text/uri-list', link_role: role, uploaded_at: new Date().toISOString() }] : [])] })
      return { success: true }
    },
    async addTheme(name) {
      record('addTheme', name)
      await delay()
      if (!admin) return { success: false, error: 'may_not_edit_theme' }
      const id = `th-${norm(name)}`
      setThemes(t => [...t, { id, name, brand_id: null, owner_id: me.id, frequency_count: null, frequency_period: null, audience: [], pillars: [] }])
      return { success: true, id }
    },
    async saveTheme(id, p) {
      record('saveTheme', id, p)
      await delay()
      const th = lab.themes.find(x => x.id === id)!
      if (!admin && th.owner_id !== me.id) return { success: false, error: 'may_not_edit_theme' }
      setThemes(t => t.map(x => (x.id === id ? { ...x, ...p, name: p.name ?? x.name } as ContentTheme : x)))
      return { success: true }
    },
    async savePillar(themeId, input) {
      record('savePillar', themeId, input)
      await delay()
      const th = lab.themes.find(x => x.id === themeId)!
      if (!admin && th.owner_id !== me.id) return { success: false, error: 'may_not_edit_theme' }
      if (th.pillars.some(p => p.id !== input.id && norm(p.name) === norm(input.name))) return { success: false, error: 'duplicate_pillar' }
      const id = input.id ?? `pl-${norm(input.name)}`
      setThemes(t => t.map(x => (x.id !== themeId ? x : { ...x, pillars: input.id ? x.pillars.map(p => (p.id === id ? { ...p, name: input.name } : p)) : [...x.pillars, { id, name: input.name, sort_order: x.pillars.length }] })))
      return { success: true, id }
    },
    async removePillar(id) {
      record('removePillar', id)
      await delay()
      setThemes(t => t.map(x => ({ ...x, pillars: x.pillars.filter(p => p.id !== id) })))
      setTasks(ts => ts.map(x => (x.pillar_id === id ? { ...x, pillar_id: null } : x)))
      return { success: true }
    },
  }

  const cols = useLabColumns({
    me, members: CONTENT_MEMBERS, lab, seed: new URLSearchParams(location.hash.slice(1)).get('cols') === '1' ? columnFixtures() : { records: [], values: {} },
    types: ['Post', 'Video', 'Reel', 'Article', 'Report', 'Framework/Model', 'Other'].map(l => ({ id: l, label: l })),
  })
  return (
    <ContentSheet
      tasks={tasks}
      themes={themes}
      me={me}
      members={CONTENT_MEMBERS}
      contentTypes={cols.types}
      columns={cols.bundle}
      onOpenTask={id => lab.opened.push({ id })}
      onOpenVideoSheet={id => lab.opened.push({ id, opts: { videoSheet: true } })}
      onView={v => lab.views.push(v)}
      api={api}
    />
  )
}
