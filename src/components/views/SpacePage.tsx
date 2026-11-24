'use client'

/**
 * A team Space page (spec 021 US1/US2, design/teams-brands.html): the tasks
 * on this Space's Shows in list, from every brand — as List, Board, Sheet,
 * Calendar or Workload.
 *
 * The Content and Video Spaces' Sheet tab is today's Content sheet and Video
 * sheet, unchanged (FR-012). Other Spaces get the task Sheet (TaskSheet).
 */
import { setWorkWeekend } from '@/lib/utils'
import { useEffect, useMemo, useState } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { useUIStore } from '@/store/useUIStore'
import type { ContentTheme, StageId, Task } from '@/types/index'
import { PIPE } from '@/lib/pipeline-tokens'
import { BrandGroupProvider } from '@/components/spaces/brandGroup'
import { STAGE_META } from '@/lib/stage-meta'
import { SpaceSettingsButton } from '@/components/spaces/SpaceSettings'
import { inRange, mayCreateIn, newTaskLabel, typesForSpace } from '@/lib/space-settings'
import { defaultAssigneeFor } from '@/lib/spaces'
import { TaskForm } from '@/components/shared/TaskForm'
import { useSpaceStages } from '@/components/spaces/useSpaceStages'
import { spaceLabel } from '@/components/shared/NavTree/labels'
import { ViewHost } from './ViewHost'
import { BoardView } from './BoardView'
import { CalendarView } from './CalendarView'
import { TaskPanel } from './TaskPanel'
import { TaskSheet } from './TaskSheet'
import { NodeWorkbook } from './NodeWorkbook'
import { KanbanBoard } from '@/components/kanban/KanbanBoard'
import { viewTasks, viewOptions, fieldsSetup, type BoardData } from './types'
import { applyView, cleanTabPrefs } from '@/lib/view-config'
import { isLinkedMedia } from '@/lib/media'
import { MediaCreateButton } from '@/components/media/MediaLinks'

const chip = (on: boolean): React.CSSProperties => ({ display: 'inline-flex', alignItems: 'center', gap: 6, border: `1px solid ${on ? PIPE.ink : PIPE.border}`, background: on ? PIPE.ink : '#FFFFFF', color: on ? '#FFFFFF' : PIPE.ink, borderRadius: 999, padding: '3px 10px', fontFamily: 'inherit', fontSize: 12.5, fontWeight: 600, cursor: 'pointer' })
const brandShort = (b: { name: string; short_name?: string | null }) => b.short_name?.trim() || b.name

