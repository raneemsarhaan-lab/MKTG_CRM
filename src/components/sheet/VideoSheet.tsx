'use client'

/**
 * The video sheet (spec 008): every clip of a video in one dense grid, beside
 * the board and from the same tasks.
 *
 * The toolbar switches Board | Sheet, the column set (Editing, Copy, Full,
 * remembered per member on this device: Constitution §VI 2.1.0), Mine and Show
 * dropped, and opens Paste clips. The summary line describes the video in
 * focus. Every change goes through the host's `api`, which is the board's own
 * code path, so the sheet can never do what the board would refuse.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import type { SheetColumnSet, StageId, Task } from '@/types/index'
import { MAX_INLINE_BYTES, MAX_UPLOAD_BYTES } from '@/lib/attachments'
import { formatBytes } from '@/components/kanban/attachments/limits'
import { nextFreeName, sameName } from '@/components/kanban/attachments/names'
import { buildRows, clipsOf, videosWithClips, type SheetRow } from './rows'
import { ViewPair } from '@/components/board/ViewPair'
import { defaultColumnSet, isColumnSet } from './columns'
import { summarise } from './summary'
import { formatLength, parseClipTime } from './time'
import { SheetGrid, type ActiveCell, type GridCol } from './SheetGrid'
import { SheetMenu, SheetPopover, type MenuItem } from './SheetMenu'
import { statusMenuItems, useStageNames } from './StatusCell'
import { editorMenuItems } from './EditorCell'
import { splitFiles, hostOf, type FilesCellState } from './FilesCell'
import { LinkPrompt } from './PublishedCell'
import { PastePreview } from './PastePreview'
import { cellsFromHtml, cellsFromText, looksLikeRows, type PastedCell } from './parse-clips'
import type { VideoSheetProps } from './types'
import { useSheetColumns } from './useSheetColumns'

type Popup =
  | { kind: 'menu'; label: string; anchor: HTMLElement; items: MenuItem[] }
  | { kind: 'link'; anchor: HTMLElement; taskId: string; mode: 'files' | 'published' | 'prompt' }
  | { kind: 'drop'; anchor: HTMLElement; task: Task }

const KNOWN_ERRORS = ['not_authenticated', 'not_found', 'not_authorized', 'stage_not_in_pipeline', 'terminal',
  'not_a_video', 'not_a_clip', 'dropped', 'bad_link', 'bad_times', 'duplicate_file_name', 'generic']

export function VideoSheet(p: VideoSheetProps) {
  const t = useTranslations('sheet')
  const ta = useTranslations('attachments')
  const names = useStageNames()
  const me = p.me

  // ── preferences (per member, this device) ───────────────────────────────
  const colsKey = `momentum.sheet.columns.${me.id}`
  const [set, setSet] = useState<SheetColumnSet>(() => defaultColumnSet(me.role))
  const [showDropped, setShowDropped] = useState(true)
  const [mine, setMine] = useState(false)
  useEffect(() => {
    try {
      const c = window.localStorage.getItem(colsKey)
      if (isColumnSet(c)) setSet(c)
      if (window.localStorage.getItem('momentum.sheet.dropped') === '0') setShowDropped(false)
    } catch { /* storage refused: defaults stand */ }
  }, [colsKey])
  function chooseSet(s: SheetColumnSet) {
    setSet(s)
    try { window.localStorage.setItem(colsKey, s) } catch { /* private mode */ }
  }
  function toggleDropped() {
    setShowDropped(v => {
      try { window.localStorage.setItem('momentum.sheet.dropped', v ? '0' : '1') } catch { /* private mode */ }
      return !v
    })
  }

  // ── rows ────────────────────────────────────────────────────────────────
  const [collapsed, setCollapsed] = useState<Set<string>>(() =>
    new Set(p.videoId ? [] : videosWithClips(p.tasks).slice(3).map(g => g.video.id)))
  const [drafts, setDrafts] = useState<{ key: string; videoId: string }[]>([])
  const [editDraft, setEditDraft] = useState<string | null>(null)
  const rows = useMemo(() => buildRows(p.tasks, {
    videoId: p.videoId, mine, showDropped, me: me.id, collapsed, drafts, query: p.query,
  }), [p.tasks, p.videoId, mine, showDropped, me.id, collapsed, drafts, p.query])

  const [active, setActive] = useState<ActiveCell | null>(null)
  const activeRow = active ? rows.find(r => r.key === active.key) : undefined
  const focusVideo: Task | undefined = activeRow
    ? (activeRow.kind === 'video' ? activeRow.task : activeRow.video)
    : rows.find(r => r.kind === 'video')?.task as Task | undefined
  const summary = useMemo(() => summarise(focusVideo ? clipsOf(p.tasks, focusVideo.id) : []), [p.tasks, focusVideo])
  const singleVideo = p.videoId ? p.tasks.find(x => x.id === p.videoId) : undefined

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
  const why = (code: string | undefined) => (code && KNOWN_ERRORS.includes(code) ? t(`err.${code}`) : code || t('err.generic'))

  // ── highlight a row arriving from "Open sheet" on a clip ────────────────
  const highlighted = useRef<string | null>(null)
  useEffect(() => {
    if (!p.highlightId || highlighted.current === p.highlightId) return
    const row = rows.find(r => (r.kind === 'clip' || r.kind === 'video') && r.task.id === p.highlightId)
    if (!row) return
    highlighted.current = p.highlightId
    setActive({ key: row.key, col: 'title' })
    requestAnimationFrame(() => document.querySelector(`[data-row="${row.key}"]`)?.scrollIntoView({ block: 'center' }))
  }, [p.highlightId, rows])

  const canEdit = useCallback((task: Task) =>
    task.task_owner_id === me.id || task.assignee_id === me.id || me.access === 'admin' || me.access === 'superuser',
  [me])

  // ── shaped columns (spec 010) ───────────────────────────────────────────
  const cl = useSheetColumns({
    sheet: 'video', set, bundle: p.columns, me, members: p.members,
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

  const cellEl = (rowKey: string, col: GridCol) =>
    document.querySelector<HTMLElement>(`[data-cell="${rowKey}|${col}"]`)

  async function move(task: Task, to: StageId, anchor: HTMLElement) {
    const rowKey = anchor.closest('[data-row]')?.getAttribute('data-row') ?? ''
    const res = await p.api.move(task.id, to)
    if (!res.success) {
      const reason = why(res.error)
      say(t('notMoved', { reason }))
      onNote(`${rowKey}|status`, reason)
      return
    }
    say(t('moved', { name: task.name, stage: names.video(to) }))
    // FR-047: a clip moved to Published here is asked for its post link.
    if (to === 'publish' && task.parent_task_id && !task.published_url) {
      requestAnimationFrame(() => {
        const at = cellEl(rowKey, 'published') ?? cellEl(rowKey, 'status')
        if (at) setPopup({ kind: 'link', anchor: at, taskId: task.id, mode: 'prompt' })
      })
    }
  }

  // ── uploads (Files cell) ────────────────────────────────────────────────
  const [filesState, setFilesState] = useState<Record<string, FilesCellState | undefined>>({})
  const fileInput = useRef<HTMLInputElement>(null)
  const uploadFor = useRef<string | null>(null)
  const limitLabel = p.hasStorage ? ta('limitShortStorage') : ta('limitShortInline')

  async function upload(taskId: string, file: File) {
    const limit = p.hasStorage ? MAX_UPLOAD_BYTES : MAX_INLINE_BYTES
    // Size first, before a single byte is read (spec 007 FR-055, FR-042).
    if (file.size > limit) {
      setFilesState(s => ({ ...s, [taskId]: { kind: 'tooLarge', name: file.name, size: formatBytes(file.size), limit: limitLabel } }))
      say(t('files.tooLargeDetail', { size: formatBytes(file.size), limit: limitLabel }))
      return
    }
    const task = p.tasks.find(x => x.id === taskId)
    const taken = (task?.attachments ?? []).map(a => a.filename)
    // A clash keeps both, as spec 007's "Keep both" does: "cut (2).mp4".
    const name = taken.some(x => sameName(x, file.name)) ? nextFreeName(file.name, taken) : file.name
    setFilesState(s => ({ ...s, [taskId]: { kind: 'uploading', name, progress: 0 } }))
    const r = await p.api.upload(taskId)(file, name, pct =>
      setFilesState(s => ({ ...s, [taskId]: { kind: 'uploading', name, progress: pct } })))
    if (r.ok) {
      setFilesState(s => ({ ...s, [taskId]: undefined }))
      say(t('files.uploaded', { name }))
    } else {
      setFilesState(s => ({ ...s, [taskId]: { kind: 'failed', name, error: r.error, retryable: r.retryable, file } }))
      say(r.error)
    }
  }

  // ── opening a cell ──────────────────────────────────────────────────────
  function onOpen(row: SheetRow, col: GridCol, anchor: HTMLElement) {
    if (row.kind !== 'clip' && row.kind !== 'video') return
    const task = row.task
    const can = canEdit(task)
    const menu = (label: string, items: MenuItem[]) => { if (items.length) setPopup({ kind: 'menu', label, anchor, items }) }
    const pick = (fn: () => void) => () => { closePopup(true); fn() }
    if (cl.custom.is(col)) { cl.custom.open(task, col, anchor, row.key); return }

    switch (col) {
      case 'rowNo': {
        const items: MenuItem[] = []
        if (row.kind === 'video' && !p.videoId) {
          items.push({ key: 'own', text: t('openOnItsOwn', { name: task.name }), label: t('openOnItsOwn', { name: task.name }), onSelect: pick(() => p.onOpenVideo(task.id)) })
        }
        if (row.kind === 'clip' && can) {
          items.push(task.dropped_at
            ? { key: 'restore', text: t('drop.restoreClip'), label: t('drop.restoreClip'), onSelect: pick(() => void restore(task)) }
            : { key: 'drop', text: t('drop.dropClip'), label: t('drop.dropClip'), tone: 'danger', onSelect: () => setPopup({ kind: 'drop', anchor, task }) })
        }
        items.push({ key: 'task', text: t('files.openTask'), label: t('files.openTask'), onSelect: pick(() => p.onOpenTask(task.id)) })
        return menu(t('drop.rowMenu', { name: task.name }), items)
      }
      case 'status': {
        const items = statusMenuItems(task, me, t, names, to => { closePopup(true); void move(task, to, anchor) })
        if (!items.length) { onNote(`${row.key}|status`, t('noMoves')); return }
        return menu(t('menu.statusFor', { name: task.name }), items)
      }
      case 'editor':
        if (!can) { onNote(`${row.key}|editor`, t('readOnly')); return }
        return menu(t('editorFor', { name: task.name }), editorMenuItems(p.members, task.assignee_id, t, id => {
          closePopup(true)
          void p.api.update(task.id, { assignee_id: id }).then(r => { if (!r.success) say(t('notSaved', { reason: why(r.error) })) })
        }))
      case 'type':
        if (!can) { onNote(`${row.key}|type`, t('readOnly')); return }
        return cl.typeCombo(task, anchor, p.contentTypes, label => setType(task, label))
      case 'files': {
        const { links, files } = splitFiles(task.attachments)
        const items: MenuItem[] = [
          ...links.map(l => ({ key: `l${l.id}`, text: t('files.openLink', { host: hostOf(l.url) }), label: t('files.openLink', { host: hostOf(l.url) }),
            onSelect: pick(() => { window.open(l.url, '_blank', 'noopener,noreferrer') }) })),
          ...files.map(f => ({ key: `f${f.id}`, text: t('files.preview', { name: f.filename }), label: t('files.preview', { name: f.filename }),
            onSelect: pick(() => p.onOpenTask(task.id, { previewId: f.id })) })),
        ]
        if (can) {
          items.push(
            { key: 'upload', text: t('files.upload'), label: t('files.upload'), hint: t('files.uploadLimit', { limit: limitLabel }),
              onSelect: pick(() => { uploadFor.current = task.id; fileInput.current?.click() }) },
            { key: 'link', text: t('files.pasteLink'), label: t('files.pasteLink'),
              onSelect: () => setPopup({ kind: 'link', anchor, taskId: task.id, mode: 'files' }) },
          )
        }
        items.push({ key: 'task', text: t('files.openTask'), label: t('files.openTask'), onSelect: pick(() => p.onOpenTask(task.id)) })
        return menu(t('files.menuFor', { name: task.name }), items)
      }
      case 'published':
        if (can) return setPopup({ kind: 'link', anchor, taskId: task.id, mode: 'published' })
        if (task.published_url) window.open(task.published_url, '_blank', 'noopener,noreferrer')
        return
      case 'drop':
        if (!can) return
        if (task.dropped_at) { void restore(task); return }
        return setPopup({ kind: 'drop', anchor, task })
    }
  }

  async function drop(task: Task) {
    closePopup(true)
    const r = await p.api.drop(task.id)
    if (!r.success) { say(t('notSaved', { reason: why(r.error) })); return }
    say(t('drop.dropped'), () => { void restore(task) })
  }
  async function restore(task: Task) {
    const r = await p.api.restore(task.id)
    if (!r.success) { say(t('notSaved', { reason: why(r.error) })); return }
    say(t('drop.restored', { stage: names.video(task.status as StageId) }))
  }

  // ── typing into a cell ──────────────────────────────────────────────────
  async function onCommit(row: SheetRow, col: GridCol, value: string): Promise<string | null> {
    if (row.kind === 'draft') {
      const key = row.key.slice(2)
      const title = value.trim()
      setDrafts(d => d.filter(x => x.key !== key))
      if (!title) return null
      const r = await p.api.addClips(row.video.id, [{ title }])
      if (!r.success) { say(t('notSaved', { reason: why(r.error) })); return why(r.error) }
      say(t('newClip.added'))
      return null
    }
    if (row.kind !== 'clip' && row.kind !== 'video') return null
    const task = row.task
    if (cl.custom.is(col)) return cl.custom.commit(task, col, value)
    const res = await (async () => {
      switch (col) {
        case 'title': {
          const name = value.trim()
          if (!name) return { success: false, error: 'empty' }
          return p.api.update(task.id, { name })
        }
        case 'clipNo': {
          const v = value.trim()
          if (v && !/^\d{1,4}$/.test(v)) return { success: false, error: 'badNumber' }
          return p.api.updateClip(task.id, { clip_no: v ? Number(v) : null })
        }
        case 'source':   return p.api.updateClip(task.id, { source: value.trim() || null })
        case 'fileName': return p.api.updateClip(task.id, { file_name: value.trim() || null })
        case 'in': case 'out': {
          const ms = parseClipTime(value)
          if (ms === null) return { success: false, error: 'badTime' }
          const other = col === 'in' ? task.clip?.out_ms : task.clip?.in_ms
          const inMs = col === 'in' ? ms : other, outMs = col === 'out' ? ms : other
          // FR-038: an out time before the in time is refused here, and again on the server.
          if (inMs != null && outMs != null && !(outMs > inMs)) return { success: false, error: 'outBeforeIn' }
          return p.api.updateClip(task.id, col === 'in' ? { in_ms: ms ?? null } : { out_ms: ms ?? null })
        }
      }
      return { success: true }
    })()
    if (res.success) return null
    const local: Record<string, string> = { badNumber: t('badNumber'), badTime: t('badTime'), outBeforeIn: t('outBeforeIn'), empty: t('err.generic') }
    const reason = (res.error && local[res.error]) || why(res.error)
    say(t('notSaved', { reason }))
    return reason
  }

  function addClip(videoId: string) {
    const key = Math.random().toString(36).slice(2, 9)
    setDrafts(d => [...d, { key, videoId }])
    setEditDraft(key)
  }

  // ── pasting ─────────────────────────────────────────────────────────────
  const [paste, setPaste] = useState<{ videoId: string; cells: PastedCell[][] | null } | null>(null)
  function pasteTarget(row: SheetRow | null): string | null {
    if (row) return row.kind === 'video' ? row.task.id : row.video.id
    return p.videoId ?? focusVideo?.id ?? null
  }
  function onPaste(e: React.ClipboardEvent, row: SheetRow | null, col: GridCol | null) {
    const html = e.clipboardData.getData('text/html')
    const plain = e.clipboardData.getData('text/plain')
    const cells = html && /<t[rd][\s>]/i.test(html) ? cellsFromHtml(html, new DOMParser()) : cellsFromText(plain)
    const single = plain.trim()
    // One link into a Files or Published cell attaches it (FR-040).
    if (!looksLikeRows(cells) && /^https?:\/\/\S+$/i.test(single) && row && (row.kind === 'clip' || row.kind === 'video')) {
      if (!canEdit(row.task)) { onNote(`${row.key}|${col}`, t('readOnly')); return }
      if (col === 'files') {
        e.preventDefault()
        void p.api.addLink(row.task.id, single).then(r => say(r.success ? t('files.attached') : t('notSaved', { reason: why(r.error) })))
        return
      }
      if (col === 'published' && row.kind === 'clip') {
        e.preventDefault()
        void p.api.updateClip(row.task.id, { published_url: single }).then(r => say(r.success ? t('published.saved') : t('notSaved', { reason: why(r.error) })))
        return
      }
    }
    if (looksLikeRows(cells)) {
      const videoId = pasteTarget(row)
      if (!videoId) return
      e.preventDefault()
      setPaste({ videoId, cells })
    }
  }
  const pasteVideo = paste ? p.tasks.find(x => x.id === paste.videoId) : undefined
  const existingNames = useMemo(
    () => (paste ? clipsOf(p.tasks, paste.videoId).map(c => c.clip?.file_name ?? '').filter(Boolean) : []),
    // Only the video's own file names matter; recomputed when the dialog opens or clips are added.
    [paste, p.tasks],
  )

  // ── render ──────────────────────────────────────────────────────────────
  const label = singleVideo ? t('gridLabel', { name: singleVideo.name }) : t('gridAllLabel')
  const noVideo = p.videoId && !singleVideo
  const empty = !rows.some(r => r.kind === 'video')
  const popupTask = popup && popup.kind === 'link' ? p.tasks.find(x => x.id === popup.taskId) : undefined

  return (
    <div className="fx-sheet" data-video-sheet="">
      {/* The header's third row on Pipeline · Sheet (spec 011 R2): the sheet's
          own controls, with Board | Sheet at the end in place of the old
          three-way switch. Content is a page tab now. */}
      <div className="fx-sheet-bar" role="toolbar" aria-label={t('view.label')} data-toolbar="">
        {p.videoId && (
          <button type="button" className="fx-sheet-back" onClick={() => p.onOpenVideo(null)}>
            <span aria-hidden="true">‹ </span>{t('backToAll')}
          </button>
        )}
        <div className="fx-sheet-seg" role="group" aria-label={t('sets.label')} data-sets="">
          {(['editing', 'copy', 'full'] as const).map(s => (
            <button key={s} type="button" aria-pressed={set === s} data-set={s} onClick={() => chooseSet(s)}>{t(`sets.${s}`)}</button>
          ))}
        </div>
        <span className="fx-sheet-bar-gap" />
        {cl.toolbar}
        <button type="button" className="fx-sheet-tog" aria-pressed={mine} data-mine="" onClick={() => setMine(v => !v)}>{t('mine')}</button>
        <button type="button" className="fx-sheet-tog" aria-pressed={showDropped} data-show-dropped="" onClick={toggleDropped}>{t('showDropped')}</button>
        <button
          type="button"
          className="fx-sheet-btn is-primary"
          data-paste-clips=""
          disabled={!pasteTarget(activeRow ?? null)}
          onClick={() => { const v = pasteTarget(activeRow ?? null); if (v) setPaste({ videoId: v, cells: null }) }}
        >
          {t('pasteClips')}
        </button>
        <span className="fx-hd-vr" aria-hidden="true" />
        <ViewPair view="sheet" onView={v => p.onView(v)} />
      </div>

      {focusVideo && (
        <div className="fx-sheet-sum" data-summary="">
          <span className="fx-sheet-sum-name">{focusVideo.name}</span>
          <span><b>{t('summary.clips', { count: summary.clips })}</b></span>
          <span><b>{formatLength(summary.totalMs)}</b></span>
          <span>{t('summary.editing', { n: summary.editing })}</span>
          <span>
            {t('summary.published', { n: summary.published })}
            {summary.noLink > 0 && <> <span className="fx-sheet-sum-bad">{t('summary.noLink', { n: summary.noLink })}</span></>}
          </span>
          <span>{t('summary.dropped', { n: summary.dropped })}</span>
        </div>
      )}

      {(noVideo || empty) && (
        <div className="fx-sheet-empty"><p>{t('noVideos')}</p></div>
      )}

      {!empty && (
        <div className="fx-sheet-scroll">
          <SheetGrid
            rows={rows}
            columns={cl}
            me={me}
            members={p.members}
            label={label}
            allVideos={!p.videoId}
            active={active}
            setActive={setActive}
            canEdit={canEdit}
            filesState={filesState}
            highlightId={p.highlightId}
            editDraft={editDraft}
            notes={notes}
            onCommit={onCommit}
            onCancelDraft={key => setDrafts(d => d.filter(x => x.key !== key))}
            onOpen={onOpen}
            onToggle={id => setCollapsed(c => { const n = new Set(c); if (n.has(id)) n.delete(id); else n.add(id); return n })}
            onAddClip={addClip}
            onOpenVideo={id => p.onOpenVideo(id)}
            onDelete={(row, anchor) => { if (row.kind === 'clip' && canEdit(row.task)) { if (row.task.dropped_at) void restore(row.task); else setPopup({ kind: 'drop', anchor, task: row.task }) } }}
            onPaste={onPaste}
            onRetry={id => { const s = filesState[id]; if (s?.kind === 'failed') void upload(id, s.file) }}
            onLinkInstead={(id, anchor) => setPopup({ kind: 'link', anchor, taskId: id, mode: 'files' })}
            onNote={onNote}
            onTypeAhead={(row, ch, anchor) => {
              if (row.kind !== 'clip' && row.kind !== 'video') return false
              if (!canEdit(row.task) || row.task.dropped_at) { onNote(`${row.key}|type`, t('readOnly')); return true }
              cl.typeCombo(row.task, anchor, p.contentTypes, label => setType(row.task, label), ch)
              return true
            }}
          />
        </div>
      )}
      {cl.layer}

      {singleVideo && !empty && clipsOf(p.tasks, singleVideo.id).length === 0 && (
        <p className="fx-sheet-hint">{t('empty')}</p>
      )}

      <input
        ref={fileInput}
        type="file"
        hidden
        onChange={e => {
          const f = e.target.files?.[0]
          const id = uploadFor.current
          e.target.value = ''
          if (f && id) void upload(id, f)
        }}
      />

      {popup?.kind === 'menu' && (
        <SheetMenu anchor={popup.anchor} label={popup.label} items={popup.items} onClose={closePopup} />
      )}
      {popup?.kind === 'link' && popupTask && (
        <SheetPopover anchor={popup.anchor} label={popup.mode === 'files' ? t('files.linkLabel') : t('published.edit', { name: popupTask.name })} onClose={closePopup}>
          <LinkPrompt
            title={popup.mode === 'files' ? t('files.linkLabel') : popup.mode === 'prompt' ? t('published.prompt') : t('published.edit', { name: popupTask.name })}
            initial={popup.mode === 'published' ? popupTask.published_url ?? '' : ''}
            saveLabel={popup.mode === 'files' ? t('files.attach') : t('published.save')}
            skipLabel={popup.mode === 'prompt' ? t('published.skip') : t('files.cancel')}
            badLink={t('err.bad_link')}
            placeholder={popup.mode === 'files' ? 'https://drive.google.com/…' : 'https://www.instagram.com/reel/…'}
            onSkip={() => closePopup(true)}
            onSave={async url => {
              if (popup.mode === 'files') {
                if (!url) return t('err.bad_link')
                const r = await p.api.addLink(popupTask.id, url)
                if (!r.success) return why(r.error)
                setFilesState(s => ({ ...s, [popupTask.id]: undefined }))
                say(t('files.attached'))
              } else {
                const r = await p.api.updateClip(popupTask.id, { published_url: url || null })
                if (!r.success) return why(r.error)
                if (url) say(t('published.saved'))
              }
              closePopup(true)
              return null
            }}
          />
        </SheetPopover>
      )}
      {popup?.kind === 'drop' && (
        <SheetPopover anchor={popup.anchor} label={t('drop.dropClip')} onClose={closePopup}>
          <div className="fx-sheet-pop-form" data-drop-confirm="">
            <span>{popup.task.clip?.clip_no != null
              ? t('drop.confirm', { n: String(popup.task.clip.clip_no).padStart(2, '0') })
              : t('drop.confirmPlain')}</span>
            <span className="fx-sheet-pop-row">
              <button type="button" className="fx-sheet-btn" onClick={() => closePopup(true)}>{t('drop.cancel')}</button>
              <button type="button" className="fx-sheet-btn is-danger" data-autofocus="" onClick={() => void drop(popup.task)}>{t('drop.drop')}</button>
            </span>
          </div>
        </SheetPopover>
      )}

      {paste && pasteVideo && (
        <PastePreview
          videoName={pasteVideo.name}
          existingFileNames={existingNames}
          initialCells={paste.cells}
          columns={{ targets: cl.pasteNames, values: cl.pasteColumns, addColumn: cl.addTextColumn }}
          onAdd={rowsIn => p.api.addClips(paste.videoId, rowsIn)}
          onClose={msg => {
            setPaste(null)
            if (msg) say(msg)
            requestAnimationFrame(() => (document.querySelector<HTMLElement>('[data-cell][tabindex="0"]') ?? document.querySelector<HTMLElement>('[data-paste-clips]'))?.focus())
          }}
        />
      )}

      <div className="fx-sheet-toast" role="status" aria-live="polite" data-sheet-toast="">
        {toast && (
          <span key={toast.n} className="fx-sheet-toast-in">
            {toast.text}
            {toast.undo && (
              <button type="button" onClick={() => { const u = toast.undo; setToast(null); u?.() }}>{ta('undo')}</button>
            )}
          </span>
        )}
      </div>
    </div>
  )
}
