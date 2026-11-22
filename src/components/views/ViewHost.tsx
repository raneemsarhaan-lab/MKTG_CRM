'use client'

/**
 * The frame every Space, brand and Folder page shares (spec 021 US2,
 * contracts/routes.md, design/teams-brands.html): crumbs, a title with its
 * tag, a line saying what the page shows, page actions, and view tabs.
 *
 * The open tab is in the address (`?view=`), written with the history API so
 * switching never refetches the page (as the Board does with `?view=`).
 */
import { useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { PIPE } from '@/lib/pipeline-tokens'

export interface ViewTab { key: string; label: string; disabled?: boolean; note?: string }

interface ViewHostProps {
  crumbs: string[]
  title: string
  tag: string
  /** Square colour beside the title (brand or Space colour). */
  color?: string
  /** The letter in that square; defaults to the title's first. */
  mark?: string
  sub?: React.ReactNode
  actions?: React.ReactNode
  tabs: ViewTab[]
  render: (tab: string) => React.ReactNode
}

export function ViewHost({ crumbs, title, tag, color, mark, sub, actions, tabs, render }: ViewHostProps) {
  const t = useTranslations('views')
  const params = useSearchParams()
  const live = tabs.filter(x => !x.disabled)
  const pick = (v: string | null) => (live.some(x => x.key === v) ? (v as string) : live[0]?.key ?? '')
  const [tab, setTab] = useState(() => pick(params.get('view')))
  useEffect(() => { setTab(pick(params.get('view'))) }, [params]) // eslint-disable-line react-hooks/exhaustive-deps

  function choose(next: string) {
    setTab(next)
    const url = new URL(window.location.href)
    if (next === live[0]?.key) url.searchParams.delete('view'); else url.searchParams.set('view', next)
    window.history.replaceState(null, '', url)
  }

  return (
    <div data-view-host style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', background: '#FFFFFF' }}>
      <header className="fx-view-head" style={{ padding: '22px 26px 0 38px', display: 'flex', flexDirection: 'column', gap: 10, borderBottom: `1px solid ${PIPE.border}` }}>
        <div data-crumbs style={{ display: 'flex', flexWrap: 'wrap', gap: 6, fontSize: 12, color: PIPE.textMuted }}>
          {crumbs.map((c, i) => (
            <span key={i} style={{ display: 'inline-flex', gap: 6 }}>
              {i > 0 && <span aria-hidden="true">›</span>}
              <span style={i === crumbs.length - 1 ? { color: PIPE.ink, fontWeight: 700 } : undefined}>{c}</span>
            </span>
          ))}
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10, justifyContent: 'space-between' }}>
          <h1 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 10, fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 26, letterSpacing: '-0.02em', color: PIPE.ink }}>
            {color && <span aria-hidden="true" style={{ width: 22, height: 22, borderRadius: 7, background: color, display: 'grid', placeItems: 'center', color: '#FFFFFF', fontSize: 12, fontWeight: 800 }}>{mark ?? title[0]}</span>}
            {title}
            <span style={{ fontFamily: 'inherit', fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 6, background: PIPE.surface, color: PIPE.textMuted, letterSpacing: 0 }}>{tag}</span>
          </h1>
          {actions && <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>{actions}</div>}
        </div>
        {sub && <div data-sub style={{ fontSize: 12.5, color: PIPE.textSecondary }}>{sub}</div>}
        <div role="tablist" aria-label={t('tabs')} style={{ display: 'flex', gap: 2, overflowX: 'auto', scrollbarWidth: 'none' }}>
          {tabs.map(x => (
            <button
              key={x.key}
              type="button"
              role="tab"
              data-view-tab={x.key}
              aria-selected={tab === x.key}
              disabled={x.disabled}
              title={x.note}
              onClick={() => choose(x.key)}
              style={{
                border: 'none', background: 'none', cursor: x.disabled ? 'default' : 'pointer', fontFamily: 'inherit',
                padding: '9px 12px 11px', fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap',
                color: tab === x.key ? PIPE.ink : x.disabled ? PIPE.textFaintest : PIPE.textMuted,
                borderBottom: `2px solid ${tab === x.key ? PIPE.ink : 'transparent'}`,
              }}
            >
              {x.label}{x.note && <span style={{ marginInlineStart: 6, fontSize: 10.5, fontWeight: 500 }}>{x.note}</span>}
            </button>
          ))}
        </div>
      </header>
      <div role="tabpanel" data-view={tab} style={{ flex: 1, minWidth: 0 }}>{render(tab)}</div>
    </div>
  )
}
