'use client'

/**
 * A brand (spec 021 US1): every task for the brand, as List or Board. Its
 * four Folders — Calendar, Assets, Sheet, Library — open from the sidebar;
 * they arrive with Stage B (US2) and show a note until then.
 */
import { useMemo } from 'react'
import { useTranslations } from 'next-intl'
import { useUIStore } from '@/store/useUIStore'
import type { Task } from '@/types/index'
import { PIPE } from '@/lib/pipeline-tokens'
import { ViewHost } from './ViewHost'
import { ListView } from './ListView'
import { BoardView } from './BoardView'
import { TaskPanel } from './TaskPanel'
import { viewTasks, type BoardData } from './types'

export type BrandFolderSlug = 'calendar' | 'assets' | 'sheet' | 'library'
const FOLDER_KEY = { calendar: 'cal', assets: 'assets', sheet: 'sheet', library: 'lib' } as const

export function BrandPage({ data, brandId, folder }: { data: BoardData; brandId: string | null; folder: BrandFolderSlug | null }) {
  const t = useTranslations('spaces')
  const tv = useTranslations('views')
  const selectTask = useUIStore(s => s.selectTask)
  const brand = brandId ? data.brands.find(b => b.id === brandId) ?? null : null
  const name = brand?.name ?? t('noBrand')
  const scope = useMemo(() => (task: Task) => (brandId ? task.brand_id === brandId : !task.brand_id), [brandId])
  const tasks = viewTasks(data).filter(scope)
  const folderName = folder ? t(`folders.${FOLDER_KEY[folder]}`) : null

  if (folder) {
    return (
      <ViewHost
        crumbs={[t('brands'), name, folderName!]}
        title={folderName!}
        tag={t('folderTag')}
        color={brand?.color}
        tabs={[{ key: 'soon', label: folderName! }]}
        render={() => <p data-coming-soon style={{ padding: '18px 38px', color: PIPE.textMuted, fontSize: 13 }}>{t('comingSoon')}</p>}
      />
    )
  }

  return (
    <>
      <ViewHost
        crumbs={[t('brands'), name]}
        title={name}
        tag={t('brandTag')}
        color={brand?.color ?? PIPE.textFaint}
        sub={t('brandAll')}
        tabs={[{ key: 'list', label: tv('list') }, { key: 'board', label: tv('board') }]}
        render={tab => tab === 'board'
          ? <BoardView data={data} scopeTasks={scope} />
          : <><ListView tasks={tasks} brands={data.brands} members={data.members} slaConfig={data.slaConfig} today={data.today} onOpen={id => selectTask(id)} /><TaskPanel data={data} /></>}
      />
    </>
  )
}