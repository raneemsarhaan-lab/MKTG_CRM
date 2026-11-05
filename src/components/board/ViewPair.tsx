'use client'

/**
 * Board | Sheet (spec 011 FR-033): two ways of showing the pipeline. Used at
 * the far end of the Board toolbar and of the video sheet's bar, so the
 * switch is the same control on both. Content is a page tab, not a view.
 * Between 1024 and 1279 px the labels hide (CSS); title and aria-label keep
 * the names.
 */
import { useTranslations } from 'next-intl'

export function GridIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <rect x="3" y="3" width="8" height="8" rx="2" /><rect x="13" y="3" width="8" height="8" rx="2" />
      <rect x="3" y="13" width="8" height="8" rx="2" /><rect x="13" y="13" width="8" height="8" rx="2" />
    </svg>
  )
}
export function ListIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
      <path d="M9 6h12M9 12h12M9 18h12M4 6h.01M4 12h.01M4 18h.01" />
    </svg>
  )
}

export function ViewPair({ view, onView }: { view: 'board' | 'sheet'; onView(v: 'board' | 'sheet'): void }) {
  const t = useTranslations('header')
  const item = (v: 'board' | 'sheet', icon: React.ReactNode) => (
    <button type="button" aria-pressed={view === v} data-view={v} title={t(v)} aria-label={t(v)}
            onClick={() => { if (view !== v) onView(v) }}>
      {icon}<span className="fx-hd-lbl">{t(v)}</span>
    </button>
  )
  return (
    <div className="fx-hd-pair" role="group" aria-label={t('viewLabel')} data-view-pair="">
      {item('board', <GridIcon />)}
      {item('sheet', <ListIcon />)}
    </div>
  )
}
