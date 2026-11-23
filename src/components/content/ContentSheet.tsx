'use client'

/**
 * The Content sheet (spec 009): the team's content plan beside the board,
 * from the same tasks. Themes are projects with owner, frequency and audience;
 * pillars group pieces; every row is a task, moved by the board's own rules.
 * Paste plan brings the Content Library Google Sheet in.
 */
import { useMediaLinks } from '@/components/media/MediaLinks'
import { useCallback, useMemo, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import type { ContentTheme, LinkRole, StageId, Task } from '@/types/index'
import { SheetMenu, SheetPopover, type MenuItem } from '@/components/sheet/SheetMenu'
import { statusMenuItems, useStageNames } from '@/components/sheet/StatusCell'
import { editorMenuItems } from '@/components/sheet/EditorCell'
import { LinkPrompt } from '@/components/sheet/PublishedCell'
import { looksLikeRows, cellsFromText, type PastedCell } from '@/components/sheet/parse-clips'
import { useSkipText } from '@/components/sheet/skip-text'
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
import { useTaskFieldColumns } from '@/components/fields/taskFieldColumns'
import { useMakeField } from '@/components/fields/useMakeField'
import { openFields } from '@/components/sheets/links/FieldsPanel'
import { BulkBar, type BulkPatch } from '@/components/kanban/BulkBar'
import { useMoveError, type MoveRefusal } from '@/components/fields/moveErrors'

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
  const tHandoff = useTranslations('handoff')
  const tSp = useTranslations('spaces')
  /** Spec 022: a linked row whose tasks haven't all passed D-Check moves only from Ready For Design to F-Check. */
  const linkedLimit = (task: Task) => {
    const open = p.tasks.some(x => x.content_task_id === task.id && !!x.media_board && !x.dropped_at && !['final-check', 'ready-publish', 'scheduled', 'publish'].includes(x.status))
    const band: string[] = ['r-design', 'd-prog', 'd-check', 'final-check']
    return open ? (s: StageId) => band.includes(s) : null
  }

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
  /** Spec 019 stage 2: grouped another way, every theme shows all its pieces. */
  const [groupMode, setGroupMode] = useState('theme')
  const noneCollapsed = useMemo(() => new Set<string>(), [])
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [drafts, setDrafts] = useState<{ key: string; themeId: string; pillarId: string | null }[]>([])
  const [editDraft, setEditDraft] = useState<string | null>(null)
  const [active, setActive] = useState<ActiveCell | null>(null)
  const now = useMemo(() => new Date(), [])
  const toggle = (set: React.Dispatch<React.SetStateAction<Set<string>>>, id: string) =>
    set(s => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n })

  const rows = useMemo(() => buildContentRows(p.tasks, p.themes, {
    mine, showArchived, me: me.id, collapsed: groupMode === 'theme' ? collapsed : noneCollapsed, expanded, drafts, query: p.query,
  }), [p.tasks, p.themes, mine, showArchived, me.id, collapsed, groupMode, noneCollapsed, expanded, drafts, p.query])
  const summary = useMemo(() => summariseContent(p.themes.flatMap(th => piecesOf(p.tasks, th.id))), [p.tasks, p.themes])

  // ── permissions ─────────────────────────────────────────────────────────
  const canEdit = useCallback((task: Task) => task.task_owner_id === me.id || task.assignee_id === me.id || !!task.assignee_ids?.includes(me.id) || admin, [me.id, admin])
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
  // Spec 022 (R19): the Link task cell — the piece's Design and Video tasks.
  const ml = useMediaLinks({ tasks: p.tasks, onOpenTask: id => p.onOpenTask(id), say })
  const [notes, setNotes] = useState<Record<string, string | undefined>>({})
  const onNote = useCallback((key: string, note: string | null) => {
    setNotes(prev => ({ ...prev, [key]: note ?? undefined }))
    if (note) setTimeout(() => setNotes(prev => (prev[key] === note ? { ...prev, [key]: undefined } : prev)), 4000)
  }, [])
  const tMediaErr = useTranslations('media')
  // Spec 022: a linked row's Status follows its linked tasks; these say why a move was refused.
  const MEDIA_ERRORS = ['waiting_on_media', 'follows_content', 'follows_media']
  const moveErr = useMoveError()
  /** A refusal's words; a move's whole result also names the required fields (spec 023). */
  const why = (r?: string | MoveRefusal) => {
    const known = typeof r === 'object' ? moveErr(r) : null
    if (known) return known
    const code = typeof r === 'object' ? r?.error : r
    return code && MEDIA_ERRORS.includes(code) ? tMediaErr(code as 'follows_media') : code && KNOWN_ERRORS.includes(code) ? t(`err.${code}` as 'err.generic') : code || t('err.generic')
  }

  // ── shaped columns (spec 010) ───────────────────────────────────────────
  const makeField = useMakeField('content', me.access, text => say(text))
  const sheetCols = useSheetColumns({
    sheet: 'content', set: 'all', bundle: p.columns, me, members: p.members, makeField,
    defaultName: key => (key.startsWith('f:') ? '' : t(`col.${key}` as 'col.title')), canEdit, say, onNote,
  })
  // Spec 023: Caption, Channels, TOV and the other task fields of the pieces' types, as columns.
  const cl = useTaskFieldColumns(sheetCols, { tasks: p.tasks, canEdit })
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
    if (!res.success) { const reason = why(res); say(t('notMoved', { reason })); onNote(`${rowKey}|status`, reason); return }
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

  // ── bulk editing (design/content-sheet-bulk-bar.html) ───────────────────
  const [bulkIds, setBulkIds] = useState<string[]>([])
  /** What the sheet calls each stage, from the grid (its own words or the content names). */
  const bulkWord = useRef<((id: StageId) => string) | null>(null)
  const [bulkHidden, setBulkHidden] = useState(false)
  const [bulkBusy, setBulkBusy] = useState(false)
  const bulkTasks = bulkIds.map(id => p.tasks.find(x => x.id === id)).filter((x): x is Task => !!x && !x.dropped_at)
  /** Pillar spans one theme: that theme's pillars, or null when the pieces come from several. */
  const bulkThemes = new Set(bulkTasks.map(x => p.themes.find(th => piecesOf(p.tasks, th.id).some(y => y.id === x.id))?.id ?? ''))
  const bulkTheme = bulkThemes.size === 1 ? p.themes.find(th => bulkThemes.has(th.id)) : undefined
  const bulkMessage = (changed: number, refused: number) =>
    (refused ? t('bulk.doneSome', { n: changed, m: refused }) : t('bulk.done', { n: changed }))
  /** The board's bulk save, then one Undo that puts every changed piece back as it was. */
  async function bulkApply(given: BulkPatch) {
    if (!p.api.bulkUpdate || !bulkTasks.length) return
    // The Content sheet's Date is the publishing date: a bulk date sets that, and due dates follow.
    const patch: BulkPatch = given.due_date !== undefined ? { publish_date: given.due_date } : given
    const key = Object.keys(patch)[0] as keyof BulkPatch
    const before = bulkTasks.map(x => ({ id: x.id, old: (x as unknown as Record<string, unknown>)[key] as string | null | undefined }))
    setBulkBusy(true)
    const res = await p.api.bulkUpdate(bulkTasks.map(x => x.id), patch)
    setBulkBusy(false)
    if (!res.success && !res.changed) { say(t('notSaved', { reason: why(res.error) })); return }
    say([bulkMessage(res.changed, res.refused), res.handoff ? tHandoff('refused', { n: res.handoff }) : ''].filter(Boolean).join(' · '), res.changed ? () => void bulkUndo(key, before) : undefined)
  }
  async function bulkUndo(key: keyof BulkPatch, before: { id: string; old: string | null | undefined }[]) {
    if (key === 'status') {
      for (const b of before) if (b.old) await p.api.move(b.id, b.old as StageId)
    } else {
      const groups = new Map<string, string[]>()
      for (const b of before) { const k = b.old ?? ''; groups.set(k, [...(groups.get(k) ?? []), b.id]) }
      for (const [old, ids] of groups) {
        const value = key === 'due_date' || key === 'publish_date' ? (old ? old.slice(0, 10) : '') : old
        await p.api.bulkUpdate?.(ids, { [key]: value } as BulkPatch)
      }
    }
    say(t('bulk.undone'))
  }
  /** Pillar isn't one of the board's fields: each piece is saved as the Pillar cell saves it. */
  async function bulkPillar(id: string | null) {
    const list = bulkTasks.filter(canEdit)
    const before = list.map(x => ({ id: x.id, old: x.pillar_id ?? null }))
    setBulkBusy(true)
    let n = 0
    for (const x of list) { const r = await p.api.updatePiece(x.id, { pillar_id: id }); if (r.success) n++ }
    setBulkBusy(false)
    say(bulkMessage(n, bulkTasks.length - n), n ? () => {
      void (async () => { for (const b of before) await p.api.updatePiece(b.id, { pillar_id: b.old }); say(t('bulk.undone')) })()
    } : undefined)
  }
  async function bulkArchive() {
    const list = bulkTasks.filter(canEdit)
    let n = 0
    for (const x of list) { const r = await p.api.drop(x.id); if (r.success) n++ }
    say(t('bulk.archived', { n }), n ? () => { void (async () => { for (const x of list) await p.api.restore(x.id); say(t('bulk.undone')) })() } : undefined)
    setBulkIds([])
  }

  function onOpen(row: ContentRow, col: GridCol, anchor: HTMLElement) {
    // Spec 022 (R19): a piece's Link task cell opens the list.
    if (col === 'media') { if (row.kind === 'piece') ml.open(row.task, anchor); return }
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
        const items = statusMenuItems(task, me, isClip ? ts : t, isClip ? videoNames : names, to => { closePopup(true); void move(task, to, anchor, isClip) },
          !isClip && p.stages ? { api: p.stages, stepLabel: tSp('stages.step'), pick: e => { closePopup(true); void p.stages!.sub(task, e) } } : null, isClip ? null : linkedLimit(task))
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
    // Spec 019 stage 2: a typed or pasted stage or type (ContentGrid has read the sheet's words into a stage id or a type label).
    if (col === 'status') {
      const res = await p.api.move(task.id, value as StageId)
      if (!res.success) return why(res)
      say(t('moved', { name: task.name, stage: names.video(value as StageId) }))
      return null
    }
    if (col === 'type') {
      const r = await p.api.update(task.id, { content_type_label: value })
      return r.success ? null : why(r.error)
    }
    if (col === 'date') {
      const d = readDate(value)
      if (d === null) return t('date.badDate')
      const r = await p.api.updatePiece(task.id, { publish_date: d || null })
      return r.success ? null : why(r.error)
    }
    return null
  }

  // ── pasting ─────────────────────────────────────────────────────────────
  /**
   * Spec 013 FR-026: a paste onto a theme, pillar or "+ Piece" row is a plan
   * (Paste plan), and one value into a link column goes through the link rules; anything else fills
   * the cells.
   */
  function pasteAsRows(grid: string[][], row: ContentRow | null, col: GridCol | null): boolean {
    if (!row || (row.kind !== 'piece' && row.kind !== 'clip')) return true
    const flat = grid.flat().filter(Boolean)
    // One value into a link column: the link rules (attach it, or say it isn't a link).
    return flat.length === 1 && !!col && (LINK_COLS as readonly string[]).includes(col)
  }
  const skipText = useSkipText()
  const onSkipped = (s: Partial<Record<string, number>>) => { const m = skipText(s); if (m) say(m) }
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
        {/* Spec 019 stage 2: Columns opens the Fields drawer (the same as ⚙ Fields). */}
        <button type="button" className="fx-sheet-btn" data-columns-button="" aria-haspopup="dialog" onClick={() => openFields()}>{ts('columns.button')}</button>
        <button type="button" className="fx-sheet-btn" data-add-column="" onClick={e => cl.openAdd(e.currentTarget)}>{ts('columns.add')}</button>
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
              media={ml}
              stages={p.stages}
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
              pasteAsRows={pasteAsRows}
              onSkipped={onSkipped}
              onSelectPieces={(ids, word) => { bulkWord.current = word; setBulkIds(ids); setBulkHidden(false) }}
              linked={{
                drop: id => p.api.drop(id).then(r => { if (!r.success) say(t('notSaved', { reason: why(r.error) })); return r.success }),
                restore: id => p.api.restore(id).then(r => { if (!r.success) say(t('notSaved', { reason: why(r.error) })); return r.success }),
                insertRow: row => {
                  if (row.kind === 'pillar') addPiece(row.theme, row.pillar.id)
                  else if (row.kind === 'piece') addPiece(row.theme, row.task.pillar_id ?? null)
                  else if (row.kind === 'draft') addPiece(row.theme, row.pillarId)
                  else if (row.kind === 'group') return false
                  else addPiece(row.theme, null)
                  return true
                },
                heights: p.rowHeights,
                saveHeights: p.api.setRowHeights ? e => p.api.setRowHeights!('linked_content', e) : undefined,
                say: text => say(text),
              }}
              columns={cl}
              contentTypes={p.contentTypes}
              onGroupMode={setGroupMode}
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
      {ml.layer}

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

      {!bulkHidden && bulkTasks.length >= 2 && p.api.bulkUpdate && (
        <BulkBar
          count={bulkTasks.length}
          selectedBrands={bulkTasks.map(x => x.brand)}
          fields={['stage', 'assignee', 'type', 'pillar', 'due']}
          labels={{
            count: t('bulk.count', { n: bulkTasks.length }), stage: t('bulk.stage'), assignee: t('bulk.assignee'), type: t('bulk.type'),
            pillar: t('bulk.pillar'), due: t('bulk.date'), remove: t('bulk.archive'), confirm: t('bulk.archiveConfirm', { n: bulkTasks.length }),
            cancel: t('bulk.cancel'), clear: t('bulk.clear'), setDue: t('bulk.setDue'), noPillar: t('bulk.noPillar'), pillarOff: t('bulk.pillarOff'),
          }}
          members={p.members}
          brands={[]}
          types={p.contentTypes.map(c => ({ ...c } as unknown as import('@/types/index').ContentType))}
          busy={bulkBusy}
          note=""
          onApply={patch => void bulkApply(patch)}
          onDelete={() => void bulkArchive()}
          onClear={() => setBulkHidden(true)}
          stageName={id => bulkWord.current?.(id) ?? names.video(id)}
          pillars={bulkTheme ? bulkTheme.pillars.map(pl => ({ id: pl.id, name: pl.name })) : null}
          onPillar={id => void bulkPillar(id)}
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
