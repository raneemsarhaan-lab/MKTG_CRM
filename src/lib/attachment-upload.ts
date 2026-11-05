'use client'

/**
 * Uploading a file to a task: one path for the task panel's Attachments
 * section (spec 007) and the video sheet's Files cell (spec 008 research R8).
 *
 * Moved out of TaskModal unchanged in behaviour:
 * - with a bucket, the original goes there by XMLHttpRequest (real progress),
 *   to its own URL, and only our own JSON echoing this request's ref counts as
 *   stored;
 * - without one, the original is read as a data URL and stored as it is;
 * - nothing is ever shrunk or re-encoded (spec 007 FR-059), so a file over the
 *   limit is refused, before anything is read.
 *
 * The board's small cover thumbnail is a separate copy: a picture scaled to
 * 360 px, or for a video one frame drawn in the browser where it can decode it.
 */
import type { TaskAttachment } from '@/types/index'
import { addAttachments, setCoverThumb } from '@/actions/tasks'
import { MAX_ATTACHMENT_CHARS, MAX_INLINE_BYTES, MAX_UPLOAD_BYTES } from '@/lib/attachments'
import { formatBytes } from '@/components/kanban/attachments/limits'
import type { UploadFn } from '@/components/kanban/attachments/useUploadQueue'

/** The `attachments` message translator (next-intl), or any function with its shape. */
export type AttachT = (key: string, values?: Record<string, string | number>) => string

export type StorageResult =
  | { ok: true; attachment: TaskAttachment }
  | { ok: false; error: string; retryable: boolean }

/** Read a file exactly as it is. */
export function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload  = () => resolve(String(r.result))
    r.onerror = () => reject(new Error('unreadable'))
    r.readAsDataURL(file)
  })
}

/**
 * Scale a picture to fit `max` on its longest edge and re-encode it. Only ever
 * used for thumbnails and logos, never for the stored file.
 */
export async function shrinkImage(file: File, max: number, quality = 0.82): Promise<string> {
  const bitmap = await createImageBitmap(file)
  const scale  = Math.min(1, max / Math.max(bitmap.width, bitmap.height))
  const w = Math.max(1, Math.round(bitmap.width * scale))
  const h = Math.max(1, Math.round(bitmap.height * scale))

  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('This browser cannot process images')
  ctx.drawImage(bitmap, 0, 0, w, h)
  bitmap.close?.()

  // A thumbnail is always JPEG: transparency does not matter at 360px and PNG
  // would be several times the size, which is the whole constraint here.
  const type = quality < 0.7
    ? 'image/jpeg'
    : file.type === 'image/png' || file.type === 'image/svg+xml' ? 'image/png' : 'image/jpeg'
  return canvas.toDataURL(type, quality)
}

/**
 * One frame of a video as a small JPEG, for the board card's cover (spec 008
 * FR-043). At 1 s, or half way through a shorter clip. Null when the browser
 * can't decode the file, or after 8 s. The video itself is untouched.
 */
export function videoPoster(file: File, max = 360): Promise<string | null> {
  return new Promise(resolve => {
    const url = URL.createObjectURL(file)
    const v = document.createElement('video')
    let done = false
    const finish = (out: string | null) => {
      if (done) return
      done = true
      clearTimeout(timer)
      v.removeAttribute('src'); v.load()
      URL.revokeObjectURL(url)
      resolve(out)
    }
    const timer = setTimeout(() => finish(null), 8000)
    v.muted = true
    v.preload = 'auto'
    v.playsInline = true
    v.onerror = () => finish(null)
    v.onloadedmetadata = () => {
      const d = Number.isFinite(v.duration) ? v.duration : 0
      v.currentTime = d > 2 ? 1 : d / 2
    }
    v.onseeked = () => {
      try {
        const scale = Math.min(1, max / Math.max(v.videoWidth || 1, v.videoHeight || 1))
        const c = document.createElement('canvas')
        c.width = Math.max(1, Math.round((v.videoWidth || 1) * scale))
        c.height = Math.max(1, Math.round((v.videoHeight || 1) * scale))
        const ctx = c.getContext('2d')
        if (!ctx || !v.videoWidth) { finish(null); return }
        ctx.drawImage(v, 0, 0, c.width, c.height)
        finish(c.toDataURL('image/jpeg', 0.62))
      } catch { finish(null) }
    }
    v.src = url
  })
}

/**
 * Upload one file to the bucket, with progress (spec 007 FR-053, research R5).
 * Never throws.
 */
