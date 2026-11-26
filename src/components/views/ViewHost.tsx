'use client'

/**
 * The frame every Space, brand and Folder page shares (spec 021 US2,
 * contracts/routes.md, design/teams-brands.html): crumbs, a title with its
 * tag, a line saying what the page shows, page actions, and view tabs.
 *
 * The open tab is in the address (`?view=`), written with the history API so
 * switching never refetches the page (as the Board does with `?view=`).
 *
 * Saved views (FR-012a, T040): with a `node`, the page's own tabs are followed
 * by its saved views — shared ones and the reader's personal ones — and
 * "+ View". A saved view keeps a view type and a config (filters, group, sort,
 * Sheet fields) edited in the bar above it; its tab key is `v:<id>`.
 */
import { SheetBarMine } from './SheetBarControls'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { PIPE } from '@/lib/pipeline-tokens'
import type { SavedView, ViewType } from '@/types/index'
import { arrangeTabs, cleanConfig, EMPTY_TAB_PREFS, fieldsUsed, filterCount, HAS_VALUE, isFieldViewKey, shownFields, VIEW_FILTERS, VIEW_SORTS, type FieldViewKey, type TabPrefs, type ViewConfig, type ViewFilterKey } from '@/lib/view-config'
import { deleteView, listViews, reorderViews, saveView, setTabPrefs } from '@/actions/views'
import { FieldsMenu, type FieldsSetup } from '@/components/fields/FieldsMenu'
import { STATUS_GROUPS } from '@/lib/status-groups'
import { ViewChromeContext, type PageAdd } from './view-chrome'
import { Fragment, type ReactNode } from 'react'
import Link from 'next/link'
import { FIELDS_OPEN } from '@/components/sheets/links/FieldsPanel'

/** Simple sheet header (user, 25 Nov 2026): what a page shows in it. */
export interface SimpleHeader {
  /** "Spaces / Content / [logo] Forefront": each with its small icon; the last is the page. */
  crumbs: { label: string; icon: ReactNode; href?: string }[]
  /** ☆: this page in the member's favourites. */
  favourite?: { on: boolean; toggle(): void }
  /** The settings icon's "Space settings" (or the brand's). */
  settings?: { label: string; open(): void } | null
  /** "+ Post": the page's own add, its word from the Space's New task label. */
  add?: PageAdd | null
}

export interface ViewTab { key: string; label: string; disabled?: boolean; note?: string }
export interface OpenView { id: string; type: ViewType; config: ViewConfig }
export interface ViewOptions {
  brand: { id: string; name: string }[]
  assignee: { id: string; name: string }[]
  type: { id: string; name: string }[]
  campaign: { id: string; name: string }[]
  statusGroup?: { id: string; name: string }[]
  tag?: { id: string; name: string }[]
}

/** Fields (§5): what a saved view's bar offers beyond its standard filters. */
export interface FieldPicker {
  /** Fields this page offers (standard extras and custom fields on in the Space), each with whether it's on here. */
  fields: { key: FieldViewKey; label: string; glyph: string; on: boolean }[]
  /** A field's values to pick from (choices, people, Yes); empty for text, numbers, dates and links. */
  choices: (key: FieldViewKey) => { id: string; name: string }[]
  groupable: (key: FieldViewKey) => boolean
  /** Theme (the Campaign filter): false when this Space has turned the Theme field off. */
  themeOn?: boolean
}

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
  /** A saved view renders as its type, with its config. `fields`: what the Fields button shows (Board, List, Sheet). */
  render: (tab: string, view?: OpenView, fields?: string[]) => React.ReactNode
  /** Spec 023: the Fields button's custom fields and "+ Field". */
  fields?: FieldsSetup
  /** The built-in tabs whose view uses the Fields button's choices (default: Board, List and Sheet). A Space's Sheet tab has its own Fields. */
  builtInFields?: string[]
  /** Fields (§5): the fields a saved view can filter, sort and group by. */
  fieldPicker?: FieldPicker
  /** Saved views: the node they belong to ('space:<id>', 'brand:<id>', 'me'). */
  node?: string
  /** The types "+ View" offers (the page's own view tabs). */
  viewTypes?: ViewType[]
  /** What the config bar's filters list. */
  options?: ViewOptions
  /** The reader is an admin or superuser (may change any shared view). */
  lead?: boolean
  /** Spec 024 (§5): the tab the page opens on without a ?view= or a home view; the first tab when unset. */
  defaultTab?: string
  /** This member's tab choices for this page, sent with the page so it opens on the right view at once. */
  initialPrefs?: TabPrefs
  /** Spec 025: the page's sections (a brand's Brand · Assets · Settings), above the view tabs. */
  sections?: React.ReactNode
  /** Spec 025: a section with no views of its own (Assets, Settings): no view tabs. */
  noViews?: boolean
  /** The simple header, on the Sheet view (built-in or saved) of a Space, folder or brand page. */
  simple?: SimpleHeader
  /** QA 26 Nov 2026 (F12): the page's Mine (shared with its Board and Sheet), shown on List, Calendar and Workload. */
  mine?: { on: boolean; toggle(): void; me: { name: string; color?: string; avatar_url?: string } }
}

const pill: React.CSSProperties = { border: `1px solid ${PIPE.border}`, background: '#FFFFFF', borderRadius: 8, padding: '5px 9px', fontFamily: 'inherit', fontSize: 12, fontWeight: 600, color: PIPE.ink, cursor: 'pointer' }

