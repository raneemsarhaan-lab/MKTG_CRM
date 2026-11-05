'use client'

/**
 * The Content sheet (spec 009): the team's content plan beside the board,
 * from the same tasks. Themes are projects with owner, frequency and audience;
 * pillars group pieces; every row is a task, moved by the board's own rules.
 * Paste plan brings the Content Library Google Sheet in.
 */
import { useCallback, useMemo, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import type { ContentTheme, LinkRole, StageId, Task } from '@/types/index'
import { SheetMenu, SheetPopover, type MenuItem } from '@/components/sheet/SheetMenu'
import { statusMenuItems, useStageNames } from '@/components/sheet/StatusCell'
import { editorMenuItems } from '@/components/sheet/EditorCell'
import { LinkPrompt } from '@/components/sheet/PublishedCell'
import { looksLikeRows, cellsFromText, type PastedCell } from '@/components/sheet/parse-clips'
import type { ActiveCell, GridCol } from '@/components/sheet/GridCore'
import { isWebLink } from '@/lib/content-plan'
import { buildContentRows, piecesOf, type ContentRow } from './rows'
import { summariseContent } from './summary'
import { ContentGrid, LINK_COLS, pieceLink } from './ContentGrid'
import { ThemeEditor, NamePrompt } from './ThemeEditor'
import { PlanPreview } from './PlanPreview'
import { gridFromHtml, mayAddTo } from './parse-plan'
import type { ContentSheetProps } from './types'
import { useSheetColumns } from '@/components/sheet/useSheetColumns'

type LinkCol = typeof LINK_COLS[number]
type Popup =
  | { kind: 'menu'; label: string; anchor: HTMLElement; items: MenuItem[] }
  | { kind: 'link'; anchor: HTMLElement; taskId: string; col: LinkCol; prompt?: 'published' | 'post' }
  | { kind: 'archive'; anchor: HTMLElement; task: Task }
  | { kind: 'theme'; anchor: HTMLElement; theme: ContentTheme }
  | { kind: 'name'; anchor: HTMLElement; title: string; initial?: string; save(name: string): Promise<string | null> }

const KNOWN_ERRORS = ['may_not_add', 'may_not_edit_theme', 'not_a_theme', 'bad_frequency', 'bad_audience', 'duplicate_pillar',
  'not_authorized', 'bad_link', 'not_found', 'dropped', 'not_authenticated', 'bad_date', 'generic']

/** "2026-11-20", "20/11/2026" or "20/11" → YYYY-MM-DD; '' clears; null when unreadable. */
export function readDate(text: string, now = new Date()): string | null | '' {
  const v = text.trim()
  if (!v) return ''
  let y: number, m: number, d: number
  let r: RegExpExecArray | null
  if ((r = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(v))) { y = +r[1]; m = +r[2]; d = +r[3] }
  else if ((r = /^(\d{1,2})[/.-](\d{1,2})(?:[/.-](\d{2,4}))?$/.exec(v))) {
    d = +r[1]; m = +r[2]; y = r[3] ? (r[3].length === 2 ? 2000 + +r[3] : +r[3]) : now.getFullYear()
  } else return null
  const dt = new Date(Date.UTC(y, m - 1, d))
  if (dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null
  return dt.toISOString().slice(0, 10)
}

export function ContentSheet(p: ContentSheetProps) {
  const t = useTranslations('content')
  const ts = useTranslations('sheet')
  const ta = useTranslations('attachments')
  const names = useStageNames('content')
  const videoNames = useStageNames('sheet')
  const me = p.me
  const admin = me.access === 'admin' || me.access === 'superuser'

  // ── view state ──────────────────────────────────────────────────────────
  const [mine, setMine] = useState(false)
  const [showArchived, setShowArchived] = useState(() => {
    try { return typeof window === 'undefined' || window.localStorage.getItem('momentum.content.archived') !== '0' } catch { return true }
  })
  function toggleArchived() {
    setShowArchived(v => {
      try { window.localStorage.setItem('momentum.content.archived', v ? '0' : '1') } catch { /* private mode */ }
      return !v
    })
  }
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [drafts, setDrafts] = useState<{ key: string; themeId: string; pillarId: string | null }[]>([])
  const [editDraft, setEditDraft] = useState<string | null>(null)
  const [active, setActive] = useState<ActiveCell | null>(null)
  const now = useMemo(() => new Date(), [])
  const toggle = (set: React.Dispatch<React.SetStateAction<Set<string>>>, id: string) =>
    set(s => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n })

  const rows = useMemo(() => buildContentRows(p.tasks, p.themes, {
    mine, showArchived, me: me.id, collapsed, expanded, drafts, query: p.query,
  }), [p.tasks, p.themes, mine, showArchived, me.id, collapsed, expanded, drafts, p.query])
  const summary = useMemo(() => summariseContent(p.themes.flatMap(th => piecesOf(p.tasks, th.id))), [p.tasks, p.themes])

  // ── permissions ─────────────────────────────────────────────────────────
  const canEdit = useCallback((task: Task) => task.task_owner_id === me.id || task.assignee_id === me.id || admin, [me.id, admin])
  const ctx = useMemo(() => ({ tasks: p.tasks, themes: p.themes, members: p.members, me }), [p.tasks, p.themes, p.members, me])
  const mayAdd = (theme: ContentTheme) => mayAddTo(theme, ctx)
  const mayEditTheme = (theme: ContentTheme) => admin || theme.owner_id === me.id

  // ── messages ────────────────────────────────────────────────────────────
  const [toast, setToast] = useState<{ text: string; undo?: () => void; n: number } | null>(null)
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const say = useCallback((text: string, undo?: () => void) => {
    if (toastTimer.current) clearTimeout(toastTimer.current)
    setToast(prev => ({ text, undo, n: (prev?.n ?? 0) + 1 }))
    toastTimer.current = setTimeout(() => setToast(null), undo ? 10000 : 3000)
  }, [])
  const [notes, setNotes] = useState<Record<string, string | undefined>>({})
  const onNote = useCallback((key: string, note: string | null) => {
    setNotes(prev => ({ ...prev, [key]: note ?? undefined }))
    if (note) setTimeout(() => setNotes(prev => (prev[key] === note ? { ...prev, [key]: undefined } : prev)), 4000)
  }, [])
  const why = (code?: string) => (code && KNOWN_ERRORS.includes(code) ? t(`err.${code}`) : code || t('err.generic'))

  // ── shaped columns (spec 010) ───────────────────────────────────────────
  const cl = useSheetColumns({
    sheet: 'content', set: 'all', bundle: p.columns, me, members: p.members,
    defaultName: key => t(`col.${key}` as 'col.title'), canEdit, say, onNote,
  })
  const setType = (task: Task, label: string) =>
    void p.api.update(task.id, { content_type_label: label }).then(r => { if (!r.success) say(t('notSaved', { reason: why(r.error) })) })

  // ── popups ──────────────────────────────────────────────────────────────
  const [popup, setPopup] = useState<Popup | null>(null)
  const closePopup = useCallback((restore: boolean) => {
    setPopup(prev => {
      if (restore && prev) requestAnimationFrame(() => (prev.anchor.closest('[data-cell]') as HTMLElement | null ?? prev.anchor).focus())
      return null
    })
  }, [])
  const cellEl = (rowKey: string, col: string) => document.querySelector<HTMLElement>(`[data-cell="${rowKey}|${col}"]`)

  function addPiece(theme: ContentTheme, pillarId: string | null) {
    if (!mayAdd(theme)) { say(t('err.may_not_add')); return }
    const key = Math.random().toString(36).slice(2, 9)
    setCollapsed(c => { const n = new Set(c); n.delete(theme.id); return n })
    setDrafts(d => [...d, { key, themeId: theme.id, pillarId }])
    setEditDraft(key)
  }

  async function move(task: Task, to: StageId, anchor: HTMLElement, isClip: boolean) {
    const rowKey = anchor.closest('[data-row]')?.getAttribute('data-row') ?? ''
    const res = await p.api.move(task.id, to)
    const n = isClip ? videoNames : names
    if (!res.success) { const reason = why(res.error); say(t('notMoved', { reason })); onNote(`${rowKey}|status`, reason); return }
    say(t('moved', { name: task.name, stage: n.video(to) }))
    // FR-043: a piece moved to Published here is asked for its links.
    if (to === 'publish' && !isClip && !task.published_url) {
      requestAnimationFrame(() => {
        const at = cellEl(rowKey, 'published') ?? cellEl(rowKey, 'status')
        if (at) setPopup({ kind: 'link', anchor: at, taskId: task.id, col: 'published', prompt: 'published' })
      })
    }
  }

  async function archive(task: Task) {
    closePopup(true)
    const r = await p.api.drop(task.id)
    if (!r.success) { say(t('notSaved', { reason: why(r.error) })); return }
    say(t('archive.archived'), () => { void restore(task) })
  }
  async function restore(task: Task) {
    const r = await p.api.restore(task.id)
    if (!r.success) { say(t('notSaved', { reason: why(r.error) })); return }
    say(t('archive.restored', { stage: names.video(task.status as StageId) }))
  }

  function onOpen(row: ContentRow, col: GridCol, anchor: HTMLElement) {
    const menu = (label: string, items: MenuItem[]) => { if (items.length) setPopup({ kind: 'menu', label, anchor, items }) }
    const pick = (fn: () => void) => () => { closePopup(true); fn() }
    if (row.kind === 'theme') {
      const th = row.theme
      const items: MenuItem[] = []
      if (mayEditTheme(th)) {
        items.push({ key: 'edit', text: t('theme.edit'), label: t('theme.edit'), onSelect: () => setPopup({ kind: 'theme', anchor, theme: th }) })
        items.push({ key: 'pillar', text: t('theme.addPillar'), label: t('theme.addPillar'), onSelect: () => setPopup({
          kind: 'name', anchor, title: t('pillar.newName'),
          save: async name => { const r = await p.api.savePillar(th.id, { name }); if (!r.success) return why(r.error); closePopup(true); say(t('pillar.saved')); return null },
        }) })
      }
      if (mayAdd(th)) items.push({ key: 'piece', text: t('addPiece'), label: t('addPiece'), onSelect: pick(() => addPiece(th, null)) })
      items.push({ key: 'collapse', text: row.collapsed ? t('theme.expand') : t('theme.collapse'), label: row.collapsed ? t('theme.expand') : t('theme.collapse'),
        onSelect: pick(() => toggle(setCollapsed, th.id)) })
      return menu(t('theme.menu', { name: th.name }), items)
    }
    if (row.kind === 'pillar') {
      const th = row.theme, pl = row.pillar
      const items: MenuItem[] = []
      if (mayAdd(th)) items.push({ key: 'piece', text: t('addPiece'), label: t('addPiece'), onSelect: pick(() => addPiece(th, pl.id)) })
      if (mayEditTheme(th)) {
        items.push({ key: 'rename', text: t('pillar.rename'), label: t('pillar.rename'), onSelect: () => setPopup({
          kind: 'name', anchor, title: t('pillar.newName'), initial: pl.name,
          save: async name => { const r = await p.api.savePillar(th.id, { id: pl.id, name }); if (!r.success) return why(r.error); closePopup(true); say(t('pillar.saved')); return null },
        }) })
        items.push({ key: 'remove', text: t('pillar.remove'), label: t('pillar.remove'), tone: 'danger', onSelect: pick(() => {
          void p.api.removePillar(pl.id).then(r => say(r.success ? t('pillar.removed') : t('notSaved', { reason: why(r.error) })))
        }) })
      }
      return menu(t('pillar.menu', { name: pl.name }), items)
    }
    if (row.kind !== 'piece' && row.kind !== 'clip') return
    const task = row.task
    const can = canEdit(task)
    const isClip = row.kind === 'clip'
    if (cl.custom.is(col)) { cl.custom.open(task, col, anchor, row.key); return }
    switch (col) {
      case 'rowNo': {
        const items: MenuItem[] = []
        if (!isClip && can) {
          items.push(task.dropped_at
            ? { key: 'restore', text: t('archive.restoreItem'), label: t('archive.restoreItem'), onSelect: pick(() => void restore(task)) }
            : { key: 'archive', text: t('archive.archiveItem'), label: t('archive.archiveItem'), tone: 'danger', onSelect: () => setPopup({ kind: 'archive', anchor, task }) })
        }
        items.push({ key: 'task', text: t('archive.openTask'), label: t('archive.openTask'), onSelect: pick(() => p.onOpenTask(task.id)) })
        const videoId = isClip ? row.video.id : row.clips.length || task.content_type_label === 'Video' ? task.id : null
        if (videoId) items.push({ key: 'video', text: t('archive.openVideo'), label: t('archive.openVideo'), onSelect: pick(() => p.onOpenVideoSheet(videoId)) })
        return menu(t('archive.rowMenu', { name: task.name }), items)
      }
      case 'status': {
        const items = statusMenuItems(task, me, isClip ? ts : t, isClip ? videoNames : names, to => { closePopup(true); void move(task, to, anchor, isClip) })
        if (!items.length) { onNote(`${row.key}|status`, t('noMoves')); return }
        return menu(ts('menu.statusFor', { name: task.name }), items)
      }
      case 'assignee':
        if (!can) { onNote(`${row.key}|assignee`, t('readOnly')); return }
        return menu(ts('editorFor', { name: task.name }), editorMenuItems(p.members, task.assignee_id, ts, id => {
          closePopup(true)
          void p.api.update(task.id, { assignee_id: id }).then(r => { if (!r.success) say(t('notSaved', { reason: why(r.error) })) })
        }))
      case 'type':
        if (!can) { onNote(`${row.key}|type`, t('readOnly')); return }
        return cl.typeCombo(task, anchor, p.contentTypes, label => setType(task, label))
      case 'pillar': {
        if (isClip) return
        if (!can) { onNote(`${row.key}|pillar`, t('readOnly')); return }
        const choose = (id: string | null) => () => {
          closePopup(true)
          void p.api.updatePiece(task.id, { pillar_id: id }).then(r => { if (!r.success) say(t('notSaved', { reason: why(r.error) })) })
        }
        return menu(t('col.pillar'), [
          ...row.theme.pillars.map(pl => ({ key: pl.id, text: pl.name, label: pl.name, tone: pl.id === task.pillar_id ? ('next' as const) : undefined, onSelect: choose(pl.id) })),
          { key: '', text: t('pillar.none'), label: t('pillar.none'), tone: !task.pillar_id ? ('next' as const) : undefined, onSelect: choose(null) },
        ])
      }
      case 'doc': case 'design': case 'post': case 'published': {
        if (isClip) return
        if (can && !task.dropped_at) return setPopup({ kind: 'link', anchor, taskId: task.id, col })
        const url = pieceLink(task, col)
        if (url) window.open(url, '_blank', 'noopener,noreferrer')
        return
      }
      case 'task':
        if (isClip) return
        p.onOpenTask(task.id)
        return
      case 'archive':
        if (isClip || !can) return
        if (task.dropped_at) { void restore(task); return }
        return setPopup({ kind: 'archive', anchor, task })
    }
  }

  async function saveLink(taskId: string, col: LinkCol, url: string): Promise<string | null> {
    if (url && !isWebLink(url)) return t('err.bad_link')
    const r = col === 'doc' || col === 'design'
      ? await p.api.setPieceLink(taskId, (col === 'doc' ? 'working_doc' : 'design') as LinkRole, url)
      : await p.api.updatePiece(taskId, col === 'post' ? { post_url: url || null } : { published_url: url || null })
    if (!r.success) return why(r.error)
    say(url ? t('links.saved') : t('links.removed'))
    return null
  }

  async function onCommit(row: ContentRow, col: GridCol, value: string): Promise<string | null> {
    if (row.kind === 'draft') {
      const key = row.key.slice(2)
      setDrafts(d => d.filter(x => x.key !== key))
      const title = value.trim()
      if (!title) return null
      const r = await p.api.addPiece(row.theme.id, { title, pillarId: row.pillarId })
      if (!r.success) { say(t('notSaved', { reason: why(r.error) })); return why(r.error) }
      say(t('newPiece.added'))
      return null
    }
    if (row.kind !== 'piece' && row.kind !== 'clip') return null
    const task = row.task
    if (cl.custom.is(col)) return cl.custom.commit(task, col, value)
    if (row.kind !== 'piece') return null
    if (col === 'title') {
      if (!value.trim()) return t('err.generic')
      const r = await p.api.update(task.id, { name: value.trim() })
      return r.success ? null : why(r.error)
    }
    if (col === 'date') {
      const d = readDate(value)
      if (d === null) return t('date.badDate')
      const r = await p.api.updatePiece(task.id, { due_date: d || null })
      return r.success ? null : why(r.error)
    }
    return null
  }

  // ── pasting ─────────────────────────────────────────────────────────────
  const [paste, setPaste] = useState<{ cells: PastedCell[][] | null } | null>(null)
  function onPaste(e: React.ClipboardEvent, row: ContentRow | null, col: GridCol | null) {
    const html = e.clipboardData.getData('text/html')
    const plain = e.clipboardData.getData('text/plain')
    const cells = html && /<t[rd][\s>]/i.test(html) ? gridFromHtml(html, new DOMParser()) : cellsFromText(plain)
    const single = plain.trim()
    if (!looksLikeRows(cells) && row?.kind === 'piece' && col && (LINK_COLS as readonly string[]).includes(col)) {
      e.preventDefault()
      if (!canEdit(row.task)) { onNote(`${row.key}|${col}`, t('readOnly')); return }
      if (!isWebLink(single)) { onNote(`${row.key}|${col}`, t('links.notALink')); return }
      void saveLink(row.task.id, col as LinkCol, single).then(err => { if (err) onNote(`${row.key}|${col}`, err) })
      return
    }
    if (looksLikeRows(cells)) { e.preventDefault(); setPaste({ cells }) }
  }

  // ── render ──────────────────────────────────────────────────────────────
  const linkTask = popup?.kind === 'link' ? p.tasks.find(x => x.id === popup.taskId) : undefined
  const linkLabel = (col: LinkCol) => t(`links.${col}`)

  return (
    <div className="fx-sheet" data-content-sheet="">
      {/* The header's third row on the Content tab (spec 011 R2): the sheet's
          own controls. Pipeline | Content are the header's tabs now. */}
      <div className="fx-sheet-bar" role="toolbar" aria-label={ts('view.label')} data-toolbar="">
        <span className="fx-sheet-bar-gap" />
        {cl.toolbar}
        <button type="button" className="fx-sheet-tog" aria-pressed={mine} data-mine="" onClick={() => setMine(v => !v)}>{t('mine')}</button>
        <button type="button" className="fx-sheet-tog" aria-pressed={showArchived} data-show-archived="" onClick={toggleArchived}>{t('showArchived')}</button>
        {admin && (
          <button type="button" className="fx-sheet-btn" data-add-theme="" onClick={e => setPopup({
            kind: 'name', anchor: e.currentTarget, title: t('theme.newName'),
            save: async name => { const r = await p.api.addTheme(name); if (!r.success) return why(r.error); closePopup(true); say(t('theme.added')); return null },
          })}>{t('addTheme')}</button>
        )}
        <button type="button" className="fx-sheet-btn is-primary" data-paste-plan="" onClick={() => setPaste({ cells: null })}>{t('pastePlan')}</button>
      </div>

      <div className="fx-sheet-sum" data-summary="">
        <span className="fx-sheet-sum-name">{t('title')}</span>
        <span><b>{t('summary.pieces', { count: summary.pieces })}</b></span>
        <span>
          {t('summary.published', { n: summary.published })}
          {summary.noLink > 0 && <> <span className="fx-sheet-sum-bad">{t('summary.noLink', { n: summary.noLink })}</span></>}
        </span>
        <span>{t('summary.design', { n: summary.design })}</span>
        <span>{t('summary.archived', { n: summary.archived })}</span>
      </div>

      {p.themes.length === 0
        ? <div className="fx-sheet-empty"><p>{admin ? t('noThemesAdmin') : t('noThemes')}</p></div>
        : (
          <div className="fx-sheet-scroll">
            <ContentGrid
              rows={rows}
              me={me}
              members={p.members}
              now={now}
              active={active}
              setActive={setActive}
              canEdit={canEdit}
              editDraft={editDraft}
              notes={notes}
              onNote={onNote}
              onCommit={onCommit}
              onCancelDraft={key => setDrafts(d => d.filter(x => x.key !== key))}
              onOpen={onOpen}
              onToggleTheme={id => toggle(setCollapsed, id)}
              onToggleVideo={id => toggle(setExpanded, id)}
              onAddPiece={addPiece}
              onDelete={(row, anchor) => { if (row.kind === 'piece' && canEdit(row.task)) { if (row.task.dropped_at) void restore(row.task); else setPopup({ kind: 'archive', anchor, task: row.task }) } }}
              onPaste={onPaste}
              columns={cl}
              onTypeAhead={(row, ch, anchor) => {
                if (row.kind !== 'piece' && row.kind !== 'clip') return false
                if (!canEdit(row.task) || row.task.dropped_at) { onNote(`${row.key}|type`, t('readOnly')); return true }
                cl.typeCombo(row.task, anchor, p.contentTypes, label => setType(row.task, label), ch)
                return true
              }}
            />
          </div>
        )}
      {cl.layer}

      {popup?.kind === 'menu' && <SheetMenu anchor={popup.anchor} label={popup.label} items={popup.items} onClose={closePopup} />}
      {popup?.kind === 'link' && linkTask && (
        <SheetPopover anchor={popup.anchor} label={t('links.edit', { label: linkLabel(popup.col), name: linkTask.name })} onClose={closePopup}>
          <LinkPrompt
            key={`${popup.taskId}-${popup.col}-${popup.prompt ?? ''}`}
            title={popup.prompt === 'published' ? t('links.publishPrompt') : popup.prompt === 'post' ? t('links.postPrompt') : t('links.edit', { label: linkLabel(popup.col), name: linkTask.name })}
            initial={popup.prompt ? '' : pieceLink(linkTask, popup.col) ?? ''}
            saveLabel={t('links.save')}
            skipLabel={popup.prompt ? ts('published.skip') : t('links.cancel')}
            badLink={t('err.bad_link')}
            placeholder="https://…"
            onSkip={() => {
              // After the published link, a Post is asked for its post link too.
              if (popup.prompt === 'published' && linkTask.content_type_label === 'Post' && !linkTask.post_url) {
                setPopup({ ...popup, col: 'post', prompt: 'post' }); return
              }
              closePopup(true)
            }}
            onSave={async url => {
              const err = await saveLink(linkTask.id, popup.col, url)
              if (err) return err
              if (popup.prompt === 'published' && linkTask.content_type_label === 'Post' && !linkTask.post_url) {
                setPopup({ ...popup, col: 'post', prompt: 'post' }); return null
              }
              closePopup(true)
              return null
            }}
          />
        </SheetPopover>
      )}
      {popup?.kind === 'archive' && (
        <SheetPopover anchor={popup.anchor} label={t('archive.archiveItem')} onClose={closePopup}>
          <div className="fx-sheet-pop-form" data-archive-confirm="">
            <span>{t('archive.confirm', { name: popup.task.name })}</span>
            <span className="fx-sheet-pop-row">
              <button type="button" className="fx-sheet-btn" onClick={() => closePopup(true)}>{t('archive.cancel')}</button>
              <button type="button" className="fx-sheet-btn is-danger" data-autofocus="" onClick={() => void archive(popup.task)}>{t('archive.archive')}</button>
            </span>
          </div>
        </SheetPopover>
      )}
      {popup?.kind === 'theme' && (
        <SheetPopover anchor={popup.anchor} label={t('editor.title', { name: popup.theme.name })} onClose={closePopup}>
          <ThemeEditor theme={popup.theme} members={p.members} onCancel={() => closePopup(true)}
                       onSave={async patch => { const r = await p.api.saveTheme(popup.theme.id, patch); if (!r.success) return why(r.error); closePopup(true); say(t('theme.saved')); return null }} />
        </SheetPopover>
      )}
      {popup?.kind === 'name' && (
        <SheetPopover anchor={popup.anchor} label={popup.title} onClose={closePopup}>
          <NamePrompt title={popup.title} initial={popup.initial} saveLabel={t('editor.save')} cancelLabel={t('editor.cancel')}
                      onCancel={() => closePopup(true)} onSave={popup.save} />
        </SheetPopover>
      )}

      {paste && (
        <PlanPreview
          ctx={ctx}
          columns={{ targets: cl.pasteNames, values: cl.pasteColumns, addColumn: cl.addTextColumn }}
          onAdd={(r, o) => p.api.addPlan(r, o)}
          onClose={msg => {
            setPaste(null)
            if (msg) say(msg)
            requestAnimationFrame(() => (document.querySelector<HTMLElement>('[data-cell][tabindex="0"]') ?? document.querySelector<HTMLElement>('[data-paste-plan]'))?.focus())
          }}
          initialCells={paste.cells}
        />
      )}

      <div className="fx-sheet-toast" role="status" aria-live="polite" data-sheet-toast="">
        {toast && (
          <span key={toast.n} className="fx-sheet-toast-in">
            {toast.text}
            {toast.undo && <button type="button" onClick={() => { const u = toast.undo; setToast(null); u?.() }}>{ta('undo')}</button>}
          </span>
        )}
      </div>
    </div>
  )
}
