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
import { cleanConfig, filterCount, VIEW_FIELDS, VIEW_FILTERS, VIEW_SORTS, type ViewConfig, type ViewFilterKey } from '@/lib/view-config'
import { deleteView, listViews, reorderViews, saveView } from '@/actions/views'

export interface ViewTab { key: string; label: string; disabled?: boolean; note?: string }
export interface OpenView { id: string; type: ViewType; config: ViewConfig }
export interface ViewOptions {
  brand: { id: string; name: string }[]
  assignee: { id: string; name: string }[]
  type: { id: string; name: string }[]
  campaign: { id: string; name: string }[]
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
  /** A saved view renders as its type, with its config. */
  render: (tab: string, view?: OpenView) => React.ReactNode
  /** Saved views: the node they belong to ('space:<id>', 'brand:<id>', 'me'). */
  node?: string
  /** The types "+ View" offers (the page's own view tabs). */
  viewTypes?: ViewType[]
  /** What the config bar's filters list. */
  options?: ViewOptions
  /** The reader is an admin or superuser (may change any shared view). */
  lead?: boolean
}

const pill: React.CSSProperties = { border: `1px solid ${PIPE.border}`, background: '#FFFFFF', borderRadius: 8, padding: '5px 9px', fontFamily: 'inherit', fontSize: 12, fontWeight: 600, color: PIPE.ink, cursor: 'pointer' }

