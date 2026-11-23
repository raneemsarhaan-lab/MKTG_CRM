'use client'

/**
 * My tasks (user, 2026-11-23, design/my-tasks.html): an Apple Reminders-style
 * page in the Hours frame. Smart lists (Today, Upcoming, Overdue, All) as
 * tiles; one list grouped by date (Overdue, Today, Tomorrow, This week, Later,
 * No date), brand or Space; pipeline tasks open their panel and carry the
 * "⚡ → next stage" quick move; personal to-dos are added at the bottom of a
 * section, completed with a round checkbox, edited in place, and can become a
 * pipeline task. To-dos are private to their owner.
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useLocale, useTranslations } from 'next-intl'
import type { StageId, Todo } from '@/types/index'
import { STAGE_META } from '@/lib/stage-meta'
import { allowedStages, nextOnPath } from '@/lib/stage-moves'
import { formatDay } from '@/lib/due-dates'
import { SECTIONS, isMine, sectionDay, sectionOf, inTile, tileCounts, type Section, type Tile } from '@/lib/my-tasks'
import { greetingWord } from '@/lib/myboard'
import { setWorkWeekend } from '@/lib/utils'
import { moveTask } from '@/actions/tasks'
import { addTodo, completeTodo, completedTodos, deleteTodo, todoToTask, updateTodo } from '@/actions/todos'
import { useUIStore } from '@/store/useUIStore'
import { handoffRequest } from '@/components/handoff/request'
import { useMoveError } from '@/components/fields/moveErrors'
import { TaskPanel } from '@/components/views/TaskPanel'
import { viewTasks, type BoardData, type ViewTask } from '@/components/views/types'
import { spaceLabel } from '@/components/shared/NavTree/labels'

type Group = 'date' | 'brand' | 'space'
type Item = { kind: 'task'; id: string; day: string | null; task: ViewTask } | { kind: 'todo'; id: string; day: string | null; todo: Todo }

const C = {
  ink: '#14130F', text: '#24262B', muted: '#5E6166', faint: '#A3A5A8', hair: '#EEEEEA', line: '#E4E4E0', tile: '#F4F4F1',
  lime: '#D7F75B', sel: '#F2FBD2', red: '#D22040', blue: '#3E7BEA', violet: '#7B5CF0', amber: '#E8772E',
}
const card: React.CSSProperties = { border: `1px solid ${C.line}`, borderRadius: 22, background: '#FFFFFF', padding: '20px 22px' }

export function MyTasksPage({ data, todos: initialTodos, today: realToday }: { data: BoardData; todos: Todo[]; today: string }) {
  setWorkWeekend(data.dueRule?.weekend)
  const t = useTranslations('myTasks')
  const locale = useLocale()
  const router = useRouter()
  const selectTask = useUIStore(s => s.selectTask)
  const openHandoff = useUIStore(s => s.openHandoff)
  const tSpaces = useTranslations('spaces')
  const moveErr = useMoveError()
  const me = data.currentUser
  const [today, setToday] = useState(realToday)
  const [tile, setTile] = useState<Tile>('all')
  const [group, setGroupState] = useState<Group>('date')
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const [todos, setTodos] = useState<Todo[]>(initialTodos)
  const [fading, setFading] = useState<Set<string>>(new Set())
  const [editing, setEditing] = useState<string | null>(null)
  const [say, setSay] = useState('')
  const [showDone, setShowDone] = useState(false)
  const [done, setDone] = useState<Todo[] | null>(null)
  const [converting, setConverting] = useState<Todo | null>(null)
  // Fresh data from the server; a to-do just completed stays (struck through) until its 2 seconds are up.
  const fadingRef = useRef(fading)
  fadingRef.current = fading
  useEffect(() => {
    setTodos(prev => [...initialTodos, ...prev.filter(x => fadingRef.current.has(x.id) && !initialTodos.some(y => y.id === x.id))])
  }, [initialTodos])
  // Group by is remembered on this device.
  useEffect(() => { try { const g = localStorage.getItem('fx-mytasks-group'); if (g === 'brand' || g === 'space' || g === 'date') setGroupState(g) } catch { /* private mode */ } }, [])
  const setGroup = (g: Group) => { setGroupState(g); try { localStorage.setItem('fx-mytasks-group', g) } catch { /* private mode */ } }

  const tasks = useMemo(() => viewTasks(data).filter(x => isMine(x, me)), [data, me])
  const items: Item[] = useMemo(() => [
    ...tasks.map(x => ({ kind: 'task' as const, id: x.id, day: x.due_date ?? null, task: x })),
    ...todos.filter(x => !x.done_at || fading.has(x.id)).map(x => ({ kind: 'todo' as const, id: x.id, day: x.day, todo: x })),
  ], [tasks, todos, fading])
  const counts = tileCounts(items.map(i => i.day), today)
  const shown = items.filter(i => inTile(i.day, tile, today))
  const sortIn = (a: Item, b: Item) => (a.day ?? '9999').localeCompare(b.day ?? '9999') || (a.kind === b.kind ? 0 : a.kind === 'task' ? -1 : 1) || name(a).localeCompare(name(b))
  const name = (i: Item) => (i.kind === 'task' ? i.task.name : i.todo.name)
  const spaceOf = (x: ViewTask) => data.spaces.find(s => data.taskSpaces.some(r => r.task_id === x.id && r.space_id === s.id))
  const stageName = (s: string) => { const m = STAGE_META[s as StageId]; return m ? (locale.startsWith('ar') ? m.label_ar : m.label_en) : s }

  const groups: { key: string; title: ReactNode; red?: boolean; items: Item[]; add?: Section | 'personal' }[] = useMemo(() => {
    if (group === 'date') {
      return SECTIONS.map(s => ({ key: s, title: t(`sections.${s}`), red: s === 'overdue', items: shown.filter(i => sectionOf(i.day, today) === s).sort(sortIn), add: s === 'overdue' ? undefined : s }))
        .filter(g => g.items.length || (tile === 'all' && g.add && ['today', 'none'].includes(g.key)) || (tile === 'today' && g.key === 'today'))
    }
    const out = new Map<string, { key: string; title: ReactNode; items: Item[] }>()
    for (const i of shown) {
      if (i.kind === 'todo') continue
      const k = group === 'brand' ? i.task.brand_id ?? '-' : spaceOf(i.task)?.id ?? '-'
      const sp = data.spaces.find(s => s.id === k)
      const title = group === 'brand' ? (data.brands.find(b => b.id === k)?.name ?? t('noBrand')) : (sp ? spaceLabel(sp, tSpaces) : t('noSpace'))
      if (!out.has(k)) out.set(k, { key: k, title, items: [] })
      out.get(k)!.items.push(i)
    }
    const list = [...out.values()].sort((a, b) => String(a.title).localeCompare(String(b.title))).map(g => ({ ...g, items: g.items.sort(sortIn) }))
    return [...list, { key: 'personal', title: t('personal'), items: shown.filter(i => i.kind === 'todo').sort(sortIn), add: 'personal' as const }]
  }, [group, shown, today, tile]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── actions ───────────────────────────────────────────────────────────────
  async function complete(todo: Todo) {
    setFading(f => new Set(f).add(todo.id))
    setTodos(ts => ts.map(x => (x.id === todo.id ? { ...x, done_at: new Date().toISOString() } : x)))
    const r = await completeTodo(todo.id, true)
    if (!r.success) { setTodos(ts => ts.map(x => (x.id === todo.id ? { ...x, done_at: null } : x))); setFading(f => { const n = new Set(f); n.delete(todo.id); return n }); setSay(t('notSaved')); return }
    // Struck through, then gone after 2 seconds (as in Apple Reminders).
    setTimeout(() => setFading(f => { const n = new Set(f); n.delete(todo.id); return n }), 2000)
    if (showDone) setDone(d => [{ ...todo, done_at: new Date().toISOString() }, ...(d ?? [])])
  }
  async function reopen(todo: Todo) {
    const r = await completeTodo(todo.id, false)
    if (!r.success) { setSay(t('notSaved')); return }
    setDone(d => (d ?? []).filter(x => x.id !== todo.id))
    setTodos(ts => [...ts.filter(x => x.id !== todo.id), { ...todo, done_at: null }])
  }
  async function add(nameText: string, at: Section | 'personal') {
    const day = at === 'personal' ? null : sectionDay(at, today)
    const r = await addTodo({ name: nameText, day })
    if (!r.success) { setSay(t('notSaved')); return false }
    setTodos(ts => [...ts, r.todo])
    return true
  }
  async function save(todo: Todo, patch: Partial<Pick<Todo, 'name' | 'note' | 'day' | 'flagged'>>) {
    setTodos(ts => ts.map(x => (x.id === todo.id ? { ...x, ...patch } : x)))
    const r = await updateTodo(todo.id, patch)
    if (!r.success) { setTodos(ts => ts.map(x => (x.id === todo.id ? todo : x))); setSay(t('notSaved')) }
  }
  async function remove(todo: Todo) {
    setEditing(null)
    setTodos(ts => ts.filter(x => x.id !== todo.id))
    const r = await deleteTodo(todo.id)
    if (!r.success) { setTodos(ts => [...ts, todo]); setSay(t('notSaved')) }
  }
  async function advance(x: ViewTask) {
    const r = await moveTask(x.id)
    const handoff = handoffRequest(r, x, data.spaces, data.taskSpaces, data.members, tSpaces)
    if (handoff) { openHandoff(handoff); return }
    if (!r.success) { setSay(moveErr(r) ?? t('notMoved')); return }
    setSay(t('moved', { name: x.name }))
    router.refresh()
  }
  async function toggleDone() {
    const next = !showDone
    setShowDone(next)
    if (next && !done) { const r = await completedTodos(); setDone(r.success ? r.todos : []) }
  }

  // ── rows ──────────────────────────────────────────────────────────────────
  const dateText = (d: string | null) => (!d ? '' : d === today ? t('todayWord') : formatDay(d, locale, today))
  const taskRow = (x: ViewTask) => {
    const late = !!x.due_date && x.due_date < today
    const brand = data.brands.find(b => b.id === x.brand_id)
    const sp = spaceOf(x)
    const next = nextOnPath(x as never)
    const canMove = !!next && allowedStages(x as never, me).includes(next)
    return (
      // The row opens the task on click; its name is the keyboard's button (no buttons inside a button).
      <div key={x.id} className="fx-mt-row" data-mt-task={x.id}
        onClick={() => selectTask(x.id)}
        style={{ display: 'grid', gridTemplateColumns: '22px minmax(0,1fr) auto', gap: 12, alignItems: 'start', padding: '10px 4px', borderBottom: `1px solid ${C.hair}`, cursor: 'pointer' }}>
        <span aria-hidden="true" style={{ width: 10, height: 10, borderRadius: '50%', margin: '6px 6px 0', background: brand?.color ?? C.faint }} />
        <span style={{ minWidth: 0 }}>
          <button type="button" onClick={e => { e.stopPropagation(); selectTask(x.id) }}
            style={{ display: 'block', border: 'none', background: 'none', padding: 0, textAlign: 'start', font: 'inherit', fontSize: 14.5, color: C.ink, fontWeight: 500, lineHeight: 1.35, cursor: 'pointer' }}>{x.name}</button>
          <span style={{ display: 'block', fontSize: 12.5, color: C.muted, marginTop: 2 }}>{[sp ? spaceLabel(sp, tSpaces) : null, stageName(x.status)].filter(Boolean).join(' · ')}</span>
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 12.5, whiteSpace: 'nowrap', paddingTop: 1, color: late ? C.red : C.muted, fontWeight: late ? 700 : 400, fontVariantNumeric: 'tabular-nums' }}>
          {canMove && (
            <button type="button" className="fx-mt-quick" data-mt-advance={x.id} onClick={e => { e.stopPropagation(); void advance(x) }}
              style={{ border: 'none', background: C.ink, color: C.lime, borderRadius: 8, padding: '4px 9px', font: 'inherit', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
              ⚡ → {stageName(next!)}
            </button>
          )}
          {dateText(x.due_date ?? null)}
        </span>
      </div>
    )
  }
  const todoRow = (x: Todo) => {
    const isDone = !!x.done_at
    if (editing === x.id) return <TodoEditor key={x.id} todo={x} today={today} onSave={p => void save(x, p)} onClose={() => setEditing(null)}
      onDelete={() => void remove(x)} onConvert={() => { setEditing(null); setConverting(x) }} />
    const late = !!x.day && x.day < today && !isDone
    return (
      <div key={x.id} className="fx-mt-row" data-mt-todo={x.id} style={{ display: 'grid', gridTemplateColumns: '22px minmax(0,1fr) auto', gap: 12, alignItems: 'start', padding: '10px 4px', borderBottom: `1px solid ${C.hair}`,
        opacity: isDone ? 0.5 : 1, transition: 'opacity 1.6s' }}>
        <button type="button" role="checkbox" aria-checked={isDone} aria-label={t(isDone ? 'reopen' : 'complete', { name: x.name })} data-mt-check={x.id}
          onClick={() => void (isDone ? reopen(x) : complete(x))}
          style={{ width: 20, height: 20, borderRadius: '50%', marginTop: 1, padding: 0, cursor: 'pointer', border: `1.8px solid ${isDone ? C.blue : '#C9CACC'}`,
            background: isDone ? `radial-gradient(circle, ${C.blue} 45%, transparent 48%)` : '#FFFFFF' }} />
        <button type="button" onClick={() => !isDone && setEditing(x.id)} data-mt-edit={x.id}
          style={{ minWidth: 0, textAlign: 'start', border: 'none', background: 'none', padding: 0, font: 'inherit', cursor: isDone ? 'default' : 'text' }}>
          <span style={{ display: 'block', fontSize: 14.5, color: isDone ? C.faint : C.ink, fontWeight: 500, lineHeight: 1.35, textDecoration: isDone ? 'line-through' : 'none' }}>{x.name}</span>
          {(x.note || x.flagged) && <span style={{ display: 'flex', gap: 6, fontSize: 12.5, color: C.muted, marginTop: 2 }}>
            {x.flagged && <span aria-label={t('flagged')} style={{ color: C.amber }}>⚑</span>}{x.note && <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{x.note}</span>}
          </span>}
        </button>
        <span style={{ fontSize: 12.5, color: late ? C.red : C.muted, fontWeight: late ? 700 : 400, whiteSpace: 'nowrap', paddingTop: 1 }}>{dateText(x.day)}</span>
      </div>
    )
  }

  const greeting = t(`hello.${greetingWord(new Date().getHours())}`, { name: me.name.split(' ')[0] })
  const tiles: { k: Tile; color: string; icon: ReactNode }[] = [
    { k: 'today', color: C.blue, icon: <><rect x="4" y="5" width="16" height="15" rx="2" /><path d="M4 10h16M9 3v4M15 3v4" /></> },
    { k: 'upcoming', color: '#8F6FE8', icon: <><circle cx="12" cy="12" r="8" /><path d="M12 8v4l3 2" /></> },
    { k: 'overdue', color: C.red, icon: <path d="M12 7v6M12 17h.01" /> },
    { k: 'all', color: C.ink, icon: <path d="M9 6h11M9 12h11M9 18h11M4 6h.01M4 12h.01M4 18h.01" /> },
  ]
  const openTodos = todos.filter(x => !x.done_at).length

  return (
    <div className="fx-myboard fx-mt-page" style={{ padding: '30px 44px 60px', display: 'grid', gap: 18, alignContent: 'start' }}>
      <style>{`.fx-mt-row .fx-mt-quick{opacity:0;transition:opacity .12s}.fx-mt-row:hover .fx-mt-quick,.fx-mt-row:focus-within .fx-mt-quick{opacity:1}.fx-mt-row:hover{background:#FAFAF7}@media (hover:none){.fx-mt-row .fx-mt-quick{opacity:1}}@media (max-width:700px){.fx-mt-page{padding:20px 16px 90px!important}.fx-mt-tiles{grid-template-columns:repeat(2,minmax(0,1fr))!important}}`}</style>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ fontFamily: locale.startsWith('ar') ? 'inherit' : 'var(--font-accent)', fontWeight: 700, fontSize: locale.startsWith('ar') ? 30 : 44, lineHeight: 1.05, color: C.ink, margin: 0 }}>
            {greeting} <span aria-hidden="true" style={{ fontSize: 26 }}>👋</span>
          </h1>
          <p style={{ fontSize: 14.5, color: C.muted, margin: '8px 0 0' }} data-mt-lede="">
            {t('lede', { open: counts.all, overdue: counts.overdue })}{' '}
            <Link href="/me" style={{ color: C.violet, fontWeight: 600, textDecoration: 'none' }} data-mt-views="">{t('views')}</Link>
          </p>
        </div>
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, border: `1px solid ${C.line}`, borderRadius: 12, padding: '7px 12px', fontWeight: 600, fontSize: 13.5, background: '#FFFFFF', cursor: 'pointer' }}>
          <span aria-hidden="true">📅</span>
          <span className="sr-only" style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>{t('dateLabel')}</span>
          <span style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            {new Intl.DateTimeFormat(locale.startsWith('ar') ? 'ar-EG-u-nu-latn' : 'en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${today}T00:00:00Z`))}
            <span aria-hidden="true" style={{ color: C.faint }}>⌄</span>
            <input type="date" value={today} onChange={e => e.target.value && setToday(e.target.value)} data-mt-date=""
              onClick={e => { try { (e.currentTarget as HTMLInputElement & { showPicker?: () => void }).showPicker?.() } catch { /* not supported */ } }}
              style={{ position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer', width: '100%', border: 'none' }} />
          </span>
          {today !== realToday && <button type="button" onClick={e => { e.preventDefault(); setToday(realToday) }} style={{ border: 'none', background: 'none', color: C.violet, font: 'inherit', fontSize: 12.5, cursor: 'pointer' }}>{t('backToToday')}</button>}
        </label>
      </header>

      <section style={card} aria-label={t('lists')}>
        <div className="fx-mt-tiles" role="tablist" aria-label={t('lists')} style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 12 }}>
          {tiles.map(x => {
            const on = tile === x.k
            return (
              <button key={x.k} type="button" role="tab" aria-selected={on} data-mt-tile={x.k} onClick={() => setTile(x.k)}
                style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '10px 8px', alignItems: 'center', textAlign: 'start', padding: '12px 14px', borderRadius: 16, cursor: 'pointer', font: 'inherit',
                  background: on ? '#FFFFFF' : C.tile, border: `2px solid ${on ? C.ink : 'transparent'}`, boxShadow: on ? '0 6px 20px rgba(20,19,15,.08)' : 'none' }}>
                <span aria-hidden="true" style={{ width: 32, height: 32, borderRadius: '50%', background: x.color, display: 'grid', placeItems: 'center' }}>
                  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.3" strokeLinecap="round">{x.icon}</svg>
                </span>
                <span data-mt-count={x.k} style={{ justifySelf: 'end', fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 26, color: x.k === 'overdue' && counts.overdue ? C.red : C.ink, fontVariantNumeric: 'tabular-nums' }}>{counts[x.k]}</span>
                <span style={{ gridColumn: '1 / -1', fontWeight: 700, color: C.muted, fontSize: 14 }}>{t(`tiles.${x.k}`)}</span>
              </button>
            )
          })}
        </div>
      </section>

      <section style={card} data-mt-list={tile}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 6 }}>
          <h2 style={{ fontFamily: 'var(--font-heading)', fontSize: 20, fontWeight: 800, color: C.ink, margin: 0, display: 'flex', gap: 10, alignItems: 'baseline' }}>
            {t(`tiles.${tile}`)} <small style={{ fontFamily: 'inherit', fontSize: 13, color: C.muted, fontWeight: 500 }}>{t('sub', { open: shown.length, todos: openTodos })}</small>
          </h2>
          <span style={{ display: 'inline-flex', gap: 10, alignItems: 'center', fontSize: 12.5, color: C.muted }}>{t('groupBy')}
            <span role="group" aria-label={t('groupBy')} style={{ display: 'inline-flex', background: '#F1F1EE', borderRadius: 10, padding: 3 }}>
              {(['date', 'brand', 'space'] as const).map(g => (
                <button key={g} type="button" aria-pressed={group === g} data-mt-group={g} onClick={() => setGroup(g)}
                  style={{ border: 'none', borderRadius: 8, padding: '5px 11px', font: 'inherit', fontSize: 12.5, fontWeight: 600, cursor: 'pointer',
                    background: group === g ? '#FFFFFF' : 'transparent', color: group === g ? C.ink : C.muted, boxShadow: group === g ? '0 1px 3px rgba(0,0,0,.08)' : 'none' }}>{t(`group.${g}`)}</button>
              ))}
            </span>
          </span>
        </div>
        {say && <p role="status" data-mt-say="" style={{ margin: '4px 0', fontSize: 13, color: C.muted }}>{say}</p>}
        {!shown.length && !groups.some(g => g.add) && <p style={{ color: C.muted, fontSize: 14, margin: '16px 0' }}>{t(`empty.${tile}`)}</p>}
        {groups.map(g => {
          const closed = collapsed.has(g.key)
          return (
            <section key={g.key} data-mt-section={g.key} style={{ marginTop: 14 }}>
              <button type="button" aria-expanded={!closed} onClick={() => setCollapsed(c => { const n = new Set(c); if (n.has(g.key)) n.delete(g.key); else n.add(g.key); return n })}
                style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', border: 'none', borderBottom: `1px solid ${C.hair}`, background: 'none', padding: '4px 0 6px', cursor: 'pointer',
                  fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 15, color: g.red ? C.red : C.ink, textAlign: 'start' }}>
                <span aria-hidden="true" style={{ color: C.faint, fontSize: 11, width: 12 }}>{closed ? '▸' : '▾'}</span>
                {g.title}<span style={{ fontFamily: 'var(--font-body, inherit)', fontWeight: 600, fontSize: 12.5, color: C.faint }}>{g.items.length}</span>
              </button>
              {!closed && <>
                {g.items.map(i => (i.kind === 'task' ? taskRow(i.task) : todoRow(i.todo)))}
                {g.add && <NewTodo onAdd={text => add(text, g.add!)} section={g.key} />}
              </>}
            </section>
          )
        })}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, marginTop: 16, fontSize: 13, color: C.muted, flexWrap: 'wrap' }}>
          <span>{t('private')}</span>
          <button type="button" onClick={() => void toggleDone()} aria-expanded={showDone} data-mt-show-done=""
            style={{ border: 'none', background: 'none', color: C.violet, fontWeight: 700, font: 'inherit', cursor: 'pointer' }}>{showDone ? t('hideDone') : t('showDone')}</button>
        </div>
        {showDone && (
          <section data-mt-done="" style={{ marginTop: 8 }}>
            {done === null ? <p style={{ color: C.muted, fontSize: 13 }}>…</p>
              : done.length || recentPublished(data, me.id, today).length
                ? <>{recentPublished(data, me.id, today).map(x => (
                    <div key={x.id} className="fx-mt-row" role="button" tabIndex={0} onClick={() => selectTask(x.id)} style={{ display: 'grid', gridTemplateColumns: '22px minmax(0,1fr) auto', gap: 12, padding: '10px 4px', borderBottom: `1px solid ${C.hair}`, opacity: 0.6, cursor: 'pointer' }}>
                      <span aria-hidden="true" style={{ color: C.blue, fontWeight: 800 }}>✓</span><span style={{ textDecoration: 'line-through', color: C.muted }}>{x.name}</span>
                      <span style={{ fontSize: 12.5, color: C.muted }}>{t('published')}</span>
                    </div>))}
                  {done.map(todoRow)}</>
                : <p style={{ color: C.muted, fontSize: 13 }}>{t('noneDone')}</p>}
          </section>
        )}
      </section>

      {converting && <MakeTask todo={converting} data={data} onClose={() => setConverting(null)}
        onMade={id => { setTodos(ts => ts.filter(x => x.id !== converting.id)); setConverting(null); setSay(t('madeTask')); router.refresh(); selectTask(id) }} />}
      <TaskPanel data={data} />
    </div>
  )
}

