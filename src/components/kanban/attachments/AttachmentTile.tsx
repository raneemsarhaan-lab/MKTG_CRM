'use client'

import { useEffect, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import type { TaskAttachment } from '@/types/index'
import { attachmentSrc, extensionOf, isImageAttachment } from '@/lib/attachments'
import { initials, avatarColor } from '@/lib/utils'
import { AttIcon } from './icons'
import { ageLabel } from './order'
import { firstName, renamedTo, splitExt, splitName } from './names'
import { formatBytes } from './limits'
import { downloadProps, kindColor } from './AttachmentPreview'
import type { UploadJob } from './useUploadQueue'

/** The name in at most two lines, keeping its ending (FR-005). */
function NameLines({ name }: { name: string }) {
  const s = splitName(name)
  return 'whole' in s
    ? <>{s.whole}</>
    : <><span className="fx-att-l1">{s.head}</span><span className="fx-att-l2">{s.tail}</span></>
}

function Avatar({ name }: { name: string }) {
  return (
    <span aria-hidden="true" style={{
      width: 18, height: 18, borderRadius: '50%', flexShrink: 0, background: avatarColor(name),
      color: 'var(--panel)', fontSize: 8, fontWeight: 700, display: 'inline-grid', placeItems: 'center',
    }}>
      {initials(name)}
    </span>
  )
}

function Thumb({ a, children }: { a: Pick<TaskAttachment, 'filename' | 'url' | 'data'>; children?: React.ReactNode }) {
  const image = isImageAttachment(a)
  const ext = extensionOf(a.filename)
  return (
    <span className="fx-att-thumb">
      {image
        // eslint-disable-next-line @next/next/no-img-element
        ? <img src={attachmentSrc(a) ?? ''} alt="" loading="lazy" />
        : (
          <span className="fx-att-file">
            <AttIcon name="file" size={34} width={1.5} />
            <span className="fx-att-badge" style={{ background: kindColor(a.filename) }}>{(ext || 'file').toUpperCase()}</span>
          </span>
        )}
      {children}
    </span>
  )
}

/**
 * A stored file (spec 007 US1, US3, US5, US8): the picture opens the preview,
 * the name renames in place, Download and Delete sit on the picture's corner
 * (one ⋯ menu on touch screens).
 */
export function AttachmentTile({
  a, who, isLatest, canEdit, renaming, menuOpen,
  onPreview, onStartRename, onRename, onDelete, onMenu,
}: {
  a: TaskAttachment
  who: string
  isLatest: boolean
  canEdit: boolean
  renaming: boolean
  menuOpen: boolean
  onPreview: () => void
  onStartRename: () => void
  /** The new full name, or null to keep the old one. */
  onRename: (next: string | null) => void
  onDelete: () => void
  onMenu: (open: boolean) => void
}) {
  const t = useTranslations('attachments')
  const age = ageLabel(a.uploaded_at, new Date())
  const { base, ext } = splitExt(a.filename)
  const [draft, setDraft] = useState(base)
  const inputRef = useRef<HTMLInputElement>(null)
  const menuRef  = useRef<HTMLDivElement>(null)
  const moreRef  = useRef<HTMLButtonElement>(null)
  const done     = useRef(false)

  useEffect(() => {
    if (!renaming) return
    setDraft(base); done.current = false
    requestAnimationFrame(() => { inputRef.current?.focus(); inputRef.current?.select() })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [renaming])

  useEffect(() => {
    if (menuOpen) requestAnimationFrame(() => menuRef.current?.querySelector<HTMLElement>('a, button')?.focus())
  }, [menuOpen])

  function finish(save: boolean) {
    if (done.current) return
    done.current = true
    onRename(save ? renamedTo(draft, a.filename) : null)
  }

  const dl = downloadProps(a)

  return (
    <div className="fx-att-tile" data-att-tile={a.id}>
      <button
        type="button"
        className="fx-att-open"
        data-att-open={a.id}
        aria-label={t('previewName', { name: a.filename })}
        onClick={onPreview}
        onKeyDown={e => {
          if (!canEdit) return
          if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); onDelete() }
          if (e.key === 'F2') { e.preventDefault(); onStartRename() }
        }}
      >
        <Thumb a={a}>
          {isLatest && <span className="fx-att-pills"><span className="fx-att-pill is-latest">{t('latest')}</span></span>}
        </Thumb>
      </button>

      <div className="fx-att-info">
        {renaming ? (
          <span className="fx-att-rename">
            <input
              ref={inputRef}
              value={draft}
              aria-label={t('renameField', { name: a.filename })}
              onChange={e => setDraft(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') { e.preventDefault(); finish(true) }
                if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); finish(false) }
              }}
              onBlur={() => finish(true)}
            />
            {ext && <span>{ext}</span>}
          </span>
        ) : canEdit ? (
          <button
            type="button"
            className="fx-att-name"
            data-att-name={a.id}
            title={t('clickToRename')}
            aria-label={t('renameName', { name: a.filename })}
            onClick={onStartRename}
            onKeyDown={e => { if (e.key === 'F2') { e.preventDefault(); onStartRename() } }}
          >
            <NameLines name={a.filename} />
          </button>
        ) : (
          <span className="fx-att-name" title={a.filename}><NameLines name={a.filename} /></span>
        )}
        <span className="fx-att-meta">
          <Avatar name={who} />
          <span>{firstName(who)} · {t(age.key, 'n' in age ? { n: age.n } : {})}</span>
        </span>
      </div>

      <div className={`fx-att-acts${menuOpen ? ' is-open' : ''}`}>
        {dl.href && (
          <a className="fx-att-act" {...dl} aria-label={t('downloadName', { name: a.filename })} title={t('download')}>
            <AttIcon name="download" size={15} />
          </a>
        )}
        {canEdit && (
          <button type="button" className="fx-att-act is-danger" onClick={onDelete}
                  aria-label={t('deleteName', { name: a.filename })} title={t('delete')}>
            <AttIcon name="trash" size={15} />
          </button>
        )}
        <button ref={moreRef} type="button" className="fx-att-act is-more" data-att-more={a.id}
                aria-haspopup="menu" aria-expanded={menuOpen}
                aria-label={t('moreName', { name: a.filename })} onClick={() => onMenu(!menuOpen)}>
          <AttIcon name="dots" size={16} />
        </button>
      </div>

      {menuOpen && (
        <div
          ref={menuRef}
          className="fx-att-menu"
          role="menu"
          data-att-menu=""
          onKeyDown={e => {
            if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); onMenu(false); moreRef.current?.focus() }
            if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
              e.preventDefault()
              const items = Array.from(menuRef.current?.querySelectorAll<HTMLElement>('a, button') ?? [])
              const i = items.indexOf(document.activeElement as HTMLElement)
              items[(i + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length]?.focus()
            }
          }}
        >
          {dl.href && (
            <a role="menuitem" {...dl} onClick={() => onMenu(false)}>
              <AttIcon name="download" size={15} /> {t('download')}
            </a>
          )}
          {canEdit && (
            <button type="button" role="menuitem" onClick={() => { onMenu(false); onStartRename() }}>
              <AttIcon name="pencil" size={15} /> {t('rename')}
            </button>
          )}
          {canEdit && (
            <button type="button" role="menuitem" className="is-danger" onClick={() => { onMenu(false); onDelete() }}>
              <AttIcon name="trash" size={15} /> {t('delete')}
            </button>
          )}
        </div>
      )}
    </div>
  )
}

