'use client'

/**
 * A brand and its four Folders (spec 021 US1/US2, FR-006, FR-007,
 * design/teams-brands.html):
 *   - the brand: every task for it, as List, Board, Calendar or Workload;
 *   - Calendar: where its tasks live, one continuous calendar, campaigns as a filter;
 *   - Assets: its files and open design requests;
 *   - Sheet: today's Content and Video sheets with only its rows, plus its own blank tabs;
 *   - Library: everything it has published.
 */
import { useMemo } from 'react'
import { useTranslations } from 'next-intl'
import { useUIStore } from '@/store/useUIStore'
import type { ContentTheme, Task } from '@/types/index'
import { PIPE } from '@/lib/pipeline-tokens'
import { TaskSheet } from './TaskSheet'
import { NodeWorkbook } from './NodeWorkbook'
import { KanbanBoard } from '@/components/kanban/KanbanBoard'
import { applyView } from '@/lib/view-config'
import { BrandAssets } from '@/components/brands/BrandAssets'
import { BrandLibrary } from '@/components/brands/BrandLibrary'
import { ViewHost } from './ViewHost'
import { BrandFeaturesButton } from '@/components/brands/BrandFeatures'
import { ListView } from './ListView'
import { BoardView } from './BoardView'
import { CalendarView } from './CalendarView'
import { WorkloadView } from './WorkloadView'
import { TaskPanel } from './TaskPanel'
import { viewTasks, viewOptions, type BoardData } from './types'

export type BrandFolderSlug = 'calendar' | 'assets' | 'sheet' | 'library'
const FOLDER_KEY = { calendar: 'cal', assets: 'assets', sheet: 'sheet', library: 'lib' } as const

