'use client'

import { isLinkAttachment } from '@/lib/attachments'

import { useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import type { Member, TaskAttachment } from '@/types/index'
import { BRIEF_UI } from '@/lib/tokens'
import { usePendingDelete } from '@/lib/pending-deletes'
import { AttIcon } from './icons'
import { AttachmentTile, GhostTile, JobTile } from './AttachmentTile'
import { AttachmentPreview } from './AttachmentPreview'
import { PlaceholderTiles, SR_ONLY } from './PlaceholderTiles'
import { useUploadQueue, type UploadFn, type UploadJob } from './useUploadQueue'
import { latestImageId, newestFirst } from './order'
import { limitLabelKey } from './limits'
import { isGenericClipboardName, nextFreeName, screenshotName } from './names'

export type { UploadFn, UploadResult } from './useUploadQueue'

/** How the host reaches into the section (contracts/attachments-section.md). */
export interface AttachmentsHandle {
  /** Open the section, scroll it into view and highlight it (FR-072). */
  reveal(): void
  /** Paste, drop or the comment box. `forComment` → a chip on the comment being written. */
  addFiles(files: File[], opts?: { forComment?: boolean; source?: 'paste' | 'drop' | 'pick' }): void
  /** Open the file picker; what is picked goes through addFiles with the same options. */
  pick(opts?: { forComment?: boolean }): void
  /** Open the preview on a file (comment chips). False if the file no longer exists. */
  openPreview(attachmentId: string): boolean
  /** Re-read the files: something else (the brief editor) attached one. */
  reload(): void
}

/** Stored files shown before "Show all" (FR-071). */
export const CAP = 7

type Rename = (id: string, name: string) => Promise<{ success: boolean; filename?: string; error?: string }>

/**
 * The task panel's Attachments section (spec 007, Option A "Tidy").
 *
 * Owns everything inside the block and the preview. Data and side effects come
 * in through props so the attachments lab can mount it with a stub host.
 */
export function AttachmentsSection({
  taskId, initialRows, load, members, ownerName, canEdit, hasStorage,
  upload, rename, onChanged, onStoredForComment, onFilesChange, handle,
}: {
  taskId: string
  /** Rows without bytes, from the board's data: their count sizes the placeholders. */
  initialRows: TaskAttachment[]
  load: () => Promise<TaskAttachment[]>
  members: Pick<Member, 'id' | 'name'>[]
  ownerName: string
  canEdit: boolean
  hasStorage: boolean
  upload: UploadFn
  rename: Rename
  onChanged?: () => void
  onStoredForComment?: (a: TaskAttachment) => void
  /** The stored files whenever they change: the host draws comment chips from them. */
  onFilesChange?: (files: TaskAttachment[]) => void
  handle?: React.Ref<AttachmentsHandle>
}) {
  const t = useTranslations('attachments')
  const pd = usePendingDelete()

  const [open, setOpen]           = useState(true)
  const [files, setFiles]         = useState<TaskAttachment[]>([])
  const [loading, setLoading]     = useState(true)
  const [showAll, setShowAll]     = useState(false)
  const [renamingId, setRenaming] = useState<string | null>(null)
  const [menuId, setMenuId]       = useState<string | null>(null)
  const [preview, setPreview]     = useState<{ id: string; index: number } | null>(null)
  const [note, setNote]           = useState('')
  const [live, setLive]           = useState('')
  const [flash, setFlash]         = useState(false)
  const [dragging, setDragging]   = useState(false)

  const rootRef   = useRef<HTMLElement>(null)
  const inputRef  = useRef<HTMLInputElement>(null)
  const pickMode  = useRef<{ forComment?: boolean }>({})
  const filesRef  = useRef<TaskAttachment[]>([])
  filesRef.current = files
  const loadRef   = useRef(load)
  loadRef.current = load
  const firstLoad = useRef<{ taskId: string; rows: Promise<TaskAttachment[]> } | null>(null)
  /* Files removed while this panel is open (the new half of an undone Replace).
   * A refresh can read the list before that delete lands on the server; these
   * stay hidden so the file doesn't flash back. */
  const goneIds = useRef(new Set<string>())

  const announce = useCallback((msg: string) => { setLive(''); requestAnimationFrame(() => setLive(msg)) }, [])
  const focusSoon = (selector: string) => requestAnimationFrame(() => requestAnimationFrame(() =>
    rootRef.current?.querySelector<HTMLElement>(selector)?.focus()))

  // Notes (refusals, skipped files, "can't restore") clear themselves.
  useEffect(() => {
    if (!note) return
    const id = setTimeout(() => setNote(''), 7000)
    return () => clearTimeout(id)
  }, [note])

  const pendingHere = useMemo(
    () => Object.values(pd.pending).filter(e => e.taskId === taskId),
    [pd.pending, taskId],
  )
  const withoutPending = useCallback((rows: TaskAttachment[]) => {
    const pending = new Set(Object.keys(pd.pending))
    return rows.filter(r => !pending.has(r.id) && !goneIds.current.has(r.id))
  }, [pd.pending])

  /* ── loading (R13) ───────────────────────────────────────────────────── */
  const refresh = useCallback(async () => {
    const rows = await loadRef.current().catch(() => null)
    if (rows) setFiles(withoutPending(rows))
    return rows
  }, [withoutPending])

  useEffect(() => {
    let live = true
    setLoading(true)
    setShowAll(false)
    setPreview(null)
    /* One request per task, shared by both runs of this effect.
     *
     * React runs an effect twice in development, and the second call to the
     * same server action, made while the first is still in flight, never
     * answered: the first result was thrown away by the cleanup and the
     * section sat on its placeholders. Reusing the first call's promise means
     * whichever run is still live gets the rows. */
    if (firstLoad.current?.taskId !== taskId) firstLoad.current = { taskId, rows: loadRef.current() }
    void firstLoad.current.rows
      .then(rows => { if (live) setFiles(withoutPending(rows)) })
      .catch(() => { if (live) setFiles(withoutPending(initialRows)) })
      .finally(() => { if (live) setLoading(false) })
    return () => { live = false }
    // Keyed on the task: a new array of the same rows must not reload them.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [taskId])

  useEffect(() => { onFilesChange?.(files) }, [files, onFilesChange])

  // When the panel goes away, its pending deletes move to the bottom message (FR-034).
  useEffect(() => () => { pd.panelClosed(taskId) }, [taskId]) // eslint-disable-line react-hooks/exhaustive-deps

  // Restores and removals from pending deletes (Undo; a refused delete; the new half of an undone Replace).
  useEffect(() => pd.subscribe(taskId, {
    restored: a => {
      setFiles(f => [a, ...f.filter(x => x.id !== a.id)])
      announce(t('aRestored', { name: a.filename }))
      focusSoon(`[data-att-open="${a.id}"]`)
      // Undo can't bring back what someone else removed meanwhile (edge case, G1).
      void refresh().then(rows => {
        if (rows && !rows.some(r => r.id === a.id)) {
          setFiles(f => f.filter(x => x.id !== a.id))
          setNote(t('cantRestore', { name: a.filename }))
        }
      })
    },
    removed: id => { goneIds.current.add(id); setFiles(f => f.filter(x => x.id !== id)) },
  }), [taskId]) // eslint-disable-line react-hooks/exhaustive-deps

  /* ── uploads (US4) ───────────────────────────────────────────────────── */
  const onStored = useCallback((a: TaskAttachment, job: UploadJob) => {
    setFiles(f => [a, ...f.filter(x => x.id !== a.id)])
    if (job.replaces) {
      const old = filesRef.current.find(x => x.id === job.replaces)
      if (old) {
        pd.request(old, { label: 'replaced', pairedNewId: a.id })
        setFiles(f => f.filter(x => x.id !== old.id))
      }
    }
    if (job.forComment) onStoredForComment?.(a)
    onChanged?.()
  }, [onChanged, onStoredForComment, pd])

  const queue = useUploadQueue({
    hasStorage, upload, onStored, announce,
    stored: () => filesRef.current,
    t: (k, v) => t(k, v),
  })

  const addFiles = useCallback((list: File[], opts: { forComment?: boolean; source?: 'paste' | 'drop' | 'pick' } = {}) => {
    if (!list.length) return
    if (!canEdit) { setNote(t('readOnly')); return }
    setOpen(true)
    // A pasted picture with no real name gets "Screenshot HH.MM.png" (FR-051),
    // unique within the batch and against what is already attached.
    const taken = [...filesRef.current.map(f => f.filename)]
    const names = list.map(f => {
      let name = f.name
      if (opts.source === 'paste' && isGenericClipboardName(f.name)) {
        const ext = '.' + ((f.type.split('/')[1] ?? 'png').replace('jpeg', 'jpg').replace(/[^a-z0-9]/gi, '') || 'png')
        name = screenshotName(new Date(), ext)
        if (taken.some(n => n.toLowerCase() === name.toLowerCase())) name = nextFreeName(name, taken)
      }
      taken.push(name)
      return name
    })
    const skipped = queue.intake(list, { forComment: opts.forComment, names })
    if (skipped > 0) setNote(t('skipped', { count: skipped }))
  }, [canEdit, queue, t])

  /* ── preview (US2) ───────────────────────────────────────────────────── */
  // The preview walks files only: a Drive or web link opens in a new tab instead (spec 008 R7).
  const ordered = useMemo(() => newestFirst(files).filter(f => !isLinkAttachment(f)), [files])
  const previewIndex = preview ? ordered.findIndex(f => f.id === preview.id) : -1

  // The file showing was removed by someone else: move on, or close (edge case, G1).
  useEffect(() => {
    if (!preview || previewIndex !== -1 || loading) return
    if (!ordered.length) { setPreview(null); setNote(t('previewGone')); return }
    const i = Math.min(preview.index, ordered.length - 1)
    setPreview({ id: ordered[i].id, index: i })
    setNote(t('previewGone'))
  }, [preview, previewIndex, ordered, loading, t])

  const openPreview = useCallback((id: string) => {
    const i = newestFirst(filesRef.current).filter(f => !isLinkAttachment(f)).findIndex(f => f.id === id)
    if (i < 0) return false
    setMenuId(null)
    setPreview({ id, index: i })
    return true
  }, [])

  function closePreview(lastId: string) {
    setPreview(null)
    const pos = ordered.findIndex(f => f.id === lastId)
    if (pos >= CAP && !showAll) setShowAll(true)   // FR-023: its tile must be there to focus
    focusSoon(`[data-att-open="${lastId}"]`)
  }

  /* ── delete with Undo (US3) ──────────────────────────────────────────── */
  function startDelete(a: TaskAttachment) {
    if (!canEdit) return
    setMenuId(null)
    pd.request(a)
    setFiles(f => f.filter(x => x.id !== a.id))
    announce(t('aDeleted', { name: a.filename }))
    focusSoon(`[data-undo="${a.id}"]`)
  }

  /* ── rename (US5) ────────────────────────────────────────────────────── */
  async function finishRename(a: TaskAttachment, next: string | null) {
    setRenaming(null)
    focusSoon(`[data-att-name="${a.id}"]`)
    if (!next) return
    setFiles(f => f.map(x => (x.id === a.id ? { ...x, filename: next } : x)))
    const r = await rename(a.id, next).catch(() => ({ success: false, error: t('errNetwork') }) as const)
    if (r.success) {
      const name = ('filename' in r && r.filename) || next
      setFiles(f => f.map(x => (x.id === a.id ? { ...x, filename: name } : x)))
      announce(t('aRenamed', { name }))
      onChanged?.()
    } else {
      setFiles(f => f.map(x => (x.id === a.id ? { ...x, filename: a.filename } : x)))
      setNote(t('renameFailed', { name: a.filename, reason: r.error ?? '' }))
    }
  }

  /* ── the host's handle ───────────────────────────────────────────────── */
  useImperativeHandle(handle, () => ({
    reveal() {
      setOpen(true)
      requestAnimationFrame(() => {
        const el = rootRef.current
        if (!el) return
        const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
        el.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' })
        setFlash(false)
        requestAnimationFrame(() => setFlash(true))
      })
    },
    addFiles,
    pick(opts = {}) {
      if (!canEdit) { setNote(t('readOnly')); return }
      pickMode.current = opts
      inputRef.current?.click()
    },
    openPreview,
    reload() { void refresh() },
  }), [addFiles, canEdit, openPreview, refresh, t])

  useEffect(() => {
    if (!flash) return
    const id = setTimeout(() => setFlash(false), 1300)
    return () => clearTimeout(id)
  }, [flash])

  // A click outside the open ⋯ menu closes it.
  useEffect(() => {
    if (!menuId) return
    function onDown(e: MouseEvent) {
      if (!(e.target as HTMLElement).closest('[data-att-menu], [data-att-more]')) setMenuId(null)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [menuId])

  // "Drop to attach" while files are dragged over the page (FR-050). The drop
  // itself is caught by the host's window listener, so a drop anywhere works.
  useEffect(() => {
    if (!canEdit) return
    let depth = 0
    const isFiles = (e: DragEvent) => Array.from(e.dataTransfer?.types ?? []).includes('Files')
    const enter = (e: DragEvent) => { if (isFiles(e)) { depth++; setDragging(true) } }
    const leave = (e: DragEvent) => { if (isFiles(e)) { depth = Math.max(0, depth - 1); if (!depth) setDragging(false) } }
    const end   = () => { depth = 0; setDragging(false) }
    window.addEventListener('dragenter', enter)
    window.addEventListener('dragleave', leave)
    window.addEventListener('drop', end)
    window.addEventListener('dragend', end)
    return () => {
      window.removeEventListener('dragenter', enter)
      window.removeEventListener('dragleave', leave)
      window.removeEventListener('drop', end)
      window.removeEventListener('dragend', end)
    }
  }, [canEdit])

  /* ── render ──────────────────────────────────────────────────────────── */
  const latest = latestImageId(files)
  const tiles: ({ kind: 'file'; a: TaskAttachment } | { kind: 'ghost'; a: TaskAttachment })[] = newestFirst([
    ...files,
    ...pendingHere.map(e => e.attachment),
  ]).map(a => (pd.isPending(a.id) ? { kind: 'ghost' as const, a } : { kind: 'file' as const, a }))
  const storedCount = tiles.length
  const shown = showAll ? tiles : tiles.slice(0, CAP)
  const whoOf = (a: TaskAttachment) =>
    (a.uploaded_by && members.find(m => m.id === a.uploaded_by)?.name) || ownerName

  return (
    <section
      ref={rootRef}
      className={`fx-att${flash ? ' fx-att-flash' : ''}`}
      data-att-section=""
      aria-labelledby={`att-title-${taskId}`}
      style={{ marginTop: 18 }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', paddingBottom: 12 }}>
        <button type="button" onClick={() => setOpen(v => !v)} aria-expanded={open} id={`att-title-${taskId}`}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 8, border: 'none', background: 'transparent',
                  cursor: 'pointer', padding: 0, fontFamily: 'inherit', fontSize: 16.5, fontWeight: 600, color: BRIEF_UI.ink,
                }}>
          <span style={{ display: 'inline-flex', color: BRIEF_UI.label, transform: open ? 'none' : 'rotate(-90deg)', transition: 'transform .15s' }}>
            <AttIcon name="chevron" size={14} />
          </span>
          {t('title')} <span style={{ color: BRIEF_UI.faint, fontWeight: 500 }}>{loading ? Math.max(initialRows.length, storedCount) : storedCount}</span>
        </button>
        <span style={{ flex: 1 }} />
        {open && storedCount > 1 && (
          <span style={{ fontSize: 12, fontWeight: 600, color: BRIEF_UI.faint }}>{t('newestFirst')}</span>
        )}
        {open && canEdit && (
          <button type="button" className="fx-att-btn is-primary" data-att-add=""
                  onClick={() => { pickMode.current = {}; inputRef.current?.click() }}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 6, height: 34, padding: '0 12px' }}>
            <AttIcon name="plus" size={15} /> {t('addFiles')}
          </button>
        )}
      </div>

      {/* Outside the fold on purpose: the comment box's paperclip uses it while the section is collapsed. */}
      <input
        ref={inputRef}
        type="file"
        multiple
        hidden
        aria-label={t('addFiles')}
        onChange={e => {
          const picked = Array.from(e.target.files ?? [])
          e.target.value = ''
          addFiles(picked, { ...pickMode.current, source: 'pick' })
          pickMode.current = {}
        }}
      />

      <span aria-live="polite" style={SR_ONLY}>{live}</span>
      {note && (
        <p role="alert" style={{ margin: '0 0 10px', fontSize: 13.5, color: BRIEF_UI.error }}>{note}</p>
      )}

      {open && (
        loading && initialRows.length > 0 ? (
          <PlaceholderTiles count={initialRows.length} />
        ) : (
          <>
            {queue.dupe && (
              <div className="fx-att-bar" role="alert" data-att-dupe="">
                <span>{t('dupeQuestion', { name: queue.dupe.name })}</span>
                <span style={{ flex: 1 }} />
                <button type="button" className="fx-att-btn" onClick={() => queue.resolveDupe('replace')}>{t('replaceIt')}</button>
                <button type="button" className="fx-att-btn" onClick={() => queue.resolveDupe('both')}>{t('keepBoth')}</button>
                <button type="button" className="fx-att-btn" onClick={() => queue.resolveDupe('cancel')}>{t('cancel')}</button>
              </div>
            )}

            {storedCount === 0 && queue.jobs.length === 0 && !canEdit ? (
              <p style={{ margin: 0, fontSize: 15, color: BRIEF_UI.faint }}>{t('noFiles')}</p>
            ) : (
              <div className="fx-att-grid" data-att-grid="">
                {queue.jobs.map(job => (
                  <JobTile key={job.key} job={job} onRetry={() => queue.retry(job.key)} onRemove={() => queue.remove(job.key)} />
                ))}
                {shown.map(({ kind, a }) => kind === 'ghost'
                  ? <GhostTile key={a.id} a={a} onUndo={() => pd.undo(a.id)} />
                  : (
                    <AttachmentTile
                      key={a.id}
                      a={a}
                      who={whoOf(a)}
                      isLatest={a.id === latest}
                      canEdit={canEdit}
                      renaming={renamingId === a.id}
                      menuOpen={menuId === a.id}
                      onPreview={() => openPreview(a.id)}
                      onStartRename={() => { if (canEdit) { setMenuId(null); setRenaming(a.id) } }}
                      onRename={next => { void finishRename(a, next) }}
                      onDelete={() => startDelete(a)}
                      onMenu={o => setMenuId(o ? a.id : null)}
                    />
                  ))}
                {canEdit && (
                  <button type="button" className="fx-att-add" data-att-add-tile=""
                          onClick={() => { pickMode.current = {}; inputRef.current?.click() }}>
                    <AttIcon name="plus" size={18} />
                    {t('addFiles')}
                    <small>{t('addHint')}<br />{t(limitLabelKey(hasStorage))}</small>
                  </button>
                )}
              </div>
            )}

            {storedCount > CAP && (
              <button type="button" className="fx-att-more-files" data-att-show-all="" aria-expanded={showAll}
                      onClick={() => setShowAll(v => !v)}>
                {showAll ? t('showFewer') : t('showAll', { count: storedCount })}
              </button>
            )}
          </>
        )
      )}

      {dragging && open && <div className="fx-att-drop" aria-hidden="true">{t('dropOverlay')}</div>}

      {preview && previewIndex >= 0 && (
        <AttachmentPreview
          list={ordered}
          index={previewIndex}
          onIndex={i => setPreview({ id: ordered[i].id, index: i })}
          onClose={closePreview}
          members={members}
          ownerName={ownerName}
        />
      )}
    </section>
  )
}
