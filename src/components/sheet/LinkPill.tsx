'use client'

/**
 * A file or link shown as an icon pill (design/video-sheet-v4.html): a play
 * icon for a video file, the Drive mark for Drive and Docs, an image or file
 * icon for other uploads, a link icon for any other web address, and ↗ for
 * the task. "+N" says how many more there are.
 */
import type { TaskAttachment } from '@/types/index'

export type PillKind = 'video' | 'image' | 'file' | 'drive' | 'link' | 'task'

const VIDEO_RE = /\.(mp4|mov|m4v|webm|avi|mkv)$/i
const IMAGE_RE = /\.(png|jpe?g|gif|webp|svg|heic)$/i

export function hostOf(url: string | null | undefined): string {
  try { return new URL(url ?? '').hostname.replace(/^www\./, '') } catch { return '' }
}
export const isDriveHost = (host: string) => /(^|\.)(drive|docs)\.google\.com$/.test(host)

/** The pill a web address gets. */
export const linkKind = (url: string | null | undefined): PillKind => (isDriveHost(hostOf(url)) ? 'drive' : 'link')

/** The pill an uploaded file gets, by its type or name. */
export function fileKind(a: Pick<TaskAttachment, 'filename' | 'content_type'>): PillKind {
  const type = a.content_type ?? ''
  if (type.startsWith('video/') || VIDEO_RE.test(a.filename)) return 'video'
  if (type.startsWith('image/') || IMAGE_RE.test(a.filename)) return 'image'
  return 'file'
}

function Icon({ kind }: { kind: PillKind }) {
  switch (kind) {
    case 'video':
      return <svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true"><rect x="1.5" y="3" width="13" height="10" rx="2.5" fill="currentColor" opacity=".18" /><path d="M6.5 5.8v4.4l3.8-2.2z" fill="currentColor" /></svg>
    case 'image':
      return <svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true"><rect x="1.5" y="2.5" width="13" height="11" rx="2" fill="currentColor" opacity=".18" /><circle cx="5.5" cy="6" r="1.4" fill="currentColor" /><path d="M2.5 12l3.5-3.5 2.5 2.5 2-2 3 3z" fill="currentColor" /></svg>
    case 'drive':
      return <svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true"><path d="M5.6 2l4.1 7.1H1.5z" fill="currentColor" opacity=".55" /><path d="M10.4 2l4.1 7.1-2.4 4.1-4.1-7.1z" fill="currentColor" opacity=".8" /><path d="M3.9 13.2l2.4-4.1h8.2l-2.4 4.1z" fill="currentColor" /></svg>
    case 'task':
      return <svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true"><path d="M5 11l6-6M6.5 5H11v4.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
    case 'link':
      return <svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true"><path d="M6.8 9.2a2.6 2.6 0 0 0 3.7 0l2.2-2.2a2.6 2.6 0 0 0-3.7-3.7l-.9.9M9.2 6.8a2.6 2.6 0 0 0-3.7 0L3.3 9a2.6 2.6 0 0 0 3.7 3.7l.9-.9" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>
    default:
      return <svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true"><path d="M4 1.5h5l3 3v10H4z" fill="currentColor" opacity=".18" /><path d="M9 1.5v3h3" fill="none" stroke="currentColor" strokeWidth="1.4" /></svg>
  }
}

/** One pill. With `href` it is a link that opens in a new tab (the cell's own click still selects it). */
export function LinkPill({ kind, text, href, title }: { kind: PillKind; text: string; href?: string | null; title?: string }) {
  const cls = `fx-pill is-${kind}`
  // File names and web addresses stay as they are when the page is machine-translated.
  const body = <><Icon kind={kind} /><span className="fx-pill-text" translate={kind === 'task' ? undefined : 'no'}>{text}</span></>
  return href
    ? <a className={cls} href={href} target="_blank" rel="noopener noreferrer" tabIndex={-1} title={title ?? href} onClick={e => e.stopPropagation()}>{body}</a>
    : <span className={cls} title={title ?? text}>{body}</span>
}

/** "+2": how many more files there are. */
export const MorePill = ({ n, title }: { n: number; title: string }) => <span className="fx-pill is-more" title={title}>+{n}</span>