export function BrandPage({ data, brandId, folder, assets = [] }: {
  data: BoardData
  brandId: string | null
  folder: BrandFolderSlug | null
  assets?: { id: string; filename: string; url: string }[]
}) {
  const t = useTranslations('spaces')
  const tv = useTranslations('views')
  const selectTask = useUIStore(s => s.selectTask)
  const brand = brandId ? data.brands.find(b => b.id === brandId) ?? null : null
  const name = brand?.name ?? t('noBrand')
  const color = brand?.color ?? PIPE.textFaint
  const scope = useMemo(() => (task: Task) => (brandId ? task.brand_id === brandId : !task.brand_id), [brandId])
  const themeScope = useMemo(() => (th: ContentTheme) => (brandId ? th.brand_id === brandId : !th.brand_id), [brandId])
  const all = viewTasks(data).filter(scope)
  const open = (id: string) => selectTask(id)
  const campaigns = [...new Map(all.filter(x => x.project).map(x => [x.project!.id, x.project!])).values()]
    .sort((a, b) => a.name.localeCompare(b.name))
  const folderName = folder ? t(`folders.${FOLDER_KEY[folder]}`) : null
  const withPanel = (node: React.ReactNode) => <>{node}<TaskPanel data={data} /></>

  // Spec 021 (US4): admins switch the brand's features from its header.
  const features = brand && data.currentUser.access === 'admin'
    ? <BrandFeaturesButton brand={{ id: brand.id, name: brand.name, own: brand.own_features ?? {}, nine_stage_default: brand.nine_stage_default ?? null }}
        defaults={data.brandFeatureDefaults} workspaceNineStage={data.workspaceNineStage} />
    : undefined
  const common = { crumbs: [t('brands'), name, ...(folderName ? [folderName] : [])], color, mark: name[0], actions: features }

  if (folder === 'calendar') {
    return (
      <ViewHost {...common} title={folderName!} tag={t('folderTag')} sub={t('calendarLede')}
        tabs={[{ key: 'calendar', label: tv('calendar') }, { key: 'list', label: tv('list') }, { key: 'board', label: tv('board') }]}
        render={tab => tab === 'board'
          ? <BoardView data={data} scopeTasks={scope} boardKey={brandId ? `brand:${brandId}` : undefined} />
          : withPanel(tab === 'list'
            ? <ListView tasks={all} brands={data.brands} members={data.members} slaConfig={data.slaConfig} today={data.today} onOpen={open} />
            : <CalendarView tasks={all} brands={data.brands} colorBy="stage" campaigns={campaigns} onOpen={open} defaultBy="publish" />)} />
    )
  }
  if (folder === 'assets') {
    const requests = all.filter(x => x.content_type_label === 'Design' && x.status !== 'publish' && x.kind !== 'simple')
    return (
      <ViewHost {...common} title={folderName!} tag={t('folderTag')} sub={t('assetsLede')}
        tabs={[{ key: 'files', label: tv('files') }, { key: 'requests', label: tv('requests') }]}
        render={tab => withPanel(<BrandAssets assets={assets} requests={requests} color={color} onOpen={open} tab={tab === 'requests' ? 'requests' : 'files'} />)} />
    )
  }
  if (folder === 'library') {
    const published = all.filter(x => x.status === 'publish' && x.kind !== 'simple' && !x.dropped_at)
    return (
      <ViewHost {...common} title={folderName!} tag={t('folderTag')} sub={t('libraryLede')}
        tabs={[{ key: 'gallery', label: tv('gallery') }, { key: 'list', label: tv('list') }]}
        render={tab => withPanel(tab === 'list'
          ? <ListView tasks={published} brands={data.brands} members={data.members} slaConfig={data.slaConfig} today={data.today} onOpen={open} />
          : <BrandLibrary tasks={published} color={color} onOpen={open} />)} />
    )
  }
  if (folder === 'sheet') {
    return (
      <ViewHost {...common} title={folderName!} tag={t('folderTag')} sub={t('sheetLede')}
        tabs={[{ key: 'tasks', label: t('allTasksSheet'), disabled: !brandId }, { key: 'content', label: t('contentSheet') }, { key: 'video', label: t('videoSheet') }]}
        render={tab => tab === 'tasks' && brandId
          // T081: the brand's own workbook: its Tasks tab, then the brand's blank tabs.
          ? withPanel(<NodeWorkbook data={data} node={`brand:${brandId}`}
              linked={<TaskSheet data={data} tasks={all.filter(x => !x.dropped_at)} hideBrand sheetKey={`tasks:brand:${brandId}`} label={`${name} · ${t('allTasksSheet')}`} />} />)
          : <NodeWorkbook key={tab} data={data} folder={tab === 'video' ? 'video' : 'content'}
              linked={<KanbanBoard {...data} surface="sheets" sheetsView={tab === 'video' ? 'sheet' : 'content'} scopeTasks={scope} sheetScope={scope} themeScope={themeScope} />} />} />
    )
  }

  return (
    <ViewHost {...common} title={name} tag={t('brandTag')} sub={t('brandAll')}
      tabs={[{ key: 'list', label: tv('list') }, { key: 'board', label: tv('board') }, { key: 'sheet', label: tv('sheet') }, { key: 'calendar', label: tv('calendar') }, { key: 'workload', label: tv('workload') }]}
      node={brandId ? `brand:${brandId}` : undefined}
      viewTypes={['list', 'board', 'sheet', 'calendar', 'workload']}
      options={viewOptions(data, all, { brand: true })}
      lead={data.currentUser.access !== 'user'}
      render={(tab, view) => {
        const shownTasks = view ? applyView(all, view.config) : all
        const ids = view ? new Set(shownTasks.map(x => x.id)) : null
        if (tab === 'board') return <BoardView key={view?.id} data={data} scopeTasks={ids ? (x: Task) => scope(x) && ids.has(x.id) : scope} boardKey={brandId ? `brand:${brandId}` : undefined} />
        return withPanel(tab === 'sheet'
          ? (brandId
            ? <NodeWorkbook key={view?.id} data={data} node={`brand:${brandId}`}
                linked={<TaskSheet data={data} tasks={shownTasks.filter(x => !x.dropped_at)} hideBrand fields={view?.config.fields} sheetKey={`tasks:brand:${brandId}`} label={name} />} />
            : <TaskSheet data={data} tasks={shownTasks.filter(x => !x.dropped_at)} hideBrand fields={view?.config.fields} label={name} />)
          : tab === 'calendar'
            ? <CalendarView tasks={shownTasks} brands={data.brands} colorBy="stage" campaigns={campaigns} onOpen={open} />
            : tab === 'workload'
              ? <WorkloadView tasks={shownTasks} members={data.members} brands={data.brands} />
              : <ListView key={view?.id} tasks={shownTasks} brands={data.brands} members={data.members} slaConfig={data.slaConfig} today={data.today} initialGroup={view?.config.group} onOpen={open} />)
      }} />
  )
}