export function ViewHost({ crumbs, title, tag, color, mark, sub, actions, tabs, render, node, viewTypes, options, lead = false, fields: fieldSetup, defaultTab, initialPrefs, sections, noViews = false, builtInFields, fieldPicker, simple, mine }: ViewHostProps) {
  // Sheet look (25 Nov 2026): where a sheet puts its "Saved" and its tools, in this header.
  const [statusSlot, setStatusSlot] = useState<HTMLElement | null>(null)
  const [toolsSlot, setToolsSlot] = useState<HTMLElement | null>(null)
  const t = useTranslations('views')
  const th = useTranslations('views.simple')
  const params = useSearchParams()
  const [views, setViews] = useState<SavedView[]>([])
  const [drafts, setDrafts] = useState<Record<string, ViewConfig>>({})
  const [adding, setAdding] = useState(false)
  // Spec 027 (US1): renaming a saved view in its tab, and the delete confirmation.
  const [renaming, setRenaming] = useState<{ key: string; name: string } | null>(null)
  const [deleting, setDeleting] = useState<SavedView | null>(null)
  const [say, setSay] = useState('')
  // Home, pinned and hidden tabs (user, 2026-11-22), this member's own per page.
  const [prefs, setPrefs] = useState<TabPrefs>(initialPrefs ?? EMPTY_TAB_PREFS)
  // The latest choices, for a save that follows another in the same click (hide a tab, then leave it).
  const prefsRef = useRef(prefs)
  prefsRef.current = prefs
  // Owner, 26 Nov 2026: choices made while the saved ones load (a field ticked) aren't overwritten by them.
  const prefsEdits = useRef(0)
  const [tabMenu, setTabMenu] = useState<{ key: string; x: number; y: number } | null>(null)
  const [hiddenMenu, setHiddenMenu] = useState<{ x: number; y: number } | null>(null)
  const firstLoad = useRef(true)
  const live = tabs.filter(x => !x.disabled)
  const savedKey = (v: SavedView) => `v:${v.id}`
  const first = live.some(x => x.key === defaultTab) ? defaultTab as string : live[0]?.key ?? ''
  const pick = (v: string | null, list = views) =>
    live.some(x => x.key === v) || list.some(x => savedKey(x) === v) ? (v as string) : first
  // Without a ?view=: this member's home view, else the view they used last here, else the page's default.
  const remembered = (p: TabPrefs, list = views) => [p.home, p.last].find(k => !!k && (live.some(x => x.key === k) || list.some(v => savedKey(v) === k))) ?? null
  const [tab, setTab] = useState(() => (params.get('view') ? pick(params.get('view')) : remembered(initialPrefs ?? EMPTY_TAB_PREFS, []) ?? first))
  // Follow the address's ?view= only when it changes: another part of the page touching the
  // address (the board does) must not send the page back from the member's home view.
  const viewParam = params.get('view')
  const seenParam = useRef(viewParam)
  useEffect(() => { if (seenParam.current !== viewParam) { seenParam.current = viewParam; setTab(pick(viewParam)) } }, [viewParam]) // eslint-disable-line react-hooks/exhaustive-deps

  async function reload(select?: string) {
    if (!node) return
    const edits = prefsEdits.current
    const r = await listViews(node).catch(() => null)
    if (!r?.success) return
    setViews(r.views)
    if (prefsEdits.current === edits) setPrefs(r.prefs)
    // Without a ?view= in the address, the page opens on this member's home view.
    if (firstLoad.current) {
      firstLoad.current = false
      const home = remembered(r.prefs, r.views)
      if (!select && !params.get('view') && home) { setTab(home); return }
    }
    if (select) choose(select)
    else setTab(cur => (cur.startsWith('v:') && !r.views.some(v => savedKey(v) === cur) ? pick(params.get('view'), r.views) : pick(cur, r.views)))
  }
  useEffect(() => { void reload() }, [node]) // eslint-disable-line react-hooks/exhaustive-deps
  // A `?view=v:<id>` link opens once the views have loaded.
  useEffect(() => { const want = params.get('view'); if (want?.startsWith('v:') && views.some(v => savedKey(v) === want)) setTab(want) }, [views]) // eslint-disable-line react-hooks/exhaustive-deps

  function choose(next: string) {
    setTab(next)
    setSay('')
    // Spec 025: the page remembers the view used last, per member and per page.
    const cur = prefsRef.current
    if (node && cur.last !== next) { const p = { ...cur, last: next }; prefsRef.current = p; setPrefs(p); void setTabPrefs(node, p).catch(() => null) }
    const url = new URL(window.location.href)
    if (next === first) url.searchParams.delete('view'); else url.searchParams.set('view', next)
    window.history.replaceState(null, '', url)
  }

  // Spec 027 (US1): the page reopens on the view used last, however it was opened (a click, a link, a refresh).
  useEffect(() => {
    const cur = prefsRef.current
    if (!node || !tab || cur.last === tab) return
    if (tab.startsWith('v:') && !views.some(v => savedKey(v) === tab)) return
    const p = { ...cur, last: tab }
    prefsRef.current = p
    setPrefs(p)
    void setTabPrefs(node, p).catch(() => null)
  }, [tab, node, views]) // eslint-disable-line react-hooks/exhaustive-deps

  const open = views.find(v => savedKey(v) === tab) ?? null
  // The simple header is the Sheet view's (built-in or saved) on the pages that offer it.
  const isSimple = !!simple && (open ? open.type : tab) === 'sheet' && !noViews
  // User, 25 Nov 2026: the breadcrumb header (Spaces / Content ☆ • Saved) is on every view of these pages;
  // the one toolbar row and "+ Post ▾" are the Sheet view's.
  const headSimple = !!simple
  const settingsItems = [
    ...(isSimple ? [{ key: 'fields', label: th('fields'), run: () => { setSettingsMenu(null); document.dispatchEvent(new CustomEvent(FIELDS_OPEN)) } }] : []),
    ...(simple?.settings ? [{ key: 'settings', label: simple.settings.label, run: () => { setSettingsMenu(null); simple.settings!.open() } }] : []),
  ]
  const chrome = useMemo(() => ({ status: statusSlot, tools: toolsSlot, simple: isSimple, add: isSimple ? simple?.add ?? null : null }), [statusSlot, toolsSlot, isSimple, simple?.add])
  const [settingsMenu, setSettingsMenu] = useState<{ x: number; y: number } | null>(null)
  const allTabs: (ViewTab & { personal?: boolean })[] = [...tabs, ...views.map(v => ({ key: savedKey(v), label: v.name, personal: !!v.owner_id }))]
  const arranged = node ? arrangeTabs(allTabs, prefs) : { shown: allTabs, hidden: [] as typeof allTabs }
  function updatePrefs(next: TabPrefs) {
    prefsEdits.current++
    prefsRef.current = next
    setPrefs(next)
    setTabMenu(null)
    if (node) void setTabPrefs(node, next).catch(() => null)
    if (next.hidden.includes(tab)) {
      const home = next.home && !next.hidden.includes(next.home) ? next.home : arrangeTabs(allTabs, next).shown.find(x => !x.disabled)?.key
      if (home) choose(home)
    }
  }
  const menuAt = (e: React.MouseEvent<HTMLElement>) => { const r = e.currentTarget.getBoundingClientRect(); return { x: r.left, y: r.bottom + 4 } }
  const config = open ? drafts[open.id] ?? cleanConfig(open.config) : null
  const mayChange = (v: SavedView) => (v.owner_id ? true : !!v.mine || lead)
  const typeLabel = (k: string) => tabs.find(x => x.key === k)?.label ?? t(k as 'list')
  // The Fields button (spec 023): a saved view keeps its fields in its config (saved with Save);
  // a built-in tab keeps this member's choice in their tab prefs.
  const viewType = open ? open.type : tab
  // The fields a Board, List or Sheet shows are worked out for every such view; the button only shows where
  // the page's Fields sets them (a built-in Sheet tab has its own Fields in the tabs row).
  const fieldsFor = !!fieldSetup && ['board', 'list', 'sheet'].includes(viewType)
  const hasFields = fieldsFor && (!!open || !builtInFields || builtInFields.includes(viewType))
  /** A tab's view type, for its icon: the built-in tab's key, or the saved view's type. */
  const typeOf = (key: string) => (key.startsWith('v:') ? views.find(v => savedKey(v) === key)?.type : key)
  const shown = fieldsFor && fieldSetup
    ? shownFields(open ? config?.fields : prefs.fields?.[tab], viewType, fieldSetup.custom, new Set(fieldSetup.typesOnPage), fieldSetup.links)
    : undefined
  function setShown(keys: string[]) {
    if (open && config) { setDrafts(d => ({ ...d, [open.id]: { ...config, fields: keys } })); return }
    const next = { ...prefsRef.current, fields: { ...(prefsRef.current.fields ?? {}), [tab]: keys } }
    prefsEdits.current++
    prefsRef.current = next
    setPrefs(next)
    if (node) void setTabPrefs(node, next).catch(() => null)
  }

  async function renameSaved(key: string, name: string) {
    const v = views.find(x => savedKey(x) === key)
    setRenaming(null)
    const clean = name.trim()
    if (!v || !clean || clean === v.name) return
    const r = await saveView({ id: v.id, node: v.node, type: v.type, name: clean, config: drafts[v.id] ?? cleanConfig(v.config), personal: !!v.owner_id }).catch(() => null)
    if (!r?.success) { setSay(t('notSaved', { reason: r?.error ?? 'generic' })); return }
    await reload()
  }
  async function duplicateSaved(v: SavedView) {
    const r = await saveView({ node: v.node, type: v.type, name: t('copyName', { name: v.name }).slice(0, 40), config: cleanConfig(v.config), personal: true }).catch(() => null)
    if (!r?.success) { setSay(t('notSaved', { reason: r?.error ?? 'generic' })); return }
    await reload(`v:${r.id}`)
  }
  async function deleteSaved(v: SavedView) {
    setDeleting(null)
    const r = await deleteView(v.id).catch(() => null)
    if (!r?.success) { setSay(t('notSaved', { reason: r?.error ?? 'generic' })); return }
    await reload(tab === savedKey(v) ? live[0]?.key : undefined)
  }

  // The view tabs: Board · Sheet · Calendar | + View, the same row in either header.
  const tabsRow = (
        <div hidden={noViews} className={headSimple ? 'fx-sh2' : undefined} style={{ display: noViews ? 'none' : 'flex', alignItems: 'center', gap: 2, minWidth: 0 }}>
          {/* A toolbar of view buttons (each with its ⋯ menu), so the menus sit beside them legitimately. */}
          <div role="toolbar" aria-label={t('tabs')} style={{ display: 'flex', gap: 2, overflowX: 'auto', scrollbarWidth: 'none', minWidth: 0 }}>
            {arranged.shown.map(x => (
              <span key={x.key} className={`fx-view-tab${tab === x.key ? ' is-on' : ''}`}>
              <button
                type="button"
                data-view-tab={x.key}
                aria-pressed={tab === x.key}
                disabled={x.disabled}
                title={x.note}
                onClick={() => choose(x.key)}
                onContextMenu={node ? e => { e.preventDefault(); setTabMenu({ key: x.key, x: e.clientX, y: e.clientY }) } : undefined}
                className="fx-view-tab-btn"
              >
                <ViewIcon type={typeOf(x.key)} />
                {/* User, 24 Nov 2026: the home view and pinned views carry an icon before their name. */}
                {prefs.home === x.key && <svg role="img" aria-label={t('homeMark')} data-view-home="" viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ display: 'inline-block', marginInlineEnd: 5, verticalAlign: '-2px' }}><title>{t('homeMark')}</title><path d="M3 11l9-8 9 8" /><path d="M5 10v10h5v-6h4v6h5V10" /></svg>}
                {prefs.pinned.includes(x.key) && <svg role="img" aria-label={t('pinnedMark')} data-view-pinned="" viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ display: 'inline-block', marginInlineEnd: 5, verticalAlign: '-2px' }}><title>{t('pinnedMark')}</title><path d="M12 17v5" /><path d="M9 3h6l-1 6 3 3v2H7v-2l3-3z" /></svg>}
                {renaming?.key === x.key ? null : x.label}
                {x.note && <span style={{ marginInlineStart: 6, fontSize: 10.5, fontWeight: 500 }}>{x.note}</span>}
                {x.personal && <span style={{ marginInlineStart: 6, fontSize: 10.5, fontWeight: 500 }}>· {t('onlyMeMark')}</span>}
              </button>
              {renaming?.key === x.key && (
                <input data-view-rename={x.key} aria-label={t('rename')} ref={el => { if (el && document.activeElement !== el && !el.dataset.focused) { el.dataset.focused = '1'; el.focus(); el.select() } }} maxLength={40} value={renaming.name}
                  onChange={e => setRenaming({ key: x.key, name: e.target.value })}
                  onKeyDown={e => {
                    if (e.key === 'Escape') { e.preventDefault(); setRenaming(null) }
                    if (e.key === 'Enter') { e.preventDefault(); void renameSaved(x.key, renaming.name) }
                  }}
                  onBlur={() => void renameSaved(x.key, renaming.name)}
                  style={{ width: Math.max(80, renaming.name.length * 8 + 24), font: 'inherit', fontSize: 13.5, fontWeight: 600, border: `1px solid ${PIPE.border}`, borderRadius: 7, padding: '4px 8px', margin: '6px 4px 8px 0' }} />
              )}
              {node && !x.disabled && (
                <button type="button" data-tab-menu={x.key} aria-label={t('tabOptions', { name: x.label })} aria-haspopup="menu"
                  onClick={e => setTabMenu({ key: x.key, ...menuAt(e) })}
                  className="fx-view-tab-more">⋯</button>
              )}
              </span>
            ))}
          </div>
          {arranged.hidden.length > 0 && (
            <button type="button" data-hidden-views aria-haspopup="menu" onClick={e => setHiddenMenu(menuAt(e))}
              style={{ border: 'none', background: 'none', cursor: 'pointer', fontFamily: 'inherit', padding: '9px 10px 11px', fontSize: 12.5, fontWeight: 600, color: PIPE.textMuted, whiteSpace: 'nowrap' }}>
              {t('hiddenViews', { n: arranged.hidden.length })} ▾
            </button>
          )}
          {headSimple && <span aria-hidden="true" className="fx-sh2-sep" />}
          {node && viewTypes?.length ? (
            <button type="button" data-add-view aria-expanded={adding} onClick={() => setAdding(v => !v)} className="fx-view-add">
              {t('addView')}
            </button>
          ) : null}
          {/* The right end: the page's Fields (Board, List, a saved view), then what the open sheet puts here (its Fields and Comments). */}
          {!isSimple && <div className="fx-view-tools">
            {mine && ['list', 'calendar', 'workload'].includes(typeOf(open ? savedKey(open) : tab) ?? '') && <SheetBarMine me={mine.me} on={mine.on} onToggle={mine.toggle} />}
            {hasFields && fieldSetup && shown && <FieldsMenu shown={shown} setup={fieldSetup} onChange={setShown} />}
            <span ref={setToolsSlot} data-view-tools-slot="" className="fx-view-tools-slot" />
          </div>}
        </div>
  )

  return (
    <ViewChromeContext.Provider value={chrome}>
    <div data-view-host style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', background: '#FFFFFF' }}>
      {headSimple && simple ? (
        <header className="fx-simple-head" data-simple-head="">
          <div className="fx-sh1">
            <nav aria-label={th('crumbs')} className="fx-sh1-crumbs" data-crumbs="">
              {simple.crumbs.map((c, i) => {
                const here = i === simple.crumbs.length - 1
                return (
                  <Fragment key={i}>
                    {i > 0 && <span aria-hidden="true" className="fx-sh1-sep">/</span>}
                    <span className={`fx-sh1-crumb${here ? ' is-here' : ''}`} aria-current={here ? 'page' : undefined}>
                      {c.icon}
                      {c.href && !here ? <Link href={c.href}>{c.label}</Link> : <span>{c.label}</span>}
                    </span>
                  </Fragment>
                )
              })}
              {simple.favourite && (
                <button type="button" className={`fx-sh1-star${simple.favourite.on ? ' is-on' : ''}`} data-favourite="" aria-pressed={simple.favourite.on}
                  aria-label={simple.favourite.on ? th('unfavourite') : th('favourite')} title={simple.favourite.on ? th('unfavourite') : th('favourite')}
                  onClick={() => simple.favourite!.toggle()}>
                  <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill={simple.favourite.on ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinejoin="round"><path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1 6.2L12 17.3 6.5 20.2l1-6.2L3 9.6l6.2-.9z" /></svg>
                </button>
              )}
            </nav>
            <span ref={setStatusSlot} data-view-status-slot="" className="fx-view-status fx-sh1-saved" />
            <span className="fx-sh1-gap" />
            {/* Other views keep the page's own buttons (+ New post) here; the sheet has them in its toolbar. */}
            {!isSimple && actions && <div className="fx-sh1-actions">{actions}</div>}
            {settingsItems.length > 0 && <button type="button" className="fx-sh1-icon" data-page-settings="" aria-haspopup="menu" aria-expanded={!!settingsMenu}
              aria-label={th('settings')} title={th('settings')}
              onClick={e => { const r = e.currentTarget.getBoundingClientRect(); setSettingsMenu(m => (m ? null : { x: r.right - 220, y: r.bottom + 4 })) }}>
              <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M4 7h10M18 7h2M4 17h4M12 17h8" /><circle cx="16" cy="7" r="2" /><circle cx="10" cy="17" r="2" /></svg>
            </button>}
          </div>
          {sections}
          {tabsRow}
        </header>
      ) : (
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
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0, flexWrap: 'wrap' }}>
          <h1 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 10, fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 26, letterSpacing: '-0.02em', color: PIPE.ink }}>
            {color && <span aria-hidden="true" style={{ width: 22, height: 22, borderRadius: 7, background: color, display: 'grid', placeItems: 'center', color: '#FFFFFF', fontSize: 12, fontWeight: 800 }}>{mark ?? title[0]}</span>}
            {title}
            <span style={{ fontFamily: 'inherit', fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 6, background: PIPE.surface, color: PIPE.textSecondary, letterSpacing: 0 }}>{tag}</span>
          </h1>
          <span ref={setStatusSlot} data-view-status-slot="" className="fx-view-status" />
          </div>
          {actions && <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>{actions}</div>}
        </div>
        {sections}
        {sub && <div data-sub style={{ fontSize: 12.5, color: PIPE.textSecondary, paddingBottom: noViews ? 12 : 0 }}>{sub}</div>}
        {tabsRow}
      </header>
      )}
      {settingsMenu && (
        <TabMenu at={settingsMenu} label={th('settings')} onClose={() => setSettingsMenu(null)}
          items={settingsItems} />
      )}
      {tabMenu && (() => {
        const k = tabMenu.key
        const pinned = prefs.pinned.includes(k)
        const lastShown = arranged.shown.filter(x => !x.disabled).length <= 1
        const items: { key: string; label: string; disabled?: boolean; run: () => void }[] = [
          { key: 'home', label: prefs.home === k ? t('homeOff') : t('makeHome'), run: () => updatePrefs({ ...prefs, home: prefs.home === k ? null : k }) },
          { key: 'pin', label: pinned ? t('unpin') : t('pin'), run: () => updatePrefs({ ...prefs, pinned: pinned ? prefs.pinned.filter(x => x !== k) : [...prefs.pinned, k] }) },
          { key: 'hide', label: t('hide'), disabled: lastShown, run: () => updatePrefs({ ...prefs, pinned: prefs.pinned.filter(x => x !== k), hidden: [...prefs.hidden, k], home: prefs.home === k ? null : prefs.home }) },
          // Spec 027 (US1): a saved view is renamed, duplicated or deleted from its tab; Board, Sheet and Calendar can't be deleted.
          ...(() => {
            const v = views.find(x => savedKey(x) === k)
            if (!v) return []
            return [
              // After the menu has closed and given focus back, so the name box keeps it.
              { key: 'rename', label: t('rename'), disabled: !mayChange(v), run: () => { setTabMenu(null); window.setTimeout(() => setRenaming({ key: k, name: v.name }), 60) } },
              { key: 'duplicate', label: t('duplicate'), run: () => { setTabMenu(null); void duplicateSaved(v) } },
              { key: 'delete', label: t('deleteView'), disabled: !mayChange(v), run: () => { setTabMenu(null); setDeleting(v) } },
            ]
          })(),
        ]
        return <TabMenu at={tabMenu} items={items} label={t('tabOptions', { name: allTabs.find(x => x.key === k)?.label ?? '' })} onClose={() => setTabMenu(null)} />
      })()}
      {deleting && (
        <div role="alertdialog" aria-label={t('deleteConfirm', { name: deleting.name })} data-view-delete-confirm=""
          style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', padding: '10px 38px', background: '#FFF4F4', borderBottom: `1px solid ${PIPE.border}`, fontSize: 13 }}>
          <span>{t('deleteConfirm', { name: deleting.name })}</span>
          <button type="button" data-view-delete-yes="" onClick={() => void deleteSaved(deleting)} style={{ ...pill, background: '#D22040', borderColor: '#D22040', color: '#FFFFFF' }}>{t('deleteView')}</button>
          <button type="button" onClick={() => setDeleting(null)} style={pill}>{t('cancel')}</button>
        </div>
      )}
      {hiddenMenu && (
        <TabMenu at={hiddenMenu} label={t('hiddenViews', { n: arranged.hidden.length })} onClose={() => setHiddenMenu(null)}
          items={arranged.hidden.map(x => ({ key: x.key, label: t('showView', { name: x.label }), run: () => { setHiddenMenu(null); updatePrefs({ ...prefs, hidden: prefs.hidden.filter(h => h !== x.key) }); choose(x.key) } }))} />
      )}
      {adding && node && viewTypes && (
        <NewView types={viewTypes} typeLabel={typeLabel} onCancel={() => setAdding(false)}
          onCreate={async (name, type, personal) => {
            const r = await saveView({ node, type, name, config: {}, personal }).catch(() => null)
            if (!r?.success) { setSay(t('notSaved', { reason: r?.error ?? 'generic' })); return }
            setAdding(false)
            await reload(`v:${r.id}`)
          }} />
      )}
      {open && config && options && (
        <ConfigBar
          view={open} config={config} options={options} editable={mayChange(open)} dirty={!!drafts[open.id]} picker={fieldPicker}
          first={views[0]?.id === open.id} last={views[views.length - 1]?.id === open.id}
          onChange={c => setDrafts(d => ({ ...d, [open.id]: c }))}
          onSave={async () => {
            const r = await saveView({ id: open.id, node: open.node, type: open.type, name: open.name, config, personal: !!open.owner_id }).catch(() => null)
            if (!r?.success) { setSay(t('notSaved', { reason: r?.error ?? 'generic' })); return }
            setDrafts(d => { const n = { ...d }; delete n[open.id]; return n })
            setSay(t('saved'))
            await reload()
          }}
          onDelete={async () => {
            const r = await deleteView(open.id).catch(() => null)
            if (!r?.success) { setSay(t('notSaved', { reason: r?.error ?? 'generic' })); return }
            await reload(live[0]?.key)
          }}
          onMove={async dir => {
            const ids = views.map(v => v.id)
            const i = ids.indexOf(open.id), j = i + dir
            if (j < 0 || j >= ids.length) return
            ;[ids[i], ids[j]] = [ids[j], ids[i]]
            setViews(ids.map(id => views.find(v => v.id === id)!))
            await reorderViews(open.node, ids).catch(() => null)
          }}
        />
      )}
      {say && <div role="status" data-view-say style={{ padding: '6px 38px', fontSize: 12, color: PIPE.textSecondary }}>{say}</div>}
      <div role="tabpanel" data-view={open ? open.type : tab} data-saved-view={open?.id} style={{ flex: 1, minWidth: 0 }}>
        {open && config ? render(open.type, { id: open.id, type: open.type, config }, shown) : render(tab, undefined, shown)}
      </div>
    </div>
    </ViewChromeContext.Provider>
  )
}

