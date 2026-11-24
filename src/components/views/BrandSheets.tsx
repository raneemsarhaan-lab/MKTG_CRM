'use client'

/**
 * Spec 026 (§1): the Brand page's Sheet view — the brand's rows from every Space.
 *
 * Each Space keeps its own sheet (its columns, formatting and comments), so the
 * view shows one Space's sheet at a time, narrowed to this brand, with a strip
 * to move between Spaces and a count of the brand's rows on each. "All tasks"
 * is the brand's tasks from every Space together (every linked row), with a
 * Space column.
 *
 * Which one opens: the address (`?sheet=<space key>` or `?sheet=tasks`), else
 * the one last opened for this brand, else the first Space with rows.
 */
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { useSearchParams } from 'next/navigation'
import { useTranslations } from 'next-intl'
import type { ContentTheme, Task } from '@/types/index'
import { PIPE } from '@/lib/pipeline-tokens'
import { isLinkedMedia } from '@/lib/media'
import { spaceLabel } from '@/components/shared/NavTree/labels'
import { KanbanBoard } from '@/components/kanban/KanbanBoard'
import { NodeWorkbook } from './NodeWorkbook'
import type { BoardData } from './types'

const TASKS = 'tasks'
const chip = (on: boolean): React.CSSProperties => ({ display: 'inline-flex', alignItems: 'center', gap: 6, border: `1px solid ${on ? PIPE.ink : PIPE.border}`, background: on ? PIPE.ink : '#FFFFFF', color: on ? '#FFFFFF' : PIPE.ink, borderRadius: 999, padding: '3px 10px', fontFamily: 'inherit', fontSize: 12.5, fontWeight: 600, cursor: 'pointer' })

export function BrandSheets({ data, brandId, taskCount, tasksSheet }: {
  data: BoardData
  brandId: string
  /** The brand's tasks, for the "All tasks" count. */
  taskCount: number
  /** The brand's task sheet, in its workbook. */
  tasksSheet: ReactNode
}) {
  const t = useTranslations('spaces')
  const params = useSearchParams()
  const contentSpace = data.spaces.find(s => s.key === 'content')
  // The brand's rows on each Space's sheet: a row is the brand's when its theme's project is.
  const counts = useMemo(() => {
    const brandOf = new Map(data.themes.map(th => [th.id, th.brand_id]))
    const n = new Map<string, number>()
    for (const r of data.contentRows ?? []) {
      if (brandOf.get(r.project_id) !== brandId) continue
      const sid = r.space_id ?? contentSpace?.id
      if (sid) n.set(sid, (n.get(sid) ?? 0) + 1)
    }
    return n
  }, [data.themes, data.contentRows, brandId, contentSpace?.id])

  const prefKey = `momentum.brand.${brandId}.sheet`
  const keyOf = (v: string | null | undefined) => (v === TASKS || data.spaces.some(s => s.key === v) ? v! : null)
  const firstWithRows = data.spaces.find(s => (counts.get(s.id) ?? 0) > 0)?.key ?? contentSpace?.key ?? TASKS
  const asked = keyOf(params.get('sheet'))
  const [picked, setPicked] = useState<string | null>(asked)
  useEffect(() => {
    if (asked) { setPicked(asked); return }
    try { setPicked(keyOf(window.localStorage.getItem(prefKey))) } catch { /* a preference, never required */ }
  }, [asked, prefKey]) // eslint-disable-line react-hooks/exhaustive-deps
  const current = picked ?? asked ?? firstWithRows
  const pick = (k: string) => {
    setPicked(k)
    try { window.localStorage.setItem(prefKey, k) } catch { /* ignore */ }
    const url = new URL(window.location.href)
    url.searchParams.set('sheet', k)
    window.history.replaceState(null, '', url)
  }

  const space = current === TASKS ? null : data.spaces.find(s => s.key === current) ?? null
  const scope = useMemo(() => (task: Task) => task.brand_id === brandId && !isLinkedMedia(task), [brandId])
  const themeScope = useMemo(() => (th: ContentTheme) => th.brand_id === brandId, [brandId])

  return (
    <div data-brand-sheets={current} style={{ minWidth: 0 }}>
      <div role="group" aria-label={t('brandSheets')} data-brand-sheet-strip
        style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center', padding: '10px 38px 10px' }}>
        <span style={{ fontSize: 12.5, fontWeight: 600, color: PIPE.textMuted, marginInlineEnd: 4 }}>{t('brandSheets')}</span>
        {data.spaces.map(s => (
          <button key={s.id} type="button" aria-pressed={current === s.key} data-brand-sheet={s.key} data-rows={counts.get(s.id) ?? 0}
            onClick={() => pick(s.key)} style={chip(current === s.key)}>
            <span aria-hidden="true" style={{ width: 8, height: 8, borderRadius: '50%', background: s.color }} />
            {spaceLabel(s, t)}
            <span style={{ opacity: 0.7, fontWeight: 500 }}>{counts.get(s.id) ?? 0}</span>
          </button>
        ))}
        <button type="button" aria-pressed={current === TASKS} data-brand-sheet={TASKS} data-rows={taskCount}
          onClick={() => pick(TASKS)} style={{ ...chip(current === TASKS), marginInlineStart: 8 }}>
          {t('brandSheetTasks')}
          <span style={{ opacity: 0.7, fontWeight: 500 }}>{taskCount}</span>
        </button>
      </div>
      {space
        ? <NodeWorkbook key={space.id} data={data} {...(space.key === 'content' || space.key === 'video' ? { folder: space.key as 'content' | 'video' } : { node: `space:${space.id}` })}
            linked={<KanbanBoard {...data} surface="sheets" sheetsView="content" scopeTasks={scope} spaceId={space.id} themeScope={themeScope} />} />
        : tasksSheet}
    </div>
  )
}
