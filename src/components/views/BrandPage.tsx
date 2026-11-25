'use client'

/**
 * A brand's page (spec 021 US1/US2; three sections since spec 025):
 *   - Brand: every task for it from every Space, with the original stage names,
 *     as Board, Sheet (with a Space column), Calendar (its publishing calendar),
 *     List or Workload;
 *   - Assets: a table of its files;
 *   - Settings (admins): C-Check, fields switched off, default priority.
 * The Library (everything it has published) is still reachable by address.
 */
import { setWorkWeekend } from '@/lib/utils'
import { useMemo } from 'react'
import { useTranslations } from 'next-intl'
import { useUIStore } from '@/store/useUIStore'
import type { Task } from '@/types/index'
import { PIPE } from '@/lib/pipeline-tokens'
import { TaskSheet } from './TaskSheet'
import { NodeWorkbook } from './NodeWorkbook'
import { KanbanBoard } from '@/components/kanban/KanbanBoard'
import { applyView, cleanTabPrefs, isFieldViewKey } from '@/lib/view-config'
import { useFieldView } from './useFieldView'
import { isLinkedMedia } from '@/lib/media'
import Link from 'next/link'
import { BrandAssetsTable } from '@/components/brands/BrandAssetsTable'
import { BrandSettingsTab } from '@/components/brands/BrandSettingsTab'
import { BrandLibrary } from '@/components/brands/BrandLibrary'
import { ViewHost } from './ViewHost'
import { spaceLabel } from '@/components/shared/NavTree/labels'
import { ListView } from './ListView'
import { BoardView } from './BoardView'
import { CalendarView } from './CalendarView'
import { WorkloadView } from './WorkloadView'
import { TaskPanel } from './TaskPanel'
import { viewTasks, viewOptions, fieldsSetup, fieldValuesOf, type BoardData } from './types'

export type BrandFolderSlug = 'calendar' | 'assets' | 'sheet' | 'library' | 'settings'

/** Spec 025 (§3): a brand's three sections, as links under its name. Settings is for admins only. */
function BrandSections({ brandId, current, admin }: { brandId: string; current: 'brand' | 'assets' | 'settings'; admin: boolean }) {
  const t = useTranslations('spaces')
  const tabs = [
    { key: 'brand' as const, href: `/brands/${brandId}`, label: t('tabBrand') },
    { key: 'assets' as const, href: `/brands/${brandId}/assets`, label: t('tabAssets') },
    ...(admin ? [{ key: 'settings' as const, href: `/brands/${brandId}/settings`, label: t('tabSettings') }] : []),
  ]
  return (
    <nav data-brand-sections aria-label={t('brandTabs')} style={{ display: 'flex', gap: 4 }}>
      {tabs.map(x => (
        <Link key={x.key} href={x.href} data-brand-section={x.key} aria-current={current === x.key ? 'page' : undefined}
          style={{ padding: '6px 14px', borderRadius: 999, textDecoration: 'none', fontSize: 13, fontWeight: 700,
            background: current === x.key ? PIPE.ink : PIPE.surface, color: current === x.key ? '#FFFFFF' : PIPE.ink }}>
          {x.label}
        </Link>
      ))}
    </nav>
  )
}

