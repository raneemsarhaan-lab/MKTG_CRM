'use client'

/**
 * A folder, open as a workbook (spec 013 US1–US8, contracts/ui.md §3, §5, §6):
 * breadcrumb and save status on top, the toolbar, the open sheet, and Excel's
 * tab bar along the bottom.
 *
 * The workbook owns each blank sheet's document, undo stack and outbox queue,
 * so switching tabs keeps them (FR-053), and every action follows one path:
 * apply on screen, push on the stack, queue for the server (R5, R6). The
 * linked tab is the board's own sheet, passed in by the page.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import Link from 'next/link'
import { useLocale, useTranslations } from 'next-intl'
import type { FolderSummary, SheetChanges, SheetDoc, SheetSummary, TabColor } from '@/types/index'
import { TAB_COLORS } from '@/types/index'
import type { BlankChange } from '@/lib/sheet-undo'
import { canRedo, canUndo, emptyStack, makeStep, push, redo, undo, type Stack } from '@/lib/sheet-undo'
import { BLANK_COL_LIMIT, BLANK_ROW_LIMIT, applyAll, growTo, toServer } from '@/lib/sheet-doc'
import { validateSheetName, SHEET_NAME_MAX } from '@/lib/sheet-names'
import type { SheetsApi } from './types'
import { useOutbox } from './useOutbox'
import { BlankSheet } from './BlankSheet'
import { TabBar } from './TabBar'
import { PopMenu, type PopItem } from './PopMenu'
import { ConfirmDialog, Modal, MoveCopyDialog, UnhideDialog } from './Dialogs'
import { HISTORY_EVENT, UNDO_EVENT } from '@/components/sheet/useLinkedEditing'
import { FORMAT_ASK, FORMAT_STATE, sendFormat, type FormatSource, type FormatState, type TipKey } from './format/bus'
import { AdvancedFilterDialog, CreateTableDialog, InsertSlicersDialog, RemoveDuplicatesDialog, TextToColumnsDialog } from './format/CleanupDialogs'
import { FindPanel, PasteSpecialDialog, readClipboard } from './format/EditTools'
import { ManageRulesDialog, RuleDialog, SortDialog } from './format/StyleTools'
import { LINKS_STATE, openLinks, replayTaskFields, type LinksState } from './links/useTaskLinks'
import { openFields } from './links/FieldsPanel'
import type { TaskFieldsChange } from '@/lib/sheet-undo'
import type { CellStyle, RuleKind } from '@/types/index'
import { FormatToolbar, formatShortcut } from './format/FormatToolbar'
import { FormatCellsDialog } from './format/FormatCellsDialog'
import { FormatSheet } from './format/FormatSheet'
import { SheetComments } from './comments/SheetComments'
import { LinkedFormatsContext } from './format/context'
import { cellName as blankCellName } from '@/lib/sheet-selection'
import type { Carry, SelStats } from './BlankSheet'
import { SERIES_OPEN } from './format/bus'
import { CustomListsDialog, DataValidationDialog, GoToDialog, GoToSpecialDialog, SeriesDialog } from './format/TipsDialogs'
import { loadFillLists, saveFillLists } from '@/actions/settings'
import type { FillList } from '@/lib/sheet-fill'
import { STATUS_EVENT, ZOOM_EVENT, tipsBus, zoomBus } from '@/components/sheet/GridCore'
import { LINKED_SPECIAL } from '@/components/sheet/useGridTips'

export interface WorkbookProps {
  api: SheetsApi
  folder: FolderSummary
  /** Every folder, for Move or Copy. */
  folders: FolderSummary[]
  initialSheets: SheetSummary[]
  me: { id: string; admin: boolean }
  /** Member names, for "Ask Rana or an admin". */
  names: Record<string, string>
  /** The board's sheet, for a linked folder's linked tab. */
  linked?: ReactNode
  initialSheetId?: string | null
  /** Spec 015: a notification's cell to open, `rowKey:colKey`. */
  initialCell?: string | null
}

type Dialog =
  | { kind: 'delete'; ids: string[] }
  | { kind: 'protect'; id: string }
  | { kind: 'moveCopy'; ids: string[] }
  | { kind: 'unhide' }
  | null

const lastKey = (folderId: string) => `momentum.sheets.last.${folderId}`
const byPos = (a: SheetSummary, b: SheetSummary) => a.position - b.position
const renumber = (list: SheetSummary[]) => list.map((s, i) => (s.position === i ? s : { ...s, position: i }))
const newId = () => crypto.randomUUID()

/** Spec 020 tip 38: Customize Status Bar's choices; Excel's defaults. */
type SbKey = 'avg' | 'count' | 'nums' | 'min' | 'max' | 'sum' | 'zoom'
const SB_DEFAULT: Record<SbKey, boolean> = { avg: true, count: true, nums: false, min: false, max: false, sum: true, zoom: true }
const SB_KEY = 'momentum.sheet.stats'

