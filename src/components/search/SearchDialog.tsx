'use client'

/**
 * Workspace search (user, 2026-11-23): one box for tasks, my to-dos and assets.
 * Opened from the sidebar's Search, or ⌘K / Ctrl+K anywhere. Results update
 * about 200 ms after typing stops: the top 5 per group, "See all" for the
 * rest, the field that matched under each result with the matched words in
 * bold, and "Did you mean …" when the search has a spelling mistake.
 */
import { Fragment, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { useLocale, useTranslations } from 'next-intl'
import { searchWorkspace, type AssetResult, type SearchResult, type TaskResult, type TodoResult } from '@/actions/search'
import { normalize } from '@/lib/search'
import { STAGE_META } from '@/lib/stage-meta'
import { formatDay } from '@/lib/due-dates'
import { PIPE } from '@/lib/pipeline-tokens'

export const OPEN_SEARCH = 'fx-open-search'
export const openSearch = () => window.dispatchEvent(new Event(OPEN_SEARCH))

/** The page the search is made from: its Space or brand ranks first. */
function contextOf(path: string): { spaceKey?: string; brandId?: string } {
  const s = path.match(/^\/spaces\/([^/?#]+)/)
  if (s) return { spaceKey: decodeURIComponent(s[1]) }
  const b = path.match(/^\/brands\/([0-9a-f-]{36})/i)
  return b ? { brandId: b[1] } : {}
}

/** The text with the words that matched in bold. */
function Bold({ text, words }: { text: string; words: string[] }) {
  if (!words.length) return <>{text}</>
  const set = new Set(words)
  return <>{text.split(/([\p{L}\p{N}ً-ٰٟـ]+)/u).map((part, i) => {
    const n = normalize(part)
    return n && set.has(n) ? <b key={i} style={{ fontWeight: 800, color: PIPE.ink }}>{part}</b> : <Fragment key={i}>{part}</Fragment>
  })}</>
}

export function SearchDialog() {
  const t = useTranslations('search')
  const locale = useLocale()
  const router = useRouter()
  const path = usePathname() ?? '/'
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')
  const [res, setRes] = useState<SearchResult | null>(null)
  const [busy, setBusy] = useState(false)
  const [all, setAll] = useState<'tasks' | 'assets' | 'todos' | null>(null)
  const [cursor, setCursor] = useState(0)
  const input = useRef<HTMLInputElement>(null)
  const seq = useRef(0)

  useEffect(() => {
    const show = () => { setOpen(true); requestAnimationFrame(() => input.current?.select()) }
    const key = (e: KeyboardEvent) => { if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); show() } }
    window.addEventListener(OPEN_SEARCH, show)
    window.addEventListener('keydown', key)
    return () => { window.removeEventListener(OPEN_SEARCH, show); window.removeEventListener('keydown', key) }
  }, [])

  const run = useCallback((q: string, more: 'tasks' | 'assets' | 'todos' | null) => {
    const id = ++seq.current
    if (!q.trim()) { setRes(null); setBusy(false); return }
    setBusy(true)
    void searchWorkspace(q, { ...contextOf(path), limit: more ? 200 : 5 }).then(r => {
      if (id !== seq.current) return
      setBusy(false)
      if (r.success) { setRes(r); setCursor(0) }
    }).catch(() => { if (id === seq.current) setBusy(false) })
  }, [path])

  // About 200 ms after typing stops.
  useEffect(() => {
    if (!open) return
    const h = setTimeout(() => run(text, all), 200)
    return () => clearTimeout(h)
  }, [text, all, open, run])

  const close = () => { setOpen(false); setAll(null) }
  const openTask = (id: string, space?: TaskResult['space']) => {
    close()
    // Pages with a task panel open it in place; elsewhere, the task's Space.
    const here = /^\/(spaces|brands|me|board)(\/|$)/.test(path)
    router.push(here ? `${path}?${new URLSearchParams({ ...Object.fromEntries(new URLSearchParams(window.location.search)), task: id })}` : `/spaces/${space?.key ?? 'content'}?view=list&task=${id}`)
  }
  const openAsset = (a: AssetResult) => {
    if (a.where === 'task' && a.taskId) { openTask(a.taskId); return }
    if (a.url) window.open(a.url, '_blank', 'noopener,noreferrer')
    else if (a.brand) { close(); router.push(`/brands/${a.brand.id}/assets`) }
  }

  // Keyboard: ↑ ↓ through the results, Enter opens.
  const flat = useMemo(() => {
    if (!res) return [] as (() => void)[]
    const list = res.tasks.length ? res.tasks : res.nearest
    return [...list.map(x => () => openTask(x.id, x.space)), ...res.todos.map(() => () => { close(); router.push('/my-tasks') }), ...res.assets.map(a => () => openAsset(a))]
  }, [res]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!open) return null

  const stage = (s: string) => { const m = STAGE_META[s as keyof typeof STAGE_META]; return m ? (locale.startsWith('ar') ? m.label_ar : m.label_en) : s }
  const where = (h: TaskResult['hit']) => h.field === 'name' ? null : h.field === 'field' ? t('in', { field: h.fieldLabel ?? '' }) : t(`in_${h.field}`)
  let idx = -1

  const taskRow = (x: TaskResult): ReactNode => {
    const i = ++idx
    const w = where(x.hit)
    return (
      <button key={x.id} type="button" role="option" aria-selected={cursor === i} data-search-task={x.id} data-level={x.hit.level}
        onMouseEnter={() => setCursor(i)} onClick={() => openTask(x.id, x.space)}
        style={{ display: 'grid', gridTemplateColumns: '10px minmax(0,1fr) auto', gap: 12, alignItems: 'start', width: '100%', textAlign: 'start', border: 'none',
          background: cursor === i ? '#F4FBD6' : 'transparent', borderRadius: 10, padding: '9px 10px', cursor: 'pointer', font: 'inherit', color: PIPE.textSecondary }}>
        <span aria-hidden="true" style={{ width: 9, height: 9, borderRadius: '50%', marginTop: 6, background: x.brand?.color ?? PIPE.textFaint }} />
        <span style={{ minWidth: 0, display: 'grid', gap: 2 }}>
          <span style={{ fontSize: 14, color: PIPE.ink, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            <Bold text={x.name} words={x.hit.field === 'name' ? x.hit.bold : []} />
          </span>
          <span style={{ fontSize: 12, color: PIPE.textMuted }}>
            {[x.space?.name, stage(x.status)].filter(Boolean).join(' · ')}
            {w && <> · <span data-search-where={x.hit.field} style={{ color: PIPE.textSecondary, fontWeight: 600 }}>{w}</span></>}
          </span>
          {x.hit.snippet && <span style={{ fontSize: 12.5, color: PIPE.textSecondary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}><Bold text={x.hit.snippet} words={x.hit.bold} /></span>}
        </span>
        <span style={{ fontSize: 12, color: PIPE.textMuted, whiteSpace: 'nowrap', paddingTop: 2 }}>{x.publish_date ? formatDay(x.publish_date, locale) : ''}</span>
      </button>
    )
  }
  const assetRow = (a: AssetResult): ReactNode => {
    const i = ++idx
    return (
      <button key={a.id} type="button" role="option" aria-selected={cursor === i} data-search-asset={a.id} onMouseEnter={() => setCursor(i)} onClick={() => openAsset(a)}
        style={{ display: 'grid', gridTemplateColumns: '18px minmax(0,1fr)', gap: 10, alignItems: 'start', width: '100%', textAlign: 'start', border: 'none',
          background: cursor === i ? '#F4FBD6' : 'transparent', borderRadius: 10, padding: '9px 10px', cursor: 'pointer', font: 'inherit' }}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={PIPE.textMuted} strokeWidth="2" aria-hidden="true" style={{ marginTop: 2 }}><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" /><path d="M14 3v5h5" /></svg>
        <span style={{ minWidth: 0, display: 'grid', gap: 2 }}>
          <span style={{ fontSize: 14, color: PIPE.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}><Bold text={a.filename} words={a.hit.bold} /></span>
          <span style={{ fontSize: 12, color: PIPE.textMuted }}>{a.where === 'task' ? t('onTask', { task: a.taskName ?? '' }) : t('inBrand', { brand: a.brand?.name ?? '' })}</span>
        </span>
      </button>
    )
  }
  const todoRow = (x: TodoResult): ReactNode => {
    const i = ++idx
    return (
      <button key={x.id} type="button" role="option" aria-selected={cursor === i} data-search-todo={x.id} onMouseEnter={() => setCursor(i)} onClick={() => { close(); router.push('/my-tasks') }}
        style={{ display: 'grid', gridTemplateColumns: '18px minmax(0,1fr) auto', gap: 10, alignItems: 'start', width: '100%', textAlign: 'start', border: 'none',
          background: cursor === i ? '#F4FBD6' : 'transparent', borderRadius: 10, padding: '9px 10px', cursor: 'pointer', font: 'inherit' }}>
        <span aria-hidden="true" style={{ width: 16, height: 16, borderRadius: '50%', border: '1.6px solid #C9CACC', marginTop: 2, background: x.done ? '#3E7BEA' : 'transparent' }} />
        <span style={{ minWidth: 0, display: 'grid', gap: 2 }}>
          <span style={{ fontSize: 14, color: PIPE.ink, textDecoration: x.done ? 'line-through' : 'none', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}><Bold text={x.name} words={x.hit.field === 'name' ? x.hit.bold : []} /></span>
          {x.hit.snippet && <span style={{ fontSize: 12.5, color: PIPE.textSecondary }}><Bold text={x.hit.snippet} words={x.hit.bold} /></span>}
        </span>
        <span style={{ fontSize: 12, color: PIPE.textMuted, whiteSpace: 'nowrap' }}>{x.day ? formatDay(x.day, locale) : ''}</span>
      </button>
    )
  }
  const group = (key: 'tasks' | 'assets' | 'todos', title: string, n: number, rows: ReactNode[]) => n > 0 && (
    <section data-search-group={key} style={{ display: 'grid', gap: 2 }}>
      <h3 style={{ margin: '10px 10px 4px', fontSize: 11, fontWeight: 800, letterSpacing: '.08em', textTransform: 'uppercase', color: PIPE.textMuted, display: 'flex', justifyContent: 'space-between' }}>
        <span>{title} <span style={{ fontWeight: 600 }}>{n}</span></span>
        {n > rows.length && all !== key && <button type="button" data-search-all={key} onClick={() => setAll(key)}
          style={{ border: 'none', background: 'none', padding: 0, font: 'inherit', fontSize: 11.5, fontWeight: 700, color: '#6D28D9', cursor: 'pointer', textTransform: 'none', letterSpacing: 0 }}>{t('seeAll', { n })}</button>}
      </h3>
      {rows}
    </section>
  )

  const nothing = res && !res.tasks.length && !res.assets.length && !res.todos.length
  return (
    <div role="presentation" onMouseDown={e => { if (e.target === e.currentTarget) close() }}
      style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(20,19,15,.28)', display: 'grid', justifyItems: 'center', alignItems: 'start',
        paddingTop: 'max(10vh, env(safe-area-inset-top, 0px))', paddingInline: 'max(16px, env(safe-area-inset-left, 0px))' }}>
      <div role="dialog" aria-modal="true" aria-label={t('title')} data-search-dialog=""
        onKeyDown={e => {
          if (e.key === 'Escape') { e.preventDefault(); close() }
          else if (e.key === 'ArrowDown') { e.preventDefault(); setCursor(c => Math.min(c + 1, flat.length - 1)) }
          else if (e.key === 'ArrowUp') { e.preventDefault(); setCursor(c => Math.max(c - 1, 0)) }
          else if (e.key === 'Enter' && flat[cursor]) { e.preventDefault(); flat[cursor]() }
        }}
        style={{ width: 'min(680px, 100%)', maxHeight: '76vh', display: 'flex', flexDirection: 'column', background: '#FFFFFF', borderRadius: 20, boxShadow: '0 24px 60px rgba(20,19,15,.22)', overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 18px', borderBottom: `1px solid ${PIPE.border}` }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={PIPE.textMuted} strokeWidth="2.2" strokeLinecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
          <input ref={input} autoFocus value={text} onChange={e => { setText(e.target.value); setAll(null) }} placeholder={t('placeholder')} aria-label={t('title')}
            data-search-input="" autoComplete="off" spellCheck={false} role="combobox" aria-expanded={!!res} aria-controls="fx-search-results"
            style={{ flex: 1, minWidth: 0, border: 'none', outline: 'none', font: 'inherit', fontSize: 16, color: PIPE.ink, background: 'transparent' }} />
          {busy && <span aria-hidden="true" style={{ fontSize: 12, color: PIPE.textFaint }}>…</span>}
          <kbd style={{ fontSize: 11, color: PIPE.textMuted, border: `1px solid ${PIPE.border}`, borderRadius: 6, padding: '2px 6px', fontFamily: 'inherit' }}>Esc</kbd>
        </div>
        <div id="fx-search-results" role="listbox" aria-label={t('results')} style={{ overflowY: 'auto', padding: '6px 8px 12px' }}>
          {!text.trim() && <p style={{ margin: '14px 12px', fontSize: 13, color: PIPE.textMuted }}>{t('hint')}</p>}
          {res?.suggestion && (
            <p data-search-suggestion="" style={{ margin: '10px 10px 4px', fontSize: 13.5, color: PIPE.textSecondary }}>
              {t('didYouMean')}{' '}
              <button type="button" onClick={() => { setText(res.suggestion!); setAll(null) }}
                style={{ border: 'none', background: 'none', padding: 0, font: 'inherit', fontWeight: 800, color: '#6D28D9', cursor: 'pointer', textDecoration: 'underline' }}>{res.suggestion}</button>?
            </p>
          )}
          {nothing && (
            <div data-search-none="">
              <p style={{ margin: '12px 10px 4px', fontSize: 13.5, color: PIPE.ink, fontWeight: 700 }}>{t('noExact')}</p>
              {res.nearest.length
                ? group('tasks', t('closest'), res.nearest.length, res.nearest.map(taskRow))
                : <p style={{ margin: '4px 10px', fontSize: 13, color: PIPE.textMuted }}>{t('tryOther')}</p>}
            </div>
          )}
          {res && group('tasks', t('tasks'), res.taskCount, res.tasks.map(taskRow))}
          {res && group('todos', t('todos'), res.todoCount, res.todos.map(todoRow))}
          {res && group('assets', t('assets'), res.assetCount, res.assets.map(assetRow))}
          {res?.exact && <p style={{ margin: '10px 10px 0', fontSize: 12, color: PIPE.textFaint }}>{t('exactNote')}</p>}
        </div>
      </div>
    </div>
  )
}