function NewView({ types, typeLabel, onCreate, onCancel }: {
  types: ViewType[]; typeLabel: (k: string) => string
  onCreate: (name: string, type: ViewType, personal: boolean) => void; onCancel: () => void
}) {
  const t = useTranslations('views')
  const [name, setName] = useState('')
  const [type, setType] = useState<ViewType>(types[0])
  const [personal, setPersonal] = useState(true)
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => { ref.current?.focus() }, [])
  return (
    <form data-new-view onSubmit={e => { e.preventDefault(); if (name.trim()) onCreate(name.trim(), type, personal) }}
      onKeyDown={e => { if (e.key === 'Escape') onCancel() }}
      style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-end', gap: 14, padding: '12px 38px', borderBottom: `1px solid ${PIPE.border}`, background: PIPE.surface }}>
      <label style={{ display: 'grid', gap: 4, fontSize: 11.5, fontWeight: 700, color: PIPE.textMuted }}>
        {t('name')}
        <input ref={ref} data-new-view-name value={name} maxLength={40} onChange={e => setName(e.target.value)} aria-describedby="fx-nv-help"
          style={{ ...pill, cursor: 'text', minWidth: 200, fontWeight: 500 }} />
        <span id="fx-nv-help" style={{ fontWeight: 500 }}>{t('nameHelp')}</span>
      </label>
      <fieldset style={{ border: 'none', margin: 0, padding: 0, display: 'grid', gap: 4 }}>
        <legend style={{ fontSize: 11.5, fontWeight: 700, color: PIPE.textMuted, padding: 0, marginBottom: 4 }}>{t('type')}</legend>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {types.map(k => (
            <button key={k} type="button" data-new-view-type={k} aria-pressed={type === k} onClick={() => setType(k)}
              style={{ ...pill, background: type === k ? PIPE.ink : '#FFFFFF', color: type === k ? '#FFFFFF' : PIPE.ink }}>{typeLabel(k)}</button>
          ))}
          {(['gantt', 'doc'] as const).map(k => (
            <button key={k} type="button" disabled style={{ ...pill, cursor: 'default', color: PIPE.textFaintest }}>{t(k)} <span style={{ fontWeight: 500 }}>· {t('later')}</span></button>
          ))}
        </div>
      </fieldset>
      <fieldset style={{ border: 'none', margin: 0, padding: 0 }}>
        <legend style={{ fontSize: 11.5, fontWeight: 700, color: PIPE.textMuted, padding: 0, marginBottom: 4 }}>{t('who')}</legend>
        <div style={{ display: 'flex', gap: 6 }}>
          {([true, false] as const).map(p => (
            <button key={String(p)} type="button" data-new-view-personal={String(p)} aria-pressed={personal === p} onClick={() => setPersonal(p)}
              style={{ ...pill, background: personal === p ? PIPE.ink : '#FFFFFF', color: personal === p ? '#FFFFFF' : PIPE.ink }}>{p ? t('personal') : t('shared')}</button>
          ))}
        </div>
      </fieldset>
      <div style={{ display: 'flex', gap: 6 }}>
        <button type="submit" data-new-view-create disabled={!name.trim()} style={{ ...pill, background: '#C8F24E', borderColor: '#C8F24E', fontWeight: 800 }}>{t('create')}</button>
        <button type="button" onClick={onCancel} style={pill}>{t('cancel')}</button>
      </div>
    </form>
  )
}

