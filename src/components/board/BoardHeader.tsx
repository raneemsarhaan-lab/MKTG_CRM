'use client'

/**
 * The Board page's header (spec 011): the top bar and the title row, on all
 * three views. The third row, the toolbar, belongs to the view and is drawn
 * under this by the caller.
 *
 *   1. Pipeline | Content tabs · search · Inbox · avatar
 *   2. Pipeline (or Content) with the purple ticks · + New task
 *
 * The Inbox button and the avatar menu are passed in already wired, so this
 * component holds no data of its own. On a phone the search folds into an
 * icon that opens it over the top bar (US5); that open state is the only
 * state here.
 */
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useTranslations } from 'next-intl'
import type { BoardTab } from '@/types/index'
import { TitleTicks } from './TitleTicks'

function SearchIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
      <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
    </svg>
  )
}

export function BoardHeader({ tab, onTab, search, onSearch, inbox, account, canCreate, onNewTask }: {
  tab: BoardTab
  onTab(tab: BoardTab): void
  search: string
  onSearch(q: string): void
  /** The Inbox button, wired by the caller. */
  inbox: ReactNode
  /** The avatar and its account menu. */
  account: ReactNode
  canCreate: boolean
  onNewTask(): void
}) {
  const t = useTranslations('header')
  const [searchOpen, setSearchOpen] = useState(false)
  const input = useRef<HTMLInputElement>(null)
  const opener = useRef<HTMLButtonElement>(null)
  const tabsRef = useRef<HTMLDivElement>(null)

  useEffect(() => { if (searchOpen) input.current?.focus() }, [searchOpen])

  function closeSearch() {
    setSearchOpen(false)
    requestAnimationFrame(() => opener.current?.focus())
  }

  const tabs: BoardTab[] = ['pipeline', 'content']
  function onTabKey(e: React.KeyboardEvent) {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
    e.preventDefault()
    const rtl = getComputedStyle(e.currentTarget).direction === 'rtl'
    const forward = (e.key === 'ArrowRight') !== rtl
    const next = tabs[(tabs.indexOf(tab) + (forward ? 1 : tabs.length - 1)) % tabs.length]
    onTab(next)
    requestAnimationFrame(() => tabsRef.current?.querySelector<HTMLElement>(`[data-tab="${next}"]`)?.focus())
  }

  return (
    <div className="fx-hd" data-board-header="">
      <div className={`fx-hd-top${searchOpen ? ' is-searching' : ''}`} data-top-bar="">
        <div className="fx-hd-tabs" role="tablist" aria-label={t('tabsLabel')} ref={tabsRef} onKeyDown={onTabKey}>
          {tabs.map(x => (
            <button key={x} type="button" role="tab" className="fx-hd-tab" data-tab={x}
                    aria-selected={tab === x} tabIndex={tab === x ? 0 : -1}
                    onClick={() => { if (tab !== x) onTab(x) }}>
              {t(x)}
            </button>
          ))}
        </div>

        <div className="fx-hd-search">
          <SearchIcon />
          <input ref={input} type="search" value={search} placeholder={t('search')} aria-label={t('search')}
                 data-header-search="" autoComplete="off"
                 onChange={e => onSearch(e.target.value)}
                 onKeyDown={e => { if (e.key === 'Escape' && searchOpen) { e.preventDefault(); closeSearch() } }} />
        </div>
        <button type="button" className="fx-hd-search-close" aria-label={t('searchClose')} data-search-close=""
                onClick={closeSearch}>×</button>
        <button ref={opener} type="button" className="fx-hd-search-open" aria-label={t('searchOpen')} data-search-open=""
                onClick={() => setSearchOpen(true)}>
          <SearchIcon />{search && <i className="fx-hd-search-dot" aria-hidden="true" />}
        </button>

        <div className="fx-hd-inbox">{inbox}</div>
        <span className="fx-hd-vr" aria-hidden="true" />
        <div className="fx-hd-account">{account}</div>
      </div>

      <div className="fx-hd-title-row" data-title-row="">
        <h1 className="fx-hd-title" data-page-title="">
          <span>{t(tab)}</span><TitleTicks />
        </h1>
        {canCreate && (
          <button type="button" className="fx-hd-cta" data-new-task="" onClick={onNewTask}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" aria-hidden="true">
              <path d="M12 5v14M5 12h14" />
            </svg>
            {t('newTask')}
          </button>
        )}
      </div>
    </div>
  )
}