/** Tasks of mine published in the last 30 days, for "Show completed". */
function recentPublished(data: BoardData, me: string, today: string) {
  const since = new Date(Date.parse(today) - 30 * 86_400_000).toISOString().slice(0, 10)
  return viewTasks(data).filter(x => x.status === 'publish' && (x.assignee_id === me || !!x.assignee_ids?.includes(me)) && !x.dropped_at && (x.stage_date ?? '').slice(0, 10) >= since).slice(0, 50)
}

function NewTodo({ onAdd, section }: { onAdd: (text: string) => Promise<boolean>; section: string }) {
  const t = useTranslations('myTasks')
  const [v, setV] = useState('')
  const [busy, setBusy] = useState(false)
  const ref = useRef<HTMLInputElement>(null)
  return (
    <form data-mt-new={section} onSubmit={async e => { e.preventDefault(); const text = v.trim(); if (!text || busy) return; setBusy(true); if (await onAdd(text)) setV(''); setBusy(false); ref.current?.focus() }}
      style={{ display: 'grid', gridTemplateColumns: '22px 1fr', gap: 12, alignItems: 'center', padding: '8px 4px' }}>
      <span aria-hidden="true" style={{ width: 20, height: 20, borderRadius: '50%', border: '1.8px dashed #D4D5D7', display: 'grid', placeItems: 'center', fontSize: 13, color: C.faint, lineHeight: 1 }}>+</span>
      <input ref={ref} value={v} onChange={e => setV(e.target.value)} placeholder={t('newTodo')} aria-label={t('newTodoIn', { section: t(`sections.${section}` as 'sections.today') })} maxLength={200}
        style={{ border: 'none', borderBottom: v ? `1.5px solid ${C.blue}` : '1.5px solid transparent', outline: 'none', font: 'inherit', fontSize: 14.5, color: C.ink, padding: '2px 0', background: 'transparent' }} />
    </form>
  )
}

