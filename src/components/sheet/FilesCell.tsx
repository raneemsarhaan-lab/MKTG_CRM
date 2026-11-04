'use client'

/**
 * The Files cell (spec 008 FR-040–FR-046): what the clip has (a Drive link,
 * other links, uploaded files), an upload in progress, a refusal with "Paste a
 * link instead", or a failure with Retry.
 */
import type { useTranslations } from 'next-intl'
import type { TaskAttachment } from '@/types/index'
import { isLinkAttachment } from '@/lib/attachments'

export type FilesCellState =
  | { kind: 'uploading'; name: string; progress: number | null }
  | { kind: 'failed'; name: string; error: string; retryable: boolean; file: File }
  | { kind: 'tooLarge'; name: string; size: string; limit: string }

export function splitFiles(attachments: TaskAttachment[] | undefined) {
  const links = (attachments ?? []).filter(isLinkAttachment)
  const files = (attachments ?? []).filter(a => !isLinkAttachment(a))
  const drive = links.some(l => /(^|\.)(drive|docs)\.google\.com$/.test(hostOf(l.url)))
  return { links, files, drive }
}

export function hostOf(url: string | undefined): string {
  try { return new URL(url ?? '').hostname.replace(/^www\./, '') } catch { return '' }
}

export function FilesContent({ attachments, state, canEdit, t, onRetry, onLinkInstead }: {
  attachments: TaskAttachment[] | undefined
  state: FilesCellState | undefined
  canEdit: boolean
  t: ReturnType<typeof useTranslations>
  onRetry(): void
  onLinkInstead(): void
}) {
  if (state?.kind === 'uploading') {
    return (
      <>
        <span className="fx-sheet-ellipsis fx-sheet-muted">
          {state.progress == null ? t('files.uploadingNoPct', { name: state.name }) : t('files.uploading', { name: state.name, pct: state.progress })}
        </span>
        <span className="fx-sheet-prog" role="progressbar" aria-label={state.name}
              aria-valuemin={0} aria-valuemax={100} aria-valuenow={state.progress ?? undefined}>
          <i style={state.progress == null ? undefined : { width: `${state.progress}%` }} className={state.progress == null ? 'is-indeterminate' : undefined} />
        </span>
      </>
    )
  }
  if (state?.kind === 'tooLarge') {
    return (
      <span className="fx-sheet-files">
        <span className="fx-sheet-err fx-sheet-ellipsis" title={t('files.tooLargeDetail', { size: state.size, limit: state.limit })}>
          {t('files.tooLarge', { size: state.size })}
        </span>
        {canEdit && <span className="fx-sheet-fbtn" role="button" tabIndex={-1} data-link-instead=""
              onClick={e => { e.stopPropagation(); onLinkInstead() }}>{t('files.linkInstead')}</span>}
      </span>
    )
  }
  if (state?.kind === 'failed') {
    return (
      <span className="fx-sheet-files">
        <span className="fx-sheet-err fx-sheet-ellipsis" title={`${state.name}: ${state.error}`}>{state.error}</span>
        {state.retryable && <span className="fx-sheet-fbtn" role="button" tabIndex={-1} data-retry=""
              onClick={e => { e.stopPropagation(); onRetry() }}>{t('files.retry')}</span>}
      </span>
    )
  }
  const { links, files, drive } = splitFiles(attachments)
  if (!links.length && !files.length) {
    return canEdit ? <span className="fx-sheet-muted">{t('files.add')}</span> : null
  }
  return (
    <span className="fx-sheet-files">
      {links.length > 0 && <span className="fx-sheet-tag">{drive ? t('files.drive') : t('files.link')}</span>}
      {files.length > 0 && <span className="fx-sheet-tag">{t('files.count', { count: files.length })}</span>}
    </span>
  )
}
