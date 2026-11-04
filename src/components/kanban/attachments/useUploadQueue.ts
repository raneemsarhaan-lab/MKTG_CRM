'use client'

import { useCallback, useRef, useState } from 'react'
import type { TaskAttachment } from '@/types/index'
import { MAX_ATTACHMENTS_PER_GO } from '@/lib/attachments'
import { limitFor, formatBytes } from './limits'
import { nextFreeName, sameName } from './names'

/** What the host's upload does for one file (contracts/attachments-section.md). Never throws. */
export type UploadResult =
  | { ok: true; attachment: TaskAttachment }
  | { ok: false; error: string; retryable: boolean }

export type UploadFn = (file: File, name: string, onProgress: (pct: number | null) => void) => Promise<UploadResult>

/** One file being added (data-model UploadJob). Stored jobs leave the list. */
export type UploadJob = {
  key: string
  /** The file exactly as picked: kept for Retry, never re-encoded (FR-059). */
  file: File
  name: string
  /** 0–100, or null while a path that reports no progress sends it. */
  progress: number | null
  status: 'queued' | 'uploading' | 'failed' | 'too-large'
  error?: string
  retryable?: boolean
  forComment: boolean
  /** "Replace it": the stored file this one replaces once it lands. */
  replaces?: string
}

/** A file whose name is already attached, waiting for Replace / Keep both / Cancel. */
export type DuplicatePrompt = { file: File; name: string; existingId: string; forComment: boolean }

type T = (key: string, values?: Record<string, string | number>) => string

/**
 * The upload queue (spec 007 US4, FR-050–FR-058; research R5, R7, R8).
 *
 * Size first, before anything is read (FR-054); then names (FR-056); then one
 * upload at a time, in order, each with its own progress (FR-053). A failure
 * keeps its job, with the reason and Retry (FR-055).
 */
export function useUploadQueue({ hasStorage, upload, stored, onStored, announce, t }: {
  hasStorage: boolean
  upload: UploadFn
  /** The stored files the duplicate check compares against. */
  stored: () => { id: string; filename: string }[]
  onStored: (a: TaskAttachment, job: UploadJob) => void
  announce: (msg: string) => void
  t: T
}) {
  const [jobs, setJobsState] = useState<UploadJob[]>([])
  const [dupes, setDupesState] = useState<DuplicatePrompt[]>([])
  const dupesRef = useRef<DuplicatePrompt[]>([])
  const setDupes = useCallback((next: DuplicatePrompt[]) => { dupesRef.current = next; setDupesState(next) }, [])
  const jobsRef = useRef<UploadJob[]>([])
  const busy    = useRef(false)
  const seq     = useRef(0)
  // The latest callbacks, so the running pump never calls a stale one.
  const live = useRef({ upload, stored, onStored, announce, t })
  live.current = { upload, stored, onStored, announce, t }

  const setJobs = useCallback((fn: (j: UploadJob[]) => UploadJob[]) => {
    jobsRef.current = fn(jobsRef.current)
    setJobsState(jobsRef.current)
  }, [])
  const patch = useCallback((key: string, p: Partial<UploadJob>) => {
    setJobs(js => js.map(j => (j.key === key ? { ...j, ...p } : j)))
  }, [setJobs])

  const pump = useCallback(async () => {
    if (busy.current) return
    const next = jobsRef.current.find(j => j.status === 'queued')
    if (!next) return
    busy.current = true
    patch(next.key, { status: 'uploading', progress: 0 })
    live.current.announce(live.current.t('aUploading', { name: next.name }))
    let r: UploadResult
    try {
      r = await live.current.upload(next.file, next.name, pct => patch(next.key, { progress: pct }))
    } catch {
      r = { ok: false, error: live.current.t('errNetwork'), retryable: true }
    }
    if (r.ok) {
      setJobs(js => js.filter(j => j.key !== next.key))
      live.current.onStored(r.attachment, next)
      live.current.announce(live.current.t('aUploaded', { name: r.attachment.filename }))
    } else {
      patch(next.key, { status: 'failed', error: r.error, retryable: r.retryable, progress: null })
      live.current.announce(live.current.t('aFailed', { name: next.name, reason: r.error }))
    }
    busy.current = false
    void pump()
  }, [patch, setJobs])

  const makeJob = useCallback((file: File, name: string, forComment: boolean, replaces?: string): UploadJob =>
    ({ key: `j${++seq.current}`, file, name, progress: 0, status: 'queued', forComment, replaces }), [])

  /**
   * Take files from a paste, a drop, the picker or the comment box. Returns how
   * many were skipped over the per-go cap (FR-057).
   */
  const intake = useCallback((files: File[], opts: { forComment?: boolean; names?: string[] } = {}) => {
    const taken   = files.slice(0, MAX_ATTACHMENTS_PER_GO)
    const skipped = files.length - taken.length
    const limit   = limitFor(hasStorage)
    const limitText = live.current.t(hasStorage ? 'limitShortStorage' : 'limitShortInline')
    const add: UploadJob[] = []
    const ask: DuplicatePrompt[] = []

    taken.forEach((file, i) => {
      const name = opts.names?.[i] ?? file.name
      const forComment = !!opts.forComment
      if (file.size > limit) {
        add.push({ ...makeJob(file, name, forComment), status: 'too-large', progress: null,
          error: live.current.t('tooLargeDetail', { size: formatBytes(file.size), limit: limitText }) })
        live.current.announce(live.current.t('aTooLarge', { name, size: formatBytes(file.size), limit: limitText }))
        return
      }
      const clash = live.current.stored().find(s => sameName(s.filename, name))
      if (clash) { ask.push({ file, name, existingId: clash.id, forComment }); return }
      add.push(makeJob(file, name, forComment))
    })

    if (add.length) setJobs(js => [...add, ...js])
    if (ask.length) setDupes([...dupesRef.current, ...ask])
    void pump()
    return skipped
  }, [hasStorage, makeJob, pump, setDupes, setJobs])

  /** Replace it · Keep both · Cancel, for the first waiting duplicate (FR-056). */
  const resolveDupe = useCallback((how: 'replace' | 'both' | 'cancel') => {
    const [first, ...rest] = dupesRef.current
    if (!first) return
    setDupes(rest)
    if (how === 'replace') {
      const job = makeJob(first.file, first.name, first.forComment, first.existingId)
      setJobs(js => [job, ...js])
    } else if (how === 'both') {
      const names = [...live.current.stored().map(s => s.filename), ...jobsRef.current.map(j => j.name)]
      const job = makeJob(first.file, nextFreeName(first.name, names), first.forComment)
      setJobs(js => [job, ...js])
    }
    void pump()
  }, [makeJob, pump, setDupes, setJobs])

  const retry = useCallback((key: string) => {
    patch(key, { status: 'queued', error: undefined, progress: 0 })
    void pump()
  }, [patch, pump])

  const remove = useCallback((key: string) => {
    setJobs(js => js.filter(j => j.key !== key))
  }, [setJobs])

  return { jobs, dupe: dupes[0] ?? null, intake, resolveDupe, retry, remove }
}