export function ViewHost({ crumbs, title, tag, color, mark, sub, actions, tabs, render, node, viewTypes, options, lead = false }: ViewHostProps) {
  const t = useTranslations('views')
  const params = useSearchParams()
  const [views, setViews] = useState<SavedView[]>([])
  const [drafts, setDrafts] = useState<Record<string, ViewConfig>>({})
  const [adding, setAdding] = useState(false)
  const [say, setSay] = useState('')
  const live = tabs.filter(x => !x.disabled)
  const savedKey = (v: SavedView) => `v:${v.id}`
  const pick = (v: string | null, list = views) =>
    live.some(x => x.key === v) || list.some(x => savedKey(x) === v) ? (v as string) : live[0]?.key ?? ''
  const [tab, setTab] = useState(() => pick(params.get('view')))
  useEffect(() => { setTab(pick(params.get('view'))) }, [params]) // eslint-disable-line react-hooks/exhaustive-deps

  async function reload(select?: string) {
    if (!node) return
    const r = await listViews(node).catch(() => null)
    if (!r?.success) return
    setViews(r.views)
    if (select) choose(select)
    else setTab(cur => (cur.startsWith('v:') && !r.views.some(v => savedKey(v) === cur) ? pick(params.get('view'), r.views) : pick(cur, r.views)))
  }
  useEffect(() => { void reload() }, [node]) // eslint-disable-line react-hooks/exhaustive-deps
  // A `?view=v:<id>` link opens once the views have loaded.
  useEffect(() => { const want = params.get('view'); if (want?.startsWith('v:') && views.some(v => savedKey(v) === want)) setTab(want) }, [views]) // eslint-disable-line react-hooks/exhaustive-deps

  function choose(next: string) {
    setTab(next)
    setSay('')
    const url = new URL(window.location.href)
    if (next === live[0]?.key) url.searchParams.delete('view'); else url.searchParams.set('view', next)
    window.history.replaceState(null, '', url)
  }

  const open = views.find(v => savedKey(v) === tab) ?? null
  const config = open ? drafts[open.id] ?? cleanConfig(open.config) : null
  const mayChange = (v: SavedView) => (v.owner_id ? true : !!v.mine || lead)
  const typeLabel = (k: string) => tabs.find(x => x.key === k)?.label ?? t(k as 'list')

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
        <div style={{ display: 'flex', alignItems: 'center', gap: 2, minWidth: 0 }}>
          <div role="tablist" aria-label={t('tabs')} style={{ display: 'flex', gap: 2, overflowX: 'auto', scrollbarWidth: 'none', minWidth: 0 }}>
            {[...tabs, ...views.map(v => ({ key: savedKey(v), label: v.name, personal: !!v.owner_id }))].map(x => (
              <button
                key={x.key}
                type="button"
                role="tab"
                data-view-tab={x.key}
                aria-selected={tab === x.key}
                disabled={'disabled' in x ? x.disabled : false}
                title={'note' in x ? x.note : undefined}
                onClick={() => choose(x.key)}
                style={{
                  border: 'none', background: 'none', cursor: 'disabled' in x && x.disabled ? 'default' : 'pointer', fontFamily: 'inherit',
                  padding: '9px 12px 11px', fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap',
                  color: tab === x.key ? PIPE.ink : 'disabled' in x && x.disabled ? PIPE.textFaintest : PIPE.textMuted,
                  borderBottom: `2px solid ${tab === x.key ? PIPE.ink : 'transparent'}`,
                }}
              >
                {x.label}
                {'note' in x && x.note && <span style={{ marginInlineStart: 6, fontSize: 10.5, fontWeight: 500 }}>{x.note}</span>}
                {'personal' in x && x.personal && <span style={{ marginInlineStart: 6, fontSize: 10.5, fontWeight: 500 }}>· {t('onlyMeMark')}</span>}
              </button>
            ))}
          </div>
          {node && viewTypes?.length ? (
            <button type="button" data-add-view aria-expanded={adding} onClick={() => setAdding(v => !v)}
              style={{ border: 'none', background: 'none', cursor: 'pointer', fontFamily: 'inherit', padding: '9px 10px 11px', fontSize: 13, fontWeight: 700, color: PIPE.textMuted, whiteSpace: 'nowrap' }}>
              {t('addView')}
            </button>
          ) : null}
        </div>
      </header>
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
        {open && config ? render(open.type, { id: open.id, type: open.type, config }) : render(tab)}
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
  const none = useMemo(() => ({ assignee: t('noOne'), campaign: t('noCampaign') }) as Partial<Record<ViewFilterKey, string>>, [t])
  const setFilter = (k: ViewFilterKey, ids: string[]) => onChange({ ...config, filters: { ...config.filters, [k]: ids } })
  const sel: React.CSSProperties = { ...pill, paddingInlineEnd: 4 }
  return (
    <div data-view-config role="toolbar" aria-label={t('filters')}
      style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, padding: '10px 38px', borderBottom: `1px solid ${PIPE.border}` }}>
      {VIEW_FILTERS.map(k => {
        const list = [...options[k], ...(none[k] ? [{ id: '__none', name: none[k]! }] : [])]
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
            <option value="">{t('groupDefault')}</option><option value="stage">{t('groupStage')}</option><option value="brand">{t('groupBrand')}</option>
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
      {view.type === 'sheet' && (
        <details data-view-fields style={{ position: 'relative' }}>
          <summary style={{ ...pill, listStyle: 'none' }}>{t('fields')}</summary>
          <div style={{ position: 'absolute', zIndex: 30, top: 'calc(100% + 4px)', insetInlineStart: 0, minWidth: 180, background: '#FFFFFF', border: `1px solid ${PIPE.border}`, borderRadius: 10, padding: 6, boxShadow: '0 8px 24px rgba(0,0,0,.08)' }}>
            {VIEW_FIELDS.map(f => {
              const shown = config.fields ?? [...VIEW_FIELDS]
              return (
                <label key={f} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 6px', fontSize: 12.5, cursor: 'pointer' }}>
                  <input type="checkbox" data-view-field={f} checked={shown.includes(f)}
                    onChange={e => onChange({ ...config, fields: e.target.checked ? [...shown, f] : shown.filter(x => x !== f) })} />
                  <FieldName f={f} />
                </label>
              )
            })}
          </div>
        </details>
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

function FieldName({ f }: { f: string }) {
  const t = useTranslations('taskSheet')
  return <>{t(`col.${f as 'brand'}`)}</>
}
