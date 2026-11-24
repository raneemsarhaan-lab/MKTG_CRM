'use client'

/**
 * Comments on cells (spec 015 US3, FR-050–FR-054, contracts/ui.md §4,
 * design: Comments). Mounted once by the workbook for the open sheet.
 *
 * - Purple corner markers on cells with open threads (announced to the sheet).
 * - Hovering a marker, or selecting a cell with a thread, shows the thread
 *   beside the cell; New comment opens an empty one on the active cell.
 * - The thread: comments with author and time, Edit and Delete on your own
 *   (Delete on any for admins), Resolve and Reopen, a reply box with the
 *   @mention picker, Ctrl/Cmd+Enter to send, Esc to close.
 * - The panel (💬 on the toolbar): Open and Resolved, newest first; choosing
 *   a thread selects its cell.
 * - Phones: the thread and the panel open full screen.
 */
import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { intlLocale } from '@/lib/sheet-format'
import { focusBack, opener, tabKeys, useFocusReturn } from '../a11y'
import type { SheetCommentThread } from '@/types/index'
import { addComment, clearCellComments, copyCellComments, deleteComment, editComment, listThreads, reopenThread, replyComment, resolveThread } from '@/actions/sheet-comments'
import { announceMarks, COMMENT_MARKS_ASK, COMMENT_NEW, COMMENTS_CLEAR, COMMENTS_PASTE, COMMENTS_RELOAD, recordCommentStep, selectCell, type FormatSource, type FormatState } from '../format/bus'
import { relativeTime } from '@/lib/notify/message'

const AVATAR = ['#DB2777', '#2563EB', '#0E7C7C', '#B45309', '#7C3AED', '#15803D', '#C81E3A', '#4B5563']
const colorOf = (id: string | null) => AVATAR[[...(id ?? 'x')].reduce((a, c) => a + c.charCodeAt(0), 0) % AVATAR.length]
const net = { success: false as const, error: 'network' }
const safe = <A extends unknown[], R>(fn: (...a: A) => Promise<R>) => (...a: A) => fn(...a).catch(() => net)
const api = {
  list: safe(listThreads), add: safe(addComment), reply: safe(replyComment), edit: safe(editComment),
  del: safe(deleteComment), resolve: safe(resolveThread), reopen: safe(reopenThread), clear: safe(clearCellComments), copy: safe(copyCellComments),
}
const keyOf = (t: { rowKey: string; colKey: string }) => `${t.rowKey}|${t.colKey}`

export interface SheetCommentsProps {
  /** The open sheet: a blank sheet's id, or 'linked_content' / 'linked_video'. */
  sheetRef: string | null
  source: FormatSource
  /** The active cell (from the sheet). */
  state: FormatState | null
  names: Record<string, string>
  me: { id: string; admin: boolean }
  panelOpen: boolean
  setPanelOpen(open: boolean): void
  /** A link's cell to open once (`?cell=row:col`). */
  initialCell: { rowKey: string; colKey: string } | null
  /** Whether a thread's cell is on the sheet now (a deleted row hides its threads until undone). */
  live?(rowKey: string, colKey: string): boolean
  /** A name for a thread's cell in the panel, when it isn't the active one. */
  cellName?(rowKey: string, colKey: string): string | null
  phone: boolean
  say(text: string): void
  /** Open threads, for the toolbar's count. */
  onCount?(n: number): void
}

type Open = { key: string; mode: 'peek' | 'pinned'; draft?: boolean }