function ConfigBar({ view, config, options, editable, dirty, first, last, onChange, onSave, onDelete, onMove, picker }: {
  view: SavedView; config: ViewConfig; options: ViewOptions; editable: boolean; dirty: boolean; first: boolean; last: boolean; picker?: FieldPicker
  onChange: (c: ViewConfig) => void; onSave: () => void; onDelete: () => void; onMove: (dir: -1 | 1) => void
}) {
  const t = useTranslations('views')
  const tg = useTranslations('statusGroups')
  const none = useMemo(() => ({ assignee: t('noOne'), campaign: t('noCampaign'), tag: t('noTag') }) as Partial<Record<ViewFilterKey, string>>, [t])
  const setFilter = (k: ViewFilterKey, ids: string[]) => onChange({ ...config, filters: { ...config.filters, [k]: ids } })
  const sel: React.CSSProperties = { ...pill, paddingInlineEnd: 4 }
  // An open filter menu closes on a click anywhere outside it.
  const barRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const close = (e: MouseEvent) => {
      for (const d of barRef.current?.querySelectorAll('details[open]') ?? []) if (!d.contains(e.target as Node)) d.removeAttribute('open')
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [])
  return (
    <div data-view-config role="toolbar" aria-label={t('filters')} ref={barRef}
      style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, padding: '10px 38px', borderBottom: `1px solid ${PIPE.border}` }}>
      {VIEW_FILTERS.map(k => {
        // Spec 023: status groups (Not started, Active, Done, Closed) are the same on every page.
        const list = k === 'statusGroup' ? STATUS_GROUPS.map(g => ({ id: g, name: tg(g) })) : [...(options[k] ?? []), ...(none[k] ? [{ id: '__none', name: none[k]! }] : [])]
        if (!list.length) return null
        const on = config.filters[k] ?? []
        return (
          <details key={k} data-view-filter={k} style={{ position: 'relative' }}>
            <summary style={{ ...pill, listStyle: 'none', background: on.length ? PIPE.surface : '#FFFFFF' }}>
              {t(`filter.${k}`)}: {on.length ? on.map(id => list.find(x => x.id === id)?.name ?? '?').join(', ') : t('any')}
            </summary>
            <div style={{ position: 'absolute', zIndex: 30, top: 'calc(100% + 4px)', insetInlineStart: 0, minWidth: 200, maxHeight: 260, overflowY: 'auto', background: '#FFFFFF', border: `1px solid ${PIPE.border}`, borderRadius: 10, padding: 6, boxShadow: '0 8px 24px rgba(0,0,0,.08)' }}>
              {list.map(o => (
                <label key={o.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 6px', fontSize: 12.5, cursor: 'pointer' }}>
                  <input type="checkbox" data-view-option={o.id} checked={on.includes(o.id)}
                    onChange={e => setFilter(k, e.target.checked ? [...on, o.id] : on.filter(x => x !== o.id))} />
                  {o.name}
                </label>
              ))}
            </div>
          </details>
        )
      })}
      {picker && <FieldFilters config={config} picker={picker} onChange={onChange} />}
      {(view.type === 'list' || view.type === 'sheet') && (
        <label style={{ fontSize: 12, color: PIPE.textMuted, display: 'inline-flex', gap: 6, alignItems: 'center' }}>{t('group')}
          <select data-view-group value={config.group ?? ''} style={sel} onChange={e => onChange({ ...config, group: (e.target.value || null) as ViewConfig['group'] })}>
            <option value="">{t('groupDefault')}</option>
            {view.type === 'list' && <><option value="stage">{t('groupStage')}</option><option value="brand">{t('groupBrand')}</option><option value="statusGroup">{t('groupStatusGroup')}</option></>}
            {picker?.fields.filter(f => picker.groupable(f.key) && (f.on || config.group === f.key)).map(f => <option key={f.key} value={f.key}>{f.label}</option>)}
          </select>
        </label>
      )}
      {(view.type === 'list' || view.type === 'sheet') && (
        <label style={{ fontSize: 12, color: PIPE.textMuted, display: 'inline-flex', gap: 6, alignItems: 'center' }}>{t('sort')}
          <select data-view-sort value={config.sort ?? ''} style={sel} onChange={e => onChange({ ...config, sort: (e.target.value || null) as ViewConfig['sort'] })}>
            <option value="">{t('sortDefault')}</option>
            {VIEW_SORTS.map(s => <option key={s} value={s}>{t(`sortBy.${s}`)}</option>)}
            {picker?.fields.filter(f => f.key !== 'priority' && (f.on || config.sort === f.key)).map(f => <option key={f.key} value={f.key}>{f.label}</option>)}
          </select>
        </label>
      )}
      <span style={{ flex: 1 }} />
      {filterCount(config) > 0 && <span style={{ fontSize: 11.5, color: PIPE.textMuted }}>{t('filters')} · {filterCount(config)}</span>}
      {editable ? (
        // Above any open filter menu, so a menu from the row above never covers Save.
        <span style={{ display: 'inline-flex', gap: 8, alignItems: 'center', position: 'relative', zIndex: 31 }}>
          <button type="button" style={pill} aria-label={t('moveLeft')} disabled={first} onClick={() => onMove(-1)}>‹</button>
          <button type="button" style={pill} aria-label={t('moveRight')} disabled={last} onClick={() => onMove(1)}>›</button>
          <button type="button" data-view-delete style={pill} onClick={onDelete}>{t('deleteView')}</button>
          <button type="button" data-view-save disabled={!dirty} onClick={onSave}
            style={{ ...pill, background: dirty ? '#C8F24E' : '#FFFFFF', borderColor: dirty ? '#C8F24E' : PIPE.border, fontWeight: 800 }}>{t('save')}</button>
        </span>
      ) : <span data-view-readonly style={{ fontSize: 11.5, color: PIPE.textMuted }}>{t('readOnlyView')}</span>}
    </div>
  )
}

