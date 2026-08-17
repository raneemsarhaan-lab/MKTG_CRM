'use client'

import { useState, useEffect, useMemo, useRef, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import type { Task, Member, Stage, TaskComment, TaskAttachment, SLAConfig, StageId } from '@/types/index'
import type { Brand } from '@/types/index'
import { STAGE_META, nextStageId, EIGHT_STAGE, NINE_STAGE } from '@/lib/stage-meta'
import { COLORS } from '@/lib/tokens'
import { initials, avatarColor, calDaysBetween } from '@/lib/utils'
import {
  moveTask, setTaskStage, addComment, updateTask, createSubtask,
  addAttachments, removeAttachment, loadAttachments,
  type TaskPatch,
} from '@/actions/tasks'
import { InlineValue } from './EditableCell'
import { BriefEditor } from './BriefEditor'
import { Brief } from '@/components/shared/Brief'
import { coverImageFor } from '@/lib/attachments'
import {
  isImageAttachment, shortName, attachmentSrc,
  MAX_ATTACHMENT_CHARS, MAX_ATTACHMENTS_PER_GO,
} from '@/lib/attachments'
import { ImageWithFallback } from '@/components/shared/ImageWithFallback'
import { useUIStore } from '@/store/useUIStore'

/**
 * Task detail — rebuilt to the ClickUp reference.
 *
 * The shape is ClickUp's: one full-width bar across the top carrying the
 * breadcrumb and the window controls, a wide left column, and a narrower
 * Activity rail pinned down the right with the composer at its foot. Inside
 * the left column the order is fixed — type chips, title, a two-up property
 * grid, the description, a collapsible Fields block, the action rows, then
 * attachments.
 *
 * What is *in* those slots is ours. Every row is backed by a real column and
 * a real server action; ClickUp rows we hold no data for (tags, tracked time,
 * start dates, dependencies, checklists) are left out rather than drawn as
 * controls that do nothing.
 */

type FullTask = Task & {
  brand: Brand
  task_owner: Member
  comments: (TaskComment & { author: Member })[]
  attachments?: TaskAttachment[]
}

const PLATFORMS  = ['LinkedIn', 'Instagram', 'TikTok', 'Facebook', 'Twitter', 'YouTube', 'Email']
const PRIORITIES = ['High', 'Medium', 'Low']

/** ClickUp's greys, sampled off the reference. */
const CU = {
  ink:        '#1A1A1A',
  text:       '#292D34',
  label:      '#7C828D',
  faint:      '#A5AAB3',
  line:       '#E8EAED',
  lineSoft:   '#F1F2F4',
  hover:      '#F7F8F9',
  chipBg:     '#F4F5F7',
  blue:       '#3B82F6',
} as const

interface TaskModalProps {
  task: FullTask
  currentUser: Member
  stages: Stage[]
  slaConfig: SLAConfig
  today: Date
  onClose: () => void
  brands?: Brand[]
  members?: Member[]
  contentTypes?: { id: string; label: string }[]
}

/* ── icons — 16px line set, ClickUp's weight ─────────────────────────── */

type IconName =
  | 'status' | 'user' | 'calendar' | 'flag' | 'clock' | 'tag' | 'folder'
  | 'link' | 'clip' | 'chevron' | 'chevronR' | 'chevronUp' | 'plus' | 'subtask'
  | 'search' | 'bell' | 'filter' | 'star' | 'panel' | 'close' | 'more'
  | 'brand' | 'type' | 'platform' | 'image' | 'target' | 'expand' | 'send'
  | 'at' | 'emoji' | 'video' | 'mic' | 'person' | 'sparkle' | 'openIn' | 'file'

function Icon({ name, size = 16, color = CU.label, width = 1.7, style }: {
  name: IconName; size?: number; color?: string; width?: number; style?: React.CSSProperties
}) {
  const p: Record<IconName, React.ReactNode> = {
    status:   <><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="3.2" fill={color} stroke="none" /></>,
    target:   <><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="3.2" fill={color} stroke="none" /></>,
    user:     <><circle cx="12" cy="8" r="3.6" /><path d="M5 20c0-3.6 3.1-5.6 7-5.6s7 2 7 5.6" /></>,
    person:   <><circle cx="12" cy="8" r="3.6" /><path d="M5 20c0-3.6 3.1-5.6 7-5.6s7 2 7 5.6" /></>,
    calendar: <><rect x="3.2" y="5" width="17.6" height="16" rx="2.4" /><path d="M16 3v4M8 3v4M3.2 10h17.6" /></>,
    flag:     <><path d="M5 21V4M5 4h11l-2 3.5L16 11H5" /></>,
    clock:    <><circle cx="12" cy="12" r="9" /><path d="M12 7.2V12l3.2 2" /></>,
    tag:      <><path d="M3.5 11.4V4.5a1 1 0 0 1 1-1h6.9a1 1 0 0 1 .7.3l8.1 8.1a1 1 0 0 1 0 1.4l-6.9 6.9a1 1 0 0 1-1.4 0L3.8 12.1a1 1 0 0 1-.3-.7z" /><circle cx="8" cy="8" r="1.3" /></>,
    folder:   <><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /></>,
    brand:    <><path d="M3.5 11.4V4.5a1 1 0 0 1 1-1h6.9a1 1 0 0 1 .7.3l8.1 8.1a1 1 0 0 1 0 1.4l-6.9 6.9a1 1 0 0 1-1.4 0L3.8 12.1a1 1 0 0 1-.3-.7z" /><circle cx="8" cy="8" r="1.3" /></>,
    type:     <><rect x="3" y="5" width="18" height="14" rx="2.2" /><path d="M3 9.5h18" /></>,
    platform: <><path d="M12 3v18M3 12h18" /><circle cx="12" cy="12" r="9" /></>,
    image:    <><rect x="3" y="4.5" width="18" height="15" rx="2.2" /><circle cx="8.5" cy="10" r="1.6" /><path d="m3.6 17.5 5-4.6 4 3.4 3-2.4 4.8 4" /></>,
    link:     <><path d="M10.6 13.4a4 4 0 0 0 5.7 0l2.8-2.8a4 4 0 1 0-5.7-5.7l-1.6 1.6" /><path d="M13.4 10.6a4 4 0 0 0-5.7 0l-2.8 2.8a4 4 0 1 0 5.7 5.7l1.6-1.6" /></>,
    openIn:   <><path d="M5 12v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6" /><path d="M12 3v12M8 7l4-4 4 4" /></>,
    clip:     <><path d="M21.4 11.05l-9.2 9.19a6 6 0 0 1-8.48-8.49l9.19-9.19a4 4 0 0 1 5.65 5.66l-9.19 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" /></>,
    chevron:  <path d="M6 9.5l6 6 6-6" />,
    chevronR: <path d="M9.5 6l6 6-6 6" />,
    chevronUp:<path d="M6 14.5l6-6 6 6" />,
    plus:     <path d="M12 5v14M5 12h14" />,
    subtask:  <><path d="M6 4v9a3 3 0 0 0 3 3h6" /><circle cx="18" cy="16" r="2.6" /><path d="M18 6.4v3.6M16.2 8.2h3.6" /></>,
    search:   <><circle cx="11" cy="11" r="6.6" /><path d="m16 16 4.4 4.4" /></>,
    bell:     <><path d="M18 8.6a6 6 0 1 0-12 0c0 6-2 7.4-2 7.4h16s-2-1.4-2-7.4z" /><path d="M13.7 20a2 2 0 0 1-3.4 0" /></>,
    filter:   <path d="M3.5 5.5h17l-6.6 7.8v5.6l-3.8 2v-7.6z" />,
    star:     <path d="m12 3.6 2.7 5.5 6 .9-4.3 4.2 1 6-5.4-2.8-5.4 2.8 1-6L3.3 10l6-.9z" />,
    panel:    <><rect x="3" y="4.5" width="18" height="15" rx="2.2" /><path d="M15 4.5v15" /></>,
    close:    <path d="m6 6 12 12M18 6 6 18" />,
    more:     <><circle cx="5.5" cy="12" r="1.4" fill={color} stroke="none" /><circle cx="12" cy="12" r="1.4" fill={color} stroke="none" /><circle cx="18.5" cy="12" r="1.4" fill={color} stroke="none" /></>,
    expand:   <path d="M6 9.5l6 6 6-6" />,
    send:     <path d="M20 12 4 4l6 8-6 8z" />,
    at:       <><circle cx="12" cy="12" r="4" /><path d="M16 8v5a3 3 0 0 0 5 0v-1a9 9 0 1 0-3.5 7" /></>,
    emoji:    <><circle cx="12" cy="12" r="9" /><circle cx="9" cy="10" r="1.1" fill={color} stroke="none" /><circle cx="15" cy="10" r="1.1" fill={color} stroke="none" /><path d="M8.5 14.5a4.4 4.4 0 0 0 7 0" /></>,
    video:    <><rect x="3" y="6" width="12" height="12" rx="2.2" /><path d="m15 10.5 6-3.5v10l-6-3.5z" /></>,
    mic:      <><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5.5 11.5a6.5 6.5 0 0 0 13 0M12 18v3" /></>,
    sparkle:  <path d="M12 3.5l1.9 5.6 5.6 1.9-5.6 1.9L12 18.5l-1.9-5.6L4.5 11l5.6-1.9z" />,
    file:     <><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" /><path d="M14 3v5h5" /></>,
  }
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color}
         strokeWidth={width} strokeLinecap="round" strokeLinejoin="round"
         aria-hidden="true" style={{ flexShrink: 0, ...style }}>
      {p[name]}
    </svg>
  )
}