function TodoEditor({ todo, today, onSave, onClose, onDelete, onConvert }: {
  todo: Todo; today: string; onSave: (p: Partial<Pick<Todo, 'name' | 'note' | 'day' | 'flagged'>>) => void; onClose: () => void; onDelete: () => void; onConvert: () => void
}) {
  const t = useTranslations('myTasks')
  const [nameV, setName] = useState(todo.name)
  const [note, setNote] = useState(todo.note ?? '')
  const [day, setDay] = useState(todo.day ?? '')
  const box = useRef<HTMLDivElement>(null)
  const commit = () => {
    const p: Partial<Pick<Todo, 'name' | 'note' | 'day'>> = {}
    if (nameV.trim() && nameV.trim() !== todo.name) p.name = nameV.trim()
    if (note !== (todo.note ?? '')) p.note = note
    if ((day || null) !== todo.day) p.day = day || null
    if (Object.keys(p).length) onSave(p)
    onClose()
  }
  useEffect(() => {
    const out = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) commit() }
    document.addEventListener('mousedown', out)
    return () => document.removeEventListener('mousedown', out)
  })
  const btn: React.CSSProperties = { border: `1px solid ${C.line}`, background: '#FFFFFF', borderRadius: 8, padding: '4px 9px', font: 'inherit', fontSize: 12.5, fontWeight: 600, cursor: 'pointer', color: C.ink }
  return (
    <div ref={box} data-mt-editor={todo.id} onKeyDown={e => { if (e.key === 'Escape') onClose() }}
      style={{ display: 'grid', gridTemplateColumns: '22px minmax(0,1fr)', gap: 12, padding: '10px 4px', borderBottom: `1px solid ${C.hair}`, background: '#FAFAF7', borderRadius: 10 }}>
      <span aria-hidden="true" style={{ width: 20, height: 20, borderRadius: '50%', border: '1.8px solid #C9CACC', marginTop: 2 }} />
      <div style={{ display: 'grid', gap: 6, minWidth: 0 }}>
        <input autoFocus value={nameV} onChange={e => setName(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') commit() }} aria-label={t('name')} maxLength={200} data-mt-edit-name=""
          style={{ border: 'none', outline: 'none', font: 'inherit', fontSize: 14.5, fontWeight: 500, color: C.ink, background: 'transparent', padding: 0 }} />
        <textarea value={note} onChange={e => setNote(e.target.value)} placeholder={t('notePh')} aria-label={t('note')} rows={1} data-mt-edit-note=""
          style={{ border: 'none', outline: 'none', font: 'inherit', fontSize: 13, color: C.muted, background: 'transparent', padding: 0, resize: 'vertical' }} />
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
          <input type="date" value={day} onChange={e => setDay(e.target.value)} aria-label={t('date')} data-mt-edit-date="" style={{ ...btn, fontWeight: 500 }} />
          <button type="button" style={btn} aria-pressed={todo.flagged} onClick={() => onSave({ flagged: !todo.flagged })} data-mt-flag="">
            <span style={{ color: todo.flagged ? C.amber : C.muted }}>⚑</span> {todo.flagged ? t('unflag') : t('flag')}
          </button>
          <button type="button" style={btn} onClick={onConvert} data-mt-convert="">{t('makeTask')}</button>
          <button type="button" style={{ ...btn, color: C.red }} onClick={onDelete} data-mt-delete="">{t('delete')}</button>
          <span style={{ flex: 1 }} />
          <button type="button" style={{ ...btn, background: C.ink, color: '#FFFFFF', borderColor: C.ink }} onClick={commit} data-mt-done-edit="">{t('done')}</button>
        </div>
      </div>
    </div>
  )
}

function MakeTask({ todo, data, onClose, onMade }: { todo: Todo; data: BoardData; onClose: () => void; onMade: (taskId: string) => void }) {
  const t = useTranslations('myTasks')
  const spaces = data.spaces.filter(s => !s.archived_at && !s.media_board)
  const [brand, setBrand] = useState(data.brands[0]?.id ?? '')
  const [space, setSpace] = useState(spaces[0]?.id ?? '')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const field: React.CSSProperties = { width: '100%', border: `1px solid ${C.line}`, borderRadius: 10, padding: '8px 10px', font: 'inherit', fontSize: 14, background: '#FFFFFF' }
  return (
    <div role="presentation" onMouseDown={e => { if (e.target === e.currentTarget) onClose() }} style={{ position: 'fixed', inset: 0, zIndex: 900, background: 'rgba(20,19,15,.28)', display: 'grid', placeItems: 'center', padding: 16 }}>
      <form role="dialog" aria-modal="true" aria-label={t('makeTaskTitle')} data-mt-make="" onKeyDown={e => { if (e.key === 'Escape') onClose() }}
        onSubmit={async e => {
          e.preventDefault(); setBusy(true)
          const r = await todoToTask(todo.id, { brandId: brand, spaceId: space })
          setBusy(false)
          if (!r.success) { setErr(t('makeFailed')); return }
          onMade(r.taskId)
        }}
        style={{ width: 'min(420px, 100%)', background: '#FFFFFF', borderRadius: 20, padding: 22, display: 'grid', gap: 14, boxShadow: '0 24px 60px rgba(20,19,15,.22)' }}>
        <h2 style={{ margin: 0, fontFamily: 'var(--font-heading)', fontSize: 18, fontWeight: 800, color: C.ink }}>{t('makeTaskTitle')}</h2>
        <p style={{ margin: 0, fontSize: 13.5, color: C.muted }}>{t('makeTaskLede', { name: todo.name })}</p>
        <label style={{ display: 'grid', gap: 5, fontSize: 12.5, fontWeight: 700, color: C.muted }}>{t('brand')}
          <select autoFocus value={brand} onChange={e => setBrand(e.target.value)} style={field} data-mt-make-brand="">{data.brands.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}</select>
        </label>
        <label style={{ display: 'grid', gap: 5, fontSize: 12.5, fontWeight: 700, color: C.muted }}>{t('space')}
          <select value={space} onChange={e => setSpace(e.target.value)} style={field} data-mt-make-space="">{spaces.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
        </label>
        {err && <p role="alert" style={{ margin: 0, color: C.red, fontSize: 13 }}>{err}</p>}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button type="button" onClick={onClose} style={{ border: `1px solid ${C.line}`, background: '#FFFFFF', borderRadius: 10, padding: '8px 14px', font: 'inherit', fontWeight: 600, cursor: 'pointer' }}>{t('cancel')}</button>
          <button type="submit" disabled={busy || !brand || !space} data-mt-make-go="" style={{ border: 'none', background: C.lime, borderRadius: 10, padding: '8px 14px', font: 'inherit', fontWeight: 800, cursor: 'pointer' }}>{t('makeTaskGo')}</button>
        </div>
      </form>
    </div>
  )
}