export function SheetComments(p: SheetCommentsProps) {
  const t = useTranslations('sheets.comments')
  const locale = useLocale() as 'en' | 'ar'
  const [threads, setThreads] = useState<SheetCommentThread[]>([])
  const [sheetId, setSheetId] = useState<string | null>(null)
  const [open, setOpen] = useState<Open | null>(null)
  const [tab, setTab] = useState<'open' | 'resolved'>('open')
  const uid = useId()
  const ref = useRef(p)
  ref.current = p
  const initialDone = useRef(false)

  const errText = (e: string) => (t.has(`err.${e}`) ? t(`err.${e}`) : t('err.generic'))
  const load = useCallback(async () => {
    const ref0 = ref.current.sheetRef
    if (!ref0) return
    const r = await api.list(ref0)
    if (r.success && ref.current.sheetRef === ref0) { setThreads(r.threads); setSheetId(r.sheetId) }
  }, [])
  useEffect(() => { setThreads([]); setOpen(null); void load() }, [p.sheetRef, load])
  // Reopening the panel fetches again (others may have commented).
  useEffect(() => { if (p.panelOpen) void load() }, [p.panelOpen, load])

  const live = useCallback((th: SheetCommentThread) => !p.live || p.live(th.rowKey, th.colKey), [p])
  const openThreads = useMemo(() => threads.filter(th => !th.resolved && live(th)), [threads, live])
  const marks = useMemo(() => openThreads.map(keyOf), [openThreads])
  const marksKey = marks.join(',')
  useEffect(() => { announceMarks(p.source, marks) }, [marksKey, p.source]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const ask = (e: Event) => { if ((e as CustomEvent<{ source: FormatSource }>).detail.source === ref.current.source) announceMarks(ref.current.source, marks) }
    document.addEventListener(COMMENT_MARKS_ASK, ask)
    return () => document.removeEventListener(COMMENT_MARKS_ASK, ask)
  }, [marksKey]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { p.onCount?.(openThreads.length) }, [openThreads.length]) // eslint-disable-line react-hooks/exhaustive-deps

  // Selecting a cell with an open thread shows it beside the cell (not taking focus).
  const activeKey = p.state ? `${p.state.rowKey}|${p.state.colKey}` : null
  useEffect(() => {
    if (!activeKey) return
    setOpen(o => {
      if (o?.mode === 'pinned' && o.key !== activeKey) return o.draft ? null : o
      if (o?.key === activeKey) return o
      return openThreads.some(th => keyOf(th) === activeKey) ? { key: activeKey, mode: 'peek' } : (o?.mode === 'peek' ? null : o)
    })
  }, [activeKey]) // eslint-disable-line react-hooks/exhaustive-deps

  // New comment: on the active cell; an existing thread there opens for a reply.
  useEffect(() => {
    const on = () => {
      const st = ref.current.state
      if (!st || !st.rowKey) return
      ref.current.setPanelOpen(false)
      setOpen({ key: `${st.rowKey}|${st.colKey}`, mode: 'pinned', draft: true })
    }
    document.addEventListener(COMMENT_NEW, on)
    return () => document.removeEventListener(COMMENT_NEW, on)
  }, [])

  // Clear › Comments (stage 2): the threads on the selected cells.
  useEffect(() => {
    const on = async (e: Event) => {
      const d = (e as CustomEvent<{ source: FormatSource; keys: string[] }>).detail
      const cur = ref.current
      if (d.source !== cur.source || !cur.sheetRef || !d.keys.length) return
      const r = await api.clear(cur.sheetRef, d.keys)
      if (!r.success) { cur.say(errText(r.error)); return }
      if (r.ids.length) recordCommentStep(cur.source, cur.sheetRef, 'commentsClear', [{ op: 'live', ids: r.ids, before: true, after: false }])
      if (r.skipped) cur.say(t('clearSkipped', { n: r.skipped }))
      setOpen(null)
      void load()
    }
    document.addEventListener(COMMENTS_CLEAR, on)
    return () => document.removeEventListener(COMMENTS_CLEAR, on)
  }, [load]) // eslint-disable-line react-hooks/exhaustive-deps

  // Paste carries comments (spec 015 FR-041): the copied cells' threads, onto the pasted cells.
  useEffect(() => {
    const on = async (e: Event) => {
      const d = (e as CustomEvent<{ source: FormatSource; pairs: { from: string; rowKey: string; colKey: string }[] }>).detail
      const cur = ref.current
      if (d.source !== cur.source || !cur.sheetRef || !d.pairs.length) return
      const to = cur.sheetRef
      const r = await api.copy(d.pairs.map(x => ({ from: x.from, to: { sheet: to, rowKey: x.rowKey, colKey: x.colKey } })))
      if (!r.success) { cur.say(errText(r.error)); return }
      const ids = r.threads.flatMap(th => th.comments.map(c => c.id))
      if (ids.length) recordCommentStep(cur.source, to, 'commentsPaste', [{ op: 'live', ids, before: false, after: true }])
      if (r.threads.length) void load()
    }
    document.addEventListener(COMMENTS_PASTE, on)
    return () => document.removeEventListener(COMMENTS_PASTE, on)
  }, [load]) // eslint-disable-line react-hooks/exhaustive-deps

  // After an undo or redo of a comment action, the threads as they are now.
  useEffect(() => {
    const on = (e: Event) => { if ((e as CustomEvent<{ source: FormatSource }>).detail.source === ref.current.source) void load() }
    document.addEventListener(COMMENTS_RELOAD, on)
    return () => document.removeEventListener(COMMENTS_RELOAD, on)
  }, [load])

  // Hovering a corner marker shows its thread.
  useEffect(() => {
    if (p.phone) return
    let timer: number | undefined
    const over = (e: MouseEvent) => {
      const m = (e.target as HTMLElement).closest?.('[data-comment-marker]') as HTMLElement | null
      if (!m) return
      const cell = m.closest('[data-row-key][data-col]') as HTMLElement | null
      const tr = m.closest('.fx-sheet-tr') as HTMLElement | null
      if (!cell) return
      const rowKey = ref.current.source === 'linked' ? tr?.dataset.task ?? '' : cell.dataset.rowKey ?? ''
      const key = `${rowKey}|${cell.dataset.col}`
      window.clearTimeout(timer)
      setOpen(o => (o?.mode === 'pinned' ? o : { key, mode: 'peek' }))
    }
    document.addEventListener('mouseover', over)
    return () => { document.removeEventListener('mouseover', over); window.clearTimeout(timer) }
  }, [p.phone])

  // A notification's link: select the cell and open its thread, once the threads are in.
  useEffect(() => {
    if (initialDone.current || !p.initialCell || !sheetId) return
    initialDone.current = true
    const { rowKey, colKey } = p.initialCell
    let tries = 0
    const go = () => {
      selectCell(p.source, rowKey, colKey)
      setOpen({ key: `${rowKey}|${colKey}`, mode: 'pinned' })
      if (++tries < 6 && !document.querySelector(`[data-cell$="|${CSS.escape(colKey)}"]`)) window.setTimeout(go, 400)
    }
    window.setTimeout(go, 200)
  }, [p.initialCell, sheetId, p.source])

  const replace = (th: SheetCommentThread | null, id: string) =>
    setThreads(list => (th ? (list.some(x => x.id === th.id) ? list.map(x => (x.id === th.id ? th : x)) : [th, ...list]) : list.filter(x => x.id !== id)))

  const thread = open ? threads.find(th => keyOf(th) === open.key) ?? null : null
  const [rowKey, colKey] = open ? open.key.split('|') : ['', '']
  const cellLabel = open
    ? (p.state && `${p.state.rowKey}|${p.state.colKey}` === open.key ? p.state.cell : p.cellName?.(rowKey, colKey) ?? '')
    : ''

  async function send(text: string): Promise<boolean> {
    if (!open || !p.sheetRef) return false
    const res = thread
      ? await api.reply(thread.id, { body: text, cell: cellLabel })
      : await api.add(p.sheetRef, { rowKey, colKey, body: text, cell: cellLabel })
    if (!res.success) { p.say(errText(res.error)); return false }
    replace(res.thread, res.thread.id)
    // Undo removes what was just written: a new thread's first comment, or the reply.
    const added = thread ? res.thread.comments[res.thread.comments.length - 1]?.id : res.thread.id
    if (added) recordCommentStep(p.source, p.sheetRef, thread ? 'commentReply' : 'commentAdd', [{ op: 'live', ids: [added], before: false, after: true }])
    setOpen(o => (o ? { ...o, draft: false, mode: 'pinned' } : o))
    return true
  }

  return (
    <>
      {open && (thread || open.draft) && (
        <ThreadBox
          key={open.key}
          anchorKey={open.key} source={p.source} phone={p.phone}
          thread={thread} cell={cellLabel} names={p.names} me={p.me} locale={locale}
          focus={open.mode === 'pinned'}
          onPin={() => setOpen(o => (o ? { ...o, mode: 'pinned' } : o))}
          onClose={() => setOpen(null)}
          onSend={send}
          onEdit={async (id, body) => {
            const before = thread?.comments.find(c => c.id === id)?.body ?? ''
            const r = await api.edit(id, body, cellLabel); if (!r.success) { p.say(errText(r.error)); return false }
            replace(r.thread, r.thread.id)
            const after = r.thread.comments.find(c => c.id === id)?.body ?? body
            if (p.sheetRef && before !== after) recordCommentStep(p.source, p.sheetRef, 'commentEdit', [{ op: 'edit', id, before, after }])
            return true
          }}
          onDelete={async id => {
            const r = await api.del(id); if (!r.success) { p.say(errText(r.error)); return }
            replace(r.thread, thread?.id ?? ''); if (!r.thread) setOpen(null)
            if (p.sheetRef) recordCommentStep(p.source, p.sheetRef, 'commentDelete', [{ op: 'live', ids: [id], before: true, after: false }])
          }}
          onResolve={async () => {
            if (!thread) return
            const was = !!thread.resolved
            const r = was ? await api.reopen(thread.id) : await api.resolve(thread.id)
            if (!r.success) { p.say(errText(r.error)); return }
            replace(r.thread, r.thread.id)
            if (p.sheetRef) recordCommentStep(p.source, p.sheetRef, was ? 'commentReopen' : 'commentResolve', [{ op: 'resolve', id: thread.id, before: was, after: !was }])
            if (r.thread.resolved) setOpen(null)
          }}
        />
      )}
      {p.panelOpen && (
        <Panel phone={p.phone} onClose={() => p.setPanelOpen(false)}>
          <div className="fx-cmt-tabs" role="tablist" aria-label={t('title')} onKeyDown={tabKeys}>
            {(['open', 'resolved'] as const).map(k => {
              const n = threads.filter(th => (k === 'open') !== !!th.resolved).length
              return <button key={k} type="button" role="tab" id={`${uid}-tab-${k}`} aria-selected={tab === k} aria-controls={`${uid}-list`} tabIndex={tab === k ? 0 : -1}
                             data-cmt-tab={k} onClick={() => setTab(k)}>{t(k === 'open' ? 'openCount' : 'resolvedCount', { n })}</button>
            })}
          </div>
          <div className="fx-cmt-list" role="tabpanel" id={`${uid}-list`} aria-labelledby={`${uid}-tab-${tab}`}>
            {threads.filter(th => (tab === 'open') !== !!th.resolved).map(th => {
              const first = th.comments.find(c => !c.deleted) ?? th.comments[0]
              const last = th.comments[th.comments.length - 1]
              const name = p.cellName?.(th.rowKey, th.colKey) ?? null
              return (
                <button key={th.id} type="button" className="fx-cmt-item" data-cmt-thread={th.id}
                        onClick={() => {
                          selectCell(p.source, th.rowKey, th.colKey)
                          if (p.phone) p.setPanelOpen(false)
                          setOpen({ key: keyOf(th), mode: 'pinned' })
                        }}>
                  {name && <span className="fx-cmt-ref">{name}</span>}
                  <p>{first.deleted ? t('deleted') : first.body}</p>
                  <small>{p.names[first.authorId ?? ''] ?? '…'} · {when(last.createdAt, locale, t)} · {t('replies', { n: th.comments.length - 1 })}</small>
                </button>
              )
            })}
            {!threads.some(th => (tab === 'open') !== !!th.resolved) && <p className="fx-cmt-empty">{tab === 'open' ? t('emptyOpen') : t('emptyResolved')}</p>}
          </div>
        </Panel>
      )}
    </>
  )
}

