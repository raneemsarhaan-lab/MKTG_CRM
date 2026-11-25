'use client'

/**
 * The Content sheet (spec 009): the team's content plan beside the board,
 * from the same tasks. Themes are projects with owner, frequency and audience;
 * pillars group pieces; every row is a task, moved by the board's own rules.
 * Paste plan brings the Content Library Google Sheet in.
 */
import { useAddColumn } from '@/components/fields/useAddColumn'
import { setMyColumns } from '@/actions/fields'
import { fieldOnIn } from '@/lib/field-catalog'
import { useMediaLinks } from '@/components/media/MediaLinks'
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
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
import { TAB_ROWS_ID, buildContentRows, isPseudoTheme, isReadOnlyTheme, piecesIn, type ContentRow } from './rows'
import { ContentGrid, LINK_COLS, pieceLink } from './ContentGrid'
import { ThemeEditor, NamePrompt } from './ThemeEditor'
import { PlanPreview } from './PlanPreview'
import { gridFromHtml, mayAddTo } from './parse-plan'
import type { ContentSheetProps } from './types'
import { useSheetColumns } from '@/components/sheet/useSheetColumns'
import { useFieldColumnDefs, useTaskFieldColumns } from '@/components/fields/taskFieldColumns'
import { useMakeField } from '@/components/fields/useMakeField'
import { ROWS_COMMAND, openAddColumn, type RowsCommand } from '@/components/sheets/links/FieldsPanel'
import { BulkBar, type BulkPatch } from '@/components/kanban/BulkBar'
import { useMoveError, type MoveRefusal } from '@/components/fields/moveErrors'
import type { ContentRowRec } from '@/lib/content-rows'
import { mayNest } from '@/lib/content-rows'
import { ThemeAdd, DestinationPick, DeleteRowPrompt, LinkTaskPick, MakeTaskDialog, destinations } from './RowDialogs'
import type { ContentDraft } from './rows'

type LinkCol = typeof LINK_COLS[number]
type Popup =
  | { kind: 'menu'; label: string; anchor: HTMLElement; items: MenuItem[] }
  | { kind: 'link'; anchor: HTMLElement; taskId: string; col: LinkCol; prompt?: 'published' | 'post' }
  | { kind: 'archive'; anchor: HTMLElement; task: Task }
  | { kind: 'removePillar'; anchor: HTMLElement; theme: ContentTheme; pillar: ContentTheme['pillars'][number] }
  | { kind: 'theme'; anchor: HTMLElement; theme: ContentTheme }
  | { kind: 'name'; anchor: HTMLElement; title: string; initial?: string; save(name: string): Promise<string | null> }
  // Sheet 2b
  | { kind: 'themeAdd'; anchor: HTMLElement; at?: { projectId: string; where: 'above' | 'below' } | null; names: string[] }
  | { kind: 'dest'; anchor: HTMLElement; theme: ContentTheme; pillar?: ContentTheme['pillars'][number] | null; rows: number }
  | { kind: 'delRow'; anchor: HTMLElement; rec: ContentRowRec; name: string; linked: boolean; children: number }
  | { kind: 'linkTask'; anchor: HTMLElement; rec: ContentRowRec }
  | { kind: 'makeTask'; anchor: HTMLElement; rec: ContentRowRec }
  | { kind: 'addExisting'; anchor: HTMLElement }

