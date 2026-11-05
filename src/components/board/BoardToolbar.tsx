'use client'

/**
 * The Board view's toolbar (spec 011 FR-030–FR-035), the header's third row:
 *
 *   My tasks | Team tasks  ┊  All brands ▾  Filters  (N no project assigned)      Board | Sheet  ┊  Display options
 *
 * Each control keeps what it did before; the brand logos became one
 * dropdown, and the dark "Board" label that did nothing is gone. The Sheet
 * and Content views draw their own bars in this row instead.
 */
import type { ReactNode } from 'react'
import { useTranslations } from 'next-intl'
import type { Brand } from '@/types/index'
import { BrandMenu } from './BrandMenu'
import { ViewPair } from './ViewPair'

export function BoardToolbar({ scope, onScope, brands, brandIds, onBrandIds, noProject, filters, view, onView, display }: {
  scope: 'me' | 'team'
  onScope(s: 'me' | 'team'): void
  brands: Brand[]
  brandIds: string[]
  onBrandIds(ids: string[]): void
  /** Tasks of the one selected brand with no project; null unless exactly one brand is chosen. */
  noProject: number | null
  /** The Filters button (BoardFilters' FiltersButton). */
  filters: ReactNode
  view: 'board' | 'sheet'
  onView(v: 'board' | 'sheet'): void
  /** Display options (the View menu). */
  display: ReactNode
}) {
  const t = useTranslations('header')
  return (
    <div className="fx-hd-tools" data-toolbar="">
      <div className="fx-hd-pair" role="group" aria-label={t('scopeLabel')}>
        {(['me', 'team'] as const).map(v => (
          <button key={v} type="button" aria-pressed={scope === v} data-scope={v} onClick={() => onScope(v)}>
            {t(v === 'me' ? 'mine' : 'team')}
          </button>
        ))}
      </div>
      <span className="fx-hd-vr" aria-hidden="true" />
      <BrandMenu brands={brands} selected={brandIds} onChange={onBrandIds} />
      {filters}
      {noProject !== null && (
        <span className={`fx-hd-note${noProject > 0 ? ' is-warn' : ''}`} data-no-project="">
          {noProject > 0 ? t('noProject', { n: noProject }) : t('allAttached')}
        </span>
      )}
      <div className="fx-hd-end">
        <ViewPair view={view} onView={onView} />
        <span className="fx-hd-vr" aria-hidden="true" />
        {display}
      </div>
    </div>
  )
}