export function Workbook(p: WorkbookProps) {
  const t = useTranslations('sheets')
  const { api, folder } = p
  const [sheets, setSheets] = useState<SheetSummary[]>(() => [...p.initialSheets].sort(byPos))
  const visible = useMemo(() => sheets.filter(s => !s.hidden), [sheets])
  const hidden = useMemo(() => sheets.filter(s => s.hidden), [sheets])

  const [openId, setOpenId] = useState<string>(() => {
    const vis = p.initialSheets.filter(s => !s.hidden).sort(byPos)
    if (p.initialSheetId && vis.some(s => s.id === p.initialSheetId)) return p.initialSheetId
    return vis[0]?.id ?? ''
  })
  const openRef = useRef(openId)
  openRef.current = openId
  // The last tab used in this folder, on this device (FR-084).
  useEffect(() => {
    if (p.initialSheetId) return
    try {
      const last = localStorage.getItem(lastKey(folder.id))
      if (last && last !== openId && sheets.some(s => s.id === last && !s.hidden)) setOpenId(last)
    } catch { /* private mode */ }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { try { if (openId) localStorage.setItem(lastKey(folder.id), openId) } catch { /* private mode */ } }, [openId, folder.id])

  // ── documents and history ───────────────────────────────────────────────
  const [docs, setDocsState] = useState<Record<string, SheetDoc>>({})
  const docsRef = useRef(docs)
  const setDocs = (f: (d: Record<string, SheetDoc>) => Record<string, SheetDoc>) => { docsRef.current = f(docsRef.current); setDocsState(docsRef.current) }
  const [stacks, setStacksState] = useState<Record<string, Stack>>({})
  const stacksRef = useRef(stacks)
  const setStacks = (f: (d: Record<string, Stack>) => Record<string, Stack>) => { stacksRef.current = f(stacksRef.current); setStacksState(stacksRef.current) }
  const [loadError, setLoadError] = useState<Record<string, string>>({})
  const loading = useRef(new Set<string>())

  const [toast, setToast] = useState<string | null>(null)
  // Spec 020: a cleanup's note offers Undo, as the design's toasts do.
  const [toastUndo, setToastUndo] = useState(false)
  const toastTimer = useRef<number | undefined>(undefined)
  const say = useCallback((text: string, undo = false) => {
    setToast(text); setToastUndo(undo)
    window.clearTimeout(toastTimer.current)
    toastTimer.current = window.setTimeout(() => setToast(null), 6000)
  }, [])
  const errText = useCallback((e: string) => (t.has(`err.${e}`) ? t(`err.${e}`, { max: SHEET_NAME_MAX }) : t('err.generic')), [t])

  const [gone, setGone] = useState<string | null>(null)

  const reload = useCallback(async (id: string) => {
    const res = await api.loadSheet(id)
    if (!res.success) { if (res.error === 'gone') setGone(id); return }
    setDocs(d => ({ ...d, [id]: res.doc }))
    // What's on screen changed under the history: it starts again from here.
    setStacks(s => ({ ...s, [id]: emptyStack() }))
    setSheets(list => list.map(s => (s.id === id ? { ...s, ...res.sheet } : s)))
  }, [api])

  const outbox = useOutbox(api, {
    onRefused(id, error) {
      if (error === 'gone') { if (id === openRef.current) setGone(id); return }
      say(errText(error))
      void reload(id)
    },
    onSaved(id, res) {
      const pos = res.positions
      if (pos && (pos.rows?.length || pos.cols?.length)) {
        const rp = new Map(pos.rows?.map(r => [r.id, r.position]) ?? [])
        const cp = new Map(pos.cols?.map(c => [c.id, c.position]) ?? [])
        setDocs(d => {
          const doc = d[id]
          if (!doc) return d
          return { ...d, [id]: {
            ...doc,
            rows: rp.size ? doc.rows.map(r => (rp.has(r.id) ? { ...r, position: rp.get(r.id)! } : r)) : doc.rows,
            cols: cp.size ? doc.cols.map(c => (cp.has(c.id) ? { ...c, position: cp.get(c.id)! } : c)) : doc.cols,
          } }
        })
      }
      // A row or column someone else removed: show the sheet as it is now (FR-086).
      if (res.skipped.length) { say(t('grid.reason.gone', { n: res.skipped.length })); void reload(id) }
    },
  })

  const open = sheets.find(s => s.id === openId)
  const openBlank = open?.kind === 'blank'

  useEffect(() => {
    if (!open || !openBlank || docsRef.current[open.id] || loading.current.has(open.id)) return
    const id = open.id
    loading.current.add(id)
    void api.loadSheet(id).then(res => {
      loading.current.delete(id)
      if (res.success) { setDocs(d => ({ ...d, [id]: res.doc })); setLoadError(e => { const n = { ...e }; delete n[id]; return n }) }
      else if (res.error === 'gone') setGone(id)
      else setLoadError(e => ({ ...e, [id]: res.error }))
    })
  }, [open, openBlank, api])

  /** Spec 016: a doc change that isn't an undo step (values from the board). */
  const patchDoc = useCallback((id: string, fn: (d: SheetDoc) => SheetDoc) => setDocs(d => (d[id] ? { ...d, [id]: fn(d[id]) } : d)), [])
  /** Spec 016: undo and redo of mapped cells go back through the board's rules (R5). */
  const tl = useTranslations('sheets.links')
  function replayFields(id: string, changes: BlankChange[]) {
    for (const ch of changes) if (ch.kind === 'taskFields') void replayTaskFields(api, id, ch as TaskFieldsChange, fn => patchDoc(id, fn), say, (k, v) => tl(k, v))
  }
  const apply = useCallback((id: string, label: string, forward: BlankChange[]) => {
    if (!docsRef.current[id]) return
    setDocs(d => ({ ...d, [id]: applyAll(d[id], forward) }))
    setStacks(s => ({ ...s, [id]: push(s[id] ?? emptyStack(), makeStep(label, forward)) }))
    outbox.enqueue(id, toServer(forward))
  }, [outbox])

  const doUndo = useCallback(() => {
    const id = openRef.current
    const u = stacksRef.current[id] && undo(stacksRef.current[id])
    if (!u) return
    const back = u.step.backward as BlankChange[]
    setDocs(d => ({ ...d, [id]: applyAll(d[id], back) }))
    setStacks(s => ({ ...s, [id]: u.stack }))
    outbox.enqueue(id, toServer(back))
    replayFields(id, back)
  }, [outbox]) // eslint-disable-line react-hooks/exhaustive-deps
  const doRedo = useCallback(() => {
    const id = openRef.current
    const r = stacksRef.current[id] && redo(stacksRef.current[id])
    if (!r) return
    const fwd = r.step.forward as BlankChange[]
    setDocs(d => ({ ...d, [id]: applyAll(d[id], fwd) }))
    setStacks(s => ({ ...s, [id]: r.stack }))
    outbox.enqueue(id, toServer(fwd))
    replayFields(id, fwd)
  }, [outbox]) // eslint-disable-line react-hooks/exhaustive-deps

  // The linked tab's history, from its grid (it lives in the board's sheet, not here).
  const [linkedHist, setLinkedHist] = useState({ canUndo: false, canRedo: false })
  useEffect(() => {
    const on = (e: Event) => setLinkedHist((e as CustomEvent<{ canUndo: boolean; canRedo: boolean }>).detail)
    document.addEventListener(HISTORY_EVENT, on)
    return () => document.removeEventListener(HISTORY_EVENT, on)
  }, [])
  const linkedUndo = (dir: 'undo' | 'redo') => document.dispatchEvent(new CustomEvent(UNDO_EVENT, { detail: dir }))

  // ── spec 015: the format toolbar ────────────────────────────────────────
  const [fmt, setFmt] = useState<Partial<Record<FormatSource, FormatState>>>({})
  useEffect(() => {
    const on = (e: Event) => {
      const d = (e as CustomEvent<FormatState | { source: FormatSource; gone: true }>).detail
      setFmt(f => { const n = { ...f }; if ('gone' in d) delete n[d.source]; else n[d.source] = d; return n })
    }
    document.addEventListener(FORMAT_STATE, on)
    // A sheet may have announced itself before this listener was there (its effects run first).
    document.dispatchEvent(new Event(FORMAT_ASK))
    return () => document.removeEventListener(FORMAT_STATE, on)
  }, [])
  // Stage 2: Format Painter, Find and Replace, Paste Special.
  const [painter, setPainter] = useState<{ style: CellStyle | null; sticky: boolean } | null>(null)
  const painterRef = useRef(painter)
  painterRef.current = painter
  const [find, setFind] = useState<{ replace: boolean } | null>(null)
  const [pasteSpecial, setPasteSpecial] = useState(false)
  // Stage 3: Sort, New rule, Manage rules.
  const [styleDlg, setStyleDlg] = useState<{ k: 'sort' } | { k: 'rule'; kind?: RuleKind } | { k: 'rules' } | null>(null)
  const [commentsOpen, setCommentsOpen] = useState(false)
  // Spec 016: the Board ▾ menu, and what the open blank sheet can offer in it.
  const [boardMenu, setBoardMenu] = useState<{ x: number; y: number; el: HTMLElement } | null>(null)
  const [links, setLinks] = useState<LinksState | null>(null)
  useEffect(() => {
    const on = (e: Event) => setLinks((e as CustomEvent<LinksState | null>).detail)
    document.addEventListener(LINKS_STATE, on)
    return () => document.removeEventListener(LINKS_STATE, on)
  }, [])
  const [openThreads, setOpenThreads] = useState(0)
  // Format Painter: the next selection in the sheet takes the look (FR-040). Once, or until Esc after a double-click.
  useEffect(() => {
    if (!painter) return
    const up = (e: PointerEvent) => {
      const el = e.target as HTMLElement
      if (!el.closest('.fx-sh-panel [data-cell]')) return
      requestAnimationFrame(() => {
        const cur = painterRef.current
        if (!cur) return
        sendFormat(openRef.current && sheets.find(x => x.id === openRef.current)?.kind === 'blank' ? 'blank' : 'linked', { kind: 'paint', style: cur.style })
        if (!cur.sticky) setPainter(null)
      })
    }
    document.addEventListener('pointerup', up, true)
    return () => document.removeEventListener('pointerup', up, true)
  }, [painter, sheets])
  const initialCell = useMemo(() => {
    const c = p.initialCell
    if (!c) return null
    const i = c.lastIndexOf(':')
    return i > 0 ? { rowKey: c.slice(0, i), colKey: c.slice(i + 1) } : null
  }, [p.initialCell])
  const [formatCells, setFormatCells] = useState(false)
  const [phoneFormat, setPhoneFormat] = useState(false)
  const [phone, setPhone] = useState(false)
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 640px)')
    const on = () => setPhone(mq.matches)
    on()
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [])

  // ── toolbar state ───────────────────────────────────────────────────────
  /** Spec 018: where the title row ends on screen, so the comments panel opens below the Comments button. */
  const topRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = topRef.current
    if (!el) return
    const put = () => el.parentElement?.style.setProperty('--fx-sh-top-h', `${Math.max(0, Math.round(el.getBoundingClientRect().bottom))}px`)
    put()
    const ro = new ResizeObserver(put)
    ro.observe(el)
    window.addEventListener('scroll', put, true)
    return () => { ro.disconnect(); window.removeEventListener('scroll', put, true) }
  }, [])
  const [sel, setSel] = useState<{ cell: string; count: number; areas?: number; label?: string; more?: number; adding?: boolean; stats?: SelStats } | null>(null)
  // ── spec 020: zoom per sheet, the status bar's mode, the custom lists, the Go To / Series / Validation dialogs ──
  const tt = useTranslations('sheets.tips')
  const locale = useLocale()
  const [zooms, setZooms] = useState<Record<string, number>>({})
  const zoomKey = (id: string) => `momentum.sheet.zoom.${id}`
  useEffect(() => {
    if (!openId || zooms[openId] !== undefined) return
    let z = 1
    try { const v = Number(window.localStorage.getItem(zoomKey(openId))); if (v >= 0.5 && v <= 2) z = v } catch { /* private mode */ }
    setZooms(m => ({ ...m, [openId]: z }))
  }, [openId]) // eslint-disable-line react-hooks/exhaustive-deps
  const zoom = zooms[openId] ?? 1
  const setZoom = useCallback((z: number) => {
    const v = Math.round(Math.max(0.5, Math.min(2, z)) * 100) / 100
    const id = openRef.current
    setZooms(m => ({ ...m, [id]: v }))
    try { window.localStorage.setItem(zoomKey(id), String(v)) } catch { /* private mode */ }
  }, [])
  // The linked sheets live in the board's page: they hear the zoom by event (and ask for it with one).
  useEffect(() => {
    zoomBus.z = zoom; zoomBus.set = setZoom
    document.dispatchEvent(new CustomEvent(ZOOM_EVENT, { detail: { z: zoom } }))
  }, [zoom, openId, setZoom])
  const [statusMode, setStatusMode] = useState<string | null>(null)
  const [fillLists, setFillLists] = useState<{ lists: FillList[]; canEdit: boolean }>({ lists: [], canEdit: false })
  useEffect(() => { void loadFillLists().then(r => { if (r.success) setFillLists({ lists: r.lists, canEdit: r.canEdit }) }) }, [])
  const fillItems = useMemo(() => fillLists.lists.map(l => l.items), [fillLists.lists])
  // The Content and Video sheets read the lists here (they live in the board's page).
  useEffect(() => { tipsBus.lists = fillItems }, [fillItems])
  // Their status-bar news: the mode text and the selection's figures.
  const [linkedStats, setLinkedStats] = useState<(SelStats & { cells: number }) | null>(null)
  useEffect(() => {
    const on = (e: Event) => {
      const d = (e as CustomEvent<{ text?: string | null; stats?: SelStats & { cells: number } }>).detail
      if (d.text !== undefined) setStatusMode(d.text)
      if (d.stats) setLinkedStats(d.stats)
    }
    document.addEventListener(STATUS_EVENT, on)
    return () => document.removeEventListener(STATUS_EVENT, on)
  }, [])
  const [tip, setTipState] = useState<TipKey | null>(null)
  /** Dialogs that start from the block around the cell ask the sheet to work it out first (it isn't worked out on every key). */
  const setTip = (k: TipKey | null) => {
    if (k === 'createTable' || k === 'advanced' || k === 'dedupe') { sendFormat('blank', { kind: 'scope' }); requestAnimationFrame(() => requestAnimationFrame(() => setTipState(k))) }
    else setTipState(k)
  }
  const [recentRefs, setRecentRefs] = useState<string[]>([])
  useEffect(() => {
    const on = () => setTip('series')
    document.addEventListener(SERIES_OPEN, on)
    return () => document.removeEventListener(SERIES_OPEN, on)
  }, [])
  const [zoomMenu, setZoomMenu] = useState<{ x: number; y: number; el: HTMLElement } | null>(null)
  // Spec 020 tip 38: Customize Status Bar, as Excel: which numbers show, kept for this member (momentum.sheet.stats).
  const [sbMenu, setSbMenu] = useState<{ x: number; y: number; el: HTMLElement } | null>(null)
  const [sbShow, setSbShow] = useState<Record<SbKey, boolean>>(SB_DEFAULT)
  useEffect(() => {
    try { const v = JSON.parse(localStorage.getItem(SB_KEY) ?? 'null'); if (v && typeof v === 'object') setSbShow(x => ({ ...x, ...Object.fromEntries(Object.entries(v).filter(([k, b]) => k in SB_DEFAULT && typeof b === 'boolean')) })) } catch { /* private window: the defaults */ }
  }, [])
  const setSbShowKey = (k: SbKey) => setSbShow(x => { const n = { ...x, [k]: !x[k] }; try { localStorage.setItem(SB_KEY, JSON.stringify(n)) } catch { /* not kept */ } return n })
  /** Status-bar figures as the member reads numbers (at most 2 decimals, grouped). */
  const curStats = openBlank ? (sel && sel.count > 1 ? sel.stats ?? null : null) : (linkedStats && linkedStats.cells > 1 ? linkedStats : null)
  const fmtNum = (n: number) => new Intl.NumberFormat(locale.startsWith('ar') ? 'ar-EG' : 'en-GB', { maximumFractionDigits: 2 }).format(n)
  const [skip, setSkip] = useState<string | null>(null)
  const skipTimer = useRef<number | undefined>(undefined)
  const onSkipped = useCallback((s: Partial<Record<string, number>>) => {
    const parts = Object.entries(s).filter(([, n]) => n)
    const total = parts.reduce((a, [, n]) => a + (n ?? 0), 0)
    window.clearTimeout(skipTimer.current)
    if (!total) { setSkip(null); return }
    const reasons = parts.map(([k, n]) => (t.has(`grid.reason.${k}`) ? t(`grid.reason.${k}`, { n: n ?? 0 }) : t('grid.reason.invalid', { n: n ?? 0 })))
    setSkip(t('grid.skipped', { n: total, reasons: reasons.join(', ') }))
    skipTimer.current = window.setTimeout(() => setSkip(null), 10000)
  }, [t])
  useEffect(() => { setSel(null); setSkip(null); setStatusMode(null); setLinkedStats(null) }, [openId])

  // ── names ───────────────────────────────────────────────────────────────
  const folderName = folder.kind === 'content' ? t('folder.content') : folder.kind === 'video' ? t('folder.video') : folder.name ?? ''
  const nameOf = useCallback((s: SheetSummary) => (s.kind === 'linked_content' ? t('sheet.content') : s.kind === 'linked_video' ? t('sheet.video') : s.name ?? ''), [t])
  const pattern = t.raw('sheet.defaultName') as string

  // ── tabs ────────────────────────────────────────────────────────────────
  const [grouped, setGrouped] = useState<Set<string>>(() => new Set([openId]))
  const [renaming, setRenaming] = useState<string | null>(null)
  const [tabMenu, setTabMenu] = useState<{ at: { x: number; y: number }; items: PopItem[]; anchor: HTMLElement; attr: string; label: string } | null>(null)
  const [dialog, setDialog] = useState<Dialog>(null)
  const [otherSheets, setOtherSheets] = useState<Record<string, { id: string; name: string }[]>>({})
  const fetching = useRef(new Set<string>())

  const openSheet = useCallback((id: string) => {
    if (id === openRef.current) return
    void outbox.flush()
    setOpenId(id)
  }, [outbox])

  function onOpen(id: string, how: { ctrl: boolean; shift: boolean }) {
    if (how.ctrl) {
      // Ctrl/Cmd+click groups tabs (FR-059e); the open tab stays in the group.
      setGrouped(g => { const n = new Set(g); n.add(openRef.current); if (n.has(id) && id !== openRef.current) n.delete(id); else n.add(id); return n })
      return
    }
    if (how.shift) {
      const a = visible.findIndex(s => s.id === openRef.current), b = visible.findIndex(s => s.id === id)
      const [lo, hi] = a < b ? [a, b] : [b, a]
      setGrouped(new Set(visible.slice(lo, hi + 1).map(s => s.id)))
      return
    }
    setGrouped(new Set([id]))
    openSheet(id)
  }
  const targets = (id: string) => (grouped.has(id) && grouped.size > 1 ? visible.filter(s => grouped.has(s.id)).map(s => s.id) : [id])

  async function createSheet(where: { before?: string; after?: string }) {
    const res = await outbox.track(api.createSheet(folder.id, { ...where, pattern }))
    if (!res.success) { say(errText(res.error)); return }
    const made = res.sheet
    setSheets(list => {
      const vis = [...list].sort(byPos)
      let at = vis.length
      if (where.before) { const i = vis.findIndex(s => s.id === where.before); if (i >= 0) at = i }
      else if (where.after) { const i = vis.findIndex(s => s.id === where.after); if (i >= 0) at = i + 1 }
      return renumber([...vis.slice(0, at), made, ...vis.slice(at)])
    })
    setGrouped(new Set([made.id]))
    openSheet(made.id)
  }

  // Spec 020 tip 111: Alt+drag over a tab carries the block to that sheet; it's dropped there with the pointer.
  const [carry, setCarry] = useState<(Carry & { n: number; now?: boolean }) | null>(null)
  const carryRef = useRef(carry)
  carryRef.current = carry
  function startCarry(tab: string, c: Carry) {
    if (!visible.some(x => x.id === tab && x.kind === 'blank')) { say(tt('move.teamOnly')); return }
    setCarry({ ...c, n: Date.now() })
    setGrouped(new Set([tab]))
    openSheet(tab)
    // Let go before the sheet was ready: it lands where it was on its own sheet.
    const up = () => window.setTimeout(() => { const cur = carryRef.current; if (cur && !cur.now) setCarry({ ...cur, now: true }) }, 120)
    document.addEventListener('pointerup', up, { once: true })
  }
  /** The block landed (or the drag was cancelled): a move empties its old cells, one step on that sheet. */
  function endCarry(c: Carry | null) {
    setCarry(null)
    if (!c || c.copy || !docsRef.current[c.sheetId]) return
    const cells = c.cells.flat().filter(x => x.value).map(x => ({ rowId: x.rowId, colId: x.colId, before: x.value, after: '' }))
    const formats = c.cells.flat().filter(x => x.style).map(x => ({ rowKey: x.rowId, colKey: x.colId, before: x.style, after: null }))
    const forward: BlankChange[] = []
    if (cells.length) forward.push({ kind: 'cells', cells })
    if (formats.length) forward.push({ kind: 'formats', items: formats })
    if (forward.length) apply(c.sheetId, 'moveCells', forward)
  }

  /** Spec 020 tip 78: Advanced Filter › Copy to a new sheet: a sheet after this one, holding the rows. */
  async function newSheetWith(grid: string[][]) {
    const res = await outbox.track(api.createSheet(folder.id, { after: openRef.current, pattern }))
    if (!res.success) { say(errText(res.error)); return }
    const made = res.sheet
    const fresh = await api.loadSheet(made.id)
    if (!fresh.success) return
    const doc0 = fresh.doc
    const width = Math.max(1, ...grid.map(r => r.length))
    const rows = growTo(doc0.rows, grid.length - 1, BLANK_ROW_LIMIT, newId), cols = growTo(doc0.cols, width - 1, BLANK_COL_LIMIT, newId)
    const allRows = [...doc0.rows, ...rows], allCols = [...doc0.cols, ...cols]
    const forward: BlankChange[] = []
    if (rows.length) forward.push({ kind: 'insertRows', rows: rows.map(r => ({ ...r, height: null })) })
    if (cols.length) forward.push({ kind: 'insertCols', cols: cols.map(c => ({ ...c, width: null })) })
    const cells = grid.flatMap((line, i) => line.map((v, j) => ({ rowId: allRows[i]?.id ?? '', colId: allCols[j]?.id ?? '', before: '', after: v }))).filter(x => x.after && x.rowId && x.colId)
    if (cells.length) forward.push({ kind: 'cells', cells })
    setDocs(d => ({ ...d, [made.id]: doc0 }))
    setSheets(list => {
      const vis = [...list].sort(byPos)
      const i = vis.findIndex(x => x.id === openRef.current)
      return renumber([...vis.slice(0, i + 1), made, ...vis.slice(i + 1)])
    })
    if (forward.length) apply(made.id, 'advancedCopy', forward)
    setGrouped(new Set([made.id]))
    openSheet(made.id)
  }

  function onRename(id: string, raw: string | null): string | null {
    if (raw === null) { setRenaming(null); return null }
    const s = sheets.find(x => x.id === id)
    if (!s) { setRenaming(null); return null }
    if (raw.trim() === (s.name ?? '')) { setRenaming(null); return null }
    const v = validateSheetName(raw, sheets.filter(x => x.id !== id).map(x => x.name ?? ''))
    if (!v.ok) return errText(v.error)
    const before = s.name
    setSheets(list => list.map(x => (x.id === id ? { ...x, name: v.name } : x)))
    setRenaming(null)
    void outbox.track(api.renameSheet(id, v.name)).then(res => {
      if (res.success) return
      setSheets(list => list.map(x => (x.id === id ? { ...x, name: before } : x)))
      say(errText(res.error))
    })
    return null
  }

  async function deleteSheets(ids: string[]) {
    const prev = sheets
    const left = visible.filter(s => !ids.includes(s.id))
    if (ids.includes(openRef.current)) {
      const i = visible.findIndex(s => s.id === openRef.current)
      const next = left[Math.min(i, left.length - 1)]
      if (next) setOpenId(next.id)
    }
    setSheets(list => renumber(list.filter(s => !ids.includes(s.id))))
    setGrouped(new Set([left[0]?.id ?? '']))
    const res = await outbox.track(api.deleteSheets(ids))
    if (!res.success) { setSheets(prev); say(errText(res.error)) }
  }

  async function hideSheets(ids: string[]) {
    const prev = sheets
    const left = visible.filter(s => !ids.includes(s.id))
    if (ids.includes(openRef.current) && left[0]) {
      const i = visible.findIndex(s => s.id === openRef.current)
      openSheet(left[Math.min(i, left.length - 1)].id)
    }
    setSheets(list => list.map(s => (ids.includes(s.id) ? { ...s, hidden: true } : s)))
    setGrouped(new Set([openRef.current]))
    const res = await outbox.track(api.hideSheets(ids, true))
    if (!res.success) { setSheets(prev); say(errText(res.error)) }
  }
  async function unhide(id: string) {
    setSheets(list => list.map(s => (s.id === id ? { ...s, hidden: false } : s)))
    openSheet(id)
    const res = await outbox.track(api.hideSheets([id], false))
    if (!res.success) { setSheets(list => list.map(s => (s.id === id ? { ...s, hidden: true } : s))); say(errText(res.error)) }
  }
  async function color(ids: string[], c: TabColor | null) {
    const prev = sheets
    setSheets(list => list.map(s => (ids.includes(s.id) ? { ...s, color: c } : s)))
    const res = await outbox.track(api.colorSheets(ids, c))
    if (!res.success) { setSheets(prev); say(errText(res.error)) }
  }
  async function protect(id: string, on: boolean) {
    const res = await outbox.track(api.protectSheet(id, on))
    if (!res.success) { say(errText(res.error)); return }
    setSheets(list => list.map(s => (s.id === id ? { ...s, protectedBy: res.protectedBy } : s)))
  }
  async function refreshSheets() {
    const res = await api.listSheets(folder.id)
    if (res.success) setSheets([...res.sheets].sort(byPos))
    return res.success ? res.sheets : null
  }
  async function moveCopy(ids: string[], to: string, beforeId: string | null, copy: boolean) {
    const res = await outbox.track(api.moveSheets(ids, to, beforeId, copy, { pattern }))
    if (!res.success) { say(errText(res.error)); return }
    setOtherSheets({})
    fetching.current.clear()
    await outbox.flush()
    const list = await refreshSheets()
    if (!list) return
    if (copy && to === folder.id && res.sheets[0]) { setGrouped(new Set([res.sheets[0].id])); openSheet(res.sheets[0].id); return }
    if (!list.some(s => s.id === openRef.current && !s.hidden)) {
      const first = list.filter(s => !s.hidden).sort(byPos)[0]
      if (first) { setGrouped(new Set([first.id])); setOpenId(first.id) }
    }
  }
  async function onDrop(id: string, beforeId: string | null, copy: boolean) {
    if (copy) { await moveCopy([id], folder.id, beforeId, true); return }
    const prev = sheets
    const all = [...sheets].sort(byPos).filter(s => s.id !== id)
    const moving = sheets.find(s => s.id === id)
    if (!moving) return
    const at = beforeId ? all.findIndex(s => s.id === beforeId) : all.length
    const next = renumber([...all.slice(0, at < 0 ? all.length : at), moving, ...all.slice(at < 0 ? all.length : at)])
    setSheets(next)
    const res = await outbox.track(api.reorderSheets(folder.id, next.map(s => s.id)))
    if (!res.success) { setSheets(prev); say(errText(res.error)) }
  }

  const mayUnprotect = (s: SheetSummary) => !s.protectedBy || s.protectedBy === p.me.id || p.me.admin

  function tabMenuFor(id: string, at: { x: number; y: number }, anchor: HTMLElement) {
    const s = sheets.find(x => x.id === id)
    if (!s) return
    if (!grouped.has(id)) { setGrouped(new Set([id])); if (id !== openRef.current) openSheet(id) }
    const ids = grouped.has(id) ? targets(id) : [id]
    const list = sheets.filter(x => ids.includes(x.id))
    const anyLinked = list.some(x => x.kind !== 'blank')
    const wouldEmpty = visible.filter(x => !ids.includes(x.id)).length === 0
    const lockedByOther = list.some(x => !mayUnprotect(x))
    const no = (why: string) => ({ disabled: true, why })
    const del = anyLinked ? no(t('tabMenu.why.linked')) : wouldEmpty ? no(t('tabMenu.why.lastVisible')) : lockedByOther ? no(t('err.protected')) : {}
    const hide = anyLinked ? no(t('tabMenu.why.linked')) : wouldEmpty ? no(t('tabMenu.why.lastVisible')) : {}
    const single = ids.length === 1
    const swatches = (
      <div className="fx-sh-swatches" role="group" aria-label={t('tabMenu.color')}>
        <span className="fx-sh-swatches-lbl">{t('tabMenu.color')}</span>
        <div className="fx-sh-swatch-row">
          {TAB_COLORS.map(c => (
            <button key={c} type="button" role="menuitemradio" tabIndex={-1} aria-checked={list.every(x => x.color === c)}
                    data-tab-color={c} aria-label={t(`tabMenu.colors.${c}`)} title={t(`tabMenu.colors.${c}`)}
                    style={{ background: `var(--sh-${c})` }}
                    onClick={() => { setTabMenu(null); void color(ids, c) }}
                    onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setTabMenu(null); void color(ids, c) } }} />
          ))}
        </div>
        <button type="button" role="menuitemradio" tabIndex={-1} aria-checked={list.every(x => !x.color)} data-tab-color="none" className="fx-sh-nocolor"
                onClick={() => { setTabMenu(null); void color(ids, null) }}
                onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setTabMenu(null); void color(ids, null) } }}>
          {t('tabMenu.noColor')}
        </button>
      </div>
    )
    const protectItem: PopItem = s.protectedBy
      ? { key: 'unprotect', label: t('tabMenu.unprotect'), ...(single && mayUnprotect(s) ? {} : no(t('tabMenu.why.notProtector'))), onSelect: () => void protect(id, false) }
      : { key: 'protect', label: t('tabMenu.protect'), ...(s.kind !== 'blank' ? no(t('tabMenu.why.linked')) : !single ? { disabled: true } : {}), onSelect: () => setDialog({ kind: 'protect', id }) }
    const items: PopItem[] = [
      // Spec 020 stage C: File › Print (the open sheet).
      ...(id === openId ? [{ key: 'print', label: `${tt('print.title')}…`, kbd: 'Ctrl+P', onSelect: () => sendFormat(open?.kind === 'blank' ? 'blank' : 'linked', { kind: 'print' }) } as PopItem, { kind: 'sep', key: 'sp' } as PopItem] : []),
      { key: 'insert', label: t('tabMenu.insert'), onSelect: () => void createSheet({ before: id }) },
      { key: 'delete', label: t('tabMenu.delete'), danger: true, ...del, onSelect: () => setDialog({ kind: 'delete', ids }) },
      { key: 'rename', label: t('tabMenu.rename'), kbd: 'F2', ...(s.kind !== 'blank' ? no(t('tabMenu.why.linked')) : !single ? { disabled: true } : {}), onSelect: () => setRenaming(id) },
      { key: 'moveCopy', label: t('tabMenu.moveCopy'), onSelect: () => setDialog({ kind: 'moveCopy', ids }) },
      protectItem,
      { kind: 'node', key: 'color', node: swatches },
      { kind: 'sep', key: 's1' },
      { key: 'hide', label: t('tabMenu.hide'), ...hide, onSelect: () => void hideSheets(ids) },
      { key: 'unhide', label: t('tabMenu.unhide'), ...(hidden.length ? {} : no(t('tabMenu.why.noHidden'))), onSelect: () => setDialog({ kind: 'unhide' }) },
      { kind: 'sep', key: 's2' },
      { key: 'selectAll', label: t('tabMenu.selectAll'), onSelect: () => setGrouped(new Set(visible.map(x => x.id))) },
    ]
    setTabMenu({ at, items, anchor, attr: 'data-tab-menu', label: t('tabMenu.label') })
  }

  function allSheetsMenu(anchor: HTMLElement) {
    const b = anchor.getBoundingClientRect()
    setTabMenu({
      at: { x: b.left, y: b.top - 4 }, anchor, attr: 'data-all-menu', label: t('tabs.all'),
      items: visible.map(s => ({ key: s.id, label: nameOf(s), checked: s.id === openId, onSelect: () => onOpen(s.id, { ctrl: false, shift: false }) })),
    })
  }

  // Ctrl+Page Up/Down switches sheets; Shift+F11 adds one (FR-054).
  function onKeyDownCapture(e: React.KeyboardEvent) {
    const ctrl = e.ctrlKey || e.metaKey
    // Spec 015: Ctrl+B, I, U, 5, Ctrl+Shift+$ % # !, Ctrl+1, Ctrl+Alt+M on the grid (not while typing in a cell).
    const el = e.target as HTMLElement
    if (e.key === 'Escape' && painterRef.current) { setPainter(null); return }
    if (ctrl && el.closest('.fx-sh-panel') && !el.closest('input, textarea, select, [contenteditable="true"]')) {
      const target: FormatSource = open?.kind === 'blank' ? 'blank' : 'linked'
      if (formatShortcut(e, target, fmt[target] ?? null, () => setFormatCells(true))) { e.preventDefault(); e.stopPropagation(); return }
      // Stage 2: Paste Special, Fill Down and Right, Find and Replace (FR-003).
      const k = e.key.toLowerCase()
      const stop = () => { e.preventDefault(); e.stopPropagation() }
      // Spec 020 stage C: Ctrl+P, File › Print (the sheet's own print, not the browser's page).
      if (!e.shiftKey && !e.altKey && (k === 'p' || e.code === 'KeyP')) { stop(); sendFormat(target, { kind: 'print' }); return }
      // Ctrl+Shift+V, and Excel's Ctrl+Alt+V (spec 020 stage C), open Paste Special.
      if (((e.shiftKey && !e.altKey) || (e.altKey && !e.shiftKey)) && (k === 'v' || e.code === 'KeyV')) { stop(); if ((fmt[target]?.areas ?? 1) > 1) say(t('areas.oneArea')); else setPasteSpecial(true); return }
      if (!e.shiftKey && !e.altKey && (k === 'd' || k === 'r')) { stop(); sendFormat(target, { kind: 'fill', dir: k === 'd' ? 'down' : 'right' }); return }
      if (!e.shiftKey && !e.altKey && (k === 'f' || k === 'h')) { stop(); setFind({ replace: k === 'h' }); return }
      // Stage 3: Filter on and off (FR-046).
      if (e.shiftKey && !e.altKey && k === 'l') { stop(); sendFormat(target, { kind: 'filter', op: 'toggle' }); return }
      // Spec 020: Ctrl+G, Go To.
      if (!e.shiftKey && !e.altKey && k === 'g') { stop(); setTip('goto'); return }
      // Spec 020 tip 71: Ctrl+T (and Ctrl+L, which browsers leave to the page) creates a table (team sheets).
      if (!e.shiftKey && !e.altKey && (k === 't' || k === 'l') && open?.kind === 'blank') { stop(); if (fmt.blank?.tableInfo) say(tt('table.already')); else setTip('createTable'); return }
    }
    // Spec 020 tip 80: Shift+Alt+→ groups, Shift+Alt+← ungroups (team sheets).
    if (e.shiftKey && e.altKey && !ctrl && (e.key === 'ArrowRight' || e.key === 'ArrowLeft') && open?.kind === 'blank' && el.closest('.fx-sh-panel') && !el.closest('input, textarea, select')) {
      e.preventDefault(); e.stopPropagation()
      const rtl = getComputedStyle(el).direction === 'rtl'
      const right = e.key === 'ArrowRight' ? !rtl : rtl
      sendFormat('blank', { kind: 'outline', op: right ? 'group' : 'ungroup' })
      return
    }
    // Spec 020: F5, Go To (instead of the browser's reload while the grid has focus).
    if (e.key === 'F5' && !ctrl && el.closest('.fx-sh-panel') && !el.closest('input, textarea, select')) {
      e.preventDefault(); e.stopPropagation()
      setTip('goto')
      return
    }
    if (ctrl && (e.key === 'PageDown' || e.key === 'PageUp')) {
      e.preventDefault(); e.stopPropagation()
      const i = visible.findIndex(s => s.id === openRef.current)
      const next = visible[i + (e.key === 'PageDown' ? 1 : -1)]
      if (next) { setGrouped(new Set([next.id])); openSheet(next.id) }
      return
    }
    if (e.key === 'F11' && e.shiftKey) { e.preventDefault(); e.stopPropagation(); void createSheet({ after: openRef.current }) }
  }

  // Someone deleted the open sheet: copy what is on screen into a new one (FR-087).
  async function copyGone(id: string) {
    const doc = docsRef.current[id]
    setGone(null)
    setSheets(list => renumber(list.filter(s => s.id !== id)))
    const res = await outbox.track(api.createSheet(folder.id, { pattern }))
    if (!res.success) { say(errText(res.error)); return }
    const made = res.sheet
    if (doc) {
      const fresh = await api.loadSheet(made.id)
      if (fresh.success) {
        const rowMap = new Map(doc.rows.map(r => [r.id, newId()]))
        const colMap = new Map(doc.cols.map(c => [c.id, newId()]))
        const ch: SheetChanges = {
          deleteRows: fresh.doc.rows.map(r => r.id), deleteCols: fresh.doc.cols.map(c => c.id),
          insertRows: doc.rows.map(r => ({ id: rowMap.get(r.id)!, position: r.position, height: r.height })),
          insertCols: doc.cols.map(c => ({ id: colMap.get(c.id)!, position: c.position, width: c.width })),
          cells: Object.entries(doc.cells).flatMap(([rid, row]) => Object.entries(row).map(([cid, value]) => ({ rowId: rowMap.get(rid)!, colId: colMap.get(cid)!, value }))),
        }
        outbox.enqueue(made.id, ch)
        await outbox.flush()
      }
    }
    await refreshSheets()
    setGrouped(new Set([made.id]))
    setOpenId(made.id)
  }
  function closeGone(id: string) {
    setGone(null)
    const left = visible.filter(s => s.id !== id)
    setSheets(list => renumber(list.filter(s => s.id !== id)))
    if (left[0]) { setGrouped(new Set([left[0].id])); setOpenId(left[0].id) }
  }

  // ── render ──────────────────────────────────────────────────────────────
  const fmtTarget: FormatSource = openBlank ? 'blank' : 'linked'
  const fmtState = fmt[fmtTarget] ?? null
  const doc = open && openBlank ? docs[open.id] : undefined
  const stack = stacks[openId]
  const readOnly = open?.protectedBy && open.protectedBy !== p.me.id && !p.me.admin
    ? t('protect.blocked', { name: p.names[open.protectedBy] ?? '…' })
    : null
  const status = outbox.status
  const linkedFolder = folder.kind !== 'team'
  const statusText = status === 'retrying' ? t('status.retrying', { n: outbox.pending }) : status === 'saving' ? t('status.saving') : t('status.saved')
  const dialogSheet = (id: string) => sheets.find(s => s.id === id)

  // Spec 019: ⚙ Fields on team sheets and (stage 2) the Content sheet.
  const fieldsHere = (openBlank && !!doc) || open?.kind === 'linked_content' || open?.kind === 'linked_video'
  // Spec 018: on a computer these sit in the title row; on a phone, in the tools row as before.
  const headTools = (
    <>
      {readOnly && <span className="fx-sh-lock" data-readonly="">🔒 {readOnly}{doc?.extras?.formats.some(f => f.style.unlocked) ? ` ${tt('protect.inputsOpen')}` : ''}</span>}
      {skip && <span className="fx-sh-skip" data-skip-note="" role="status">{skip}</span>}
      {fieldsHere && (
        <button type="button" className="fx-sh-ib is-text" data-fields-btn="" title={t('fields.title')} onClick={() => openFields()}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0" /><circle cx="16" cy="6" r="2" /><circle cx="10" cy="12" r="2" /><circle cx="18" cy="18" r="2" /></svg>
          <span className={phone ? 'sr-only' : undefined}>{t('fields.button')}</span>
        </button>
      )}
      {openBlank && doc && (
        <button type="button" className="fx-sh-ib is-text" data-board-menu="" aria-haspopup="menu" aria-expanded={!!boardMenu}
                title={tl('boardTip')} onClick={ev => { const el = ev.currentTarget, r = el.getBoundingClientRect(), x = getComputedStyle(el).direction === 'rtl' ? r.left : r.right; setBoardMenu(m => (m ? null : { x, y: r.bottom + 4, el })) }}>
          {tl('board')} <span aria-hidden="true">▾</span>
        </button>
      )}
      <button type="button" className="fx-sh-ib is-text fx-cmt-btn" data-comments-btn="" aria-pressed={commentsOpen}
              title={t('comments.button', { n: openThreads })} onClick={() => setCommentsOpen(v => !v)}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" aria-hidden="true"><path d="M4 5h16v11H9l-5 4z" /></svg>
        <span className={phone ? 'sr-only' : undefined}>{t('comments.title')}</span>
        {openThreads > 0 && <span className="fx-cmt-badge">{openThreads}</span>}
      </button>
    </>
  )
  return (
    <div className="fx-sh-workbook" data-workbook={folder.id} onKeyDownCapture={onKeyDownCapture}>
      <div className="fx-sh-top" ref={topRef}>
        <nav className="fx-sh-crumbs" aria-label={t('crumb')} data-crumb="">
          <Link href="/sheets">{t('crumb')}</Link>
          <span aria-hidden="true">›</span>
          <h1>{folderName}</h1>
          {linkedFolder && <span className="fx-sh-linked">🔗 {t('home.linkedBadge')}</span>}
        </nav>
        <span className={`fx-sh-status is-${status}`} data-save-status={status} role="status" aria-live="polite"
              title={status === 'retrying' ? t('status.offline') : undefined}>{statusText}</span>
        {!phone && <div className="fx-sh-top-tools">{headTools}</div>}
      </div>
      {phone && <div className="fx-sh-tools" role="toolbar" aria-label={folderName}>
        <button type="button" className="fx-sh-ib" data-undo="" aria-label={t('toolbar.undoKey')} title={t('toolbar.undoKey')}
                disabled={openBlank ? !stack || !canUndo(stack) : !linkedHist.canUndo}
                onClick={() => (openBlank ? doUndo() : linkedUndo('undo'))}>↶</button>
        <button type="button" className="fx-sh-ib" data-redo="" aria-label={t('toolbar.redoKey')} title={t('toolbar.redoKey')}
                disabled={openBlank ? !stack || !canRedo(stack) : !linkedHist.canRedo}
                onClick={() => (openBlank ? doRedo() : linkedUndo('redo'))}>↷</button>
        <span className="fx-sh-sep" aria-hidden="true" />
        <span className="fx-sh-lbl" data-selection="" aria-live="polite">
          {openBlank
            ? (sel
              ? <>
                  {(sel.areas ?? 1) > 1
                    // Spec 017 FR-008: "B2, E5, B8:D9 +2 more · 5 areas, 14 cells".
                    ? t('areas.status', { label: sel.more ? `${sel.label} ${t('areas.more', { n: sel.more })}` : sel.label ?? sel.cell, n: sel.areas ?? 1, count: sel.count })
                    : sel.count > 1 ? t('grid.activeRange', { cell: sel.cell, n: sel.count }) : t('grid.active', { cell: sel.cell })}
                  {sel.adding && <span className="fx-sh-adding" data-add-mode="">{t('areas.adding')}</span>}
                </>
              : t('toolbar.blankHint'))
            : t('toolbar.linkedHint')}
        </span>
        {headTools}
        {fmtState && (
          <button type="button" className="fx-sh-ib is-text" data-format-open="" aria-expanded={phoneFormat} onClick={() => setPhoneFormat(v => !v)}>{t('format.phone.open')}</button>
        )}
      </div>}
      {!phone && open && (!openBlank || doc) && (
        <FormatToolbar state={fmtState} target={fmtTarget} onFormatCells={() => setFormatCells(true)}
          painter={!!painter}
          onPainter={sticky => setPainter(pt => (pt && !sticky ? null : { style: fmtState?.style ?? null, sticky }))}
          onPaste={async mode => {
            const clip = await readClipboard()
            if (!clip || !clip.grid.length) { say(t('format.edit.noClip')); return }
            sendFormat(fmtTarget, { kind: 'pasteSpecial', mode, transpose: false, grid: clip.grid, styles: clip.styles })
          }}
          onPasteSpecial={() => setPasteSpecial(true)}
          onFind={replace => setFind({ replace })}
          onRule={kind => setStyleDlg({ k: 'rule', kind })} onManageRules={() => setStyleDlg({ k: 'rules' })} onSortDialog={() => setStyleDlg({ k: 'sort' })}
          onUndo={() => (openBlank ? doUndo() : linkedUndo('undo'))} onRedo={() => (openBlank ? doRedo() : linkedUndo('redo'))}
          canUndo={openBlank ? !!stack && canUndo(stack) : linkedHist.canUndo} canRedo={openBlank ? !!stack && canRedo(stack) : linkedHist.canRedo}
          onFileMenu={(el, at) => { if (openId) tabMenuFor(openId, at, el) }}
          onBoardMenu={openBlank && doc ? (el, at) => setBoardMenu({ x: at.x, y: at.y, el }) : undefined}
          onFields={fieldsHere ? () => openFields() : undefined}
          onTip={k => setTip(k)} />
      )}
      {painter && <p className="fx-painter-note" role="status" data-painter-on="">{t(painter.sticky ? 'format.edit.painterOn' : 'format.edit.painterOnce')}</p>}

      <div className={`fx-sh-panel${painter ? ' is-painting' : ''}`} id="fx-sh-panel" role="tabpanel" aria-labelledby={openId ? `sheet-tab-${openId}` : undefined}>
        {p.linked && <div className="fx-sh-linkedpane" hidden={openBlank} data-linked-pane=""><LinkedFormatsContext.Provider value={api}>{p.linked}</LinkedFormatsContext.Provider></div>}
        {openBlank && (doc
          ? <BlankSheet key={doc.id} doc={doc} name={nameOf(open)} readOnly={readOnly}
                        apply={(label, ch) => apply(doc.id, label, ch)} onUndo={doUndo} onRedo={doRedo}
                        onSelect={setSel} onSkipped={onSkipped} onNotice={say} newId={newId} onNewSheet={grid => void newSheetWith(grid)}
                        carry={carry} onCarry={startCarry} onCarryDone={endCarry}
                        links={api} patch={fn => patchDoc(doc.id, fn)}
                        fillLists={fillItems} zoom={zoom} onZoom={setZoom} canRedo={!!stack && canRedo(stack)} onStatus={setStatusMode} />
          : loadError[openId]
            ? <div className="fx-sh-empty" role="alert">{errText(loadError[openId])}</div>
            : <div className="fx-sh-skeleton" data-sheet-loading="" aria-busy="true" />)}
      </div>

      <TabBar
        sheets={visible}
        openId={openId}
        grouped={grouped}
        renaming={renaming}
        label={t('tabs.label', { folder: folderName })}
        nameOf={nameOf}
        onOpen={onOpen}
        onNew={() => void createSheet({ after: openId })}
        onAll={allSheetsMenu}
        onMenu={tabMenuFor}
        onRenameStart={id => { const s = sheets.find(x => x.id === id); if (s?.kind === 'blank') setRenaming(id) }}
        onRename={onRename}
        onDrop={(id, before, copy) => void onDrop(id, before, copy)}
      />

      {/* Spec 020: Excel's status bar: the mode, Average / Count / Sum of the selection, and the zoom. */}
      <div className="fx-sh-statusbar" data-statusbar="" onContextMenu={ev => { ev.preventDefault(); setSbMenu({ x: ev.clientX, y: ev.clientY, el: ev.currentTarget }) }}>
        <span className="fx-sb-mode" role="status" aria-live="polite" data-sb-mode="">
          <i aria-hidden="true" className="fx-sb-dot" />{statusMode ?? (sel?.adding ? t('areas.adding') : tt('ready'))}
        </span>
        <span className="fx-sb-sp" />
        {(() => {
          // Blank sheets report through onSelect; the Content and Video sheets through STATUS_EVENT.
          const st = curStats
          if (!st || st.count === 0) return null
          return (
            <span className="fx-sb-stats" data-sb-stats="">
              {sbShow.avg && st.nums > 0 && <span className="fx-sb-chip" data-sb-avg="">{tt('avg')} <b>{fmtNum(st.avg ?? 0)}</b></span>}
              {sbShow.count && <span className="fx-sb-chip" data-sb-count="">{tt('count')} <b>{st.count}</b></span>}
              {sbShow.nums && <span className="fx-sb-chip" data-sb-nums="">{tt('sb.numsShort')} <b>{st.nums}</b></span>}
              {sbShow.min && st.nums > 0 && st.min !== null && <span className="fx-sb-chip" data-sb-min="">{tt('sb.minShort')} <b>{fmtNum(st.min)}</b></span>}
              {sbShow.max && st.nums > 0 && st.max !== null && <span className="fx-sb-chip" data-sb-max="">{tt('sb.maxShort')} <b>{fmtNum(st.max)}</b></span>}
              {sbShow.sum && st.nums > 0 && <span className="fx-sb-chip" data-sb-sum="">{tt('sum')} <b>{fmtNum(st.sum)}</b></span>}
            </span>
          )
        })()}
        {!phone && sbShow.zoom && (
          <span className="fx-sb-zoom" data-sb-zoom="">
            <button type="button" className="fx-sb-zb" data-zoom-out="" aria-label={tt('zoomOut')} title={tt('zoomOut')} disabled={zoom <= 0.5} onClick={() => setZoom(zoom - 0.1)}>−</button>
            <input type="range" min={50} max={200} step={10} value={Math.round(zoom * 100)} aria-label={tt('zoom')} data-zoom-slider=""
                   onChange={e => setZoom(Number(e.target.value) / 100)} />
            <button type="button" className="fx-sb-zb" data-zoom-in="" aria-label={tt('zoomIn')} title={tt('zoomIn')} disabled={zoom >= 2} onClick={() => setZoom(zoom + 0.1)}>+</button>
            <button type="button" className="fx-sb-pct" data-zoom-pct="" aria-haspopup="menu" title={tt('zoomMenu')}
                    onClick={ev => { const el = ev.currentTarget, r = el.getBoundingClientRect(); setZoomMenu({ x: getComputedStyle(el).direction === 'rtl' ? r.left : r.right - 120, y: r.top - 8, el }) }}>{Math.round(zoom * 100)}%</button>
          </span>
        )}
        <button type="button" className="fx-sb-more" data-sb-customize="" aria-haspopup="menu" aria-label={tt('sb.title')} title={tt('sb.title')}
                onClick={ev => { const el = ev.currentTarget, r = el.getBoundingClientRect(); setSbMenu({ x: getComputedStyle(el).direction === 'rtl' ? r.left : r.right - 260, y: r.top - 8, el }) }}>⋯</button>
      </div>
      {sbMenu && (
        <PopMenu at={{ x: sbMenu.x, y: sbMenu.y }} label={tt('sb.title')} attr="data-sb-menu" returnTo={sbMenu.el} onClose={() => setSbMenu(null)}
          items={[
            { kind: 'node', key: 'h', node: <div role="presentation" className="fx-st-h">{tt('sb.title')}</div> },
            ...(['avg', 'count', 'nums', 'min', 'max', 'sum'] as const).map(k => {
              const st = curStats, v = !st ? '' : k === 'avg' ? (st.nums ? fmtNum(st.avg ?? 0) : '') : k === 'count' ? String(st.count) : k === 'nums' ? String(st.nums) : k === 'sum' ? (st.nums ? fmtNum(st.sum) : '') : (st[k] !== null && st.nums ? fmtNum(st[k]!) : '')
              return { key: k, label: tt(`sb.${k}`), kbd: v || undefined, checked: sbShow[k], onSelect: () => setSbShowKey(k) }
            }),
            { kind: 'sep', key: 's' },
            { key: 'zoom', label: tt('sb.zoom'), checked: sbShow.zoom, onSelect: () => setSbShowKey('zoom') },
          ]} />
      )}
      {zoomMenu && (
        <PopMenu at={{ x: zoomMenu.x, y: zoomMenu.y }} label={tt('zoom')} attr="data-zoom-menu" returnTo={zoomMenu.el} onClose={() => setZoomMenu(null)}
          items={[200, 150, 125, 100, 75, 50].map(n => ({ key: String(n), label: `${n}%`, checked: Math.round(zoom * 100) === n, onSelect: () => setZoom(n / 100) }))} />
      )}

      {open && (
        <SheetComments
          sheetRef={openBlank ? open.id : open.kind === 'linked_video' ? 'linked_video' : 'linked_content'}
          source={fmtTarget}
          state={fmtState}
          names={p.names}
          me={p.me}
          panelOpen={commentsOpen}
          setPanelOpen={setCommentsOpen}
          initialCell={initialCell && open.id === p.initialSheetId ? initialCell : null}
          live={openBlank && doc ? (r, c) => doc.rows.some(x => x.id === r) && doc.cols.some(x => x.id === c) : undefined}
          cellName={(r, c) => {
            if (openBlank && doc) {
              const ri = doc.rows.findIndex(x => x.id === r), ci = doc.cols.findIndex(x => x.id === c)
              return ri >= 0 && ci >= 0 ? blankCellName(ri, ci) : null
            }
            const title = document.querySelector<HTMLElement>(`[data-linked-pane] .fx-sheet-tr[data-task="${CSS.escape(r)}"] [data-col="title"]`)?.innerText.trim()
            const head = document.querySelector<HTMLElement>(`[data-linked-pane] [data-col-head="${CSS.escape(c)}"]`)?.innerText.trim()
            return title ? `${title}${head ? ` · ${head}` : ''}` : null
          }}
          phone={phone}
          say={say}
          onCount={setOpenThreads}
        />
      )}
      {find && <FindPanel target={fmtTarget} replace={find.replace} onClose={() => setFind(null)} />}
      {pasteSpecial && <PasteSpecialDialog target={fmtTarget} say={say} onClose={() => setPasteSpecial(false)} />}
      {styleDlg?.k === 'sort' && fmtState && <SortDialog state={fmtState} target={fmtTarget} onClose={() => setStyleDlg(null)} />}
      {styleDlg?.k === 'rule' && fmtState && <RuleDialog state={fmtState} target={fmtTarget} start={styleDlg.kind} onClose={() => setStyleDlg(null)} />}
      {styleDlg?.k === 'rules' && fmtState && <ManageRulesDialog state={fmtState} target={fmtTarget} onNew={() => setStyleDlg({ k: 'rule' })} onClose={() => setStyleDlg(null)} />}
      {formatCells && fmtState && <FormatCellsDialog state={fmtState} target={fmtTarget} onClose={() => setFormatCells(false)} />}
      {phone && phoneFormat && fmtState && <FormatSheet state={fmtState} target={fmtTarget} onClose={() => setPhoneFormat(false)} onFormatCells={() => setFormatCells(true)} onFind={replace => setFind({ replace })}
        onRule={() => setStyleDlg({ k: 'rule' })} onManageRules={() => setStyleDlg({ k: 'rules' })} onSortDialog={() => setStyleDlg({ k: 'sort' })} />}

      {boardMenu && (
        <PopMenu at={{ x: boardMenu.x, y: boardMenu.y }} label={tl('board')} attr="data-board-items" returnTo={boardMenu.el} onClose={() => setBoardMenu(null)}
          items={[
            { key: 'link', label: links?.linked ? tl('menu.change') : tl('menu.link'), disabled: !!links?.readOnly, why: links?.readOnly ?? undefined, onSelect: () => openLinks('link') },
            { key: 'add', label: tl('menu.add'), disabled: !links?.linked || !!links?.readOnly, onSelect: () => openLinks('add') },
            { key: 'create', label: tl('menu.create'), disabled: !links?.linked || !links?.canCreate || !links?.unlinkedSelected || !!links?.readOnly,
              why: links?.linked && !links?.canCreate ? tl('menu.cantCreate') : links?.linked && !links?.unlinkedSelected ? tl('menu.noUnlinked') : undefined, onSelect: () => openLinks('create') },
            { key: 'refresh', label: tl('menu.refresh'), disabled: !links?.linked, onSelect: () => openLinks('refresh') },
          ]} />
      )}
      {tabMenu && <PopMenu at={tabMenu.at} items={tabMenu.items} label={tabMenu.label} returnTo={tabMenu.anchor} attr={tabMenu.attr} onClose={() => setTabMenu(null)} />}

      {dialog?.kind === 'delete' && (
        <ConfirmDialog attr="data-delete-sheet" danger
                       title={t('deleteSheet.title', { n: dialog.ids.length, name: nameOf(dialogSheet(dialog.ids[0]) ?? sheets[0]) })}
                       body={t('deleteSheet.body')} ok={t('deleteSheet.ok')} cancel={t('deleteSheet.cancel')}
                       onCancel={() => setDialog(null)} onOk={() => { const ids = dialog.ids; setDialog(null); void deleteSheets(ids) }} />
      )}
      {dialog?.kind === 'protect' && (
        <ConfirmDialog attr="data-protect-sheet"
                       title={t('protect.title', { name: nameOf(dialogSheet(dialog.id) ?? sheets[0]) })}
                       body={t('protect.body')} ok={t('protect.ok')} cancel={t('protect.cancel')}
                       onCancel={() => setDialog(null)} onOk={() => { const id = dialog.id; setDialog(null); void protect(id, true) }} />
      )}
      {dialog?.kind === 'unhide' && (
        <UnhideDialog hidden={hidden.map(s => ({ id: s.id, name: nameOf(s) }))} onCancel={() => setDialog(null)}
                      onOk={id => { setDialog(null); void unhide(id) }} />
      )}
      {dialog?.kind === 'moveCopy' && (
        <MoveCopyDialog
          folders={p.folders.map(f => ({ id: f.id, name: f.kind === 'content' ? t('folder.content') : f.kind === 'video' ? t('folder.video') : f.name ?? '' }))}
          folderId={folder.id}
          linked={dialog.ids.some(id => dialogSheet(id)?.kind !== 'blank')}
          count={dialog.ids.length}
          sheetsOf={fid => {
            if (fid === folder.id) return visible.filter(s => !dialog.ids.includes(s.id)).map(s => ({ id: s.id, name: nameOf(s) }))
            if (otherSheets[fid]) return otherSheets[fid]
            if (fetching.current.has(fid)) return null
            fetching.current.add(fid)
            void api.listSheets(fid).then(r => { fetching.current.delete(fid); if (r.success) setOtherSheets(o => ({ ...o, [fid]: r.sheets.filter(s => !s.hidden).sort(byPos).map(s => ({ id: s.id, name: nameOf(s) })) })) })
            return null
          }}
          onCancel={() => setDialog(null)}
          onOk={(to, before, copy) => { const ids = dialog.ids; setDialog(null); void moveCopy(ids, to, before, copy) }}
        />
      )}
      {gone && (
        <Modal title={t('gone.title')} body={t('gone.body')} onCancel={() => closeGone(gone)} attr="data-sheet-gone">
          <div className="fx-sh-dialog-row">
            <button type="button" onClick={() => closeGone(gone)}>{t('gone.close')}</button>
            {docs[gone] && <button type="button" className="is-go" data-ok="" onClick={() => void copyGone(gone)}>{t('gone.copy')}</button>}
          </div>
        </Modal>
      )}
      {tip === 'goto' && (
        <GoToDialog recent={recentRefs}
                    onGo={ref => { setTip(null); setRecentRefs(r => [ref, ...r.filter(x => x !== ref)].slice(0, 8)); sendFormat(fmtTarget, { kind: 'goto', ref }) }}
                    onSpecial={() => setTip('gotoSpecial')} onCancel={() => setTip(null)} />
      )}
      {tip === 'gotoSpecial' && (
        <GoToSpecialDialog supported={fmtState?.goSpecial ?? (openBlank ? [] : LINKED_SPECIAL)} onCancel={() => setTip(null)}
                           onOk={(what, numbers, text) => { setTip(null); sendFormat(fmtTarget, { kind: 'goSpecial', what, numbers, text }) }} />
      )}
      {tip === 'series' && fmtState && (
        <SeriesDialog range={fmtState.range ?? fmtState.cell} by={(() => { const m = /^([A-Z]+)(\d+):([A-Z]+)(\d+)$/.exec(fmtState.range ?? ''); return m && m[1] !== m[3] && m[2] === m[4] ? 'rows' : 'cols' })()}
                      onCancel={() => setTip(null)} onOk={(spec, by) => { setTip(null); sendFormat(fmtTarget, { kind: 'series', spec, by }) }} />
      )}
      {tip === 'validation' && fmtState && openBlank && (
        <DataValidationDialog range={fmtState.range ?? fmtState.cell} rule={fmtState.validation ?? null} mixed={!!fmtState.validationMixed} inRule={!!fmtState.validation}
                              onCancel={() => setTip(null)} onOk={(rule, all) => { setTip(null); sendFormat('blank', { kind: 'validation', rule, all }) }} />
      )}
      {tip === 'dedupe' && fmtState && openBlank && (
        <RemoveDuplicatesDialog cols={fmtState.dedupe?.cols ?? []} header={fmtState.dedupe?.header ?? true} range={fmtState.region ?? fmtState.range ?? ''}
                                onCancel={() => setTip(null)} onOk={(cols, header) => { setTip(null); sendFormat('blank', { kind: 'dedupe', cols, header }) }} />
      )}
      {tip === 'split' && fmtState && openBlank && (
        <TextToColumnsDialog values={fmtState.splitValues ?? []} range={fmtState.range ?? ''}
                             onCancel={() => setTip(null)} onOk={(opts, formats) => { setTip(null); sendFormat('blank', { kind: 'split', opts, formats }) }} />
      )}
      {tip === 'createTable' && fmtState && openBlank && (
        <CreateTableDialog range={fmtState.region ?? fmtState.range ?? 'A1'}
                           onCancel={() => setTip(null)} onOk={(ref, header) => { setTip(null); sendFormat('blank', { kind: 'createTable', ref, header }) }} />
      )}
      {tip === 'slicers' && fmtState?.tableInfo && openBlank && (
        <InsertSlicersDialog cols={fmtState.tableInfo.cols}
                             onCancel={() => setTip(null)} onOk={cols => { setTip(null); sendFormat('blank', { kind: 'slicers', cols }) }} />
      )}
      {tip === 'advanced' && fmtState && openBlank && (
        <AdvancedFilterDialog range={fmtState.region ?? ''} active={!!fmtState.advancedOn}
                              onCancel={() => setTip(null)} onClear={() => { setTip(null); sendFormat('blank', { kind: 'advancedClear' }) }}
                              onOk={v => { setTip(null); sendFormat('blank', { kind: 'advanced', ...v }) }} />
      )}
      {tip === 'lists' && (
        <CustomListsDialog lists={fillLists.lists} canEdit={fillLists.canEdit}
                           fromCells={openBlank ? fmtState?.selValues ?? [] : []}
                           onCancel={() => setTip(null)}
                           onSave={async lists => {
                             setTip(null)
                             const r = await saveFillLists(lists)
                             if (r.success) { setFillLists(f => ({ ...f, lists: r.lists })); say(tt('lists.saved')) } else say(t('err.generic'))
                           }} />
      )}
      {toast && <div className="fx-sh-toast" role="status" data-sheets-toast="">{toast}
        {toastUndo && <button type="button" className="fx-sh-toast-undo" data-toast-undo="" onClick={() => { setToast(null); if (openBlank) doUndo() }}>{t('undo')}</button>}</div>}
    </div>
  )
}