/** A small, deliberately unambitious palette — the ones people actually use. */
const EMOJI = [
  '👍','🙌','🎉','🔥','✅','👀','🙏','💡',
  '❤️','😊','😅','😬','🤔','⚠️','⏰','📌',
]

/**
 * Draw the @names in a posted comment as mentions.
 *
 * Matching is on the text rather than the stored ids: the ids say who was
 * meant, this says where in the sentence they were meant. Longest names first,
 * so "Islam Saadany" is not matched as "Islam" with a stray surname after it.
 */
function withMentions(body: string, members: Member[]): React.ReactNode {
  const names = members.map(m => m.name).filter(Boolean).sort((a, b) => b.length - a.length)
  if (!names.length) return body

  const escaped = names.map(n => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
  const re = new RegExp(`@(${escaped.join('|')})`, 'g')

  const out: React.ReactNode[] = []
  let last = 0
  for (const m of body.matchAll(re)) {
    const at = m.index ?? 0
    if (at > last) out.push(body.slice(last, at))
    out.push(
      <span key={`${at}-${m[1]}`} style={{
        background: '#EEF3FF', color: CU.blue, borderRadius: 5,
        padding: '1px 4px', fontWeight: 600,
      }}>
        @{m[1]}
      </span>,
    )
    last = at + m[0].length
  }
  if (last < body.length) out.push(body.slice(last))
  return out
}

/* ── turning a picked file into something storable ───────────────────── */

/** Read a file exactly as it is. Used for anything that is not a picture. */
function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload  = () => resolve(String(r.result))
    r.onerror = () => reject(new Error('unreadable'))
    r.readAsDataURL(file)
  })
}

/**
 * Scale a picture to fit `max` on its longest edge and re-encode it.
 *
 * The same trick ImageUpload uses for logos and avatars, and for the same
 * reason: the bytes are going into a text column, so an untouched phone photo
 * has to come down before it gets there. PNG keeps transparency; everything
 * else is far smaller as JPEG, and 0.82 is where the artefacts stop showing.
 */
async function shrinkImage(file: File, max: number, quality = 0.82): Promise<string> {
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

function Avatar({ name, size = 24 }: { name: string; size?: number }) {
  return (
    <span title={name} style={{
      width: size, height: size, borderRadius: '50%',
      background: avatarColor(name), color: '#fff',
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      fontSize: size * 0.4, fontWeight: 700, flexShrink: 0, letterSpacing: '-.01em',
    }}>
      {initials(name)}
    </span>
  )
}

/** A square, quiet icon button — the window controls along the top bar. */
function IconButton({ name, label, onClick, size = 17, color = CU.label }: {
  name: IconName; label: string; onClick?: () => void; size?: number; color?: string
}) {
  return (
    <button type="button" onClick={onClick} aria-label={label} title={label}
            style={{
              width: 30, height: 30, borderRadius: 7, border: 'none', background: 'transparent',
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer', padding: 0, flexShrink: 0,
            }}
            onMouseEnter={e => { e.currentTarget.style.background = CU.hover }}
            onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}>
      <Icon name={name} size={size} color={color} />
    </button>
  )
}

/**
 * A property row in the two-up grid under the title.
 *
 * ClickUp gives the label a fixed column so the values line up down both
 * halves of the grid regardless of how long the labels are.
 */
function Prop({ icon, label, children }: {
  icon: IconName; label: string; children: React.ReactNode
}) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '158px minmax(0, 1fr)', alignItems: 'center', minHeight: 38 }}>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 9, fontSize: 15, color: CU.label }}>
        <Icon name={icon} size={16} />
        {label}
      </span>
      <div style={{ minWidth: 0, fontSize: 15, color: CU.text }}>{children}</div>
    </div>
  )
}

/** A row in the Fields block — hairline-separated, value in its own column. */
function Field({ icon, label, children }: {
  icon: IconName; label: string; children: React.ReactNode
}) {
  return (
    <div style={{
      display: 'grid', gridTemplateColumns: '220px minmax(0, 1fr)', alignItems: 'center',
      minHeight: 42, padding: '0 4px', borderBottom: `1px solid ${CU.lineSoft}`,
    }}>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10, fontSize: 15, color: CU.text }}>
        <Icon name={icon} size={16} color={CU.faint} />
        {label}
      </span>
      <div style={{ minWidth: 0, fontSize: 15, color: CU.text }}>{children}</div>
    </div>
  )
}

/** The full-width action rows — "Add subtask" and friends. */
function ActionRow({ icon, label, onClick }: { icon: IconName; label: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick}
            style={{
              display: 'flex', alignItems: 'center', gap: 11, width: '100%',
              padding: '11px 8px', border: 'none', background: 'transparent',
              borderRadius: 8, cursor: 'pointer', fontFamily: 'inherit',
              fontSize: 15.5, color: CU.text, textAlign: 'start',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = CU.hover }}
            onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}>
      <Icon name={icon} size={17} color={CU.label} />
      {label}
    </button>
  )
}

const fmtDate = (d: string | Date) =>
  new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })

const fmtShort = (d: string | Date) =>
  new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })

const fmtTime = (d: string | Date) =>
  new Date(d).toLocaleString('en-GB', {
    day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', hour12: true,
  })