export function BrandPage({ data, brandId, folder }: {
  data: BoardData
  brandId: string | null
  folder: BrandFolderSlug | null
  /** Unused since spec 025 (the Assets tab loads its own files); kept so older callers compile. */
  assets?: { id: string; filename: string; url: string }[]
}) {
  setWorkWeekend(data.dueRule?.weekend)
  const t = useTranslations('spaces')
  const tv = useTranslations('views')
  const selectTask = useUIStore(s => s.selectTask)
  const brand = brandId ? data.brands.find(b => b.id === brandId) ?? null : null
  const name = brand?.name ?? t('noBrand')
  const color = brand?.color ?? PIPE.textFaint
  // Spec 022: linked media tasks show through their content task, not as cards of their own.
  const scope = useMemo(() => (task: Task) => (brandId ? task.brand_id === brandId : !task.brand_id) && !isLinkedMedia(task), [brandId])
  const all = viewTasks(data).filter(scope)
  const open = (id: string) => selectTask(id)
  // Spec 023: custom fields and their values, for List rows.
  const fv = useFieldView(data)
  const custom = useMemo(() => ({ fields: data.taskFields, links: data.typeFields, values: fieldValuesOf(data), types: data.contentTypes, tags: data.tags }), [data])
  const campaigns = [...new Map(all.filter(x => x.project).map(x => [x.project!.id, x.project!])).values()]
    .sort((a, b) => a.name.localeCompare(b.name))
  // The Spaces each task shows in, for the List grouped by project (a brand's work, collected from every Space).
  const spacesOf = useMemo(() => {
    const byTask = new Map<string, { id: string; name: string; color: string }[]>()
    const info = new Map(data.spaces.map(sp => [sp.id, { id: sp.id, name: spaceLabel(sp, t), color: sp.color }]))
    for (const r of data.taskSpaces) { const sp = info.get(r.space_id); if (sp) byTask.set(r.task_id, [...(byTask.get(r.task_id) ?? []), sp]) }
    return (taskId: string) => byTask.get(taskId) ?? []
  }, [data.spaces, data.taskSpaces, t])
  const folderName = folder === 'library' ? t('folders.lib') : null
  const withPanel = (node: React.ReactNode) => <>{node}<TaskPanel data={data} /></>

  const admin = data.currentUser.access === 'admin'
  const section = folder === 'assets' ? 'assets' as const : folder === 'settings' ? 'settings' as const : 'brand' as const
  const sections = brandId ? <BrandSections brandId={brandId} current={section} admin={admin} /> : undefined
  const common = { crumbs: [t('brands'), name, ...(folderName ? [folderName] : [])], color, mark: name[0], actions: undefined as React.ReactNode, sections }

  if (folder === 'assets' && brandId) {
    return (
      <ViewHost {...common} crumbs={[t('brands'), name, t('tabAssets')]} title={name} tag={t('brandTag')} sub={t('assetsSub')} noViews
        tabs={[{ key: 'files', label: tv('files') }]}
        render={() => withPanel(<BrandAssetsTable brandId={brandId} tasks={all.filter(x => !x.dropped_at).map(x => ({ id: x.id, name: x.name }))} hasStorage={data.hasStorage} onOpenTask={open} />)} />
    )
  }
  if (folder === 'settings' && brandId && brand && admin) {
    return (
      <ViewHost {...common} crumbs={[t('brands'), name, t('tabSettings')]} title={name} tag={t('brandTag')} sub={t('settingsSub')} noViews
        tabs={[{ key: 'settings', label: t('tabSettings') }]}
        render={() => <BrandSettingsTab brand={brand} defaults={data.brandFeatureDefaults} workspaceNineStage={data.workspaceNineStage} fields={data.taskFields} />} />
    )
  }
  if (folder === 'library') {
    // Spec 022: tasks migrated from simple tasks aren't new posts.
    const published = all.filter(x => x.status === 'publish' && !x.dropped_at && !x.migrated_simple)
    return (
      <ViewHost {...common} title={folderName!} tag={t('folderTag')} sub={t('libraryLede')}
        tabs={[{ key: 'gallery', label: tv('gallery') }, { key: 'list', label: tv('list') }]}
        render={tab => withPanel(tab === 'list'
          ? <ListView custom={custom} tasks={published} brands={data.brands} members={data.members} slaConfig={data.slaConfig} today={data.today} onOpen={open} />
          : <BrandLibrary tasks={published} color={color} onOpen={open} />)} />
    )
  }
  return (
    <ViewHost {...common} title={name} tag={t('brandTag')} sub={t('brandAll')}
      tabs={[{ key: 'board', label: tv('board') }, { key: 'sheet', label: tv('sheet') }, { key: 'calendar', label: tv('calendar') }, { key: 'list', label: tv('list') }, { key: 'workload', label: tv('workload') }]}
      node={brandId ? `brand:${brandId}` : undefined}
      initialPrefs={brandId ? cleanTabPrefs(data.viewPrefs[`brand:${brandId}`]) : undefined}
      viewTypes={['list', 'board', 'sheet', 'calendar', 'workload']}
      options={viewOptions(data, all, { brand: true })}
      fields={fieldsSetup(data, all)}
      lead={data.currentUser.access !== 'user'}
      fieldPicker={fv.picker(all)}
      // The Sheet tab's own Fields (in the tabs row) sets its columns; the page's Fields is for the other views.
      builtInFields={['board', 'list', 'calendar']}
      render={(tab, view, shownKeys) => {
        const shownTasks = view ? applyView(all, view.config, fv.valueOf) : all
        const ids = view ? new Set(shownTasks.map(x => x.id)) : null
        if (tab === 'board') return <BoardView key={view?.id} fields={shownKeys} data={data} scopeTasks={ids ? (x: Task) => scope(x) && ids.has(x.id) : scope} boardKey={brandId ? `brand:${brandId}` : undefined} />
        return withPanel(tab === 'sheet'
          ? (brandId
            // The brand's tasks from every Space, with a Space column. (User, 24 Nov 2026: no "Sheets by
            // Space" strip here — a Space's rows for the brand are in its brand folder in the sidebar.)
            // Spec 027: the new sheet. Its Board tab is the brand's tasks from every Space, by theme, under the
            // Board's own Mine / Everyone and Filters; "+" adds tabs that link to a Space's board (it asks which).
            ? <NodeWorkbook key={view?.id} data={data} node={`brand:${brandId}`} brandId={brandId}
                linked={<KanbanBoard {...data} surface="sheets" sheetsView="content" boardKey={`brand:${brandId}`} brandBoard sheetBrandId={brandId}
                  scopeTasks={ids ? (x: Task) => scope(x) && ids.has(x.id) : scope} narrowed={!!view} />}
                rowsTab={s => <KanbanBoard {...data} surface="sheets" sheetsView="content" sheetBrandId={brandId}
                  tabSheet={{ id: s.id, linked: !!s.linked, spaceId: s.spaceId ?? null }} />} />
            : <TaskSheet data={data} tasks={shownTasks.filter(x => !x.dropped_at)} hideBrand showSpace fields={shownKeys} label={name} />)
          : tab === 'calendar'
            // The brand's publishing calendar (spec 025): by publishing date, campaigns as a filter.
            ? <CalendarView tasks={shownTasks.filter(x => !(x.migrated_simple && x.status === 'publish'))} brands={data.brands} colorBy="stage" campaigns={campaigns} onOpen={open} defaultBy="publish" milestones={brandId ? { list: data.milestones, brandIds: [brandId], canEdit: data.currentUser.access !== 'user' } : undefined} />
            : tab === 'workload'
              ? <WorkloadView tasks={shownTasks} members={data.members} brands={data.brands} />
              : <ListView key={view?.id} fields={shownKeys} custom={custom} tasks={shownTasks} brands={data.brands} members={data.members} slaConfig={data.slaConfig} today={data.today} initialGroup={view && !isFieldViewKey(view.config.group) ? view.config.group : null} fieldGroups={view ? fv.groupsFor(view.config, shownTasks) : null} onOpen={open}
                  projectGroups={brandId ? { spacesOf, noProject: t('noProjectGroup') } : undefined} />)
      }} />
  )
}
