import type { TaskAttachment } from '@/types/index'

/**
 * Attachment helpers — kind detection and cover selection.
 *
 * Kind comes from the filename, never the URL: the imported ClickUp links are
 * percent-encoded and carry the extension inside a path segment, so parsing
 * them is both harder and less reliable than reading the name we stored.
 */

const IMAGE_EXT = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'avif', 'bmp', 'heic']
const VIDEO_EXT = ['mp4', 'mov', 'webm', 'avi', 'mkv']
const AUDIO_EXT = ['mp3', 'wav', 'm4a', 'aac', 'ogg']
const DOC_EXT   = ['pdf', 'doc', 'docx', 'ppt', 'pptx', 'xls', 'xlsx', 'csv', 'txt', 'srt']

export type AttachmentKind = 'image' | 'video' | 'audio' | 'doc' | 'other'

export function extensionOf(filename: string): string {
  const base = filename.split('/').pop() ?? filename
  const dot  = base.lastIndexOf('.')
  if (dot === -1) return ''
  // "english_pure.srt copy" — take the first word of the tail, not the lot.
  return base.slice(dot + 1).trim().split(/\s+/)[0].toLowerCase()
}

export function attachmentKind(filename: string): AttachmentKind {
  const ext = extensionOf(filename)
  if (IMAGE_EXT.includes(ext)) return 'image'
  if (VIDEO_EXT.includes(ext)) return 'video'
  if (AUDIO_EXT.includes(ext)) return 'audio'
  if (DOC_EXT.includes(ext))   return 'doc'
  return 'other'
}

export function isImageAttachment(a: { filename: string; url?: string | null }): boolean {
  return Boolean(a.url) && attachmentKind(a.filename) === 'image'
}

/** Newest first. Ties keep their incoming order, which is stable enough here. */
export function sortByNewest<T extends { uploaded_at?: string }>(list: T[]): T[] {
  return [...list].sort((a, b) => (b.uploaded_at ?? '').localeCompare(a.uploaded_at ?? ''))
}

export function imageAttachments(
  list: TaskAttachment[] | undefined,
): TaskAttachment[] {
  return sortByNewest((list ?? []).filter(isImageAttachment))
}

/**
 * What a card or panel shows as its cover.
 *
 * An explicitly set cover_image_url always wins — someone chose it. Otherwise
 * the most recently uploaded image attachment stands in, so a task picks up
 * the latest artwork without anyone having to set a field.
 */
export function coverImageFor(task: {
  cover_image_url?: string | null
  attachments?: TaskAttachment[]
}): string | null {
  if (task.cover_image_url) return task.cover_image_url
  return imageAttachments(task.attachments)[0]?.url ?? null
}

/** Single glyph per kind, for the non-image file rows. */
export function kindIcon(kind: AttachmentKind): string {
  switch (kind) {
    case 'image': return '🖼'
    case 'video': return '▶'
    case 'audio': return '♪'
    case 'doc':   return '📄'
    default:      return '📎'
  }
}

/** "2.4 MB" — only used when a size is known, which imports don't carry. */
export function shortName(filename: string, max = 28): string {
  if (filename.length <= max) return filename
  const ext = extensionOf(filename)
  const head = filename.slice(0, max - ext.length - 2)
  return `${head}…${ext ? '.' + ext : ''}`
}
