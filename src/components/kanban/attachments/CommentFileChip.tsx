'use client'

import { useTranslations } from 'next-intl'
import type { TaskAttachment } from '@/types/index'
import { attachmentSrc, extensionOf, isImageAttachment } from '@/lib/attachments'
import { BRIEF_UI } from '@/lib/tokens'
import { AttIcon } from './icons'
import { kindColor } from './AttachmentPreview'

/**
 * A file shown on a comment (spec 007 FR-073, FR-074): its thumbnail or
 * extension badge and its current name. Opens the preview on that file.
 * A file that no longer exists reads "name · deleted" and does nothing.
 */
export function CommentFileChip({ file, name, onOpen, onRemove }: {
  /** The attachment as it is now, or null when it has been deleted. */
  file: TaskAttachment | null
  /** The name written into the comment, shown when the file is gone. */
  name: string
  onOpen?: (id: string) => void
  /** While writing: take the file off the comment (it stays on the task). */
  onRemove?: () => void
}) {
  const t = useTranslations('attachments')
  const label = file?.filename ?? name
  const short = label.length > 34 ? `${label.slice(0, 16)}…${label.slice(-15)}` : label
  const ext = extensionOf(label)

  const chipStyle: React.CSSProperties = {
    display: 'inline-flex', alignItems: 'center', gap: 6, height: 30, maxWidth: '100%',
    padding: '0 10px 0 4px', borderRadius: 8, border: `1px solid ${BRIEF_UI.line}`, background: 'var(--panel)',
    fontFamily: 'inherit', fontSize: 12.5, fontWeight: 600, color: file ? BRIEF_UI.ink : BRIEF_UI.faint,
    verticalAlign: 'middle', cursor: file && onOpen ? 'pointer' : 'default',
  }
  const thumb = file && isImageAttachment(file)
    // eslint-disable-next-line @next/next/no-img-element
    ? <img src={attachmentSrc(file) ?? ''} alt="" style={{ width: 22, height: 22, borderRadius: 5, objectFit: 'cover', flexShrink: 0 }} />
    : (
      <span aria-hidden="true" style={{
        width: 22, height: 22, borderRadius: 5, flexShrink: 0, display: 'inline-grid', placeItems: 'center',
        background: file ? kindColor(label) : BRIEF_UI.line, color: 'var(--panel)', fontSize: 7, fontWeight: 800,
      }}>
        {file ? (ext || 'file').toUpperCase().slice(0, 4) : <AttIcon name="file" size={12} />}
      </span>
    )
  const text = <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
    {file ? short : t('chipDeleted', { name: short })}
  </span>

  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 2, maxWidth: '100%' }} data-file-chip={file?.id ?? 'deleted'}>
      {file && onOpen
        ? <button type="button" onClick={e => { e.stopPropagation(); onOpen(file.id) }} title={label}
                  aria-label={t('openFile', { name: label })} style={chipStyle}>{thumb}{text}</button>
        : <span style={chipStyle} title={label}>{thumb}{text}</span>}
      {onRemove && (
        <button type="button" onClick={onRemove} aria-label={t('takeOff', { name: label })} title={t('takeOff', { name: label })}
                style={{
                  width: 22, height: 22, border: 'none', borderRadius: 6, background: 'transparent', cursor: 'pointer',
                  display: 'inline-grid', placeItems: 'center', color: BRIEF_UI.label, padding: 0,
                }}>
          <AttIcon name="close" size={12} />
        </button>
      )}
    </span>
  )
}