function TabMenu({ at, items, label, onClose }: {
  at: { x: number; y: number }; label: string; onClose: () => void
  items: { key: string; label: string; disabled?: boolean; run: () => void }[]
}) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    ref.current?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus()
    const away = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) onClose() }
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('mousedown', away)
    document.addEventListener('keydown', key)
    return () => { document.removeEventListener('mousedown', away); document.removeEventListener('keydown', key) }
  }, [onClose])
  return (
    <div ref={ref} role="menu" aria-label={label} data-tab-options
      style={{ position: 'fixed', top: at.y, left: Math.min(at.x, (typeof window !== 'undefined' ? window.innerWidth : 1200) - 220), zIndex: 400, minWidth: 200,
        background: '#FFFFFF', border: `1px solid ${PIPE.border}`, borderRadius: 10, boxShadow: '0 12px 34px rgba(20,20,20,.16)', padding: 5 }}>
      {items.map(i => (
        <button key={i.key} type="button" role="menuitem" data-tab-option={i.key} disabled={i.disabled} onClick={i.run}
          style={{ display: 'block', width: '100%', textAlign: 'start', border: 'none', background: 'none', borderRadius: 7, padding: '7px 10px',
            fontFamily: 'inherit', fontSize: 13, cursor: i.disabled ? 'default' : 'pointer', color: i.disabled ? PIPE.textFaintest : PIPE.ink }}>
          {i.label}
        </button>
      ))}
    </div>
  )
}