export function SpacePage({ data, spaceId, brandId = null }: {
  data: BoardData; spaceId: string
  /** Spec 025: a Space › Brand folder — only this brand's tasks in the Space. */
  brandId?: string | null
}) {
  setWorkWeekend(data.dueRule?.weekend)
  const t = useTranslations('spaces')
  const tv = useTranslations('views')
  const selectTask = useUIStore(s => s.selectTask)
  const space = data.spaces.find(s => s.id === spaceId)!
  const shown = useMemo(() => new Set(data.taskSpaces.filter(r => r.space_id === spaceId).map(r => r.task_id)), [data.taskSpaces, spaceId])
  // Spec 022: a media board (Design, Video) shows its media tasks; other Spaces show content tasks,
  // with linked media tasks seen through their content task's chips.
  const board = space.media_board ?? null
  // Spec 024 (§2): its views show only the stages from "Starts at" to "Ends at".
  const flow = space.settings.flow
  // Spec 025 (§2): on the Space page a brand filter and "Group by brand"; a folder is one brand.
  const folderBrand = brandId ? data.brands.find(b => b.id === brandId) ?? null : null
  const [picked, setPicked] = useState<string[]>([])
  const [groupBrand, setGroupBrand] = useState(false)
  const prefKey = `momentum.space.${spaceId}`
  useEffect(() => {
    try {
      const v = JSON.parse(window.localStorage.getItem(prefKey) ?? '{}')
      if (Array.isArray(v.brands)) setPicked(v.brands.filter((x: unknown): x is string => typeof x === 'string'))
      setGroupBrand(v.group === true)
    } catch { /* a preference, never required */ }
  }, [prefKey])
  const remember = (brands: string[], group: boolean) => { try { window.localStorage.setItem(prefKey, JSON.stringify({ brands, group })) } catch { /* ignore */ } }
  const brandIds = useMemo(() => (brandId ? [brandId] : picked.filter(id => data.brands.some(b => b.id === id))), [brandId, picked, data.brands])
  const scope = useMemo(() => (task: Task) => shown.has(task.id) && (board ? task.media_board === board : !isLinkedMedia(task)) && (task.kind === 'simple' || inRange(flow, task.status))
    && (!brandIds.length || (!!task.brand_id && brandIds.includes(task.brand_id))), [shown, board, flow, brandIds])
  const themeScope = useMemo(() => (brandIds.length ? (th: ContentTheme) => !!th.brand_id && brandIds.includes(th.brand_id) : undefined), [brandIds])
  const tasks = viewTasks(data).filter(scope)
  const memberNames = data.spaceMembers.filter(r => r.space_id === spaceId)
    .map(r => data.members.find(m => m.id === r.member_id)?.name).filter(Boolean).join(', ')
  const label = spaceLabel(space, t)
  const rule = ['content', 'design', 'video', 'planning'].includes(space.key) ? t(`rules.${space.key}`) : t('rules.other')
  const sheetStart = space.key === 'content' ? 'content' : space.key === 'video' ? 'sheet' : null
  const open = (id: string) => selectTask(id)
  // Spec 024 (§3): the Space's own text for the add button, and who may create here.
  const showTaskForm = useUIStore(s => s.showTaskForm)
  const setShowTaskForm = useUIStore(s => s.setShowTaskForm)
  const memberIds = data.spaceMembers.filter(r => r.space_id === spaceId).map(r => r.member_id)
  const mayCreate = mayCreateIn(space.settings, data.currentUser, memberIds)
  // Spec 021 (US3): this Space's own words for the stages. Boards keep the board names.
  const locale = useLocale()
  // Spec 022 (US4): this Space's stages (renamed or split); boards elsewhere keep the original names.
  const ss = useSpaceStages(spaceId, data.spaceStages, data.taskSpaceStages)
  const stageName = (s: StageId) => ss?.stageName(s) ?? (locale === 'ar' ? STAGE_META[s]?.label_ar : STAGE_META[s]?.label_en) ?? s
  const statusName = (x: Task) => ss?.name(x) ?? stageName(x.status as StageId)
  const addLabel = newTaskLabel(space.settings, locale, t('config.newLabelDefault'))
  // The add form, on the tabs that don't carry a board of their own.
  const taskForm = showTaskForm && (
    <TaskForm currentUser={data.currentUser} brands={data.brands} contentTypes={typesForSpace(space.settings, data.contentTypes)} members={data.members}
      spaceId={spaceId} spaceAssignees={{ [spaceId]: defaultAssigneeFor(space, data.members, memberIds) }} dueRule={data.dueRule} />
  )

  return (
    <ViewHost
      crumbs={folderBrand ? [t('teams'), label, brandShort(folderBrand)] : [t('teams'), label]}
      title={folderBrand ? `${label} · ${brandShort(folderBrand)}` : label}
      tag={folderBrand ? t('folderTag') : t('spaceTag')}
      color={folderBrand?.color ?? space.color}
      actions={<>
        {mayCreate && (space.media_board
          ? <MediaCreateButton board={space.media_board} boardName={space.name} brands={data.brands} label={addLabel} />
          : <button type="button" data-space-add onClick={() => setShowTaskForm(true)}
              style={{ border: 'none', background: '#14131A', color: '#FFFFFF', borderRadius: 9, padding: '6px 12px', fontFamily: 'inherit', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>＋ {addLabel}</button>)}
        {data.currentUser.access !== 'user' && <SpaceSettingsButton space={space} data={data} />}
      </>}
      defaultTab={space.settings.views.default}
      initialPrefs={cleanTabPrefs(data.viewPrefs[folderBrand ? `space:${spaceId}:brand:${folderBrand.id}` : `space:${spaceId}`])}
      sub={<span style={{ display: 'grid', gap: 8 }}>
        <span style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
          <span data-space-rule>{folderBrand ? t('folderRule', { space: label, brand: folderBrand.name }) : rule}</span>
          <span>{memberNames ? t('members', { names: memberNames }) : t('noMembers')}</span>
        </span>
        {!folderBrand && data.brands.length > 1 && (
          <span data-space-brands role="group" aria-label={t('brandFilter')} style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
            <button type="button" aria-pressed={!brandIds.length} data-brand-chip="all" onClick={() => { setPicked([]); remember([], groupBrand) }} style={chip(!brandIds.length)}>{t('allBrands')}</button>
            {data.brands.map(b => {
              const on = brandIds.includes(b.id)
              return (
                <button key={b.id} type="button" aria-pressed={on} data-brand-chip={b.id} title={b.name}
                  onClick={() => { const next = on ? picked.filter(x => x !== b.id) : [...picked, b.id]; setPicked(next); remember(next, groupBrand) }} style={chip(on)}>
                  <span aria-hidden="true" style={{ width: 8, height: 8, borderRadius: '50%', background: b.color }} />{brandShort(b)}
                </button>
              )
            })}
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginInlineStart: 8, fontSize: 12.5, fontWeight: 600, color: PIPE.ink }}>
              <input type="checkbox" checked={groupBrand} data-group-brand onChange={e => { setGroupBrand(e.target.checked); remember(picked, e.target.checked) }} />
              {t('groupBrand')}
            </label>
          </span>
        )}
      </span>}
      tabs={[
        { key: 'board', label: tv('board') },
        { key: 'sheet', label: tv('sheet') },
        { key: 'calendar', label: tv('calendar') },
      ]}
      node={folderBrand ? `space:${spaceId}:brand:${folderBrand.id}` : `space:${spaceId}`}
      viewTypes={['board', 'sheet', 'calendar']}
      options={viewOptions(data, tasks)}
      fields={fieldsSetup(data, tasks)}
      lead={data.currentUser.access !== 'user'}
      render={(tab, view, shownKeys) => {
        // A saved view narrows the Space's tasks by its filters and orders them by its sort.
        const shownTasks = view ? applyView(tasks, view.config) : tasks
        const ids = view ? new Set(shownTasks.map(x => x.id)) : null
        const inView = ids ? (x: Task) => scope(x) && ids.has(x.id) : scope
        if (tab === 'board') return <BrandGroupProvider value={groupBrand && !folderBrand}><BoardView key={view?.id} fields={shownKeys} data={data} scopeTasks={inView} spaceId={spaceId} /></BrandGroupProvider>
        // Spec 026: every Space's Sheet view is its sheet of rows — themes, pillars, plain and linked rows —
        // inside a full workbook (tabs, toolbar, formatting, comments, blank tabs). The Content and Video
        // Spaces keep the workbooks their sheets always had, so formatting and comments carry over.
        if (tab === 'sheet') return (
          <NodeWorkbook key={view?.id} data={data} {...(space.key === 'content' || space.key === 'video' ? { folder: space.key as 'content' | 'video' } : { node: `space:${spaceId}` })}
            linked={<KanbanBoard {...data} surface="sheets" sheetsView="content" scopeTasks={inView} spaceId={spaceId}
              themeScope={themeScope} />} />
        )
        const body = <CalendarView tasks={shownTasks} brands={data.brands} colorBy={folderBrand ? 'stage' : 'brand'} statusName={statusName} onOpen={open}
              milestones={{ list: data.milestones, brandIds: [...new Set(shownTasks.map(x => x.brand_id).filter(Boolean))] as string[], canEdit: data.currentUser.access !== 'user' }}
              link={board ? undefined : { spaceId, media: viewTasks(data) }} />
        return <>{body}<TaskPanel data={data} spaceId={spaceId} />{taskForm}</>
      }}
    />
  )
}
