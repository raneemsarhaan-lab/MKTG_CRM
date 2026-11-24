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
import { useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { PIPE } from '@/lib/pipeline-tokens'
import type { SavedView, ViewType } from '@/types/index'
import { arrangeTabs, cleanConfig, EMPTY_TAB_PREFS, filterCount, shownFields, VIEW_FILTERS, VIEW_SORTS, type TabPrefs, type ViewConfig, type ViewFilterKey } from '@/lib/view-config'
import { deleteView, listViews, reorderViews, saveView, setTabPrefs } from '@/actions/views'
import { FieldsMenu, type FieldsSetup } from '@/components/fields/FieldsMenu'
import { STATUS_GROUPS } from '@/lib/status-groups'

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
}

const pill: React.CSSProperties = { border: `1px solid ${PIPE.border}`, background: '#FFFFFF', borderRadius: 8, padding: '5px 9px', fontFamily: 'inherit', fontSize: 12, fontWeight: 600, color: PIPE.ink, cursor: 'pointer' }

export function ViewHost({ crumbs, title, tag, color, mark, sub, actions, tabs, render, node, viewTypes, options, lead = false, fields: fieldSetup, defaultTab, initialPrefs }: ViewHostProps) {
  const t = useTranslations('views')
  const params = useSearchParams()
  const [views, setViews] = useState<SavedView[]>([])
  const [drafts, setDrafts] = useState<Record<string, ViewConfig>>({})
  const [adding, setAdding] = useState(false)
  const [say, setSay] = useState('')
  // Home, pinned and hidden tabs (user, 2026-11-22), this member's own per page.
  const [prefs, setPrefs] = useState<TabPrefs>(initialPrefs ?? EMPTY_TAB_PREFS)
  // The latest choices, for a save that follows another in the same click (hide a tab, then leave it).
  const prefsRef = useRef(prefs)
  prefsRef.current = prefs
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
    const r = await listViews(node).catch(() => null)
    if (!r?.success) return
    setViews(r.views)
    setPrefs(r.prefs)
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

  const open = views.find(v => savedKey(v) === tab) ?? null
  const allTabs: (ViewTab & { personal?: boolean })[] = [...tabs, ...views.map(v => ({ key: savedKey(v), label: v.name, personal: !!v.owner_id }))]
  const arranged = node ? arrangeTabs(allTabs, prefs) : { shown: allTabs, hidden: [] as typeof allTabs }
  function updatePrefs(next: TabPrefs) {
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
  const hasFields = !!fieldSetup && ['board', 'list', 'sheet'].includes(viewType)
  const shown = hasFields && fieldSetup
    ? shownFields(open ? config?.fields : prefs.fields?.[tab], viewType, fieldSetup.custom, new Set(fieldSetup.typesOnPage), fieldSetup.links)
    : undefined
  function setShown(keys: string[]) {
    if (open && config) { setDrafts(d => ({ ...d, [open.id]: { ...config, fields: keys } })); return }
    const next = { ...prefs, fields: { ...(prefs.fields ?? {}), [tab]: keys } }
    setPrefs(next)
    if (node) void setTabPrefs(node, next).catch(() => null)
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
            <span style={{ fontFamily: 'inherit', fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 6, background: PIPE.surface, color: PIPE.textSecondary, letterSpacing: 0 }}>{tag}</span>
          </h1>
          {actions && <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>{actions}</div>}
        </div>
        {sub && <div data-sub style={{ fontSize: 12.5, color: PIPE.textSecondary }}>{sub}</div>}
        <div style={{ display: 'flex', alignItems: 'center', gap: 2, minWidth: 0 }}>
          {/* A toolbar of view buttons (each with its ⋯ menu), so the menus sit beside them legitimately. */}
          <div role="toolbar" aria-label={t('tabs')} style={{ display: 'flex', gap: 2, overflowX: 'auto', scrollbarWidth: 'none', minWidth: 0 }}>
            {arranged.shown.map(x => (
              <span key={x.key} style={{ display: 'inline-flex', alignItems: 'center' }} className="fx-view-tab">
              <button
                type="button"
                data-view-tab={x.key}
                aria-pressed={tab === x.key}
                disabled={x.disabled}
                title={x.note}
                onClick={() => choose(x.key)}
                onContextMenu={node ? e => { e.preventDefault(); setTabMenu({ key: x.key, x: e.clientX, y: e.clientY }) } : undefined}
                style={{
                  border: 'none', background: 'none', cursor: x.disabled ? 'default' : 'pointer', fontFamily: 'inherit',
                  padding: '9px 6px 11px 12px', fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap',
                  color: tab === x.key ? PIPE.ink : x.disabled ? PIPE.textFaintest : PIPE.textMuted,
                  borderBottom: `2px solid ${tab === x.key ? PIPE.ink : 'transparent'}`,
                }}
              >
                {prefs.pinned.includes(x.key) && <svg role="img" aria-label={t('pinnedMark')} viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ marginInlineEnd: 4, verticalAlign: '-1px' }}><path d="M12 17v5" /><path d="M9 3h6l-1 6 3 3v2H7v-2l3-3z" /></svg>}
                {x.label}
                {prefs.home === x.key && <span style={{ marginInlineStart: 6, fontSize: 10.5, fontWeight: 600, color: PIPE.textMuted }}>· {t('homeMark')}</span>}
                {x.note && <span style={{ marginInlineStart: 6, fontSize: 10.5, fontWeight: 500 }}>{x.note}</span>}
                {x.personal && <span style={{ marginInlineStart: 6, fontSize: 10.5, fontWeight: 500 }}>· {t('onlyMeMark')}</span>}
              </button>
              {node && !x.disabled && (
                <button type="button" data-tab-menu={x.key} aria-label={t('tabOptions', { name: x.label })} aria-haspopup="menu"
                  onClick={e => setTabMenu({ key: x.key, ...menuAt(e) })}
                  style={{ border: 'none', background: 'none', cursor: 'pointer', color: PIPE.textFaint, padding: '9px 6px 11px 0', fontSize: 13, borderBottom: `2px solid ${tab === x.key ? PIPE.ink : 'transparent'}` }}>⋯</button>
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
          {node && viewTypes?.length ? (
            <button type="button" data-add-view aria-expanded={adding} onClick={() => setAdding(v => !v)}
              style={{ border: 'none', background: 'none', cursor: 'pointer', fontFamily: 'inherit', padding: '9px 10px 11px', fontSize: 13, fontWeight: 700, color: PIPE.textMuted, whiteSpace: 'nowrap' }}>
              {t('addView')}
            </button>
          ) : null}
          {hasFields && fieldSetup && shown && (
            <div style={{ marginInlineStart: 'auto', paddingBottom: 6, paddingInlineStart: 8 }}>
              <FieldsMenu shown={shown} setup={fieldSetup} onChange={setShown} />
            </div>
          )}
        </div>
      </header>
      {tabMenu && (() => {
        const k = tabMenu.key
        const pinned = prefs.pinned.includes(k)
        const lastShown = arranged.shown.filter(x => !x.disabled).length <= 1
        const items: { key: string; label: string; disabled?: boolean; run: () => void }[] = [
          { key: 'home', label: prefs.home === k ? t('homeOff') : t('makeHome'), run: () => updatePrefs({ ...prefs, home: prefs.home === k ? null : k }) },
          { key: 'pin', label: pinned ? t('unpin') : t('pin'), run: () => updatePrefs({ ...prefs, pinned: pinned ? prefs.pinned.filter(x => x !== k) : [...prefs.pinned, k] }) },
          { key: 'hide', label: t('hide'), disabled: lastShown, run: () => updatePrefs({ ...prefs, pinned: prefs.pinned.filter(x => x !== k), hidden: [...prefs.hidden, k], home: prefs.home === k ? null : prefs.home }) },
        ]
        return <TabMenu at={tabMenu} items={items} label={t('tabOptions', { name: allTabs.find(x => x.key === k)?.label ?? '' })} onClose={() => setTabMenu(null)} />
      })()}
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
          view={open} config={config} options={options} editable={mayChange(open)} dirty={!!drafts[open.id]}
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

function ConfigBar({ view, config, options, editable, dirty, first, last, onChange, onSave, onDelete, onMove }: {
  view: SavedView; config: ViewConfig; options: ViewOptions; editable: boolean; dirty: boolean; first: boolean; last: boolean
  onChange: (c: ViewConfig) => void; onSave: () => void; onDelete: () => void; onMove: (dir: -1 | 1) => void
}) {
  const t = useTranslations('views')
  const tg = useTranslations('statusGroups')
  const none = useMemo(() => ({ assignee: t('noOne'), campaign: t('noCampaign'), tag: t('noTag') }) as Partial<Record<ViewFilterKey, string>>, [t])
  const setFilter = (k: ViewFilterKey, ids: string[]) => onChange({ ...config, filters: { ...config.filters, [k]: ids } })
  const sel: React.CSSProperties = { ...pill, paddingInlineEnd: 4 }
  return (
    <div data-view-config role="toolbar" aria-label={t('filters')}
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
      {(view.type === 'list') && (
        <label style={{ fontSize: 12, color: PIPE.textMuted, display: 'inline-flex', gap: 6, alignItems: 'center' }}>{t('group')}
          <select data-view-group value={config.group ?? ''} style={sel} onChange={e => onChange({ ...config, group: (e.target.value || null) as ViewConfig['group'] })}>
            <option value="">{t('groupDefault')}</option><option value="stage">{t('groupStage')}</option><option value="brand">{t('groupBrand')}</option><option value="statusGroup">{t('groupStatusGroup')}</option>
          </select>
        </label>
      )}
      {(view.type === 'list' || view.type === 'sheet') && (
        <label style={{ fontSize: 12, color: PIPE.textMuted, display: 'inline-flex', gap: 6, alignItems: 'center' }}>{t('sort')}
          <select data-view-sort value={config.sort ?? ''} style={sel} onChange={e => onChange({ ...config, sort: (e.target.value || null) as ViewConfig['sort'] })}>
            <option value="">{t('sortDefault')}</option>
            {VIEW_SORTS.map(s => <option key={s} value={s}>{t(`sortBy.${s}`)}</option>)}
          </select>
        </label>
      )}
      <span style={{ flex: 1 }} />
      {filterCount(config) > 0 && <span style={{ fontSize: 11.5, color: PIPE.textMuted }}>{t('filters')} · {filterCount(config)}</span>}
      {editable ? (
        <>
          <button type="button" style={pill} aria-label={t('moveLeft')} disabled={first} onClick={() => onMove(-1)}>‹</button>
          <button type="button" style={pill} aria-label={t('moveRight')} disabled={last} onClick={() => onMove(1)}>›</button>
          <button type="button" data-view-delete style={pill} onClick={onDelete}>{t('deleteView')}</button>
          <button type="button" data-view-save disabled={!dirty} onClick={onSave}
            style={{ ...pill, background: dirty ? '#C8F24E' : '#FFFFFF', borderColor: dirty ? '#C8F24E' : PIPE.border, fontWeight: 800 }}>{t('save')}</button>
        </>
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