/** A deleted file waiting out its Undo window (FR-031): same size as a tile. */
export function GhostTile({ a, onUndo }: { a: TaskAttachment; onUndo: () => void }) {
  const t = useTranslations('attachments')
  const short = a.filename.length > 40 ? `${a.filename.slice(0, 38)}…` : a.filename
  return (
    <div className="fx-att-tile fx-att-ghost" data-att-ghost={a.id} role="status">
      <span className="fx-att-thumb">
        <b>{t('deletedTile', { name: short })}</b>
        <button type="button" className="fx-att-undo" data-undo={a.id} onClick={onUndo}>{t('undo')}</button>
        <span className="fx-att-secs">{t('seconds', { n: 5 })}</span>
        <span className="fx-att-timer" />
      </span>
      <span className="fx-att-info"><span className="fx-att-name" aria-hidden="true" /><span className="fx-att-meta">&nbsp;</span></span>
    </div>
  )
}

/** A file being added, or one that was refused or failed (FR-053–FR-055). */
export function JobTile({ job, onRetry, onRemove }: {
  job: UploadJob
  onRetry: () => void
  onRemove: () => void
}) {
  const t = useTranslations('attachments')
  const isImage = job.file.type.startsWith('image/')
  // The local picture while it uploads: the same bytes, shown before the server has them.
  // Created and revoked in the same effect, keyed on the file alone, so the
  // picture never points at a link that has already been revoked (React runs
  // effects twice in development; a memoised link did not survive that).
  const tooLarge = job.status === 'too-large'
  const [preview, setPreview] = useState<string | null>(null)
  useEffect(() => {
    if (!isImage || tooLarge) return
    const url = URL.createObjectURL(job.file)
    setPreview(url)
    return () => URL.revokeObjectURL(url)
  }, [job.file, isImage, tooLarge])
  const failed = job.status === 'failed' || job.status === 'too-large'

  return (
    <div className={`fx-att-tile${failed ? ' is-error' : ''}`} data-att-job={job.key} data-att-job-status={job.status}>
      <div className="fx-att-open" style={{ cursor: 'default' }}>
        <Thumb a={{ filename: job.name, data: preview ?? undefined }}>
          <span className="fx-att-pills">
            <span className={`fx-att-pill ${failed ? 'is-error' : 'is-uploading'}`}>
              {job.status === 'too-large' ? t('tooLarge') : job.status === 'failed' ? t('notUploaded') : t('uploading')}
            </span>
          </span>
          {!failed && (
            <span className={`fx-att-prog${job.progress == null ? ' is-indeterminate' : ''}`}
                  role="progressbar" aria-label={t('aUploading', { name: job.name })}
                  aria-valuemin={0} aria-valuemax={100} aria-valuenow={job.progress ?? undefined}>
              <i style={job.progress == null ? undefined : { width: `${job.progress}%` }} />
            </span>
          )}
        </Thumb>
      </div>
      <div className="fx-att-info">
        <span className="fx-att-name" title={job.name}><NameLines name={job.name} /></span>
        <span className={`fx-att-meta${failed ? ' is-error' : ''}`}>
          <span>{failed ? job.error : `${job.progress == null ? '' : `${job.progress}% · `}${formatBytes(job.file.size)}`}</span>
        </span>
      </div>
      {failed && (
        <div className="fx-att-fixes">
          {job.status === 'failed' && job.retryable && (
            <button type="button" className="fx-att-btn" onClick={onRetry}>{t('retry')}</button>
          )}
          <button type="button" className="fx-att-btn is-danger" onClick={onRemove}>{t('remove')}</button>
        </div>
      )}
    </div>
  )
}