/** Sheet look (25 Nov 2026): each view tab carries its type's icon. */
function ViewIcon({ type }: { type?: string }) {
  const path = type === 'board' ? <><rect x="3" y="4" width="7" height="16" rx="1.5" /><rect x="14" y="4" width="7" height="10" rx="1.5" /></>
    : type === 'sheet' ? <><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M3 10h18M3 15h18M9 4v16" /></>
    : type === 'calendar' ? <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M8 3v4M16 3v4" /></>
    : type === 'list' ? <path d="M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01" />
    : null
  if (!path) return null
  return <svg className="fx-view-tab-ic" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{path}</svg>
}

/**
 * Fields (§5): filters on fields. "+ Field" offers the fields on in this Space; each filter picks values
 * (choices, people, Yes) or "Has a value" / "Empty". A field turned off in the Space keeps filtering on the
 * stored values, with a note saying so.
 */
function FieldFilters({ config, picker, onChange }: { config: ViewConfig; picker: FieldPicker; onChange: (c: ViewConfig) => void }) {
  const t = useTranslations('views')
  const ff = config.fieldFilters ?? {}
  const used = Object.keys(ff).filter(isFieldViewKey)
  const set = (key: string, vals: string[] | null) => {
    const next = { ...ff }
    if (vals === null) delete next[key]; else next[key] = vals
    onChange({ ...config, fieldFilters: next })
  }
  const off: { key: string; label: string }[] = fieldsUsed(config).map(k => picker.fields.find(f => f.key === k)).filter((f): f is FieldPicker['fields'][number] => !!f && !f.on)
  // The Theme filter (Campaign) keeps working when the Space turns Theme off, with the same note.
  if (config.filters.campaign?.length && picker.themeOn === false) off.push({ key: 'theme', label: t('builtInField.theme') })
  const offerable = picker.fields.filter(f => f.on && !used.includes(f.key))
  return (
    <>
      {used.map(key => {
        const f = picker.fields.find(x => x.key === key)
        const on = ff[key] ?? []
        const list = [...picker.choices(key as FieldViewKey), { id: HAS_VALUE, name: t('hasValue') }, { id: '__none', name: t('noValue') }]
        return (
          <details key={key} data-view-field-filter={key} style={{ position: 'relative' }}>
            <summary style={{ ...pill, listStyle: 'none', background: on.length ? PIPE.surface : '#FFFFFF' }}>
              <span aria-hidden="true" style={{ marginInlineEnd: 4, fontWeight: 800 }}>{f?.glyph}</span>
              {f?.label ?? key}: {on.length ? on.map(id => list.find(x => x.id === id)?.name ?? id).join(', ') : t('any')}
            </summary>
            <div style={{ position: 'absolute', zIndex: 30, top: 'calc(100% + 4px)', insetInlineStart: 0, minWidth: 200, maxHeight: 260, overflowY: 'auto', background: '#FFFFFF', border: `1px solid ${PIPE.border}`, borderRadius: 10, padding: 6, boxShadow: '0 8px 24px rgba(0,0,0,.08)' }}>
              {list.map(o => (
                <label key={o.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 6px', fontSize: 12.5, cursor: 'pointer' }}>
                  <input type="checkbox" data-view-field-option={o.id} checked={on.includes(o.id)}
                    onChange={e => set(key, e.target.checked ? [...on, o.id] : on.filter(x => x !== o.id))} />
                  {o.name}
                </label>
              ))}
              <button type="button" data-view-field-remove={key} onClick={() => set(key, null)}
                style={{ ...pill, marginTop: 4, width: '100%', justifyContent: 'center' }}>{t('removeFilter')}</button>
            </div>
          </details>
        )
      })}
      {offerable.length > 0 && (
        <select data-view-add-field-filter value="" aria-label={t('addFieldFilter')} style={{ ...pill, paddingInlineEnd: 4 }}
          onChange={e => { const k = e.target.value; if (k) set(k, []) }}>
          <option value="">{t('addFieldFilter')}</option>
          {offerable.map(f => <option key={f.key} value={f.key}>{f.glyph} {f.label}</option>)}
        </select>
      )}
      {off.map(f => (
        <span key={f.key} role="note" data-view-field-off={f.key} style={{ fontSize: 12, color: '#8A5A00', background: '#FFF4DB', borderRadius: 8, padding: '4px 8px' }}>
          {t('fieldOffNote', { field: f.label })}
        </span>
      ))}
    </>
  )
}