export function uploadToStorage(
  taskId: string, file: File, name: string, onProgress: (pct: number | null) => void, t: AttachT,
): Promise<StorageResult> {
  if (file.size > MAX_UPLOAD_BYTES) {
    return Promise.resolve({ ok: false, retryable: false, error: t('tooLargeDetail', {
      size: formatBytes(file.size), limit: t('limitShortStorage') }) })
  }
  return new Promise(resolve => {
    /* Its own URL per file. Whatever sits in front of this deployment caches
     * upload replies whatever the response says; what such a cache keys on is
     * the URL, so a fresh path segment (not a query, which a cache may drop)
     * makes every upload distinct. The no-store header stays for when the
     * cache is fixed. */
    const ref  = crypto.randomUUID()
    const url  = `/api/attachments/${ref}`
    const body = new FormData()
    body.append('taskId', taskId)
    body.append('file', file, name)
    const xhr = new XMLHttpRequest()
    xhr.open('POST', url)
    xhr.setRequestHeader('Cache-Control', 'no-store')
    xhr.upload.onprogress = e => {
      if (e.lengthComputable) onProgress(Math.min(99, Math.round((e.loaded / e.total) * 100)))
    }
    xhr.onerror = () => resolve({ ok: false, retryable: true, error: t('errNetwork') })
    xhr.onabort = () => resolve({ ok: false, retryable: true, error: t('errNetwork') })
    xhr.onload = () => {
      let json: { ref?: string; error?: string; attachment?: TaskAttachment } | null = null
      try { json = JSON.parse(xhr.responseText) } catch { /* not ours */ }
      if (xhr.status < 200 || xhr.status >= 300) {
        resolve({ ok: false, error: json?.error ?? (xhr.statusText || `HTTP ${xhr.status}`),
          retryable: xhr.status >= 500 || xhr.status === 401 })
        return
      }
      /* A 200 is not proof the file was stored: an expired session is
       * redirected to the login page, which answers 200 with HTML. Only our
       * own JSON means it landed. */
      if (!json?.attachment) {
        const redirected = Boolean(xhr.responseURL) && !xhr.responseURL.includes(url)
        resolve({ ok: false, retryable: true, error: redirected ? t('errSession') : t('errUnexpected') })
        return
      }
      /* The reply has to be the reply to *this* request: a cached 200 once
       * carried somebody else's upload from days earlier. */
      if (json.ref !== ref) { resolve({ ok: false, retryable: true, error: t('errReplay') }); return }
      onProgress(100)
      resolve({ ok: true, attachment: { ...json.attachment, task_id: taskId } })
    }
    xhr.send(body)
  })
}

/**
 * The upload for one task (contracts/attachments-section.md): one file, under
 * the name chosen, with progress. `onStored` runs after a file is stored (the
 * board refreshes there).
 */
export function makeUploader({ taskId, hasStorage, t, onStored }: {
  taskId: string
  hasStorage: boolean
  t: AttachT
  onStored?: () => void
}): UploadFn {
  return async (file, name, onProgress) => {
    const isImage = file.type.startsWith('image/')
    const isVideo = file.type.startsWith('video/')
    const thumbFor = async () => (
      isImage ? await shrinkImage(file, 360, 0.62).catch(() => null)
      : isVideo ? await videoPoster(file).catch(() => null)
      : null
    )

    if (hasStorage) {
      const r = await uploadToStorage(taskId, file, name, onProgress, t)
      if (r.ok) {
        // Cosmetic, guarded, last: a failed thumbnail must not hide a stored file.
        const thumb = await thumbFor()
        if (thumb) { try { await setCoverThumb(taskId, thumb) } catch { /* preview only */ } }
        onStored?.()
      }
      return r
    }

    onProgress(null)   // a server action reports no progress
    const tooLarge = () => ({ ok: false as const, retryable: false, error: t('tooLargeDetail', {
      size: formatBytes(file.size), limit: t('limitShortInline') }) })
    if (file.size > MAX_INLINE_BYTES) return tooLarge()
    let data: string
    try { data = await readAsDataUrl(file) } catch { return { ok: false, retryable: true, error: t('errNetwork') } }
    if (data.length > MAX_ATTACHMENT_CHARS) return tooLarge()
    try {
      const res = await addAttachments(taskId, [{ filename: name, data }], await thumbFor())
      const row = res.rows?.[0]
      if (!res.success || !row) return { ok: false, retryable: false, error: res.error ?? t('errUnexpected') }
      onStored?.()
      return { ok: true, attachment: {
        id: row.id, task_id: taskId, filename: row.filename, data,
        uploaded_by: row.uploaded_by ?? undefined, uploaded_at: row.uploaded_at,
        size_bytes: row.size_bytes, content_type: row.content_type,
      } }
    } catch (e: unknown) {
      // The 8 MB action body limit: say so instead of a raw framework error.
      return String(e).includes('Body exceeded') ? tooLarge() : { ok: false, retryable: true, error: t('errNetwork') }
    }
  }
}