export function TaskModal({
  task, currentUser, stages: _stages, slaConfig: _slaConfig, today, onClose,
  brands = [], members = [], contentTypes = [],
}: TaskModalProps) {
  const [cmtText, setCmtText]             = useState('')
  const [editingBrief, setEditingBrief]   = useState(false)
  const [briefText, setBriefText]         = useState('')
  const [error, setError]                 = useState('')
  const [editingName, setEditingName]     = useState(false)
  const [nameText, setNameText]           = useState('')
  const [showEmpty, setShowEmpty]         = useState(false)
  const [fieldsOpen, setFieldsOpen]       = useState(true)
  const [filesOpen, setFilesOpen]         = useState(true)
  const [briefOpen, setBriefOpen]         = useState(false)
  const [menuOpen, setMenuOpen]           = useState(false)
  const [addingSubtask, setAddingSubtask] = useState(false)
  const [subtaskName, setSubtaskName]     = useState('')
  const [showAllActivity, setShowAllActivity] = useState(false)
  const [lightbox, setLightbox]           = useState<TaskAttachment | null>(null)
  const [copied, setCopied]               = useState('')
  const [picked, setPicked]               = useState<string[]>([])
  const [mentionOpen, setMentionOpen]     = useState(false)
  const [mentionQuery, setMentionQuery]   = useState('')
  const [mentionIndex, setMentionIndex]   = useState(0)
  const [emojiOpen, setEmojiOpen]         = useState(false)
  const [stageOpen, setStageOpen]         = useState(false)
  const [dragging, setDragging]           = useState(false)
  const [uploading, setUploading]         = useState(false)
  const [uploadError, setUploadError]     = useState('')
  const [isPending, startTransition]      = useTransition()

  const router = useRouter()
  const menuRef = useRef<HTMLDivElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const cmtRef  = useRef<HTMLTextAreaElement>(null)
  const stageBtnRef  = useRef<HTMLButtonElement>(null)
  const stageMenuRef = useRef<HTMLDivElement>(null)
  const setCelebration = useUIStore(s => s.setCelebration)
  const selectTask     = useUIStore(s => s.selectTask)

  const cover     = coverImageFor(task)
  const stageMeta = STAGE_META[task.status]
  const nextStage = nextStageId(task.status, task.nine_stage)
  const nextMeta  = nextStage ? STAGE_META[nextStage] : null
  const pipeline  = task.nine_stage ? NINE_STAGE : EIGHT_STAGE
  // The board's query includes the relation; a panel opened from elsewhere may
  // only have the id, so fall back to the member list.
  const assignee  = task.assignee ?? members.find(m => m.id === task.assignee_id) ?? null
  const daysLeft  = task.due_date ? calDaysBetween(today, new Date(task.due_date)) : null
  const overdue   = daysLeft !== null && daysLeft < 0

  /**
   * The board hands us every task's attachments but without `data` — see the
   * model comment in schema.prisma. So the rows arrive as filenames and links,
   * and we fetch this one task's full rows once, which is what makes an
   * uploaded file actually show its contents.
   */
  const [files, setFiles] = useState<TaskAttachment[]>(task.attachments ?? [])
  const [reloadFiles, setReloadFiles] = useState(0)
  /**
   * What has already been fetched, as a ref rather than state.
   *
   * It has to be a ref: the effect below sets it, so as state it would be a
   * dependency the effect changes itself — React would tear the effect down
   * and the cleanup would cancel the very fetch that was in flight. The
   * symptom was an uploaded picture saving correctly and then rendering as a
   * placeholder, because the rows carrying its bytes were thrown away on
   * arrival.
   */
  const loadedRef = useRef<string | null>(null)

  // Keyed on the task id alone, also deliberately: `task.attachments` is a
  // fresh array on every board render, so watching it meant every
  // router.refresh() put back the rows without their contents. From here this
  // component owns `files` — uploads and removals update it directly.
  useEffect(() => {
    setFiles(task.attachments ?? [])
    loadedRef.current = null
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [task.id])

  useEffect(() => {
    if (!filesOpen) return
    const key = `${task.id}:${reloadFiles}`
    if (loadedRef.current === key) return
    loadedRef.current = key

    let live = true
    void loadAttachments(task.id).then(rows => {
      if (!live) return
      setFiles(rows.map(r => ({
        id: r.id, task_id: task.id, filename: r.filename,
        url: r.url ?? undefined, data: r.data ?? undefined,
        uploaded_by: r.uploaded_by ?? undefined, uploaded_at: r.uploaded_at,
      })))
    })
    return () => { live = false }
  }, [filesOpen, task.id, reloadFiles])

  const attachments = files

  // Long briefs are folded, as ClickUp folds them. The threshold is on the
  // markdown rather than the rendered height because the height is not known
  // until after paint, and a pill that appears a frame late reads as a glitch.
  const clipped = (task.description ?? '').length > 420

  // Mirrors updateTask's server-side check — the server one is authoritative.
  // Mirrors canAct() in the server action — owner or assignee, or a manager.
  const canEdit =
    task.task_owner_id === currentUser.id ||
    task.assignee_id === currentUser.id ||
    currentUser.access === 'admin' ||
    currentUser.access === 'superuser'

  const isAdmin     = currentUser.access === 'admin'
  const isSuperuser = currentUser.access === 'superuser'
  const isPublished = task.status === 'publish'

  const isOwnStage = stageMeta.owner_role === null
    ? task.assignee_id === currentUser.id || task.task_owner_id === currentUser.id
    : stageMeta.owner_role === currentUser.role

  const canAdvance = !isPublished && nextStage !== null && (isOwnStage || isAdmin || isSuperuser)
  const isOverride = canAdvance && !isOwnStage && (isAdmin || isSuperuser)

  // Escape closes the panel — unless something smaller is open, which takes it
  // first: the lightbox, then the menu, then whatever field is being edited.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== 'Escape') return
      if (lightbox) { setLightbox(null); return }
      if (menuOpen) { setMenuOpen(false); return }
      if (stageOpen) { setStageOpen(false); return }
      const tag = (e.target as HTMLElement)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
      onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, lightbox, menuOpen, stageOpen])

  useEffect(() => {
    if (!menuOpen) return
    function onDown(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [menuOpen])

  useEffect(() => {
    if (!stageOpen) return
    function onDown(e: MouseEvent) {
      const t = e.target as Node
      if (stageMenuRef.current?.contains(t) || stageBtnRef.current?.contains(t)) return
      setStageOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [stageOpen])

  function applyPatch(patch: TaskPatch, after?: () => void) {
    setError('')
    startTransition(async () => {
      const res = await updateTask(task.id, patch)
      if (res.success) { router.refresh(); after?.() }
      else setError(res.error ?? 'Could not save the change')
    })
  }

  async function handleCreateSubtask(name: string) {
    const res = await createSubtask(task.id, name)
    if (!res.success || !res.id) {
      setError(res.error === 'not_authorized'
        ? 'You cannot add subtasks to this task'
        : res.error ?? 'Could not create the subtask')
      return null
    }
    router.refresh()
    return { name: res.name ?? name, href: `/board?task=${res.id}` }
  }

  function submitSubtask() {
    const name = subtaskName.trim()
    if (!name) { setAddingSubtask(false); return }
    startTransition(async () => {
      await handleCreateSubtask(name)
      setSubtaskName('')
      setAddingSubtask(false)
    })
  }

  function handleAdvance() {
    if (!canAdvance) return
    startTransition(async () => {
      const result = await moveTask(task.id)
      if (result.success) {
        router.refresh()
        if (result.shouldCelebrate && nextMeta) {
          setCelebration({ taskName: task.name, stageLabel: nextMeta.label_en })
        }
        onClose()
      }
    })
  }

  /* ── naming people in a comment ──────────────────────────────────────── */

  /**
   * Who is still named in what has been typed.
   *
   * Picking someone records their id, but the text stays editable — delete
   * the "@Salma" and the mention should go with it. So the list is derived
   * from the body on every render rather than kept as the truth: whoever's
   * handle survives in the text is who gets stored.
   */
  const mentioned = useMemo(
    () => members.filter(m => picked.includes(m.id) && cmtText.includes(`@${m.name}`)),
    [members, picked, cmtText],
  )

  const mentionMatches = useMemo(() => {
    const q = mentionQuery.trim().toLowerCase()
    const pool = members.filter(m => m.id !== currentUser.id)
    if (!q) return pool.slice(0, 8)
    return pool.filter(m => m.name.toLowerCase().includes(q) || (m.role ?? '').toLowerCase().includes(q)).slice(0, 8)
  }, [members, mentionQuery, currentUser.id])

  useEffect(() => { setMentionIndex(0) }, [mentionQuery, mentionOpen])

  /** The "@word" being typed immediately before the caret, if there is one. */
  function mentionTokenAt(el: HTMLTextAreaElement): { at: number; query: string } | null {
    const caret = el.selectionStart ?? 0
    const upto  = el.value.slice(0, caret)
    const at    = upto.lastIndexOf('@')
    if (at === -1) return null
    // Only right after whitespace or at the very start — an email address is
    // not a mention.
    if (at > 0 && !/\s/.test(upto[at - 1])) return null
    const query = upto.slice(at + 1)
    if (query.includes('\n')) return null
    return { at, query }
  }

  function syncMentionQuery(el: HTMLTextAreaElement) {
    const token = mentionTokenAt(el)
    if (!token) { setMentionOpen(false); return }
    setEmojiOpen(false)
    setMentionQuery(token.query)
    setMentionOpen(true)
  }

  function openMentionPicker() {
    const el = cmtRef.current
    if (!el) return
    const caret = el.selectionStart ?? cmtText.length
    const needsSpace = caret > 0 && !/\s/.test(cmtText[caret - 1])
    const insert = `${needsSpace ? ' ' : ''}@`
    const next = cmtText.slice(0, caret) + insert + cmtText.slice(caret)
    setCmtText(next)
    setMentionQuery('')
    setMentionOpen(true)
    requestAnimationFrame(() => {
      el.focus()
      const pos = caret + insert.length
      el.setSelectionRange(pos, pos)
    })
  }

  function insertMention(m: Member) {
    const el = cmtRef.current
    if (!el) return
    const token = mentionTokenAt(el)
    const caret = el.selectionStart ?? cmtText.length
    const from  = token ? token.at : caret
    const next  = `${cmtText.slice(0, from)}@${m.name} ${cmtText.slice(caret)}`
    setCmtText(next)
    setPicked(p => (p.includes(m.id) ? p : [...p, m.id]))
    setMentionOpen(false)
    requestAnimationFrame(() => {
      el.focus()
      const pos = from + m.name.length + 2
      el.setSelectionRange(pos, pos)
    })
  }

  function insertAtCursor(text: string) {
    const el = cmtRef.current
    if (!el) { setCmtText(t => t + text); return }
    const start = el.selectionStart ?? cmtText.length
    const end   = el.selectionEnd ?? start
    setCmtText(cmtText.slice(0, start) + text + cmtText.slice(end))
    setEmojiOpen(false)
    requestAnimationFrame(() => {
      el.focus()
      const pos = start + text.length
      el.setSelectionRange(pos, pos)
    })
  }

  function onComposerKey(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (mentionOpen && mentionMatches.length) {
      if (e.key === 'ArrowDown') { e.preventDefault(); setMentionIndex(i => (i + 1) % mentionMatches.length); return }
      if (e.key === 'ArrowUp')   { e.preventDefault(); setMentionIndex(i => (i - 1 + mentionMatches.length) % mentionMatches.length); return }
      if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); insertMention(mentionMatches[mentionIndex]); return }
      if (e.key === 'Escape')    { e.preventDefault(); setMentionOpen(false); return }
    }
    if (e.key === 'Escape' && emojiOpen) { e.preventDefault(); setEmojiOpen(false); return }
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); handleComment() }
  }

  /**
   * Move to any stage in this task's pipeline, forward or back.
   *
   * setTaskStage carries the same permission rule as advancing — your own
   * stage, or an admin/superuser override — and decides for itself whether a
   * move is worth celebrating, so a task pulled backwards does not throw
   * confetti.
   */
  function handleSetStage(next: StageId) {
    setStageOpen(false)
    if (next === task.status) return
    setError('')
    startTransition(async () => {
      const r = await setTaskStage(task.id, next)
      if (!r.success) {
        setError(r.error === 'not_authorized'
          ? 'That stage belongs to someone else — ask an admin to move it.'
          : r.error ?? 'Could not move that task')
        return
      }
      router.refresh()
      if (r.shouldCelebrate) {
        setCelebration({ taskName: task.name, stageLabel: STAGE_META[next].label_en })
      }
    })
  }

  function handleComment() {
    const text = cmtText.trim()
    if (!text) return
    const ids = mentioned.map(m => m.id)
    startTransition(async () => {
      const r = await addComment(task.id, text, ids)
      if (!r.success) { setError(r.error ?? 'Could not post that comment'); return }
      router.refresh()
      setCmtText('')
      setPicked([])
      setMentionOpen(false)
      setEmojiOpen(false)
    })
  }

  /**
   * Take files from a drop or the picker and store them on the task.
   *
   * There is no object store behind this app, so the bytes end up in Postgres
   * as data URLs — the same route brand logos and avatars already take. That
   * makes the size limit real rather than polite, so pictures are scaled down
   * on a canvas first: an untouched phone photo is several megabytes and comes
   * back under a couple of hundred kilobytes. Anything that is not an image
   * has to fit as it is, and is refused with its own name if it does not.
   */
  async function acceptFiles(list: FileList | null) {
    if (!canEdit || !list?.length) return
    setUploadError('')

    const picked = Array.from(list).slice(0, MAX_ATTACHMENTS_PER_GO)
    if (list.length > MAX_ATTACHMENTS_PER_GO) {
      setUploadError(`Only the first ${MAX_ATTACHMENTS_PER_GO} files were taken.`)
    }

    setUploading(true)
    try {
      const prepared: { filename: string; data: string }[] = []
      const rejected: string[] = []
      // The newest picture in this batch also becomes the card's preview.
      let thumb: string | null = null

      for (const file of picked) {
        try {
          const isImage = file.type.startsWith('image/')
          const data = isImage
            ? await shrinkImage(file, 1600)
            : await readAsDataUrl(file)
          if (data.length > MAX_ATTACHMENT_CHARS) { rejected.push(file.name); continue }
          prepared.push({ filename: file.name, data })
          if (isImage) thumb = await shrinkImage(file, 360, 0.62)
        } catch {
          rejected.push(file.name)
        }
      }

      if (rejected.length) {
        setUploadError(
          `Too large to store: ${rejected.join(', ')}. Files need to be under about 1 MB — ` +
          'pictures are shrunk automatically, anything else has to be small already.',
        )
      }
      if (!prepared.length) return

      const res = await addAttachments(task.id, prepared, thumb)
      if (!res.success) { setUploadError(res.error ?? 'Could not attach those files'); return }
      setReloadFiles(n => n + 1)   // pull the new rows, contents and all
      router.refresh()             // and refresh the card behind the panel
    } finally {
      setUploading(false)
    }
  }

  function copy(what: 'link' | 'id') {
    const value = what === 'id'
      ? task.id
      : `${window.location.origin}/board?task=${task.id}`
    navigator.clipboard?.writeText(value)
    setCopied(what)
    setMenuOpen(false)
    window.setTimeout(() => setCopied(''), 1800)
  }

  /**
   * The Fields block. `filled` decides whether a row shows up front or waits
   * behind "Show N empty fields" — an imported task with six blank attributes
   * reads as a form to complete rather than a brief to work from.
   */
  const fields: { key: string; filled: boolean; node: React.ReactNode }[] = [
    {
      key: 'brand', filled: Boolean(task.brand?.name),
      node: (
        <Field key="brand" icon="brand" label="Brand">
          <InlineValue
            canEdit={canEdit} type="select" value={task.brand_id ?? ''}
            display={task.brand?.name ? (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                <span style={{ width: 8, height: 8, borderRadius: 2, background: task.brand.color }} />
                {task.brand.name}
              </span>
            ) : ''}
            options={brands.map(b => ({ value: b.id, label: b.name }))}
            emptyLabel="–"
            onCommit={v => applyPatch({ brand_id: v })}
          />
        </Field>
      ),
    },
    {
      key: 'type', filled: Boolean(task.content_type_label),
      node: (
        <Field key="type" icon="type" label="Type">
          <InlineValue
            canEdit={canEdit} type="select" value={task.content_type_label}
            display={task.content_type_label}
            options={contentTypes.map(c => ({ value: c.label, label: c.label }))}
            emptyLabel="–"
            onCommit={v => applyPatch({ content_type_label: v })}
          />
        </Field>
      ),
    },
    {
      key: 'platform', filled: Boolean(task.platform),
      node: (
        <Field key="platform" icon="platform" label="Platform">
          <InlineValue
            canEdit={canEdit} type="select" value={task.platform ?? ''} display={task.platform}
            options={PLATFORMS.map(p => ({ value: p, label: p }))}
            emptyLabel="–"
            onCommit={v => applyPatch({ platform: v })}
          />
        </Field>
      ),
    },
    {
      key: 'campaign', filled: Boolean(task.campaign),
      node: (
        <Field key="campaign" icon="folder" label="Campaign">
          <InlineValue
            canEdit={canEdit} type="text" value={task.campaign ?? ''} display={task.campaign}
            placeholder="e.g. Brand Launch"
            emptyLabel="–"
            onCommit={v => applyPatch({ campaign: v })}
          />
        </Field>
      ),
    },
    {
      key: 'owner', filled: true,
      node: (
        <Field key="owner" icon="user" label="Owner">
          <InlineValue
            canEdit={canEdit} type="select" value={task.task_owner_id}
            display={
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 9 }}>
                <Avatar name={task.task_owner.name} size={26} />
                {task.task_owner.name}
              </span>
            }
            options={members.map(m => ({ value: m.id, label: m.name }))}
            onCommit={v => applyPatch({ task_owner_id: v })}
          />
        </Field>
      ),
    },
    {
      key: 'cover', filled: Boolean(task.cover_image_url),
      node: (
        <Field key="cover" icon="image" label="Cover image">
          <InlineValue
            canEdit={canEdit} type="text" value={task.cover_image_url ?? ''}
            display={task.cover_image_url ? shortName(task.cover_image_url, 46) : ''}
            placeholder="https://…"
            emptyLabel="–"
            onCommit={v => applyPatch({ cover_image_url: v })}
          />
        </Field>
      ),
    },
    {
      key: 'stage-since', filled: true,
      node: (
        <Field key="stage-since" icon="clock" label="In this stage since">
          <span style={{ color: CU.text }}>{fmtDate(task.stage_date)}</span>
        </Field>
      ),
    },
  ]
  const emptyCount = fields.filter(f => !f.filled).length

  /**
   * The activity rail.
   *
   * ClickUp's is an event log with the comments folded into it; ours is built
   * from what the row can actually prove — when it was created, when it
   * entered the stage it is in, and every comment since. Nothing is inferred:
   * we do not keep a per-move history, so the log does not claim one.
   */
  const activity = useMemo(() => {
    const items: { id: string; when: Date; node: React.ReactNode }[] = [
      {
        id: 'created', when: new Date(task.created_at),
        node: <><strong style={{ fontWeight: 600 }}>{task.task_owner.name}</strong> created this task</>,
      },
      {
        id: 'stage', when: new Date(task.stage_date),
        node: <>Moved to <strong style={{ fontWeight: 600 }}>{stageMeta.label_en}</strong></>,
      },
      ...task.comments.map(c => {
        const atMe = (c.mentions ?? []).includes(currentUser.id)
        return {
          id: c.id, when: new Date(c.created_at),
          node: (
            <>
              <strong style={{ fontWeight: 600 }}>{c.author?.name ?? 'Someone'}</strong> commented
              {atMe && (
                <span style={{
                  marginInlineStart: 7, padding: '2px 7px', borderRadius: 999,
                  background: '#EEF3FF', color: CU.blue, fontSize: 11.5, fontWeight: 700,
                }}>
                  mentioned you
                </span>
              )}
              <span style={{
                display: 'block', marginTop: 6, padding: '8px 11px', borderRadius: 9,
                background: '#FFFFFF', color: CU.text, lineHeight: 1.55, whiteSpace: 'pre-wrap',
                border: `1px solid ${atMe ? '#C9D9FF' : CU.line}`,
              }}>
                {withMentions(c.body, members)}
              </span>
            </>
          ),
        }
      }),
    ]
    return items.sort((a, b) => a.when.getTime() - b.when.getTime())
  }, [task.created_at, task.stage_date, task.comments, task.task_owner.name,
      stageMeta.label_en, members, currentUser.id])

  // ClickUp shows the first couple and hides the rest behind "Show more".
  const HEAD = 1
  const collapsible = activity.length > HEAD + 1
  const shown = !collapsible || showAllActivity
    ? activity
    : [...activity.slice(0, HEAD), ...activity.slice(-1)]
  const hiddenActivity = activity.length - shown.length

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.42)',
        zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '2vh 2vw',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: '#fff', borderRadius: 12, width: '100%', maxWidth: 1280,
          height: '94vh', display: 'flex', flexDirection: 'column', overflow: 'hidden',
          boxShadow: '0 2px 6px rgba(20,20,20,.06), 0 24px 68px rgba(20,20,20,.22)',
          color: CU.text, fontSize: 15.5,
        }}
      >
        {/* ── TOP BAR — spans the whole panel ───────────────────────────── */}
        <div style={{
          height: 48, flexShrink: 0, display: 'flex', alignItems: 'center', gap: 4,
          padding: '0 10px 0 8px', borderBottom: `1px solid ${CU.line}`,
        }}>
          {/* Breadcrumb: brand / parent / type */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, minWidth: 0, flex: 1, paddingInlineStart: 4 }}>
            <span style={{
              width: 20, height: 20, borderRadius: 5, flexShrink: 0,
              background: task.brand?.color ?? '#C4C4BE', color: '#fff',
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 12, fontWeight: 800,
            }}>
              {(task.brand?.name ?? '?')[0]?.toUpperCase()}
            </span>
            <span style={{
              fontWeight: 600, fontSize: 15, color: CU.text,
              whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 200,
            }}>
              {task.brand?.name ?? 'No brand'}
            </span>

            {task.parent && (
              <>
                <span style={{ color: CU.faint }}>/</span>
                <button type="button" onClick={() => selectTask(task.parent!.id)}
                        title={`Open parent: ${task.parent.name}`}
                        style={{
                          background: 'none', border: 'none', padding: 0, cursor: 'pointer',
                          fontFamily: 'inherit', fontSize: 15, fontWeight: 600, color: CU.blue,
                          maxWidth: 190, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                        }}>
                  {task.parent.name}
                </button>
              </>
            )}

            {task.content_type_label && (
              <>
                <span style={{ color: CU.faint }}>/</span>
                <span style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  fontWeight: 700, fontSize: 14, letterSpacing: '.02em',
                  color: CU.text, textTransform: 'uppercase',
                  whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 220,
                }}>
                  <Icon name="type" size={15} color={CU.label} />
                  {task.content_type_label}
                </span>
              </>
            )}
          </div>

          <span style={{ fontSize: 14, color: CU.label, whiteSpace: 'nowrap', marginInlineEnd: 4 }}>
            Created {fmtShort(task.created_at)}
          </span>

          {/* ⋯ menu */}
          <div ref={menuRef} style={{ position: 'relative' }}>
            <IconButton name="more" label="Task actions" onClick={() => setMenuOpen(v => !v)} />
            {menuOpen && (
              <div role="menu" style={{
                position: 'absolute', top: 36, insetInlineEnd: 0, width: 260, zIndex: 3,
                background: '#fff', border: `1px solid ${CU.line}`, borderRadius: 10,
                boxShadow: '0 10px 30px rgba(20,20,20,.16)', padding: 8,
              }}>
                <div style={{
                  display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)',
                  border: `1px solid ${CU.line}`, borderRadius: 8, overflow: 'hidden', marginBottom: 8,
                }}>
                  <MenuSplit label="Copy link" onClick={() => copy('link')} />
                  <MenuSplit label="Copy ID" onClick={() => copy('id')} divider />
                  <MenuSplit label="New tab" divider
                             onClick={() => { window.open(`/board?task=${task.id}`, '_blank', 'noopener'); setMenuOpen(false) }} />
                </div>
                <MenuItem icon="subtask" label="Add subtask"
                          onClick={() => { setMenuOpen(false); setAddingSubtask(true) }} />
                <MenuItem icon="openIn" label="Open the board behind this"
                          onClick={() => { setMenuOpen(false); onClose() }} />
              </div>
            )}
          </div>

          <IconButton name="close" label="Close task" onClick={onClose} size={18} />
        </div>

        {/* ── BODY ──────────────────────────────────────────────────────── */}
        <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>

          {/* ── LEFT COLUMN ─────────────────────────────────────────────── */}
          <div style={{ flex: '1 1 auto', display: 'flex', flexDirection: 'column', minWidth: 0 }}>

            {/* chip row */}
            <div style={{
              display: 'flex', alignItems: 'center', gap: 10, padding: '12px 26px 0', flexShrink: 0,
            }}>
              <span style={{
                display: 'inline-flex', alignItems: 'center', gap: 7, height: 30, padding: '0 11px',
                border: `1px solid ${CU.line}`, borderRadius: 8, fontSize: 15, fontWeight: 600,
              }}>
                <Icon name="target" size={15} color={stageMeta.color} />
                Task
              </span>
              <button type="button" onClick={() => copy('id')} title="Copy task ID"
                      style={{
                        display: 'inline-flex', alignItems: 'center', gap: 6, height: 28, padding: '0 9px',
                        border: 'none', background: CU.chipBg, borderRadius: 7, cursor: 'pointer',
                        fontFamily: 'inherit', fontSize: 13, fontWeight: 600, color: CU.label,
                      }}>
                <Icon name="link" size={13} color={CU.label} />
                {copied === 'id' ? 'Copied' : 'ID'}
              </button>
              {attachments.length > 0 && (
                <span style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6, height: 28, padding: '0 9px',
                  background: CU.chipBg, borderRadius: 7, fontSize: 13, fontWeight: 600, color: CU.label,
                }}>
                  <Icon name="clip" size={13} color={CU.label} />
                  {attachments.length}
                </span>
              )}
              {copied === 'link' && (
                <span style={{ fontSize: 13, color: CU.label }}>Link copied</span>
              )}
            </div>

            {/* scrolls */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '18px 26px 40px' }}>

              {/* Title */}
              {editingName ? (
                <input
                  value={nameText}
                  autoFocus
                  onChange={e => setNameText(e.target.value)}
                  onBlur={() => {
                    setEditingName(false)
                    if (nameText.trim() && nameText !== task.name) applyPatch({ name: nameText })
                  }}
                  onKeyDown={e => {
                    if (e.key === 'Enter')  { e.preventDefault(); e.currentTarget.blur() }
                    if (e.key === 'Escape') { setNameText(task.name); setEditingName(false) }
                  }}
                  style={{
                    width: '100%', boxSizing: 'border-box', fontFamily: 'inherit',
                    fontSize: 32, fontWeight: 700, letterSpacing: '-.02em', color: CU.ink,
                    border: `1px solid ${CU.line}`, borderRadius: 8, padding: '4px 8px',
                    margin: '0 -8px 20px', outline: 'none',
                  }}
                />
              ) : (
                <h1
                  onClick={() => { if (canEdit) { setNameText(task.name); setEditingName(true) } }}
                  title={canEdit ? 'Click to rename' : undefined}
                  style={{
                    fontSize: 32, fontWeight: 700, letterSpacing: '-.02em', lineHeight: 1.25,
                    color: CU.ink, margin: '0 0 22px', cursor: canEdit ? 'text' : 'default',
                  }}
                >
                  {task.name}
                </h1>
              )}

              {/* Property grid — two up, as ClickUp */}
              <div style={{
                display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
                columnGap: 28, rowGap: 2,
              }}>
                <Prop icon="status" label="Status">
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 9, flexWrap: 'wrap', position: 'relative' }}>
                    {/* The pill is the picker. The arrow button beside it still
                        does the common thing in one click — this is for the
                        other case, where the work went back or skipped ahead. */}
                    <button
                      type="button"
                      ref={stageBtnRef}
                      onClick={() => setStageOpen(v => !v)}
                      disabled={isPending}
                      aria-haspopup="listbox"
                      aria-expanded={stageOpen}
                      aria-label={`Stage: ${stageMeta.label_en}. Change it`}
                      title="Change the stage"
                      style={{
                        display: 'inline-flex', alignItems: 'center', gap: 6, border: 'none',
                        background: stageMeta.color, color: '#fff', borderRadius: 5,
                        padding: '4px 8px 4px 10px', fontSize: 12.5, fontWeight: 800,
                        letterSpacing: '.04em', textTransform: 'uppercase', whiteSpace: 'nowrap',
                        cursor: 'pointer', fontFamily: 'inherit', opacity: isPending ? 0.6 : 1,
                      }}
                    >
                      {stageMeta.label_en}
                      <Icon name="chevron" size={13} color="#fff" width={2.6} />
                    </button>

                    {stageOpen && (
                      <div role="listbox" aria-label="Move to a stage" ref={stageMenuRef} style={{
                        position: 'absolute', top: 'calc(100% + 6px)', insetInlineStart: 0, zIndex: 5,
                        minWidth: 232, maxHeight: 330, overflowY: 'auto',
                        background: '#fff', border: `1px solid ${CU.line}`, borderRadius: 10,
                        boxShadow: '0 12px 34px rgba(20,20,20,.18)', padding: 6,
                      }}>
                        {pipeline.map((id, i) => {
                          const meta = STAGE_META[id]
                          const here = id === task.status
                          const back = i < pipeline.indexOf(task.status as typeof id)
                          return (
                            <button
                              key={id}
                              type="button"
                              role="option"
                              aria-selected={here}
                              onClick={() => handleSetStage(id)}
                              style={{
                                display: 'flex', alignItems: 'center', gap: 10, width: '100%',
                                padding: '8px 10px', border: 'none', borderRadius: 8,
                                cursor: here ? 'default' : 'pointer', textAlign: 'start',
                                background: here ? CU.hover : 'transparent',
                                fontFamily: 'inherit', fontSize: 14, color: CU.text,
                              }}
                              onMouseEnter={e => { if (!here) e.currentTarget.style.background = CU.hover }}
                              onMouseLeave={e => { if (!here) e.currentTarget.style.background = 'transparent' }}
                            >
                              <span style={{ width: 9, height: 9, borderRadius: '50%', background: meta.color, flexShrink: 0 }} />
                              <span style={{ flex: 1, minWidth: 0 }}>{meta.label_en}</span>
                              {here && <span style={{ fontSize: 12, color: CU.faint }}>now</span>}
                              {!here && back && <span style={{ fontSize: 12, color: CU.faint }}>back</span>}
                            </button>
                          )
                        })}
                      </div>
                    )}

                    {canAdvance && nextMeta && (
                      <button
                        onClick={handleAdvance}
                        disabled={isPending}
                        title={`Move to ${nextMeta.label_en}`}
                        style={{
                          border: `1px solid ${CU.line}`, background: isOverride ? COLORS.ink : '#fff',
                          color: isOverride ? COLORS.lime : CU.text,
                          borderRadius: 6, cursor: 'pointer', padding: '4px 9px',
                          fontFamily: 'inherit', fontSize: 13, fontWeight: 600,
                          opacity: isPending ? 0.6 : 1, whiteSpace: 'nowrap',
                        }}
                      >
                        {isOverride ? '⚡ ' : ''}→ {nextMeta.label_en}
                      </button>
                    )}
                  </span>
                </Prop>

                {/* Assignee is who is doing it; Owner sits in Fields below and
                    is who is answerable for it. Everything personal — My Day,
                    the attention card, the bell — follows this one. */}
                <Prop icon="user" label="Assignee">
                  <InlineValue
                    canEdit={canEdit} type="select"
                    value={task.assignee_id ?? ''}
                    display={assignee ? (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 9 }}>
                        <Avatar name={assignee.name} size={26} />
                        {assignee.name}
                      </span>
                    ) : ''}
                    emptyLabel="Nobody yet"
                    options={[{ value: '', label: '— nobody —' },
                              ...members.map(m => ({ value: m.id, label: m.name }))]}
                    onCommit={v => applyPatch({ assignee_id: v || null })}
                  />
                </Prop>

                <Prop icon="calendar" label="Due date">
                  {/* The InlineValue button fills its parent, so it gets a
                      shrink-to-fit box of its own — otherwise it claims the
                      whole row and knocks the overdue count onto a line by
                      itself, which then drags the label out of alignment. */}
                  <span style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                    <span style={{ flex: '0 1 auto', minWidth: 0 }}>
                      <InlineValue
                        canEdit={canEdit} type="date" value={task.due_date ?? ''}
                        display={task.due_date ? fmtDate(task.due_date) : ''}
                        onCommit={v => applyPatch({ due_date: v })}
                      />
                    </span>
                    {daysLeft !== null && (
                      <span style={{
                        flexShrink: 0, fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap',
                        color: overdue ? '#D22040' : CU.faint,
                      }}>
                        {Math.abs(daysLeft)}d {overdue ? 'overdue' : 'left'}
                      </span>
                    )}
                  </span>
                </Prop>

                <Prop icon="flag" label="Priority">
                  <InlineValue
                    canEdit={canEdit} type="select" value={task.priority}
                    display={
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                        <Icon name="flag" size={15}
                              color={task.priority === 'High' ? '#E5484D'
                                   : task.priority === 'Medium' ? '#E8A33D' : '#8F95A1'} />
                        {task.priority}
                      </span>
                    }
                    options={PRIORITIES.map(p => ({ value: p, label: p }))}
                    onCommit={v => applyPatch({ priority: v as 'Low' | 'Medium' | 'High' })}
                  />
                </Prop>

                <Prop icon="clock" label="Time estimate">
                  <InlineValue
                    canEdit={canEdit} type="number" min={0} step={0.5}
                    value={task.hours_estimate}
                    display={(task.hours_estimate ?? 0) > 0 ? `${task.hours_estimate}h` : ''}
                    onCommit={v => applyPatch({ hours_estimate: parseFloat(v) })}
                  />
                </Prop>

                <Prop icon="folder" label="Pipeline">
                  <span style={{ color: CU.label }}>{task.nine_stage ? '9-stage' : '8-stage'}</span>
                </Prop>
              </div>

              {error && (
                <p role="alert" style={{ color: '#D22040', fontSize: 14, margin: '12px 0 0' }}>{error}</p>
              )}

              <div style={{ height: 1, background: CU.line, margin: '22px 0 18px' }} />

              {/* ── Description ──────────────────────────────────────────── */}
              {cover && !editingBrief && (
                <div style={{
                  position: 'relative', borderRadius: 10, overflow: 'hidden',
                  maxHeight: briefOpen ? 'none' : 232, marginBottom: 14,
                }}>
                  <ImageWithFallback
                    src={cover}
                    alt=""
                    style={{ display: 'block', width: '100%', maxWidth: 560, objectFit: 'cover' }}
                    fallback={null}
                  />
                </div>
              )}

              {editingBrief ? (
                <BriefEditor
                  value={briefText}
                  saving={isPending}
                  onSave={next => applyPatch({ description: next }, () => setEditingBrief(false))}
                  onCancel={() => setEditingBrief(false)}
                  attachments={attachments}
                  onCreateSubtask={canEdit ? handleCreateSubtask : undefined}
                />
              ) : (
                <>
                  <div
                    onClick={e => {
                      if (!canEdit) return
                      if ((e.target as HTMLElement).closest('a, input, button, summary, iframe, label')) return
                      setBriefText(task.description ?? '')
                      setEditingBrief(true)
                    }}
                    role={canEdit ? 'button' : undefined}
                    tabIndex={canEdit ? 0 : undefined}
                    onKeyDown={e => {
                      if (!canEdit) return
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault(); setBriefText(task.description ?? ''); setEditingBrief(true)
                      }
                    }}
                    title={canEdit ? 'Click to edit' : undefined}
                    style={{
                      cursor: canEdit ? 'text' : 'default', borderRadius: 8,
                      padding: '6px 8px', margin: '0 -8px',
                      // Room at the foot for the Expand pill to sit over,
                      // so it never lands on top of a line of the brief.
                      paddingBottom: clipped && !briefOpen ? 44 : 6,
                      maxHeight: briefOpen ? 'none' : 300, overflow: 'hidden', position: 'relative',
                    }}
                    onMouseEnter={e => { if (canEdit) e.currentTarget.style.background = CU.hover }}
                    onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
                  >
                    {task.description ? (
                      <Brief
                        markdown={task.description}
                        onToggleTask={canEdit ? next => applyPatch({ description: next }) : undefined}
                      />
                    ) : (
                      <p style={{ color: CU.faint, margin: 0 }}>
                        {canEdit ? 'Add a description…' : 'No description.'}
                      </p>
                    )}

                    {/* The fade tells you the text is cut rather than finished. */}
                    {clipped && !briefOpen && (
                      <div aria-hidden="true" style={{
                        position: 'absolute', insetInline: 0, bottom: 0, height: 72, borderRadius: 8,
                        background: 'linear-gradient(to bottom, rgba(255,255,255,0), #fff 78%)',
                      }} />
                    )}
                  </div>

                  {/* ClickUp's Expand pill, centred on the fold */}
                  {clipped && (
                    <div style={{
                      display: 'flex', justifyContent: 'center',
                      marginTop: briefOpen ? 8 : -38, marginBottom: 10, position: 'relative',
                    }}>
                      <button type="button" onClick={() => setBriefOpen(v => !v)}
                              style={{
                                display: 'inline-flex', alignItems: 'center', gap: 6, height: 30,
                                padding: '0 12px', borderRadius: 8, cursor: 'pointer',
                                border: `1px solid ${CU.line}`, background: '#fff',
                                fontFamily: 'inherit', fontSize: 14, fontWeight: 600, color: CU.text,
                                boxShadow: '0 1px 3px rgba(20,20,20,.07)',
                              }}>
                        <Icon name={briefOpen ? 'chevronUp' : 'chevron'} size={15} color={CU.label} />
                        {briefOpen ? 'Collapse' : 'Expand'}
                      </button>
                    </div>
                  )}
                </>
              )}

              {/* ── Fields ───────────────────────────────────────────────── */}
              <div style={{ marginTop: 26 }}>
                <button type="button" onClick={() => setFieldsOpen(v => !v)}
                        style={{
                          display: 'inline-flex', alignItems: 'center', gap: 8, border: 'none',
                          background: 'transparent', cursor: 'pointer', padding: '0 0 10px',
                          fontFamily: 'inherit', fontSize: 16.5, fontWeight: 600, color: CU.text,
                        }}>
                  <Icon name="chevron" size={14} color={CU.label}
                        style={{ transform: fieldsOpen ? 'none' : 'rotate(-90deg)', transition: 'transform .15s' }} />
                  Fields
                </button>

                {fieldsOpen && (
                  <div style={{ paddingInlineStart: 20, borderTop: `1px solid ${CU.lineSoft}` }}>
                    {fields.filter(f => f.filled).map(f => f.node)}
                    {showEmpty && fields.filter(f => !f.filled).map(f => f.node)}
                    {emptyCount > 0 && (
                      <button type="button" onClick={() => setShowEmpty(v => !v)}
                              style={{
                                display: 'inline-flex', alignItems: 'center', gap: 8, border: 'none',
                                background: 'transparent', cursor: 'pointer', padding: '11px 4px',
                                fontFamily: 'inherit', fontSize: 15, color: CU.label,
                              }}>
                        <Icon name={showEmpty ? 'chevronUp' : 'chevron'} size={14} color={CU.faint} />
                        {showEmpty
                          ? `Hide ${emptyCount} empty field${emptyCount === 1 ? '' : 's'}`
                          : `Show ${emptyCount} empty field${emptyCount === 1 ? '' : 's'}`}
                      </button>
                    )}
                  </div>
                )}
              </div>

              {/* ── Subtasks + actions ───────────────────────────────────── */}
              {(task.subtasks?.length ?? 0) > 0 && (
                <div style={{ marginTop: 20 }}>
                  <div style={{ fontSize: 16.5, fontWeight: 600, color: CU.text, marginBottom: 8 }}>
                    Subtasks <span style={{ color: CU.faint, fontWeight: 500 }}>{task.subtasks!.length}</span>
                  </div>
                  <div style={{ display: 'grid', gap: 4 }}>
                    {task.subtasks!.map(s => {
                      const meta = STAGE_META[s.status]
                      return (
                        <button key={s.id} type="button" onClick={() => selectTask(s.id)}
                                style={{
                                  display: 'flex', alignItems: 'center', gap: 10, width: '100%',
                                  padding: '9px 10px', borderRadius: 8, cursor: 'pointer',
                                  border: `1px solid ${CU.line}`, background: '#fff',
                                  fontFamily: 'inherit', fontSize: 15, color: CU.text, textAlign: 'start',
                                }}>
                          <span style={{ width: 8, height: 8, borderRadius: '50%', background: meta.color, flexShrink: 0 }} />
                          <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {s.name}
                          </span>
                          <span style={{ fontSize: 13, color: CU.label, whiteSpace: 'nowrap' }}>{meta.label_en}</span>
                        </button>
                      )
                    })}
                  </div>
                </div>
              )}

              {canEdit && (
                <div style={{ marginTop: 10 }}>
                  {addingSubtask ? (
                    <div style={{ display: 'flex', gap: 8, padding: '4px 0' }}>
                      <input
                        value={subtaskName}
                        autoFocus
                        placeholder="Subtask name…"
                        onChange={e => setSubtaskName(e.target.value)}
                        onKeyDown={e => {
                          if (e.key === 'Enter')  submitSubtask()
                          if (e.key === 'Escape') { setSubtaskName(''); setAddingSubtask(false) }
                        }}
                        style={{
                          flex: 1, minWidth: 0, height: 38, padding: '0 11px', fontFamily: 'inherit',
                          fontSize: 15.5, border: `1px solid ${CU.line}`, borderRadius: 8, outline: 'none',
                        }}
                      />
                      <button type="button" onClick={submitSubtask} disabled={isPending}
                              style={{
                                height: 38, padding: '0 16px', border: 'none', borderRadius: 8,
                                background: COLORS.ink, color: COLORS.lime, cursor: 'pointer',
                                fontFamily: 'inherit', fontSize: 15, fontWeight: 700,
                              }}>
                        Add
                      </button>
                    </div>
                  ) : (
                    <ActionRow icon="subtask" label="Add subtask" onClick={() => setAddingSubtask(true)} />
                  )}
                </div>
              )}

              {/* ── Attachments ──────────────────────────────────────────── */}
              <div style={{ marginTop: 18 }}>
                <button type="button" onClick={() => setFilesOpen(v => !v)}
                        style={{
                          display: 'inline-flex', alignItems: 'center', gap: 8, border: 'none',
                          background: 'transparent', cursor: 'pointer', padding: '0 0 12px',
                          fontFamily: 'inherit', fontSize: 16.5, fontWeight: 600, color: CU.text,
                        }}>
                  <Icon name="chevron" size={14} color={CU.label}
                        style={{ transform: filesOpen ? 'none' : 'rotate(-90deg)', transition: 'transform .15s' }} />
                  Attachments <span style={{ color: CU.faint, fontWeight: 500 }}>{attachments.length}</span>
                </button>

                {filesOpen && (
                  <>
                    {/* The drop zone is ClickUp's, and it is honest about what it
                        is: files reach a task through the brief editor's
                        uploader, so this points at that rather than pretending
                        to accept a drop it cannot store. Someone who cannot
                        edit the task gets no zone at all — a dead one that
                        exists only to refuse them is worse than none. */}
                    {canEdit && (
                      <div
                        onClick={() => fileRef.current?.click()}
                        onDragOver={e => { e.preventDefault(); setDragging(true) }}
                        onDragLeave={() => setDragging(false)}
                        onDrop={e => {
                          e.preventDefault(); setDragging(false)
                          void acceptFiles(e.dataTransfer.files)
                        }}
                        role="button"
                        tabIndex={0}
                        onKeyDown={e => {
                          if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileRef.current?.click() }
                        }}
                        style={{
                          border: `1.5px dashed ${dragging ? CU.blue : CU.line}`, borderRadius: 10,
                          padding: '22px 12px', textAlign: 'center', fontSize: 15.5,
                          color: dragging ? CU.blue : CU.label, cursor: 'pointer',
                          background: dragging ? '#F3F7FF' : 'transparent',
                          transition: 'border-color .12s, background .12s, color .12s',
                        }}
                        onMouseEnter={e => { if (!dragging) e.currentTarget.style.background = CU.hover }}
                        onMouseLeave={e => { if (!dragging) e.currentTarget.style.background = 'transparent' }}
                      >
                        {uploading
                          ? 'Reading files…'
                          : <>Drop files here or <span style={{ textDecoration: 'underline' }}>browse</span></>}
                      </div>
                    )}

                    <input
                      ref={fileRef}
                      type="file"
                      multiple
                      onChange={e => { void acceptFiles(e.target.files); e.target.value = '' }}
                      style={{ display: 'none' }}
                      aria-label="Attach files to this task"
                    />

                    {uploadError && (
                      <p role="alert" style={{ margin: '10px 0 0', fontSize: 14, color: '#D22040' }}>
                        {uploadError}
                      </p>
                    )}

                    {attachments.length === 0 && !canEdit && (
                      <p style={{ margin: 0, fontSize: 15, color: CU.faint }}>No files.</p>
                    )}

                    {attachments.length > 0 && (
                      <div style={{
                        display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))',
                        gap: 12, marginTop: canEdit ? 14 : 0,
                      }}>
                        {attachments.map(a => {
                          const image = isImageAttachment(a)
                          const src   = attachmentSrc(a)
                          const who   = a.uploaded_by
                            ? members.find(m => m.id === a.uploaded_by)?.name ?? task.task_owner.name
                            : task.task_owner.name
                          return (
                            <div key={a.id} style={{ background: CU.hover, borderRadius: 10, padding: 10, position: 'relative' }}>
                              <div style={{
                                height: 132, borderRadius: 6, background: '#fff', overflow: 'hidden',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                cursor: image ? 'zoom-in' : 'default',
                              }}
                                   onClick={() => { if (image) setLightbox(a) }}>
                                {image
                                  ? <ImageWithFallback
                                      src={src ?? ''}
                                      alt={a.filename}
                                      style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                                      fallback={<Icon name="image" size={30} color="#C3C7CE" width={1.5} />}
                                    />
                                  : <Icon name="file" size={30} color="#C3C7CE" width={1.5} />}
                              </div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 9 }}>
                                <a href={src ?? undefined} download={a.data ? a.filename : undefined}
                                   target="_blank" rel="noopener noreferrer"
                                   title={a.filename}
                                   style={{
                                     flex: 1, minWidth: 0, fontSize: 14, color: CU.text, textDecoration: 'none',
                                     overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                                   }}>
                                  {shortName(a.filename, 22)}
                                </a>
                                <Avatar name={who} size={22} />
                                {canEdit && (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setUploadError('')
                                      startTransition(async () => {
                                        const r = await removeAttachment(a.id)
                                        if (r.success) {
                                          setFiles(f => f.filter(x => x.id !== a.id))
                                          router.refresh()
                                        }
                                        else setUploadError(r.error ?? 'Could not remove that file')
                                      })
                                    }}
                                    aria-label={`Remove ${a.filename}`}
                                    title={`Remove ${a.filename}`}
                                    style={{
                                      width: 22, height: 22, borderRadius: 6, border: 'none', flexShrink: 0,
                                      background: 'transparent', cursor: 'pointer', padding: 0,
                                      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                                    }}
                                    onMouseEnter={e => { e.currentTarget.style.background = '#FDE7EA' }}
                                    onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
                                  >
                                    <Icon name="close" size={13} color="#D22040" width={2.2} />
                                  </button>
                                )}
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </>
                )}
              </div>

              {isPublished && (
                <div style={{
                  marginTop: 22, padding: '11px 14px', borderRadius: 9,
                  background: '#F0FDF4', color: '#15803D', fontSize: 15, fontWeight: 600,
                }}>
                  ✓ Published — this task is complete
                </div>
              )}
            </div>
          </div>

          {/* ── RIGHT — Activity rail ───────────────────────────────────── */}
          <aside style={{
            flex: '0 0 400px', display: 'flex', flexDirection: 'column',
            borderInlineStart: `1px solid ${CU.line}`, minWidth: 0, background: '#fff',
          }}>
            <div style={{
              height: 52, flexShrink: 0, display: 'flex', alignItems: 'center', gap: 2,
              padding: '0 12px 0 18px', borderBottom: `1px solid ${CU.line}`,
            }}>
              <span style={{ flex: 1, fontSize: 17.5, fontWeight: 700, color: CU.ink }}>Activity</span>
              <IconButton name="search" label="Search activity" />
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, paddingInlineEnd: 4 }}>
                <Icon name="bell" size={17} color={CU.blue} />
                <span style={{ fontSize: 14, fontWeight: 600, color: CU.blue }}>{task.comments.length}</span>
              </span>
              <IconButton name="filter" label="Filter activity" />
            </div>

            <div style={{ flex: 1, overflowY: 'auto', padding: '16px 18px' }}>
              {shown.map((a, i) => (
                <div key={a.id}>
                  {/* ClickUp folds the middle of a long log away */}
                  {collapsible && !showAllActivity && i === HEAD && (
                    <button type="button" onClick={() => setShowAllActivity(true)}
                            style={{
                              display: 'flex', alignItems: 'center', gap: 8, border: 'none',
                              background: 'transparent', cursor: 'pointer', padding: '4px 0 12px',
                              fontFamily: 'inherit', fontSize: 15, color: CU.text,
                            }}>
                      <Icon name="chevronR" size={14} color={CU.label} />
                      Show more {hiddenActivity > 0 && <span style={{ color: CU.faint }}>({hiddenActivity})</span>}
                    </button>
                  )}
                  <div style={{
                    display: 'grid', gridTemplateColumns: '10px minmax(0, 1fr) auto',
                    gap: 8, alignItems: 'start', marginBottom: 14,
                  }}>
                    <span style={{ color: CU.faint, lineHeight: '20px', fontSize: 16.5 }}>•</span>
                    <span style={{ fontSize: 15, color: CU.text, lineHeight: 1.5 }}>{a.node}</span>
                    <span style={{ fontSize: 13.5, color: CU.label, whiteSpace: 'nowrap', lineHeight: '20px' }}>
                      {fmtTime(a.when)}
                    </span>
                  </div>
                </div>
              ))}

              {collapsible && showAllActivity && (
                <button type="button" onClick={() => setShowAllActivity(false)}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 8, border: 'none',
                          background: 'transparent', cursor: 'pointer', padding: '0 0 8px',
                          fontFamily: 'inherit', fontSize: 15, color: CU.text,
                        }}>
                  <Icon name="chevronUp" size={14} color={CU.label} />
                  Hide
                </button>
              )}
            </div>

            {/* Composer */}
            <div style={{ padding: '10px 14px 14px', flexShrink: 0, position: 'relative' }}>

              {/* Who you can name. Opens on the @ button and on typing an @,
                  and filters as you keep typing after it. */}
              {mentionOpen && (
                <div role="listbox" aria-label="Mention someone" style={{
                  position: 'absolute', insetInline: 14, bottom: '100%', marginBottom: 4, zIndex: 4,
                  background: '#fff', border: `1px solid ${CU.line}`, borderRadius: 10,
                  boxShadow: '0 10px 30px rgba(20,20,20,.16)', padding: 6,
                  maxHeight: 268, overflowY: 'auto',
                }}>
                  {mentionMatches.length === 0 && (
                    <p style={{ margin: 0, padding: '10px 10px', fontSize: 14, color: CU.faint }}>
                      Nobody by that name.
                    </p>
                  )}
                  {mentionMatches.map((m, i) => (
                    <button
                      key={m.id}
                      type="button"
                      role="option"
                      aria-selected={i === mentionIndex}
                      onMouseEnter={() => setMentionIndex(i)}
                      onClick={() => insertMention(m)}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 10, width: '100%',
                        padding: '8px 10px', border: 'none', borderRadius: 8, cursor: 'pointer',
                        background: i === mentionIndex ? CU.hover : 'transparent',
                        fontFamily: 'inherit', fontSize: 14.5, color: CU.text, textAlign: 'start',
                      }}
                    >
                      <Avatar name={m.name} size={26} />
                      <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {m.name}
                      </span>
                      <span style={{ fontSize: 12.5, color: CU.faint, whiteSpace: 'nowrap' }}>{m.role}</span>
                    </button>
                  ))}
                </div>
              )}

              {emojiOpen && (
                <div role="menu" aria-label="Insert an emoji" style={{
                  position: 'absolute', insetInline: 14, bottom: '100%', marginBottom: 4, zIndex: 4,
                  background: '#fff', border: `1px solid ${CU.line}`, borderRadius: 10,
                  boxShadow: '0 10px 30px rgba(20,20,20,.16)', padding: 8,
                  display: 'grid', gridTemplateColumns: 'repeat(8, 1fr)', gap: 2,
                }}>
                  {EMOJI.map(e => (
                    <button key={e} type="button" onClick={() => insertAtCursor(e)}
                            aria-label={`Insert ${e}`}
                            style={{
                              height: 34, border: 'none', background: 'transparent', borderRadius: 7,
                              cursor: 'pointer', fontSize: 19, lineHeight: 1, padding: 0,
                            }}
                            onMouseEnter={ev => { ev.currentTarget.style.background = CU.hover }}
                            onMouseLeave={ev => { ev.currentTarget.style.background = 'transparent' }}>
                      {e}
                    </button>
                  ))}
                </div>
              )}

              <div style={{
                border: `1px solid ${CU.line}`, borderRadius: 10, background: '#fff',
                boxShadow: '0 1px 3px rgba(20,20,20,.05)',
              }}>
                <textarea
                  ref={cmtRef}
                  value={cmtText}
                  onChange={e => { setCmtText(e.target.value); syncMentionQuery(e.target) }}
                  onKeyDown={onComposerKey}
                  onBlur={() => window.setTimeout(() => setMentionOpen(false), 150)}
                  placeholder="Write a comment — type @ to name someone"
                  rows={2}
                  style={{
                    width: '100%', boxSizing: 'border-box', border: 'none', outline: 'none',
                    resize: 'none', fontFamily: 'inherit', fontSize: 15.5, color: CU.text,
                    padding: '12px 14px 4px', background: 'transparent', borderRadius: 10,
                  }}
                />

                {mentioned.length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, padding: '0 14px 6px' }}>
                    {mentioned.map(m => (
                      <span key={m.id} style={{
                        display: 'inline-flex', alignItems: 'center', gap: 6, height: 24,
                        padding: '0 9px', borderRadius: 999, background: '#EEF3FF',
                        fontSize: 12.5, fontWeight: 600, color: CU.blue,
                      }}>
                        <Icon name="at" size={12} color={CU.blue} width={2} />
                        {m.name}
                      </span>
                    ))}
                  </div>
                )}

                <div style={{
                  display: 'flex', alignItems: 'center', gap: 2, padding: '4px 8px 8px',
                }}>
                  {/* Attach — the same upload path as the Attachments section;
                      files belong to the task, not to the comment, because a
                      comment has nowhere to keep one. */}
                  {canEdit && (
                    <IconButton name="clip" label="Attach a file to this task"
                                onClick={() => fileRef.current?.click()} size={16} />
                  )}
                  <IconButton name="at" label="Mention someone" size={16}
                              onClick={() => { setEmojiOpen(false); openMentionPicker() }} />
                  <IconButton name="emoji" label="Insert an emoji" size={16}
                              onClick={() => { setMentionOpen(false); setEmojiOpen(v => !v) }} />
                  <span style={{ flex: 1 }} />
                  <button
                    type="button"
                    onClick={handleComment}
                    disabled={isPending || !cmtText.trim()}
                    aria-label="Send comment"
                    title="Send — ⌘Enter"
                    style={{
                      width: 34, height: 30, borderRadius: 7, border: 'none', cursor: 'pointer',
                      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                      background: cmtText.trim() ? COLORS.ink : CU.chipBg,
                      opacity: isPending ? 0.6 : 1,
                    }}
                  >
                    <Icon name="send" size={15} color={cmtText.trim() ? COLORS.lime : CU.faint} width={2} />
                  </button>
                </div>
              </div>
            </div>
          </aside>
        </div>
      </div>

      {/* Lightbox for an image attachment */}
      {lightbox && (
        <div
          onClick={e => { e.stopPropagation(); setLightbox(null) }}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(10,10,12,.86)', zIndex: 60,
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 32, cursor: 'zoom-out',
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={lightbox.url ?? ''} alt={lightbox.filename}
               style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', borderRadius: 8 }} />
        </div>
      )}
    </div>
  )
}

/* ── menu pieces ─────────────────────────────────────────────────────── */

function MenuSplit({ label, onClick, divider }: { label: string; onClick: () => void; divider?: boolean }) {
  return (
    <button type="button" onClick={onClick}
            style={{
              height: 34, border: 'none', background: '#fff', cursor: 'pointer',
              fontFamily: 'inherit', fontSize: 13.5, color: CU.text,
              borderInlineStart: divider ? `1px solid ${CU.line}` : 'none',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = CU.hover }}
            onMouseLeave={e => { e.currentTarget.style.background = '#fff' }}>
      {label}
    </button>
  )
}

function MenuItem({ icon, label, onClick }: { icon: IconName; label: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} role="menuitem"
            style={{
              display: 'flex', alignItems: 'center', gap: 11, width: '100%',
              padding: '9px 10px', border: 'none', background: 'transparent',
              borderRadius: 7, cursor: 'pointer', fontFamily: 'inherit',
              fontSize: 15, color: CU.text, textAlign: 'start',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = CU.hover }}
            onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}>
      <Icon name={icon} size={16} color={CU.label} />
      {label}
    </button>
  )
}