/**
 * The comments panel: opening it moves focus to its tabs, Esc or ✕ closes it,
 * and focus goes back to the Comments button.
 */
function Panel({ phone, onClose, children }: { phone: boolean; onClose(): void; children: React.ReactNode }) {
  const t = useTranslations('sheets.comments')
  const box = useRef<HTMLElement>(null)
  useFocusReturn()
  useEffect(() => { requestAnimationFrame(() => box.current?.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]')?.focus()) }, [])
  return (
    <aside ref={box} className={`fx-cmt-panel${phone ? ' is-full' : ''}`} data-comments-panel="" aria-label={t('title')}
           onKeyDown={e => { if (e.key === 'Escape' && !e.defaultPrevented) { e.preventDefault(); e.stopPropagation(); onClose() } }}>
      <header>
        <h2>{t('title')}</h2>
        <button type="button" className="fx-cmt-ico" aria-label={t('close')} title={t('close')} onClick={onClose}>✕</button>
      </header>
      {children}
    </aside>
  )
}

function when(iso: string, locale: 'en' | 'ar', t: ReturnType<typeof useTranslations>): string {
  const r = relativeTime(iso, new Date(), locale)
  if ('text' in r) return r.text
  if (r.key === 'time.now') return t('justNow')
  const n = r.values.n ?? 0
  return new Intl.RelativeTimeFormat(intlLocale(locale), { numeric: 'auto', style: 'short' })
    .format(r.key === 'time.m' ? -n : r.key === 'time.h' ? -n : -1, r.key === 'time.m' ? 'minute' : r.key === 'time.h' ? 'hour' : 'day')
}

/** The cell a thread sits on, on screen. */
function cellEl(source: FormatSource, key: string): HTMLElement | null {
  const [rowKey, colKey] = key.split('|')
  if (source === 'blank') return document.querySelector<HTMLElement>(`[data-blank-sheet] [data-cell="${CSS.escape(rowKey)}|${CSS.escape(colKey)}"]`)
  return document.querySelector<HTMLElement>(`[data-linked-pane] .fx-sheet-tr[data-task="${CSS.escape(rowKey)}"] [data-col="${CSS.escape(colKey)}"]`)
    ?? document.querySelector<HTMLElement>(`.fx-sheet-tr[data-task="${CSS.escape(rowKey)}"] [data-col="${CSS.escape(colKey)}"]`)
}

function ThreadBox(p: {
  anchorKey: string; source: FormatSource; phone: boolean
  thread: SheetCommentThread | null; cell: string; names: Record<string, string>; me: { id: string; admin: boolean }; locale: 'en' | 'ar'
  focus: boolean
  onPin(): void; onClose(): void
  onSend(text: string): Promise<boolean>
  onEdit(id: string, body: string): Promise<boolean>
  onDelete(id: string): void
  onResolve(): void
}) {
  const t = useTranslations('sheets.comments')
  const tu = useTranslations('sheets.ux')
  const box = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null)
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [editing, setEditing] = useState<{ id: string; body: string } | null>(null)
  const [menu, setMenu] = useState<string | null>(null)
  const [confirmDel, setConfirmDel] = useState<string | null>(null)
  const ta = useRef<HTMLTextAreaElement>(null)
  const uid = useId()
  /** Where focus goes when the thread closes: what had it before (the grid's cell). */
  const back = useRef<HTMLElement | null>(null)
  useEffect(() => () => focusBack(back.current), [])
  /** A comment's ⋯ button, for focus after its menu, Edit or Delete closes. */
  const moreOf = (id: string) => box.current?.querySelector<HTMLElement>(`[data-cmt-id="${CSS.escape(id)}"] .fx-cmt-more > button`) ?? ta.current

  const place = useCallback(() => {
    if (p.phone) return
    const el = cellEl(p.source, p.anchorKey), b = box.current
    if (!el || !b) return
    const r = el.getBoundingClientRect(), w = b.offsetWidth, h = b.offsetHeight
    const rtl = getComputedStyle(el).direction === 'rtl'
    let left = rtl ? r.left - w - 8 : r.right + 8
    if (left + w > window.innerWidth - 8 || left < 8) left = rtl ? r.right + 8 : r.left - w - 8
    left = Math.max(8, Math.min(left, window.innerWidth - w - 8))
    const top = Math.max(8, Math.min(r.top, window.innerHeight - h - 8))
    setPos(old => (old && old.left === left && old.top === top ? old : { left, top }))
  }, [p.phone, p.source, p.anchorKey])
  // Placed when it opens and whenever its size changes (not on every keystroke).
  useLayoutEffect(() => {
    place()
    const b = box.current
    if (!b || p.phone) return
    const ro = new ResizeObserver(() => place())
    ro.observe(b)
    return () => ro.disconnect()
  }, [place, p.phone])
  useEffect(() => {
    const on = () => place()
    window.addEventListener('resize', on)
    document.addEventListener('scroll', on, true)
    return () => { window.removeEventListener('resize', on); document.removeEventListener('scroll', on, true) }
  }, [place])
  useEffect(() => {
    if (!p.focus) return
    if (!box.current?.contains(document.activeElement)) back.current = opener()
    requestAnimationFrame(() => ta.current?.focus())
  }, [p.focus])
  // New comments are read out: someone else's by name, your own as posted.
  const [news, setNews] = useState('')
  const seen = useRef(p.thread?.comments.length ?? 0)
  useEffect(() => {
    const list = p.thread?.comments ?? []
    if (list.length > seen.current) {
      const last = list[list.length - 1]
      setNews(last.authorId === p.me.id ? tu('commentPosted') : tu('newComment', { name: p.names[last.authorId ?? ''] ?? '…' }))
    }
    seen.current = list.length
  }, [p.thread?.comments.length]) // eslint-disable-line react-hooks/exhaustive-deps
  // Edit: the box takes focus; Delete's question too, on Cancel.
  const editRef = useRef<HTMLTextAreaElement>(null)
  useEffect(() => { if (editing) requestAnimationFrame(() => editRef.current?.focus()) }, [editing?.id]) // eslint-disable-line react-hooks/exhaustive-deps
  const confirmRef = useRef<HTMLDivElement>(null)
  useEffect(() => { if (confirmDel) requestAnimationFrame(() => confirmRef.current?.querySelector<HTMLElement>('button')?.focus()) }, [confirmDel])
  const endEdit = (id: string) => { setEditing(null); requestAnimationFrame(() => moreOf(id)?.focus()) }
  const endConfirm = (id: string) => { setConfirmDel(null); requestAnimationFrame(() => moreOf(id)?.focus()) }

  // The @mention picker: names matching what follows the last "@".
  const caretAt = useRef(0)
  const q = (() => { const before = text.slice(0, caretAt.current); const m = /(^|\s)@([\p{L}\p{N}_ .'-]{0,30})$/u.exec(before); return m ? m[2] : null })()
  const people = useMemo(() => Object.entries(p.names).filter(([id]) => id !== p.me.id), [p.names, p.me.id])
  const matches = q === null ? [] : people.filter(([, n]) => n.toLowerCase().includes(q.toLowerCase())).sort((a, b) => Number(!a[1].toLowerCase().startsWith(q.toLowerCase())) - Number(!b[1].toLowerCase().startsWith(q.toLowerCase()))).slice(0, 6)
  const [pick, setPick] = useState(0)
  const choose = (name: string) => {
    const at = caretAt.current, before = text.slice(0, at), after = text.slice(at)
    const start = before.lastIndexOf('@')
    const next = `${before.slice(0, start)}@${name} ${after}`
    setText(next)
    caretAt.current = start + name.length + 2
    requestAnimationFrame(() => { ta.current?.focus(); ta.current?.setSelectionRange(caretAt.current, caretAt.current) })
  }
  async function submit() {
    if (!text.trim() || busy) return
    setBusy(true)
    const ok = await p.onSend(text)
    setBusy(false)
    if (ok) setText('')
  }
  const mine = (authorId: string | null) => authorId === p.me.id
  const th = p.thread

  return (
    <div ref={box} className={`fx-cmt-thread${p.phone ? ' is-full' : ''}`} role="dialog" aria-label={t('thread', { cell: p.cell })} data-comment-thread=""
         style={p.phone ? undefined : pos ? { left: pos.left, top: pos.top } : { visibility: 'hidden', left: 0, top: 0 }}
         onPointerDown={p.onPin}
         onFocus={e => { if (!back.current && e.relatedTarget instanceof HTMLElement && !box.current?.contains(e.relatedTarget)) back.current = e.relatedTarget; p.onPin() }}
         onKeyDown={e => { if (e.key === 'Escape' && !matches.length) { e.stopPropagation(); p.onClose() } }}>
      <header>
        {p.phone && <button type="button" className="fx-cmt-ico" aria-label={t('back')} onClick={p.onClose}>‹</button>}
        <b>{p.cell}</b>
        <span className="fx-cmt-sp">
          {th && (
            <button type="button" className="fx-cmt-ico" data-cmt-resolve="" aria-label={th.resolved ? t('reopen') : t('resolve')} title={th.resolved ? t('reopen') : t('resolve')} onClick={p.onResolve}>
              {th.resolved ? '↺' : '✓'}
            </button>
          )}
          {!p.phone && <button type="button" className="fx-cmt-ico" aria-label={t('close')} title={t('close')} onClick={p.onClose}>✕</button>}
        </span>
      </header>
      {th?.resolved && <p className="fx-cmt-resolved">{t('resolvedBy', { name: p.names[th.resolved.by ?? ''] ?? '…' })}</p>}
      <div className="fx-cmt-items">
        {th?.comments.map(c => (
          <div key={c.id} className={`fx-cmt${c.deleted ? ' is-gone' : ''}`} data-cmt-id={c.id}>
            <span className="fx-cmt-av" style={{ background: colorOf(c.authorId) }} aria-hidden="true">{(p.names[c.authorId ?? ''] ?? '?').slice(0, 1)}</span>
            <div className="fx-cmt-who"><b>{p.names[c.authorId ?? ''] ?? '…'}</b><small>{when(c.createdAt, p.locale, t)}{c.editedAt ? ` · ${t('edited')}` : ''}</small></div>
            {editing?.id === c.id
              ? (
                <div className="fx-cmt-edit">
                  <textarea ref={editRef} value={editing.body} aria-label={t('edit')} name="comment-edit" onChange={e => setEditing({ id: c.id, body: e.target.value })}
                            onKeyDown={e => {
                              if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); void p.onEdit(c.id, editing.body).then(ok => { if (ok) endEdit(c.id) }) }
                              if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); endEdit(c.id) }
                            }} />
                  <span><button type="button" onClick={() => endEdit(c.id)}>{t('cancel')}</button><button type="button" className="is-go" onClick={() => void p.onEdit(c.id, editing.body).then(ok => { if (ok) endEdit(c.id) })}>{t('save')}</button></span>
                </div>
              )
              : <p>{c.deleted ? t('deleted') : <Body text={c.body} names={Object.values(p.names)} />}</p>}
            {!c.deleted && (mine(c.authorId) || p.me.admin) && editing?.id !== c.id && (
              <span className="fx-cmt-more">
                <button type="button" className="fx-cmt-ico" aria-label={t('more')} aria-haspopup="menu" aria-expanded={menu === c.id} onClick={() => setMenu(m => (m === c.id ? null : c.id))}>⋯</button>
                {menu === c.id && (
                  <CommentMenu label={t('more')} onClose={() => { setMenu(null); requestAnimationFrame(() => moreOf(c.id)?.focus()) }}>
                    {mine(c.authorId) && <button type="button" role="menuitem" tabIndex={-1} data-cmt-edit="" onClick={() => { setMenu(null); setEditing({ id: c.id, body: c.body }) }}>{t('edit')}</button>}
                    <button type="button" role="menuitem" tabIndex={-1} data-cmt-delete="" onClick={() => { setMenu(null); setConfirmDel(c.id) }}>{t('delete')}</button>
                  </CommentMenu>
                )}
              </span>
            )}
            {confirmDel === c.id && (
              <div ref={confirmRef} className="fx-cmt-confirm" role="alertdialog" aria-label={t('deleteTitle')} aria-describedby={`${uid}-del`}
                   onKeyDown={e => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); endConfirm(c.id) } }}>
                <span id={`${uid}-del`}>{t('deleteTitle')} {t('deleteBody')}</span>
                <span><button type="button" onClick={() => endConfirm(c.id)}>{t('cancel')}</button><button type="button" className="is-danger" data-ok="" onClick={() => { setConfirmDel(null); p.onDelete(c.id); requestAnimationFrame(() => ta.current?.focus()) }}>{t('delete')}</button></span>
              </div>
            )}
          </div>
        ))}
      </div>
      <div className="fx-cmt-reply">
        {matches.length > 0 && (
          <div className="fx-cmt-mentions" role="listbox" id={`${uid}-people`} aria-label={t('mentionHint')}>
            {matches.map(([id, n], i) => (
              <button key={id} id={`${uid}-person-${i}`} type="button" role="option" tabIndex={-1} aria-selected={i === pick} onMouseDown={e => { e.preventDefault(); choose(n) }}>
                <span className="fx-cmt-av is-sm" style={{ background: colorOf(id) }} aria-hidden="true">{n.slice(0, 1)}</span>{n}
              </button>
            ))}
          </div>
        )}
        <textarea ref={ta} value={text} data-cmt-input="" rows={2} aria-label={th ? t('reply') : t('new')} placeholder={th ? t('replyPlaceholder') : tu('ph.comment')}
                  name="comment" aria-autocomplete="list" aria-controls={matches.length ? `${uid}-people` : undefined} aria-expanded={matches.length > 0}
                  aria-activedescendant={matches.length ? `${uid}-person-${Math.min(pick, matches.length - 1)}` : undefined}
                  onChange={e => { setText(e.target.value); caretAt.current = e.target.selectionStart; setPick(0) }}
                  onSelect={e => { caretAt.current = (e.target as HTMLTextAreaElement).selectionStart }}
                  onKeyDown={e => {
                    if (matches.length && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) { e.preventDefault(); setPick(i => (i + (e.key === 'ArrowDown' ? 1 : -1) + matches.length) % matches.length); return }
                    if (matches.length && (e.key === 'Enter' || e.key === 'Tab') && !(e.ctrlKey || e.metaKey)) { e.preventDefault(); choose(matches[pick][1]); return }
                    if (matches.length && e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); setText(text + ' '); return }
                    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); void submit() }
                  }} />
        <p className="sr-only" role="status">{news}</p>
        <div className="fx-cmt-row">
          <small>{t('sendKey')}</small>
          <button type="button" className="fx-cmt-send" data-cmt-send="" disabled={!text.trim() || busy} onClick={() => void submit()}>{th ? t('reply') : t('send')}</button>
        </div>
      </div>
    </div>
  )
}

