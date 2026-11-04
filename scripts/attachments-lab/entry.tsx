/**
 * Attachments lab: mounts the real AttachmentsSection and the bottom Undo
 * message with a stub host, so scenarios.mjs can drive them in a browser
 * without a database or a login (spec 007 quickstart §2).
 *
 * Modes come from the hash, e.g. `#files=many&storage=0&locale=ar&readonly=1`:
 *   files     default | many | none      what the fake server starts with
 *   storage   1 | 0                       hasStorage (limit 200 MB, or about 5 MB)
 *   readonly  1                           canEdit = false
 *   locale    en | ar
 *   load      ms                          how long load() takes (default 300)
 *
 * Everything scenarios assert on is on `window.__lab`.
 */
import React, { useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { NextIntlClientProvider } from 'next-intl'
import en from '../../messages/en.json'
import ar from '../../messages/ar.json'
import type { TaskAttachment } from '@/types/index'
import { AttachmentsSection, type AttachmentsHandle, type UploadFn } from '@/components/kanban/attachments/AttachmentsSection'
import { CommentFileChip } from '@/components/kanban/attachments/CommentFileChip'
import { PendingDeleteMessage } from '@/components/shared/PendingDeleteMessage'
import { configurePendingDeletes } from '@/lib/pending-deletes'
import { formatFileToken, parseFileTokens } from '@/lib/comment-files'
import { MEMBERS, ME, TASK_ID, defaultFiles, manyFiles, uuid, poster, dataUrlToFile, sizedFile } from './fixtures'

const params   = new URLSearchParams(location.hash.slice(1))
const locale   = params.get('locale') === 'ar' ? 'ar' : 'en'
const storage  = params.get('storage') !== '0'
const readonly = params.get('readonly') === '1'
const loadMs   = Number(params.get('load') ?? 300)
const filesMode = params.get('files') ?? 'default'

type Lab = {
  /** The fake database. */
  server: TaskAttachment[]
  uploads: { name: string; size: number; file: File; at: number }[]
  /** Files handed to addFiles by the lab helpers, to compare with what reached upload. */
  added: File[]
  removes: { id: string; at: number }[]
  renames: { id: string; name: string }[]
  loads: number
  /** Fail the next upload at this percentage (0 = no failure). */
  failAt: number
  uploadStepMs: number
  comments: string[]
  handle: AttachmentsHandle | null
  mounted: boolean
  unmount(): void
  remount(): void
  /** Lab helpers that build files in the page. */
  poster: typeof poster
  dataUrlToFile: typeof dataUrlToFile
  sizedFile: typeof sizedFile
}
declare global { interface Window { __lab: Lab } }

const initial = filesMode === 'many' ? manyFiles() : filesMode === 'none' ? [] : defaultFiles()
const lab: Lab = window.__lab = {
  server: initial.map(f => ({ ...f })),
  uploads: [], added: [], removes: [], renames: [], loads: 0, failAt: 0, uploadStepMs: 40, comments: [],
  handle: null, mounted: true,
  unmount: () => {}, remount: () => {},
  poster, dataUrlToFile, sizedFile,
}

document.documentElement.lang = locale
document.documentElement.dir  = locale === 'ar' ? 'rtl' : 'ltr'

const wait = (ms: number) => new Promise(r => setTimeout(r, ms))
const readData = (f: File) => new Promise<string>((res, rej) => {
  const r = new FileReader(); r.onload = () => res(String(r.result)); r.onerror = () => rej(r.error); r.readAsDataURL(f)
})

// The fake server delete, recorded with its time (no-store-before-window).
configurePendingDeletes(async id => {
  lab.removes.push({ id, at: Date.now() })
  lab.server = lab.server.filter(f => f.id !== id)
  return { success: true }
})

const load = async () => { lab.loads++; await wait(loadMs); return lab.server.map(f => ({ ...f })) }

/** The stub upload: scripted progress, an optional failure, a stored row. */
const upload: UploadFn = async (file, name, onProgress) => {
  lab.uploads.push({ name, size: file.size, file, at: Date.now() })
  const failAt = lab.failAt
  lab.failAt = 0
  if (!storage) onProgress(null)
  for (let p = 0; p <= 100; p += 20) {
    if (failAt && p >= failAt) return { ok: false, error: 'the connection dropped', retryable: true }
    if (storage) onProgress(p)
    await wait(lab.uploadStepMs)
  }
  const data = file.size < 50_000_000 ? await readData(file).catch(() => undefined) : undefined
  const row: TaskAttachment = {
    id: uuid(), task_id: TASK_ID, filename: name, data, uploaded_by: ME.id,
    uploaded_at: new Date().toISOString(), size_bytes: file.size, content_type: file.type || null,
  }
  lab.server.push(row)
  return { ok: true, attachment: row }
}

const rename = async (id: string, name: string) => {
  await wait(80)
  lab.renames.push({ id, name })
  lab.server = lab.server.map(f => (f.id === id ? { ...f, filename: name } : f))
  return { success: true, filename: name }
}

/** Like the task panel: a 📎 count, the section, and a comment box with file chips. */
function Host() {
  const handle = useRef<AttachmentsHandle>(null)
  const [files, setFiles] = useState<TaskAttachment[]>(initial)
  const [draft, setDraft] = useState<string[]>([])
  const [text, setText] = useState('')
  const [comments, setComments] = useState<string[]>([])
  const textRef = useRef<HTMLTextAreaElement>(null)

  // The host's paste and drop routing (TaskModal does the same).
  React.useEffect(() => {
    lab.handle = handle.current
    const onPaste = (e: ClipboardEvent) => {
      if (e.defaultPrevented) return
      const pasted = Array.from(e.clipboardData?.files ?? [])
      if (!pasted.length) return
      e.preventDefault()
      handle.current?.addFiles(pasted, { source: 'paste', forComment: e.target === textRef.current })
    }
    const onDrop = (e: DragEvent) => {
      if (!Array.from(e.dataTransfer?.types ?? []).includes('Files')) return
      e.preventDefault()
      handle.current?.addFiles(Array.from(e.dataTransfer?.files ?? []), { source: 'drop' })
    }
    const onOver = (e: DragEvent) => e.preventDefault()
    window.addEventListener('paste', onPaste)
    window.addEventListener('drop', onDrop)
    window.addEventListener('dragover', onOver)
    return () => { window.removeEventListener('paste', onPaste); window.removeEventListener('drop', onDrop); window.removeEventListener('dragover', onOver) }
  }, [])

  const post = () => {
    const tokens = draft.map(id => files.find(f => f.id === id)).filter(Boolean).map(f => formatFileToken(f!.filename, f!.id))
    const body = [text.trim(), ...tokens].filter(Boolean).join('\n')
    if (!body) return
    lab.comments.push(body)
    setComments(c => [...c, body]); setDraft([]); setText('')
  }

  return (
    <>
      {createPortal(
        <button type="button" data-att-count="" onClick={() => handle.current?.reveal()}>📎 {files.length}</button>,
        document.getElementById('header')!,
      )}
      <AttachmentsSection
        handle={handle}
        taskId={TASK_ID}
        initialRows={initial}
        load={load}
        members={MEMBERS}
        ownerName={ME.name}
        canEdit={!readonly}
        hasStorage={storage}
        upload={upload}
        rename={rename}
        onStoredForComment={a => setDraft(d => [...d, a.id])}
        onFilesChange={setFiles}
      />
      {createPortal(
        <div>
          {comments.map((c, i) => {
            const tokens = parseFileTokens(c)
            const textPart = tokens.length ? c.slice(0, tokens[0].start).trim() : c
            return (
              <div key={i} className="cmt" data-comment={i}>
                {textPart}
                {tokens.map(tk => (
                  <div key={tk.start}>
                    <CommentFileChip file={files.find(f => f.id === tk.id) ?? null} name={tk.name}
                                     onOpen={id => { handle.current?.openPreview(id) }} />
                  </div>
                ))}
              </div>
            )
          })}
          <div data-draft="">
            {draft.map(id => (
              <CommentFileChip key={id} file={files.find(f => f.id === id) ?? null} name=""
                               onRemove={() => setDraft(d => d.filter(x => x !== id))} />
            ))}
          </div>
          <textarea id="ctext" ref={textRef} value={text} onChange={e => setText(e.target.value)} placeholder="Write a comment" />
          <button type="button" id="clip" onClick={() => handle.current?.pick({ forComment: true })}>📎 attach</button>
          <button type="button" id="send" onClick={post}>Comment</button>
        </div>,
        document.getElementById('comments')!,
      )}
    </>
  )
}

import { createPortal } from 'react-dom'

const messages = locale === 'ar' ? ar : en
const sectionRoot = createRoot(document.getElementById('root')!)
const mount = () => {
  lab.mounted = true
  sectionRoot.render(
    <NextIntlClientProvider locale={locale} messages={messages} timeZone="UTC"><Host /></NextIntlClientProvider>,
  )
}
lab.unmount = () => { lab.mounted = false; sectionRoot.render(<></>) }
lab.remount = mount
mount()

createRoot(document.getElementById('message')!).render(
  <NextIntlClientProvider locale={locale} messages={messages} timeZone="UTC"><PendingDeleteMessage /></NextIntlClientProvider>,
)