const KNOWN_ERRORS = ['board_tab', 'already_linked', 'not_linked_tab', 'parent_plain', 'not_a_subtask', 'is_a_subtask', 'not_in_space', 'needs_space', 'not_allowed_in_space', 'type_not_allowed', 'not_linked', 'child_rows_off', 'one_level', 'not_a_child', 'needs_destination', 'already_theme', 'theme_exists', 'theme_name_empty', 'project_exists', 'already_in_sheet', 'linked', 'media_task', 'may_not_add', 'may_not_edit_theme', 'not_a_theme', 'bad_frequency', 'bad_audience', 'duplicate_pillar',
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
  // Shown until the browser says otherwise: read after mount, so the server's first render and the browser's match.
  const [showArchived, setShowArchived] = useState(true)
  useEffect(() => {
    try { if (window.localStorage.getItem('momentum.content.archived') === '0') setShowArchived(false) } catch { /* private mode */ }
  }, [])
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
  const [drafts, setDrafts] = useState<ContentDraft[]>([])
  const [editDraft, setEditDraft] = useState<string | null>(null)
  const [active, setActive] = useState<ActiveCell | null>(null)
  const now = useMemo(() => new Date(), [])
  const toggle = (set: React.Dispatch<React.SetStateAction<Set<string>>>, id: string) =>
    set(s => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n })

  const rows = useMemo(() => buildContentRows(p.tasks, p.themes, {
    mine, showArchived, me: me.id, collapsed: groupMode === 'theme' ? collapsed : noneCollapsed, expanded, drafts, query: p.query, recs: p.rows,
    boardTasks: p.boardTasks, boardFiltered: p.boardFiltered, noThemeLabel: t('noTheme'), tabRows: !!p.tab || (!!p.boardTasks && !!p.rows),
  }), [p.tasks, p.themes, mine, showArchived, me.id, collapsed, groupMode, noneCollapsed, expanded, drafts, p.query, p.rows, p.boardTasks, p.boardFiltered, p.tab, t])
  /** Sheet 2b: rows live on the server when the host has them; otherwise every piece is a row. */
  const rowsOn = !!p.rows && !!p.api.addRow
  const recs = p.rows ?? []
  const childCount = (id: string) => recs.filter(r => r.parent_id === id).length
  const recOf = (row: ContentRow): ContentRowRec | null => (row.kind === 'line' ? row.rec : row.kind === 'piece' ? row.rec : null)

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
  // Spec 026: each Space's sheet has its own columns.
  const sheetId = p.sheet ?? 'content'
  const makeField = useMakeField(sheetId, me.access, text => say(text))
  // Spec 026 (§6): the field library as columns of this sheet.
  const fieldColsAll = useFieldColumnDefs(p.tasks)
  // Fields (25 Nov 2026): only the custom fields on in this Space are columns here; each person has their own view.
  const fs = p.fieldSystem
  const [layoutMode, setLayoutMode] = useState<'me' | 'default'>('me')
  const fieldMenu = useRef<(key: string) => import('@/components/sheet/SheetMenu').MenuItem[]>(() => [])
  const fieldCols = useMemo(() => (fs?.space ? fieldColsAll.filter(f => fieldOnIn(f.key, fs.space!.settings.fields, fs.promoted, fs.library.find(x => `f:${x.id}` === f.key))) : fieldColsAll),
    [fieldColsAll, fs])
  const sheetCols = useSheetColumns({
    sheet: sheetId, set: 'all', bundle: p.columns, me, members: p.members, makeField, fields: fieldCols, defaultShown: p.space?.settings?.views?.columns,
    defaultName: key => (key.startsWith('f:') || key.startsWith('c:') ? '' : t(`col.${key}` as 'col.title')), canEdit, say, onNote,
    extraMenu: key => fieldMenu.current(key),
    personal: fs ? { viewKey: fs.viewKey, layout: fs.layouts[fs.viewKey] ?? null, mode: layoutMode, save: l => setMyColumns(fs.viewKey, l).catch(() => ({ success: false, error: 'network' })) } : undefined,
  })
  const ac = useAddColumn({
    cl: sheetCols, sheet: sheetId, rowsSheet: true, space: fs?.space ?? null, spaces: fs?.spaces ?? [], promoted: fs?.promoted ?? [], library: fs?.library ?? [],
    me, api: p.columns.api, say, builtInName: key => (key.startsWith('f:') || key.startsWith('c:') ? '' : t(`col.${key}` as 'col.title')),
  })
  fieldMenu.current = ac.menuFor
  const lead = me.access === 'admin' || me.access === 'superuser'
  const addColumn = fs ? {
    ...ac,
    view: { mode: layoutMode, canDefault: lead && !!fs.space, hasOwn: sheetCols.hasOwnView, onMode: setLayoutMode, onReset: () => void sheetCols.resetToDefault() },
  } : undefined
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

  function addPiece(theme: ContentTheme, pillarId: string | null, parentId: string | null = null, anchor: ContentDraft['anchor'] = null) {
    // Sheet 2b: anyone may add a row; before rows, a piece followed the theme's rule.
    if (!rowsOn && !mayAdd(theme)) { say(t('err.may_not_add')); return }
    const key = Math.random().toString(36).slice(2, 9)
    setCollapsed(c => { const n = new Set(c); n.delete(theme.id); return n })
    setDrafts(d => [...d, { key, themeId: theme.id, pillarId, parentId, anchor }])
    setEditDraft(key)
  }
  /** Insert a row above or below another (as its sibling: a child row's sibling is a child too). */
  function insertBeside(row: ContentRow, where: 'above' | 'below') {
    const rec = recOf(row)
    if (!rec || row.kind === 'clip' || row.kind === 'group') return false
    const theme = (row as { theme: ContentTheme }).theme
    addPiece(theme, rec.pillar_id, rec.parent_id, { id: rec.id, where })
    return true
  }
  const canEditRec = (rec: ContentRowRec) => {
    if (!rec.task_id) return true
    const task = p.tasks.find(x => x.id === rec.task_id)
    return !task || canEdit(task)
  }

  // ── sheet 2b: rows, themes and pillars ───────────────────────────────────
  const ok = (r: { success: boolean; error?: string }, done?: string) => { if (!r.success) { say(t('notSaved', { reason: why(r.error) })); return false } if (done) say(done); return true }
  async function indent(rec: ContentRowRec, dir: 'in' | 'out') {
    if (!p.api.indentRow) return
    ok(await p.api.indentRow(rec.id, dir), dir === 'in' ? t('rows.indented') : t('rows.outdented'))
  }
  async function openThemeAdd(anchor: HTMLElement, at: { projectId: string; where: 'above' | 'below' } | null = null) {
    const names = (await p.api.themeNames?.().catch(() => [])) ?? []
    setPopup({ kind: 'themeAdd', anchor, at, names })
  }
  function askDelete(rec: ContentRowRec, name: string, anchor: HTMLElement) {
    const children = childCount(rec.id)
    if (!rec.task_id && !children) { void p.api.deleteRow?.(rec.id, {}).then(r => ok(r, t('rows.deleted'))); return }
    setPopup({ kind: 'delRow', anchor, rec, name, linked: !!rec.task_id, children })
  }
  /** Make task: a child row needs its parent row linked first. */
  function openMakeTask(rec: ContentRowRec, anchor: HTMLElement) {
    setPopup({ kind: 'makeTask', anchor, rec })
  }
  function rowItems(row: ContentRow, anchor: HTMLElement): MenuItem[] {
    const rec = recOf(row)
    if (!rowsOn || !rec) return []
    const pick = (fn: () => void) => () => { closePopup(true); fn() }
    const editable = canEditRec(rec)
    const parent = rec.parent_id ? recs.find(r => r.id === rec.parent_id) : null
    const items: MenuItem[] = [
      { key: 'above', text: t('rows.insertAbove'), label: t('rows.insertAbove'), onSelect: pick(() => insertBeside(row, 'above')) },
      { key: 'below', text: t('rows.insertBelow'), label: t('rows.insertBelow'), onSelect: pick(() => insertBeside(row, 'below')) },
    ]
    if (!rec.parent_id && editable) items.push({ key: 'child', text: t('rows.addChildItem'), label: t('rows.addChildItem'), onSelect: pick(() => addPiece((row as { theme: ContentTheme }).theme, rec.pillar_id, rec.id)) })
    if (editable && !rec.parent_id && !childCount(rec.id)) items.push({ key: 'indent', text: t('rows.makeChild'), label: t('rows.makeChild'), onSelect: pick(() => void indent(rec, 'in')) })
    if (editable && parent) items.push({ key: 'outdent', text: t('rows.moveOut'), label: t('rows.moveOut'), onSelect: pick(() => void indent(rec, 'out')) })
    // Spec 026: Make task (a new task in a chosen Space, or an existing one); Unlink keeps the row as plain text.
    if (!rec.task_id) {
      if (p.api.makeTask) items.push({ key: 'task', text: t('rows.makeTaskItem'), label: t('rows.makeTaskItem'), onSelect: () => openMakeTask(rec, anchor) })
      else {
        items.push({ key: 'task', text: t('rows.makeTask'), label: t('rows.makeTask'), onSelect: pick(() => void p.api.rowToTask?.(rec.id).then(r => ok(r, t('rows.taskMade')))) })
        items.push({ key: 'link', text: t('rows.linkTask'), label: t('rows.linkTask'), onSelect: () => setPopup({ kind: 'linkTask', anchor, rec }) })
      }
    } else if (editable && p.api.unlinkRow && !p.boardTasks) {
      items.push({ key: 'unlink', text: t('rows.unlink'), label: t('rows.unlink'), onSelect: pick(() => void p.api.unlinkRow!(rec.id).then(r => ok(r, t('rows.unlinked')))) })
    }
    // Spec 027 (US3): in an added tab, a task's row comes off this tab only, or its task is archived.
    if (p.tab && rec.task_id && p.api.removeTabRow) {
      items.push({ key: 'removeTab', text: t('rows.removeFromTab'), label: t('rows.removeFromTab'), onSelect: pick(() => void p.api.removeTabRow!(rec.id, 'tab').then(r => ok(r, t('rows.removedFromTab')))) })
      items.push({ key: 'archiveTask', text: t('rows.archiveTask'), label: t('rows.archiveTask'), tone: 'danger', onSelect: pick(() => void p.api.removeTabRow!(rec.id, 'archive').then(r => ok(r, t('rows.taskArchived')))) })
      return items
    }
    // Spec 027 (US2): the Board tab lists every task on the board, so a task's row there is only archived
    // (Archive the task); a plain row (an idea) can still be deleted.
    if (editable && !(p.boardTasks && rec.task_id)) items.push({ key: 'delete', text: t('rows.delete'), label: t('rows.delete'), tone: 'danger', onSelect: () => askDelete(rec, row.kind === 'piece' ? row.task.name : rec.title, anchor) })
    return items
  }
  /** Tab makes a row a child of the row above; Shift+Tab moves it back out (on the row's number). */
  function onRowKey(row: ContentRow, col: GridCol, e: React.KeyboardEvent): boolean {
    if (e.key !== 'Tab' || col !== 'rowNo' || !rowsOn) return false
    const rec = recOf(row)
    if (!rec) return false
    if (!canEditRec(rec)) { onNote(`${row.key}|rowNo`, t('readOnly')); return true }
    void indent(rec, e.shiftKey ? 'out' : 'in')
    return true
  }
  type Where = 'before' | 'after' | 'on'
  const rowDrag = rowsOn ? {
    can: (row: ContentRow) => {
      if (row.kind === 'theme') return admin && !isPseudoTheme(row.theme.id)
      if (row.kind === 'pillar') return mayEditTheme(row.theme)
      const rec = recOf(row)
      return !!rec && canEditRec(rec)
    },
    accepts: (from: ContentRow, to: ContentRow, where: Where) => {
      const inNone = (r: ContentRow) => 'theme' in r && isReadOnlyTheme(r.theme.id)
      if (inNone(to) || inNone(from)) return false
      if (from.kind === 'theme') return to.kind === 'theme' && where !== 'on'
      if (from.kind === 'pillar') return to.kind === 'pillar' && to.theme.id === from.theme.id && where !== 'on'
      const rec = recOf(from)
      if (!rec) return false
      if (to.kind === 'theme' || to.kind === 'pillar') return where === 'on'
      if (to.kind === 'add') return where === 'before'
      const target = recOf(to)
      if (!target || target.id === rec.id) return false
      if (where === 'on') return mayNest(recs, rec, target)
      // Between rows: a parent can't land among children (one level).
      return !(target.parent_id && childCount(rec.id))
    },
    drop: (from: ContentRow, to: ContentRow, where: Where) => {
      if (from.kind === 'theme' && to.kind === 'theme') { void p.api.reorderThemes?.(from.theme.id, to.theme.id, where === 'before' ? 'before' : 'after').then(r => ok(r, t('themes.moved'))); return }
      if (from.kind === 'pillar' && to.kind === 'pillar') { void p.api.reorderPillars?.(from.theme.id, from.pillar.id, to.pillar.id, where === 'before' ? 'before' : 'after').then(r => ok(r, t('pillar.moved'))); return }
      const rec = recOf(from)
      if (!rec || !p.api.moveRow) return
      if (to.kind === 'theme') { void p.api.moveRow(rec.id, { projectId: to.theme.id, pillarId: null }).then(r => ok(r, t('rows.moved', { to: to.theme.name }))); return }
      if (to.kind === 'pillar') { void p.api.moveRow(rec.id, { projectId: to.theme.id, pillarId: to.pillar.id }).then(r => ok(r, t('rows.moved', { to: to.pillar.name }))); return }
      if (to.kind === 'add') { void p.api.moveRow(rec.id, { projectId: to.theme.id, pillarId: to.pillarId, parentId: to.parentId }).then(r => ok(r)); return }
      const target = recOf(to)
      if (!target) return
      if (where === 'on') { void p.api.moveRow(rec.id, { projectId: target.project_id, parentId: target.id }).then(r => ok(r, t('rows.nested'))); return }
      void p.api.moveRow(rec.id, { projectId: target.project_id, pillarId: target.pillar_id, parentId: target.parent_id, anchor: { id: target.id, where: where === 'before' ? 'above' : 'below' } }).then(r => ok(r))
    },
  } : undefined

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
  /**
   * Remove pillar, after its confirm: the pieces stay in the theme with no
   * pillar. Undo adds a pillar of the same name back (at the end of the
   * theme's pillars) and puts the pieces that had it back in it.
   */
  async function removePillar(theme: ContentTheme, pillar: ContentTheme['pillars'][number]) {
    closePopup(true)
    const had = p.tasks.filter(x => x.pillar_id === pillar.id).map(x => x.id)
    const r = await p.api.removePillar(pillar.id)
    if (!r.success) { say(t('notSaved', { reason: why(r.error) })); return }
    say(t('pillar.removed'), () => {
      void (async () => {
        const back = await p.api.savePillar(theme.id, { name: pillar.name })
        if (!back.success || !back.id) { say(t('notSaved', { reason: why(back.error) })); return }
        let missed = 0
        for (const id of had) { const u = await p.api.updatePiece(id, { pillar_id: back.id }); if (!u.success) missed++ }
        say(missed ? t('pillar.restoredSome', { n: missed }) : t('pillar.restored'))
      })()
    })
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
  const bulkThemes = new Set(bulkTasks.map(x => p.themes.find(th => piecesIn(p.tasks, th.id, p.rows).some(y => y.id === x.id))?.id ?? ''))
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
    // Spec 027: the Board tab's "No theme" group is not a project: no menu.
    if (row.kind === 'theme' && isPseudoTheme(row.theme.id)) return
    if (row.kind === 'theme') {
      const th = row.theme
      const items: MenuItem[] = []
      if (mayEditTheme(th)) {
        items.push({ key: 'edit', text: t('theme.edit'), label: t('theme.edit'), onSelect: () => setPopup({ kind: 'theme', anchor, theme: th }) })
        items.push({ key: 'pillar', text: t('theme.addPillar'), label: t('theme.addPillar'), onSelect: () => setPopup({
          kind: 'name', anchor, title: t('pillar.newName'),
          save: async name => { const r = rowsOn ? await p.api.addPillarAt!(th.id, name) : await p.api.savePillar(th.id, { name }); if (!r.success) return why(r.error); closePopup(true); say(t('pillar.saved')); return null },
        }) })
      }
      if (rowsOn || mayAdd(th)) items.push({ key: 'piece', text: rowsOn ? t('rows.add') : t('addPiece'), label: rowsOn ? t('rows.add') : t('addPiece'), onSelect: pick(() => addPiece(th, null)) })
      if (rowsOn && admin) {
        items.push({ key: 'thAbove', text: t('themes.insertAbove'), label: t('themes.insertAbove'), onSelect: () => void openThemeAdd(anchor, { projectId: th.id, where: 'above' }) })
        items.push({ key: 'thBelow', text: t('themes.insertBelow'), label: t('themes.insertBelow'), onSelect: () => void openThemeAdd(anchor, { projectId: th.id, where: 'below' }) })
        items.push({ key: 'thRemove', text: t('themes.remove'), label: t('themes.remove'), tone: 'danger', onSelect: () => setPopup({ kind: 'dest', anchor, theme: th, rows: recs.filter(r => r.project_id === th.id && !r.parent_id).length }) })
      }
      items.push({ key: 'collapse', text: row.collapsed ? t('theme.expand') : t('theme.collapse'), label: row.collapsed ? t('theme.expand') : t('theme.collapse'),
        onSelect: pick(() => toggle(setCollapsed, th.id)) })
      return menu(t('theme.menu', { name: th.name }), items)
    }
    if (row.kind === 'pillar') {
      const th = row.theme, pl = row.pillar
      const items: MenuItem[] = []
      if (rowsOn || mayAdd(th)) items.push({ key: 'piece', text: rowsOn ? t('rows.add') : t('addPiece'), label: rowsOn ? t('rows.add') : t('addPiece'), onSelect: pick(() => addPiece(th, pl.id)) })
      if (rowsOn && mayEditTheme(th)) {
        for (const where of ['above', 'below'] as const) {
          items.push({ key: `pl-${where}`, text: t(where === 'above' ? 'pillar.insertAbove' : 'pillar.insertBelow'), label: t(where === 'above' ? 'pillar.insertAbove' : 'pillar.insertBelow'), onSelect: () => setPopup({
            kind: 'name', anchor, title: t('pillar.newName'),
            save: async name => { const r = await p.api.addPillarAt!(th.id, name, { pillarId: pl.id, where }); if (!r.success) return why(r.error); closePopup(true); say(t('pillar.saved')); return null },
          }) })
        }
      }
      if (mayEditTheme(th)) {
        items.push({ key: 'rename', text: t('pillar.rename'), label: t('pillar.rename'), onSelect: () => setPopup({
          kind: 'name', anchor, title: t('pillar.newName'), initial: pl.name,
          save: async name => { const r = await p.api.savePillar(th.id, { id: pl.id, name }); if (!r.success) return why(r.error); closePopup(true); say(t('pillar.saved')); return null },
        }) })
        items.push(rowsOn
          ? { key: 'remove', text: t('pillar.remove'), label: t('pillar.remove'), tone: 'danger', onSelect: () => setPopup({ kind: 'dest', anchor, theme: th, pillar: pl, rows: recs.filter(r => r.pillar_id === pl.id && !r.parent_id).length }) }
          : { key: 'remove', text: t('pillar.remove'), label: t('pillar.remove'), tone: 'danger',
              onSelect: () => setPopup({ kind: 'removePillar', anchor, theme: th, pillar: pl }) })
      }
      return menu(t('pillar.menu', { name: pl.name }), items)
    }
    if (row.kind === 'line') {
      const rec = row.rec
      if (col === 'rowNo') return menu(t('rows.menu', { name: rec.title }), rowItems(row, anchor))
      if (col === 'task') return openMakeTask(rec, anchor)
      if (col === 'status') return menu(t('rows.noTask'), rowItems(row, anchor).filter(i => i.key === 'task' || i.key === 'link'))
      if (col === 'pillar') {
        if (!canEditRec(rec)) { onNote(`${row.key}|pillar`, t('readOnly')); return }
        const choose = (id: string | null) => () => { closePopup(true); void p.api.moveRow?.(rec.id, { projectId: rec.project_id, pillarId: id }).then(r => ok(r)) }
        return menu(t('col.pillar'), [
          ...row.theme.pillars.map(pl => ({ key: pl.id, text: pl.name, label: pl.name, tone: pl.id === rec.pillar_id ? ('next' as const) : undefined, onSelect: choose(pl.id) })),
          { key: '', text: t('pillar.none'), label: t('pillar.none'), tone: !rec.pillar_id ? ('next' as const) : undefined, onSelect: choose(null) },
        ])
      }
      return
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
        if (!isClip) items.push(...rowItems(row, anchor))
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
          const rec = row.kind === 'piece' ? row.rec : null
          if (rowsOn && rec) { void p.api.moveRow!(rec.id, { projectId: rec.project_id, pillarId: id }).then(r => ok(r)); return }
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
      const draft = drafts.find(x => x.key === key)
      setDrafts(d => d.filter(x => x.key !== key))
      const title = value.trim()
      if (!title) return null
      if (rowsOn) {
        const r = await p.api.addRow!({ projectId: row.theme.id, pillarId: row.pillarId, parentId: row.parentId, title, anchor: draft?.anchor ?? null })
        if (!r.success) { say(t('notSaved', { reason: why(r.error) })); return why(r.error) }
        // Enter adds the row and starts the next one, just below it.
        if (r.row) addPiece(row.theme, row.pillarId, row.parentId, { id: r.row.id, where: 'below' })
        return null
      }
      const r = await p.api.addPiece(row.theme.id, { title, pillarId: row.pillarId })
      if (!r.success) { say(t('notSaved', { reason: why(r.error) })); return why(r.error) }
      say(t('newPiece.added'))
      return null
    }
    if (row.kind === 'line') {
      const rec = row.rec
      if (!p.api.updateRow) return null
      if (col === 'title') { if (!value.trim()) return t('err.generic'); const r = await p.api.updateRow(rec.id, { title: value }); return r.success ? null : why(r.error) }
      if (col === 'date') {
        const d = readDate(value)
        if (d === null) return t('date.badDate')
        const r = await p.api.updateRow(rec.id, { date: d || null })
        return r.success ? null : why(r.error)
      }
      // A plain row holds its own value in a task-field or sheet-only column, and a stage as a label (spec 026 §3, §6).
      if (cl.custom.is(col) || col === 'status') { const r = await p.api.updateRow(rec.id, { values: { [String(col)]: value || null } }); return r.success ? null : why(r.error) }
      return null
    }
    if (row.kind !== 'piece' && row.kind !== 'clip') return null
    const task = row.task
    if (cl.custom.is(col)) return cl.custom.commit(task, col, value)
    if (row.kind !== 'piece') return null
    if (col === 'title') {
      if (!value.trim()) return t('err.emptyTitle')
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
    if (row?.kind === 'line') return false
    if (!row || (row.kind !== 'piece' && row.kind !== 'clip')) return true
    const flat = grid.flat().filter(Boolean)
    // One value into a link column: the link rules (attach it, or say it isn't a link).
    return flat.length === 1 && !!col && (LINK_COLS as readonly string[]).includes(col)
  }
  const skipText = useSkipText()
  const onSkipped = (s: Partial<Record<string, number>>) => { const m = skipText(s); if (m) say(m) }
  const [paste, setPaste] = useState<{ cells: PastedCell[][] | null; target?: { theme: ContentTheme; pillarId: string | null } | null } | null>(null)
  /** Sheet 2b: a paste on a theme, pillar or "+ Row" line adds plain rows there. */
  const pasteTarget = (row: ContentRow | null) => !rowsOn || !row ? null
    : row.kind === 'theme' ? { theme: row.theme, pillarId: null }
    : row.kind === 'pillar' ? { theme: row.theme, pillarId: row.pillar.id }
    : row.kind === 'add' || row.kind === 'draft' ? { theme: row.theme, pillarId: row.pillarId }
    : null
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
    if (looksLikeRows(cells) || pasteTarget(row)) { e.preventDefault(); setPaste({ cells, target: pasteTarget(row) }) }
  }

  // The Data menu's commands for this sheet (the toolbar no longer carries them).
  const commands = useRef<(c: RowsCommand) => void>(() => {})
  commands.current = c => { if (c === 'pastePlan') setPaste({ cells: null }); else if (c === 'mine') setMine(v => !v); else toggleArchived() }
  useEffect(() => {
    const on = (e: Event) => commands.current((e as CustomEvent<RowsCommand>).detail)
    document.addEventListener(ROWS_COMMAND, on)
    return () => document.removeEventListener(ROWS_COMMAND, on)
  }, [])

  // ── render ──────────────────────────────────────────────────────────────
  const linkTask = popup?.kind === 'link' ? p.tasks.find(x => x.id === popup.taskId) : undefined
  // Sheet look: the workbook's formula bar offers a place for + Column and + Theme.
  const sheetRootRef = useRef<HTMLDivElement>(null)
  const [fbarSlot, setFbarSlot] = useState<HTMLElement | null>(null)
  useLayoutEffect(() => { setFbarSlot(sheetRootRef.current?.closest('[data-workbook]')?.querySelector<HTMLElement>('[data-fbar-slot]') ?? null) }, [])
  const linkLabel = (col: LinkCol) => t(`links.${col}`)

  return (
    <div className="fx-sheet" data-content-sheet="" data-mine={mine} data-archived={showArchived} ref={sheetRootRef}>
      {/* The header's third row on the Content tab (spec 011 R2): the sheet's
          own controls. Pipeline | Content are the header's tabs now. */}
      {/* Sheet look (25 Nov 2026): + Column and + Theme sit at the end of the workbook's formula bar; on their
          own row only where there is none (outside a workbook). */}
      {(() => {
        const buttons = (
          <>
        {/* User, 24 Nov 2026: the toolbar keeps + Column and + Theme only. The Fields button above opens
            the columns; Paste plan, Only my rows and Show archived are in the workbook's Data menu. */}
        <button type="button" className="fx-sheet-btn" data-add-column="" aria-haspopup="menu" onClick={e => openAddColumn(e.currentTarget)}>{ts('columns.add')}</button>
        {/* Spec 027 (US3): an added tab takes tasks already on the board too. */}
        {p.tab && p.api.addExistingTasks && (
          <button type="button" className="fx-sheet-btn" data-add-existing-task="" onClick={e => setPopup({ kind: 'addExisting', anchor: e.currentTarget })}>{t('rows.addExisting')}</button>
        )}
        {admin && (
          <button type="button" className="fx-sheet-btn" data-add-theme="" onClick={e => {
            if (rowsOn) { void openThemeAdd(e.currentTarget); return }
            setPopup({
              kind: 'name', anchor: e.currentTarget, title: t('theme.newName'),
              save: async name => { const r = await p.api.addTheme(name); if (!r.success) return why(r.error); closePopup(true); say(t('theme.added')); return null },
            })
          }}>{t('addTheme')}</button>
        )}
          </>
        )
        return fbarSlot
          ? createPortal(<span className="fx-fbar-sheet-tools" role="toolbar" aria-label={ts('view.label')} data-toolbar="">{buttons}</span>, fbarSlot)
          : <div className="fx-sheet-bar" role="toolbar" aria-label={ts('view.label')} data-toolbar=""><span className="fx-sheet-bar-gap" />{buttons}</div>
      })()}

      {/* User, 25 Nov 2026: no summary line ("Content plan · 23 pieces · …") above the grid. */}

      {/* Spec 027: the Board tab and added tabs always show the sheet, even in a new, empty Space. */}
      {p.themes.length === 0 && !p.boardTasks && !p.tab
        ? <div className="fx-sheet-empty"><p>{admin ? t('noThemesAdmin') : t('noThemes')}</p></div>
        : (
          <div className="fx-sheet-scroll">
            <ContentGrid
              addColumn={addColumn}
              media={ml}
              stages={p.stages}
              rowRecs={recs}
              spaceNameOf={task => { const id = (task as { home_space_id?: string | null }).home_space_id; return id ? p.spaces?.find(sp => sp.id === id)?.name ?? null : null }}
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
              onAddRow={row => addPiece(row.theme, row.pillarId, row.parentId)}
              canEditLine={canEditRec}
              onRowKey={onRowKey}
              rowDrag={rowDrag}
              onDelete={(row, anchor) => {
                if (row.kind === 'line') { if (canEditRec(row.rec)) askDelete(row.rec, row.rec.title, anchor); return }
                if (row.kind === 'piece' && canEdit(row.task)) { if (row.task.dropped_at) void restore(row.task); else setPopup({ kind: 'archive', anchor, task: row.task }) }
              }}
              onPaste={onPaste}
              pasteAsRows={pasteAsRows}
              onSkipped={onSkipped}
              onSelectPieces={(ids, word) => { bulkWord.current = word; setBulkIds(ids); setBulkHidden(false) }}
              linked={{
                drop: id => p.api.drop(id).then(r => { if (!r.success) say(t('notSaved', { reason: why(r.error) })); return r.success }),
                restore: id => p.api.restore(id).then(r => { if (!r.success) say(t('notSaved', { reason: why(r.error) })); return r.success }),
                insertRow: row => {
                  if (rowsOn && (row.kind === 'piece' || row.kind === 'line') && insertBeside(row, 'below')) return true
                  if (row.kind === 'pillar') addPiece(row.theme, row.pillar.id)
                  else if (row.kind === 'piece') addPiece(row.theme, row.task.pillar_id ?? null)
                  else if (row.kind === 'draft') addPiece(row.theme, row.pillarId, row.parentId)
                  else if (row.kind === 'add') addPiece(row.theme, row.pillarId, row.parentId)
                  else if (row.kind === 'line') addPiece(row.theme, row.rec.pillar_id, row.rec.parent_id)
                  else if (row.kind === 'group') return false
                  else addPiece(row.theme, null)
                  return true
                },
                heights: p.rowHeights,
                saveHeights: p.api.setRowHeights && sheetId === 'content' ? e => p.api.setRowHeights!('linked_content', e) : undefined,
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
      {popup?.kind === 'removePillar' && (
        <SheetPopover anchor={popup.anchor} label={t('pillar.remove')} onClose={closePopup}>
          <div className="fx-sheet-pop-form" data-remove-pillar-confirm="">
            <span>{t('pillar.removeConfirm', { name: popup.pillar.name, n: p.tasks.filter(x => x.pillar_id === popup.pillar.id).length })}</span>
            <span className="fx-sheet-pop-row">
              <button type="button" className="fx-sheet-btn" onClick={() => closePopup(true)}>{t('archive.cancel')}</button>
              <button type="button" className="fx-sheet-btn is-danger" data-autofocus="" onClick={() => void removePillar(popup.theme, popup.pillar)}>{t('pillar.removeOk')}</button>
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

      {popup?.kind === 'themeAdd' && (
        <SheetPopover anchor={popup.anchor} label={t('themes.addTitle')} onClose={closePopup}>
          <ThemeAdd names={popup.names} onCancel={() => closePopup(true)}
            onCreate={async name => { const r = await p.api.addSheetTheme!({ name, anchor: popup.at }); if (!r.success) return why(r.error); closePopup(true); say(t('theme.added')); return null }} />
        </SheetPopover>
      )}
      {popup?.kind === 'dest' && (
        <SheetPopover anchor={popup.anchor} label={popup.pillar ? t('pillar.remove') : t('themes.remove')} onClose={closePopup}>
          <DestinationPick
            title={popup.pillar ? t('rows.removePillar', { name: popup.pillar.name }) : t('rows.removeTheme', { name: popup.theme.name })}
            rows={popup.rows}
            options={[
              ...destinations(p.themes, { themeId: popup.theme.id, pillarId: popup.pillar?.id ?? null }, (k, v) => t(k as 'rows.noPillarIn', v)),
              // Spec 027: a theme's rows may go under "No theme".
              ...((p.tab || p.boardTasks) && !popup.pillar ? [{ key: `${TAB_ROWS_ID}:`, projectId: TAB_ROWS_ID, pillarId: null, label: t('noTheme') }] : []),
            ]}
            onCancel={() => closePopup(true)}
            onConfirm={async d => {
              const dest = d ? { projectId: d.projectId, pillarId: d.pillarId } : null
              const r = popup.pillar ? await p.api.removePillarTo!(popup.pillar.id, dest) : await p.api.removeSheetTheme!(popup.theme.id, dest)
              if (!r.success) return why(r.error)
              closePopup(true); say(popup.pillar ? t('pillar.removed') : t('themes.removed'))
              return null
            }} />
        </SheetPopover>
      )}
      {popup?.kind === 'delRow' && (
        <SheetPopover anchor={popup.anchor} label={t('rows.delete')} onClose={closePopup}>
          <DeleteRowPrompt name={popup.name} linked={popup.linked} children={popup.children} onCancel={() => closePopup(true)}
            onConfirm={async o => { const r = await p.api.deleteRow!(popup.rec.id, o); if (!r.success) return why(r.error); closePopup(true); say(t('rows.deleted')); return null }} />
        </SheetPopover>
      )}
      {popup?.kind === 'makeTask' && (() => {
        const parent = popup.rec.parent_id ? recs.find(r => r.id === popup.rec.parent_id) : null
        const parentOf = parent?.task_id ? p.tasks.find(x => x.id === parent.task_id) ?? null : null
        // Owner, 25 Nov 2026: no subtasks — only a video's child rows are tied to it (its clips).
        const parentTask = parentOf && parentOf.content_type_label === 'Video' && !parentOf.parent_task_id ? parentOf : null
        return (
          <SheetPopover anchor={popup.anchor} label={t('rows.makeTask')} onClose={closePopup}>
            <MakeTaskDialog title={popup.rec.title} spaces={(p.spaces ?? []).map(sp => ({ id: sp.id, name: sp.name }))} defaultSpaceId={p.space?.id ?? null}
              tasks={p.tasks} taken={new Set(recs.map(r => r.task_id).filter((x): x is string => !!x))} parentTask={parentTask} taskSpaces={p.taskSpaces ?? []}
              onCancel={() => closePopup(true)}
              onMake={async o => { const r = await p.api.makeTask!(popup.rec.id, o); if (!r.success) return why(r.error); closePopup(true); say(o.taskId ? t('rows.linked') : t('rows.taskMade')); return null }} />
          </SheetPopover>
        )
      })()}
      {popup?.kind === 'addExisting' && p.api.addExistingTasks && (
        <SheetPopover anchor={popup.anchor} label={t('rows.addExisting')} onClose={closePopup}>
          <LinkTaskPick tasks={p.tasks} taken={new Set(recs.map(r => r.task_id).filter((x): x is string => !!x))} onCancel={() => closePopup(true)}
            onPick={async id => { const r = await p.api.addExistingTasks!([id]); if (!r.success) return why(r.error); closePopup(true); say(t('rows.addedExisting')); return null }} />
        </SheetPopover>
      )}
      {popup?.kind === 'linkTask' && (
        <SheetPopover anchor={popup.anchor} label={t('rows.linkTask')} onClose={closePopup}>
          <LinkTaskPick tasks={p.tasks} taken={new Set(recs.map(r => r.task_id).filter((x): x is string => !!x))} onCancel={() => closePopup(true)}
            onPick={async id => { const r = await p.api.linkRowTask!(popup.rec.id, id); if (!r.success) return why(r.error); closePopup(true); say(t('rows.linked')); return null }} />
        </SheetPopover>
      )}

      {paste && (
        <PlanPreview
          ctx={ctx}
          columns={{ targets: cl.pasteNames, values: cl.pasteColumns, addColumn: cl.addTextColumn }}
          onAdd={(r, o) => p.api.addPlan(r, paste.target ? { ...o, target: { projectId: paste.target.theme.id, pillarId: paste.target.pillarId } } : o)}
          target={paste.target ? { themeName: paste.target.theme.name, pillarName: paste.target.theme.pillars.find(x => x.id === paste.target!.pillarId)?.name ?? null, lines: recs.filter(r => !r.task_id).map(r => ({ project_id: r.project_id ?? '', title: r.title })) } : null}
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
            cancel: t('bulk.cancel'), clear: t('bulk.clear'), setDue: t('bulk.setDue'), noPillar: t('bulk.noPillar'), pillarOff: t('bulk.pillarOff'), saving: t('bulk.saving'),
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