/** A comment's ⋯ menu: focus on its first item, ↑/↓ between them, Esc or Tab closes back to ⋯. */
function CommentMenu({ label, onClose, children }: { label: string; onClose(): void; children: React.ReactNode }) {
  const ref = useRef<HTMLSpanElement>(null)
  useEffect(() => { requestAnimationFrame(() => ref.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus()) }, [])
  return (
    <span ref={ref} className="fx-cmt-menu" role="menu" aria-label={label}
          onKeyDown={e => {
            const list = [...(ref.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])]
            const i = list.indexOf(document.activeElement as HTMLElement)
            if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); list[(i + (e.key === 'ArrowDown' ? 1 : -1) + list.length) % list.length]?.focus() }
            else if (e.key === 'Escape' || e.key === 'Tab') { e.preventDefault(); e.stopPropagation(); onClose() }
          }}>
      {children}
    </span>
  )
}

/** A comment's text with @Names picked out. */
function Body({ text, names }: { text: string; names: string[] }) {
  const sorted = [...names].filter(Boolean).sort((a, b) => b.length - a.length)
  if (!sorted.length) return <>{text}</>
  const re = new RegExp(`@(${sorted.map(n => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})(?![\\p{L}\\p{N}_])`, 'gu')
  const out: React.ReactNode[] = []
  let last = 0, m: RegExpExecArray | null, i = 0
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index))
    out.push(<span key={i++} className="fx-cmt-men">{m[0]}</span>)
    last = m.index + m[0].length
  }
  if (last < text.length) out.push(text.slice(last))
  return <>{out}</>
}
