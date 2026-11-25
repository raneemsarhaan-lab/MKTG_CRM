'use client'

import { fieldOnIn } from '@/lib/field-catalog'
import { PANEL_SECTIONS } from '@/lib/space-settings'
import { useState, useEffect, useMemo, useRef, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import type { Task, Member, Stage, TaskComment, TaskAttachment, SLAConfig, StageId } from '@/types/index'
import type { Brand, TeamSpace, TaskSpace, BrandFeatureKey } from '@/types/index'
import { featureOn } from '@/lib/brand-features'
import { ShowsIn } from './ShowsIn'
import { handoffRequest } from '@/components/handoff/request'
import { STAGE_META, nextStageId, EIGHT_STAGE, NINE_STAGE } from '@/lib/stage-meta'
import { initials, avatarColor, calDaysBetween } from '@/lib/utils'
import {
  moveTask, setTaskStage, addComment, updateTask, createSubtask,
  addAttachments, renameAttachment, loadAttachments, setCoverThumb,
  type TaskPatch,
} from '@/actions/tasks'
import { InlineValue } from './EditableCell'
import { BriefEditor, type UploadResult } from './BriefEditor'
import { anchorFromPoint, type ReadAnchor } from './brief-editor/readAnchor'
import { COLORS, alpha } from '@/lib/tokens'
import { Brief } from '@/components/shared/Brief'
import { useIsPhone } from '@/hooks/useMediaQuery'
import { shortName } from '@/lib/attachments'
import { makeUploader, uploadToStorage, shrinkImage } from '@/lib/attachment-upload'
import { useLocale, useTranslations } from 'next-intl'
import { cairoToday, daysBetween, formatDay, isOverdue } from '@/lib/due-dates'
import { ManualMark } from '@/components/shared/DueDates'
import { intlLocale } from '@/lib/sheet-format'
import { ImageWithFallback } from '@/components/shared/ImageWithFallback'
import { AttachmentsSection, type AttachmentsHandle, type UploadFn } from './attachments/AttachmentsSection'
import { CommentFileChip } from './attachments/CommentFileChip'
import { formatBytes } from './attachments/limits'
import { formatFileToken, parseFileTokens } from '@/lib/comment-files'
import { panelClosed } from '@/lib/pending-deletes'
import { LinkCard } from './LinkCard'
import { URL_RE, trimUrl, hrefFor, hostOf, prettyPath } from '@/lib/links'
import { useUIStore } from '@/store/useUIStore'
import { unlinkStepFromTask } from '@/actions/projects'
import { ProjectPicker } from '@/components/shared/ProjectPicker'
import { useNotify } from '@/components/notifications/NotifyProvider'
import { ReplyComposer } from './ReplyComposer'
import { mentionedIn } from '@/lib/notify/mentions'
import { useMoveError } from '@/components/fields/moveErrors'
import { RepeatEditor } from '@/components/templates/RepeatEditor'
import { templateFromTask } from '@/actions/templates'
import { TypePicker } from '@/components/types/TypePicker'
import { DescriptionLabel, PanelFieldSections, PanelTopFields, REQUIRED_EVENT, hasSections } from '@/components/fields/PanelFields'
import { useCardFields } from '@/components/fields/CardFields'
import { TypeIcon } from '@/components/types/TypeIcon'
import { typeName } from '@/lib/task-types'
import { PRIORITIES, asPriority, priorityColor } from '@/lib/priorities'
import type { Priority } from '@/types/index'
import { AssigneesPicker } from '@/components/people/AssigneesPicker'
import { TagPicker } from '@/components/tags/TagPicker'
import { useDialogFocus } from './useDialogFocus'

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
  project?: { id: string; name: string } | null
  brand: Brand
  task_owner: Member
  comments: (TaskComment & { author: Member })[]
  attachments?: TaskAttachment[]
}

const PLATFORMS  = ['LinkedIn', 'Instagram', 'TikTok', 'Facebook', 'Twitter', 'YouTube', 'Email']

/** The brand palette — blue primary, lime-green secondary accent. */
const CU = {
  ink:        '#18233F',
  text:       '#18233F',
  label:      '#68738D',
  faint:      '#929CB0',
  line:       '#E9EDF4',
  lineSoft:   '#EEF1F8',
  hover:      '#F3F6FD',
  chipBg:     '#F3F6FD',
  blue:       '#3563E9',
  blueLight:  '#EEF3FF',
  blueXLight: '#F6F8FF',
  green:      '#B7DE16',
  greenSoft:  '#F2F8D9',
  surface:    '#F8FAFD',
} as const

interface TaskModalProps {
  task: FullTask
  /** Spec 024 (§4): inside a Space, the order of the sections under the top rows. */
  sectionOrder?: string[]
  /** Spec 024 (§8): inside a Space, its own name for a stage (Editing, Edit Review…); elsewhere the original names. */
  stageNameOf?: (stage: StageId) => string | undefined
  /** Spec 021: the task's Task link fields ("Part of ↗ …" with ⇄ and ×), shown under Fields. */
  linksSection?: React.ReactNode
  /** The workspace's days-before for the due-date rule (the hover on an automatic due date). */
  dueDaysBefore?: number
  currentUser: Member
  stages: Stage[]
  slaConfig: SLAConfig
  today: Date
  onClose: () => void
  brands?: Brand[]
  members?: Member[]
  contentTypes?: import('@/types/index').ContentType[]
  /** Everything the composer can link to with #, and a chip can jump to. */
  allTasks?: TaskRef[]
  /**
   * Whether this deployment has a bucket configured. When it does, files go
   * there at full size; when it does not, they still go into the database the
   * old way, so an upload never simply stops working.
   */
  hasStorage?: boolean
  /** Open this file's preview as soon as the panel's files load (spec 008 FR-045). */
  initialPreviewId?: string
  /** Scroll to this comment and flash it, from the Inbox (spec 006 FR-042). */
  initialCommentId?: string
  /** Open at Attachments, from an attachment notification (spec 012 R14). */
  initialSection?: 'attachments'
  /**
   * "Open sheet" on a video or a clip (spec 008). The board passes its own
   * switch; elsewhere the button navigates to the board's sheet.
   */
  onOpenSheet?: (videoId: string, rowId: string | null) => void
  /** Spec 021: the live team Spaces, and every Shows in row (the panel picks this task's). */
  spaces?: TeamSpace[]
  taskSpaces?: TaskSpace[]
}

/* ── icons — 16px line set, ClickUp's weight ─────────────────────────── */

type IconName =
  | 'status' | 'user' | 'calendar' | 'flag' | 'clock' | 'tag' | 'folder'
  | 'link' | 'clip' | 'chevron' | 'chevronR' | 'chevronUp' | 'plus' | 'subtask' | 'pencil'
  | 'search' | 'bell' | 'filter' | 'star' | 'panel' | 'close' | 'more'
  | 'brand' | 'type' | 'platform' | 'image' | 'target' | 'expand' | 'send'
  | 'at' | 'emoji' | 'video' | 'mic' | 'person' | 'sparkle' | 'openIn' | 'file' | 'download'

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
    download: <><path d="M12 3v13m0 0-4.5-4.5M12 16l4.5-4.5" /><path d="M4 19.5h16" /></>,
    pencil:   <><path d="M4 20h4L19.5 8.5a2.1 2.1 0 0 0-3-3L5 17v3z" /><path d="M14.5 6.5l3 3" /></>,
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

/** A task the composer can offer and a posted comment can link to. */
export interface TaskRef { id: string; name: string; status: StageId }

/** A row in the composer's picker — a person to name, or a task to link. */
type Suggestion =
  | { kind: 'member'; id: string; name: string; role: string }
  | { kind: 'task';   id: string; name: string; status: StageId }

/** Every distinct link in a comment, in the order it was written. */
function urlsIn(body: string): string[] {
  const out: string[] = []
  for (const m of body.matchAll(URL_RE)) {
    const url = trimUrl(m[0])
    if (url && !out.includes(url)) out.push(url)
  }
  return out
}

/**
 * A one-line stand-in for a pasted URL: "claude.ai/design/p/914cfd78-…".
 *
 * The full address stays on `href` and in `title` — this is only what the
 * comment shows inline. A raw link can run sixty characters of query string
 * and folder id, and printed in full it wrapped five lines deep before the
 * LinkCard even got a chance to say the same thing with a title and a
 * favicon. One line here, then whatever the card below adds.
 */
function linkLabel(url: string, max = 42): string {
  const label = (hostOf(url) + prettyPath(url)) || url.replace(/^https?:\/\//, '')
  return label.length <= max ? label : label.slice(0, max - 1) + '…'
}

/**
 * Draw the bare URLs in a run of text as links.
 *
 * A pasted link is the single most common thing in these comments and it was
 * arriving as dead text — worse, as one unbroken word wide enough to push the
 * comment out of its own bubble. So it becomes an anchor, shown as a short
 * label rather than the address itself.
 */
function linkify(text: string, keyBase: string): React.ReactNode[] {
  const out: React.ReactNode[] = []
  let last = 0
  for (const m of text.matchAll(URL_RE)) {
    const at  = m.index ?? 0
    const url = trimUrl(m[0])
    if (!url) continue
    if (at > last) out.push(text.slice(last, at))
    out.push(
      <a key={`${keyBase}-${at}`} href={hrefFor(url)} target="_blank"
         rel="noopener noreferrer nofollow" title={url}
         onClick={e => e.stopPropagation()}
         style={{ color: CU.blue, textDecoration: 'underline', overflowWrap: 'anywhere' }}>
        {linkLabel(url)}
      </a>,
    )
    last = at + url.length
  }
  if (last < text.length) out.push(text.slice(last))
  return out
}

/**
 * Draw the @names and #tasks in a posted comment as chips.
 *
 * Matching is on the text rather than the stored ids: the ids say who and what
 * was meant, this says where in the sentence they were meant. Longest names
 * first, so "Islam Saadany" is not matched as "Islam" with a stray surname
 * after it, and a long task name wins over a shorter one it contains.
 *
 * Only tasks this comment actually recorded a link to are passed in, so a
 * comment that happens to quote a task's name in passing stays plain text.
 */
export function withRefs(
  body: string,
  members: Member[],
  linked: TaskRef[],
  onOpenTask?: (id: string) => void,
  /** The task's files, for `[📎 name](attachment:id)` tokens (spec 007 FR-074). */
  files?: { list: TaskAttachment[]; open: (id: string) => void },
): React.ReactNode {
  // File tokens first: each becomes a chip with the file's current name, and
  // the text between them goes through the @/# rendering below.
  const tokens = parseFileTokens(body)
  if (tokens.length) {
    const out: React.ReactNode[] = []
    let last = 0
    for (const tk of tokens) {
      const before = body.slice(last, tk.start).replace(/\n$/, '')
      if (before) out.push(<span key={`t${last}`}>{withRefs(before, members, linked, onOpenTask)}</span>)
      out.push(
        <span key={`f${tk.start}`} style={{ display: 'block', marginTop: 6 }}>
          <CommentFileChip file={files?.list.find(f => f.id === tk.id) ?? null} name={tk.name} onOpen={files?.open} />
        </span>,
      )
      last = tk.end
    }
    const after = body.slice(last).replace(/^\n/, '')
    if (after) out.push(<span key={`t${last}`}>{withRefs(after, members, linked, onOpenTask)}</span>)
    return out
  }

  const refs = [
    ...members.filter(m => m.name).map(m => ({ kind: 'member' as const, name: m.name, id: m.id })),
    ...linked.filter(t => t.name).map(t => ({ kind: 'task' as const, name: t.name, id: t.id })),
  ].sort((a, b) => b.name.length - a.name.length)
  if (!refs.length) return linkify(body, 'l')

  const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const re = new RegExp(refs.map(r => `${r.kind === 'task' ? '#' : '@'}${esc(r.name)}`).join('|'), 'g')

  const out: React.ReactNode[] = []
  let last = 0
  for (const m of body.matchAll(re)) {
    const at    = m.index ?? 0
    const sigil = m[0][0]
    const name  = m[0].slice(1)
    const ref   = refs.find(r => r.name === name && (r.kind === 'task') === (sigil === '#'))
    if (at > last) out.push(...linkify(body.slice(last, at), `l${last}`))

    if (ref?.kind === 'task') {
      out.push(
        <button
          key={`${at}-${ref.id}`}
          type="button"
          onClick={() => onOpenTask?.(ref.id)}
          title={`Open ${ref.name}`}
          className="fx-hov"
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 4, verticalAlign: 'baseline',
            background: '#F3EEFF', color: '#6D28D9', borderRadius: 5, border: 'none',
            padding: '1px 5px', margin: 0, fontFamily: 'inherit', fontSize: 'inherit',
            fontWeight: 600, cursor: onOpenTask ? 'pointer' : 'default', textAlign: 'start',
          }}
        >
          <Icon name="link" size={11} color="#6D28D9" width={2.2} />
          {ref.name}
        </button>,
      )
    } else {
      out.push(
        <span key={`${at}-${name}`} style={{
          background: '#EEF3FF', color: CU.blue, borderRadius: 5,
          padding: '1px 4px', fontWeight: 600,
        }}>
          @{name}
        </span>,
      )
    }
    last = at + m[0].length
  }
  if (last < body.length) out.push(...linkify(body.slice(last), `l${last}`))
  return out
}

/** The brand's uploaded logo, or its colour as a lettered disc when it has
 *  none — the same mark the board's brand filter and the task form use. */
function BrandMark({ brand, size = 20 }: { brand: { name: string; color: string; logo_url?: string }; size?: number }) {
  return (
    <span aria-hidden="true" style={{
      width: size, height: size, borderRadius: '50%', flexShrink: 0, overflow: 'hidden',
      background: brand.color, color: '#fff', fontSize: size * 0.5, fontWeight: 800, lineHeight: 1,
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    }}>
      {brand.logo_url
        // eslint-disable-next-line @next/next/no-img-element
        ? <img src={brand.logo_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        : brand.name.trim()[0]?.toUpperCase()}
    </span>
  )
}

function Avatar({ name, size = 24, color }: { name: string; size?: number; color?: string }) {
  return (
    <span title={name} style={{
      width: size, height: size, borderRadius: '50%',
      background: color ?? avatarColor(name), color: '#fff',
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
            className="fx-icon-btn"
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
/** Fields (25 Nov 2026): one icon per field kind, the same in every place. */
const KIND_ICON: Partial<Record<string, IconName>> = {
  text: 'pencil', number: 'target', money: 'target', date: 'calendar', link: 'link', person: 'at',
  choice: 'type', multi: 'tag', checkbox: 'status', rating: 'star', task: 'subtask',
}

function Prop({ icon, label, children }: {
  icon: IconName; label: string; children: React.ReactNode
}) {
  return (
    <div className="fx-prop" style={{ display: 'grid', gridTemplateColumns: '158px minmax(0, 1fr)', alignItems: 'center', minHeight: 38 }}>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 9, fontSize: 15, color: CU.label }}>
        <Icon name={icon} size={16} />
        {label}
      </span>
      <div style={{ minWidth: 0, fontSize: 15, color: CU.text }}>{children}</div>
    </div>
  )
}

/** A row in the Fields block — its own white, borderless, shadowed card. */
function Field({ icon, label, children }: {
  icon: IconName; label: string; children: React.ReactNode
}) {
  return (
    <div className="fx-field" style={{
      display: 'grid', gridTemplateColumns: '200px minmax(0, 1fr)', alignItems: 'center',
      minHeight: 46, padding: '0 12px', marginBottom: 6, borderRadius: 13,
      background: '#FFFFFF', boxShadow: '0 1px 2px rgba(24,35,63,0.03)',
    }}>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10, fontSize: 14, fontWeight: 500, color: CU.label }}>
        <Icon name={icon} size={16} color={CU.faint} />
        {label}
      </span>
      <div style={{ minWidth: 0, fontSize: 14.5, fontWeight: 600, color: CU.text }}>{children}</div>
    </div>
  )
}

/** The lightweight "Add subtask" action row — a pale-blue chip, not a button. */
function ActionRow({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick}
            style={{
              display: 'flex', alignItems: 'center', gap: 10, width: '100%',
              padding: '10px 12px', border: 'none', background: CU.blueXLight,
              borderRadius: 12, cursor: 'pointer', fontFamily: 'inherit',
              fontSize: 15, fontWeight: 600, color: CU.blue, textAlign: 'start',
              transition: 'background .12s',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = CU.blueLight }}
            onMouseLeave={e => { e.currentTarget.style.background = CU.blueXLight }}>
      <span style={{
        width: 20, height: 20, borderRadius: '50%', background: CU.blue, flexShrink: 0,
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <Icon name="plus" size={12} color="#fff" width={2.6} />
      </span>
      {label}
    </button>
  )
}

/** The small brand motif beside the "Fields" heading — blue, navy, lime. */
function BrandMotif() {
  return (
    <span style={{ display: 'inline-flex', flexDirection: 'column', gap: 2, marginInlineStart: 2 }} aria-hidden="true">
      <span style={{ width: 12, height: 2, borderRadius: 1, background: CU.blue }} />
      <span style={{ width: 12, height: 2, borderRadius: 1, background: CU.ink }} />
      <span style={{ width: 12, height: 2, borderRadius: 1, background: CU.green }} />
    </span>
  )
}

/* Dates and counts in the reader's language — `loc` is intlLocale() of the
   active locale, the same en-GB / ar-EG pair the sheets format with. */
const fmtDate = (d: string | Date, loc: string) =>
  new Date(d).toLocaleDateString(loc, { day: 'numeric', month: 'short', year: 'numeric' })

const fmtShort = (d: string | Date, loc: string) =>
  new Date(d).toLocaleDateString(loc, { day: 'numeric', month: 'short' })

const fmtTime = (d: string | Date, loc: string) =>
  new Date(d).toLocaleString(loc, {
    day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', hour12: true,
  })

/** "3d", "1.5h": the narrow unit, in the locale's own digits. */
const fmtUnit = (n: number, unit: 'day' | 'hour', loc: string) =>
  new Intl.NumberFormat(loc, { style: 'unit', unit, unitDisplay: 'narrow', maximumFractionDigits: 2 }).format(n)

/**
 * What to tell someone when an action fails: what happened, and what to do.
 *
 * The actions answer with codes ("not_authorized") for the common refusals
 * and with a sentence for anything specific to the input; a code is never
 * shown as it stands. `fallback` covers everything else — usually a dropped
 * connection — and says to try again.
 */
function errorText(code: string | undefined, fallback: string): string {
  switch (code) {
    case 'not_authenticated': return 'You’ve been signed out — sign in again, then retry.'
    case 'not_authorized':    return 'You don’t have permission to do that — ask the task’s owner or an admin.'
    case 'not_found':         return 'This task no longer exists — close it and refresh the board.'
  }
  return code && /\s/.test(code) ? code : fallback
}

/**
 * The phone's Task / Activity tab rides in the address beside the open task
 * (`?task=…&pane=activity`), so a shared link or a reload lands on the same
 * half. Only beside this task's own `task=`: a host that doesn't put the task
 * in the URL (the overview) never gets a stray parameter.
 */
function paneInUrl(taskId: string): 'task' | 'activity' {
  if (typeof window === 'undefined') return 'task'
  const q = new URL(window.location.href).searchParams
  return q.get('task') === taskId && q.get('pane') === 'activity' ? 'activity' : 'task'
}

export function TaskModal({
  task, currentUser, stages: _stages, slaConfig: _slaConfig, today, onClose,
  brands = [], members = [], contentTypes = [], allTasks = [], hasStorage = false,
  initialPreviewId, initialCommentId, initialSection, onOpenSheet,
  spaces = [], taskSpaces = [], linksSection, dueDaysBefore = 7, stageNameOf, sectionOrder,
}: TaskModalProps) {
  const orderOf = (k: string) => { const i = sectionOrder?.indexOf(k) ?? -1; return i < 0 ? PANEL_SECTIONS.indexOf(k as never) : i }
  const nameOf = (s: StageId) => stageNameOf?.(s) ?? STAGE_META[s]?.label_en ?? s
  const [cmtText, setCmtText]             = useState('')
  const [editingBrief, setEditingBrief]   = useState(false)
  // Where the read brief was clicked, so editing starts on that word (spec 005 FR-015).
  const [briefCursor, setBriefCursor]     = useState<ReadAnchor | undefined>(undefined)
  // The brief editor's last reported save state (spec 005 FR-004): closing the
  // panel while a save has failed or an image is uploading asks first.
  const briefState = useRef<{ state: 'saved' | 'saving' | 'error'; pending: number }>({ state: 'saved', pending: 0 })
  const [closeGuard, setCloseGuard] = useState<'unsaved' | 'uploading' | 'comment' | 'subtask' | null>(null)
  function requestClose() {
    // A click on the panel's close control is also a click outside the brief,
    // so the editor has already asked; don't ask twice.
    if (editingBrief && document.querySelector('[data-confirm-leave]')) return
    const { state, pending } = briefState.current
    if (editingBrief && state === 'error') { setCloseGuard('unsaved'); return }
    if (editingBrief && pending > 0) { setCloseGuard('uploading'); return }
    // Typed but not sent: closing would drop it silently. (A rename in progress
    // is saved by its own blur, so it needs no guard.)
    if (cmtText.trim() || draftFiles.length) { setCloseGuard('comment'); return }
    if (addingSubtask && subtaskName.trim()) { setCloseGuard('subtask'); return }
    // Deletes still in their Undo window move to the bottom message (spec 007 FR-034).
    panelClosed(task.id)
    onClose()
  }
  const [briefText, setBriefText]         = useState('')
  // Errors about the task itself (a field, the stage, following). Comment and
  // subtask errors sit beside their own box instead.
  const [error, setError]                 = useState('')
  const [cmtError, setCmtError]           = useState('')
  const [subtaskError, setSubtaskError]   = useState('')
  // Unlinking a plan step asks first, in place (the row turns into the question).
  const [confirmUnlink, setConfirmUnlink] = useState(false)
  const unlinkBtnRef = useRef<HTMLButtonElement>(null)
  // Enter or Esc in the rename box hands focus back to the title.
  const titleRef     = useRef<HTMLButtonElement>(null)
  const refocusTitle = useRef(false)
  // The panel's own copy ("Created", "left", "overdue", the field names) is
  // still hardcoded English, and ar-EG dates and digits inside English
  // sentences read worse than English throughout. Format in English until the
  // panel is translated; then this becomes intlLocale(useLocale()).
  const loc = intlLocale('en')

  /* One polite live region for the panel, always mounted, so confirmations
     that only change a word on screen ("Copied") are also heard. Cleared
     first, so the same message twice in a row is read twice. */
  const [status, setStatus] = useState('')
  function say(msg: string) {
    setStatus('')
    window.setTimeout(() => setStatus(msg), 60)
  }
  const [editingName, setEditingName]     = useState(false)
  const [nameText, setNameText]           = useState('')
  const [showEmpty, setShowEmpty]         = useState(false)
  const [fieldsOpen, setFieldsOpen]       = useState(true)
  const [briefOpen, setBriefOpen]         = useState(false)
  const [menuOpen, setMenuOpen]           = useState(false)
  const [addingSubtask, setAddingSubtask] = useState(false)
  const [subtaskName, setSubtaskName]     = useState('')
  const [showAllActivity, setShowAllActivity] = useState(false)

  // From the Inbox: show the whole log, then bring that comment into view and
  // flash it once (spec 006 FR-042, research R12).
  useEffect(() => {
    if (!initialCommentId) return
    setShowAllActivity(true)
    let tries = 0
    const timer = setInterval(() => {
      const el = document.querySelector<HTMLElement>(`[data-comment-id="${CSS.escape(initialCommentId)}"]`)
      if (el) {
        el.scrollIntoView({ block: 'center' })
        el.classList.add('fx-comment-flash')
        window.setTimeout(() => el.classList.remove('fx-comment-flash'), 1600)
      }
      // Up to 10 s: from a notification the comment may still be on its way
      // in with the board's refresh.
      if (el || ++tries > 100) clearInterval(timer)
    }, 100)
    return () => clearInterval(timer)
  }, [initialCommentId, task.id])
  const [copied, setCopied]               = useState('')
  const [sendHover, setSendHover]         = useState(false)
  /* Which half of the panel a phone is showing. Desktop shows both at once
     and never reads this. Reset to the task on open, because arriving in
     somebody's comment thread is not what tapping a card asks for — unless
     the address itself says `pane=activity` (a shared link, a reload). */
  const isPhone                           = useIsPhone()
  const [pane, setPane]                   = useState<'task' | 'activity'>(() => paneInUrl(task.id))
  const [picked, setPicked]               = useState<string[]>([])
  const [pickedTasks, setPickedTasks]     = useState<string[]>([])
  const [mentionOpen, setMentionOpen]     = useState(false)
  const [mentionQuery, setMentionQuery]   = useState('')
  const [mentionSigil, setMentionSigil]   = useState<'@' | '#'>('@')
  const [mentionIndex, setMentionIndex]   = useState(0)
  const [emojiOpen, setEmojiOpen]         = useState(false)
  const [stageOpen, setStageOpen]         = useState(false)
  // Files attached to the comment being written (spec 007 FR-073): attachment ids.
  const [draftFiles, setDraftFiles]       = useState<string[]>([])
  const sectionRef = useRef<AttachmentsHandle>(null)
  const ta = useTranslations('attachments')
  const [pickerOpen, setPickerOpen]       = useState(false)
  const [isPending, startTransition]      = useTransition()
  // Their own, so each button can say it's busy without the others claiming to.
  const [addingSub, startAddSub]          = useTransition()
  const [posting, startPost]              = useTransition()
  const [advancing, startAdvance]         = useTransition()

  const router = useRouter()
  const menuRef = useRef<HTMLDivElement>(null)
  const cmtRef  = useRef<HTMLTextAreaElement>(null)
  const stageBtnRef  = useRef<HTMLButtonElement>(null)
  const stageMenuRef = useRef<HTMLDivElement>(null)
  const setCelebration = useUIStore(s => s.setCelebration)
  const openHandoff = useUIStore(s => s.openHandoff)
  const selectTask     = useUIStore(s => s.selectTask)

  // The phone tab into the address (see paneInUrl). replaceState, as the
  // board does for its own parameters: switching tabs is not a step to go
  // Back through. Written only beside this task's `task=`, and taken out
  // again when the panel closes.
  useEffect(() => {
    const url = new URL(window.location.href)
    if (url.searchParams.get('task') !== task.id) return
    const want = isPhone && pane === 'activity' ? 'activity' : null
    if (url.searchParams.get('pane') === want) return
    if (want) url.searchParams.set('pane', want); else url.searchParams.delete('pane')
    window.history.replaceState(null, '', url)
  }, [pane, isPhone, task.id])
  useEffect(() => () => {
    const url = new URL(window.location.href)
    if (!url.searchParams.has('pane')) return
    url.searchParams.delete('pane')
    window.history.replaceState(null, '', url)
  }, [])

  useEffect(() => {
    if (!editingName && refocusTitle.current) { refocusTitle.current = false; titleRef.current?.focus() }
  }, [editingName])

  // From an attachment notification: open Attachments and bring it into view.
  useEffect(() => {
    if (initialSection !== 'attachments') return
    let tries = 0
    const timer = setInterval(() => {
      const ready = document.querySelector('[data-att-count]')
      if (ready) sectionRef.current?.reveal()
      if (ready || ++tries > 40) clearInterval(timer)
    }, 150)
    return () => clearInterval(timer)
  }, [initialSection, task.id])

  /* Follow / Following (spec 012 US5, FR-011): read when the panel opens. */
  const notify = useNotify()
  const tn = useTranslations('notifications')
  const [following, setFollowing] = useState<boolean | null>(null)
  const [followBusy, setFollowBusy] = useState(false)
  useEffect(() => {
    if (!notify) return
    let cancelled = false
    setFollowing(null)
    void notify.api.getFollow(task.id).then(r => { if (!cancelled && r.success) setFollowing(r.following) })
    return () => { cancelled = true }
  }, [notify, task.id])
  async function toggleFollow() {
    if (!notify || following === null) return
    const next = !following
    setFollowing(next); setFollowBusy(true)
    const r = await notify.api.setFollow(task.id, next).catch(() => ({ success: false }))
    setFollowBusy(false)
    // The button flips back; say so, or it looks like the click didn't land.
    if (!r.success) {
      setFollowing(!next)
      setError(next
        ? 'Could not follow this task — check your connection and try again.'
        : 'Could not unfollow this task — check your connection and try again.')
    }
  }

  /* Replies (spec 012 R4): the thread being answered. */
  const [replyTo, setReplyTo] = useState<string | null>(null)
  useEffect(() => { setReplyTo(null) }, [task.id])
  async function sendReply(parentId: string, body: string, mentions: string[]) {
    const r = await addComment(task.id, body, mentions, [], parentId)
    if (r.success) {
      setReplyTo(null)
      setFollowing(true)
      router.refresh()
      notify?.refresh()
    }
    return r
  }

  // From a sheet's Files cell: open that file's preview once the files have loaded.
  useEffect(() => {
    if (!initialPreviewId) return
    let tries = 0
    const timer = setInterval(() => {
      if (sectionRef.current?.openPreview(initialPreviewId) || ++tries > 40) clearInterval(timer)
    }, 150)
    return () => clearInterval(timer)
  }, [initialPreviewId, task.id])

  /**
   * The video sheet this task belongs to (spec 008): a video's own, or for a
   * clip its video's, with the clip's row highlighted.
   */
  const sheetTarget = task.content_type_label === 'Video' && !task.parent_task_id
    ? { video: task.id, row: null as string | null }
    : task.parent_task_id && (task.clip || ['Reel', 'Video'].includes(task.content_type_label))
      ? { video: task.parent_task_id, row: task.id }
      : null
  const tsheet = useTranslations('sheet')
  const tDates = useTranslations('dates')
  const tRepeat = useTranslations('repeat')
  const tTpl = useTranslations('templates')
  const tMedia = useTranslations('media')
  const moveErr = useMoveError()
  const locale = useLocale()
  const tSpaces = useTranslations('spaces')
  const tInfo = useTranslations('taskInfo')
  const tSheet = useTranslations('taskSheet')
  function openSheet() {
    if (!sheetTarget) return
    if (onOpenSheet) { onOpenSheet(sheetTarget.video, sheetTarget.row); return }
    const q = new URLSearchParams({ view: 'sheet', video: sheetTarget.video })
    if (sheetTarget.row) q.set('row', sheetTarget.row)
    router.push(`/board?${q}`)
  }

  const stageMeta = STAGE_META[task.status]
  const nextStage = nextStageId(task.status, task.nine_stage)
  const nextMeta  = nextStage ? STAGE_META[nextStage] : null
  const pipeline  = task.nine_stage ? NINE_STAGE : EIGHT_STAGE
  // The board's query includes the relation; a panel opened from elsewhere may
  // only have the id, so fall back to the member list.
  const assignee  = task.assignee ?? members.find(m => m.id === task.assignee_id) ?? null
  // Days are Cairo days (src/lib/due-dates.ts); published or done work is never overdue.
  const daysLeft  = task.due_date ? daysBetween(cairoToday(), task.due_date.slice(0, 10)) : null
  const overdue   = isOverdue(task as Parameters<typeof isOverdue>[0])

  /**
   * The task's files as the Attachments section has them (spec 007). The
   * section loads and owns them; this mirror feeds the header count, the brief
   * editor's image list and the comment chips.
   */
  const [files, setFiles] = useState<TaskAttachment[]>(task.attachments ?? [])
  useEffect(() => { setFiles(task.attachments ?? []) }, [task.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const attachments = files

  // Long briefs are folded, as ClickUp folds them. The threshold is on the
  // markdown rather than the rendered height because the height is not known
  // until after paint, and a pill that appears a frame late reads as a glitch.
  const clipped = (task.description ?? '').length > 420

  // Mirrors updateTask's server-side check — the server one is authoritative.
  // Mirrors canAct() in the server action — owner or assignee, or a manager.
  const canEdit =
    task.task_owner_id === currentUser.id ||
    task.assignee_id === currentUser.id || !!task.assignee_ids?.includes(currentUser.id) ||
    currentUser.access === 'admin' ||
    currentUser.access === 'superuser'

  const isAdmin     = currentUser.access === 'admin'
  const tPri        = useTranslations('priority')
  const tAs         = useTranslations('assignees')
  const tTags       = useTranslations('tags')
  const typeOf      = contentTypes.find(c => c.label === task.content_type_label)
  const cardFields  = useCardFields()
  const withSections = hasSections(task, cardFields?.fields, cardFields?.links)
  const isSuperuser = currentUser.access === 'superuser'
  const isPublished = task.status === 'publish'

  const isOwnStage = stageMeta.owner_role === null
    ? task.assignee_id === currentUser.id || task.task_owner_id === currentUser.id || !!task.assignee_ids?.includes(currentUser.id)
    : stageMeta.owner_role === currentUser.role

  const canAdvance = !isPublished && nextStage !== null && (isOwnStage || isAdmin || isSuperuser)
  const isOverride = canAdvance && !isOwnStage && (isAdmin || isSuperuser)

  // Escape closes the panel — unless something smaller is open, which takes it
  // first: the menu, then whatever field is being edited. The attachment preview
  // handles its own Esc, in the capture phase, before this sees it (spec 007).
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== 'Escape') return
      if (menuOpen) { setMenuOpen(false); return }
      if (stageOpen) { setStageOpen(false); return }
      // With focus on one of their options rather than the comment box, the
      // emoji and mention pickers still close before the panel does.
      if (emojiOpen) { setEmojiOpen(false); return }
      if (mentionOpen) { setMentionOpen(false); return }
      if (confirmUnlink) { cancelUnlink(); return }
      // The brief editor handles its own Esc (closing its menus, then leaving
      // editing); it marks the event handled, and it must not also close the
      // whole panel.
      if (e.defaultPrevented || (e.target as HTMLElement)?.isContentEditable) return
      const tag = (e.target as HTMLElement)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
      if (closeGuard) { setCloseGuard(null); return }
      requestClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  // Closing or reloading the tab with unsent work asks first: a comment or
  // subtask still being typed, or a brief whose save is pending or failed.
  // (The brief's last save state outlives the edit, so it only counts while
  // the brief is open for editing — as in requestClose.)
  const unsent = useRef({ draft: false, editingBrief: false })
  unsent.current = {
    draft: Boolean(cmtText.trim() || draftFiles.length || (addingSubtask && subtaskName.trim())),
    editingBrief,
  }
  useEffect(() => {
    function onBeforeUnload(e: BeforeUnloadEvent) {
      const { state, pending } = briefState.current
      const briefAtRisk = unsent.current.editingBrief && (state !== 'saved' || pending > 0)
      if (!unsent.current.draft && !briefAtRisk) return
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [])

  // Focus moves into the panel on open, Tab stays inside it, and focus goes
  // back to the card on close.
  const dialog = useDialogFocus<HTMLDivElement>(`[data-task-card="${CSS.escape(task.id)}"]`)

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

  /**
   * Save a change to the task. Resolves `true` once stored, `false` when not —
   * and always resolves. The brief editor relies on that: before, a thrown
   * action (a network drop, a stale action id after a deploy) skipped
   * `resolve()`, so the editor waited on this forever and every later
   * keystroke queued behind it, unsent, under "Saving…" (spec 005, research R1).
   */
  function applyPatch(patch: TaskPatch, after?: () => void): Promise<boolean> {
    setError('')
    return new Promise(resolve => {
      startTransition(async () => {
        try {
          const res = await updateTask(task.id, patch)
          if (res.success) { router.refresh(); after?.(); resolve(true); return }
          setError(res.error === 'start_after_due' ? tDates('startAfterDue') : errorText(res.error, 'Could not save the change — check your connection and try again.'))
          resolve(false)
        } catch {
          setError('Could not save the change — check your connection and try again.')
          resolve(false)
        }
      })
    })
  }

  /** A field's change, confirmed out loud once it's stored ("Due date saved"). */
  function saveField(label: string, patch: TaskPatch) {
    return applyPatch(patch, () => say(`${label} saved`))
  }

  /** Also the brief editor's "turn this line into a subtask"; its errors show at the top. */
  async function handleCreateSubtask(name: string, onError: (msg: string) => void = setError) {
    const fallback = 'Could not add the subtask — check your connection and try again.'
    const res = await createSubtask(task.id, name).catch(() => ({ success: false, error: undefined, id: undefined, name: undefined }))
    if (!res.success || !res.id) {
      onError(res.error === 'not_authorized'
        ? 'You can’t add subtasks to this task — ask its owner or an admin.'
        : errorText(res.error, fallback))
      return null
    }
    router.refresh()
    return { name: res.name ?? name, href: `/board?task=${res.id}` }
  }

  function submitSubtask() {
    const name = subtaskName.trim()
    if (!name) { setAddingSubtask(false); return }
    setSubtaskError('')
    startAddSub(async () => {
      const made = await handleCreateSubtask(name, setSubtaskError)
      // A failed add keeps the name in the box, to try again.
      if (!made) return
      setSubtaskName('')
      setAddingSubtask(false)
      say(`Subtask added: ${made.name}`)
    })
  }

  function handleAdvance() {
    if (!canAdvance) return
    setError('')
    startAdvance(async () => {
      const fallback = 'Could not move the task — check your connection and try again.'
      const result = await moveTask(task.id).catch(() => null)
      // Spec 021 (FR-030): into the design half with no production Space → the hand-off box.
      const handoff = result ? handoffRequest(result, task, spaces, taskSpaces, members, tSpaces) : null
      if (handoff) { openHandoff(handoff); return }
      if (!result?.success) {
        if (result?.error === 'needs_handoff') return
        if (result) flagRequired(result)
        setError(
          (result ? moveErr(result) : null)
          ?? (result?.error === 'not_authorized' ? 'That stage belongs to someone else — ask an admin to move it.'
            : result?.error === 'terminal'     ? 'This task is already at its last stage.'
            : result?.error === 'dropped'      ? 'This clip was dropped, so it can’t move on — restore it on its sheet first.'
            : errorText(result?.error, fallback)))
        return
      }
      router.refresh()
      if (result.shouldCelebrate && nextMeta) {
        setCelebration({ taskName: task.name, stageLabel: nextMeta.label_en })
      }
      onClose()
    })
  }

  /** Spec 023: a refusal for required fields outlines their sections in the panel. */
  function flagRequired(r: { error?: string; missing?: string[] }) {
    if (r.error === 'required_fields' && r.missing?.length) window.dispatchEvent(new CustomEvent(REQUIRED_EVENT, { detail: { taskId: task.id, missing: r.missing } }))
  }

  /* ── naming people and linking tasks in a comment ────────────────────── */

  /**
   * Who and what is still named in what has been typed.
   *
   * Picking someone records their id, but the text stays editable — delete
   * the "@Salma" and the mention should go with it. So the list is derived
   * from the body on every render rather than kept as the truth: whoever's
   * handle survives in the text is who gets stored. Task links work the same
   * way, on "#" and the task's name.
   */
  const mentioned = useMemo(
    () => members.filter(m => picked.includes(m.id) && cmtText.includes(`@${m.name}`)),
    [members, picked, cmtText],
  )

  const linkedTasks = useMemo(
    () => allTasks.filter(t => pickedTasks.includes(t.id) && cmtText.includes(`#${t.name}`)),
    [allTasks, pickedTasks, cmtText],
  )

  /**
   * What the picker offers.
   *
   * "#" is tasks only. "@" is people, and — once something has been typed —
   * the tasks that match it too, below them: ClickUp names both from the one
   * key, and an empty "@" that led with a wall of task names would bury the
   * people it is mostly used for.
   */
  const mentionMatches = useMemo<Suggestion[]>(() => {
    const q = mentionQuery.trim().toLowerCase()

    const people: Suggestion[] = mentionSigil === '#' ? [] : members
      .filter(m => m.id !== currentUser.id)
      .filter(m => !q || m.name.toLowerCase().includes(q) || (m.role ?? '').toLowerCase().includes(q))
      .slice(0, q ? 5 : 8)
      .map(m => ({ kind: 'member', id: m.id, name: m.name, role: m.role ?? '' }))

    const wantTasks = mentionSigil === '#' || q.length > 0
    const tasks: Suggestion[] = !wantTasks ? [] : allTasks
      .filter(t => t.id !== task.id)
      .filter(t => !q || t.name.toLowerCase().includes(q))
      .slice(0, mentionSigil === '#' ? 8 : 4)
      .map(t => ({ kind: 'task', id: t.id, name: t.name, status: t.status }))

    return [...people, ...tasks]
  }, [members, allTasks, mentionQuery, mentionSigil, currentUser.id, task.id])

  useEffect(() => { setMentionIndex(0) }, [mentionQuery, mentionOpen])

  /** The "@word" or "#word" being typed immediately before the caret. */
  function mentionTokenAt(el: HTMLTextAreaElement):
    { at: number; query: string; sigil: '@' | '#' } | null {
    const caret = el.selectionStart ?? 0
    const upto  = el.value.slice(0, caret)
    const at    = Math.max(upto.lastIndexOf('@'), upto.lastIndexOf('#'))
    if (at === -1) return null
    // Only right after whitespace or at the very start — an email address is
    // not a mention, and a colour like #F4F5F7 is not a task.
    if (at > 0 && !/\s/.test(upto[at - 1])) return null
    const query = upto.slice(at + 1)
    if (query.includes('\n')) return null
    return { at, query, sigil: upto[at] as '@' | '#' }
  }

  function syncMentionQuery(el: HTMLTextAreaElement) {
    const token = mentionTokenAt(el)
    if (!token) { setMentionOpen(false); return }
    setEmojiOpen(false)
    setMentionQuery(token.query)
    setMentionSigil(token.sigil)
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
    setMentionSigil('@')
    setMentionOpen(true)
    requestAnimationFrame(() => {
      el.focus()
      const pos = caret + insert.length
      el.setSelectionRange(pos, pos)
    })
  }

  function insertMention(s: Suggestion) {
    const el = cmtRef.current
    if (!el) return
    const token = mentionTokenAt(el)
    const caret = el.selectionStart ?? cmtText.length
    const from  = token ? token.at : caret
    const sigil = s.kind === 'task' ? '#' : '@'
    const next  = `${cmtText.slice(0, from)}${sigil}${s.name} ${cmtText.slice(caret)}`
    setCmtText(next)
    if (s.kind === 'task') setPickedTasks(p => (p.includes(s.id) ? p : [...p, s.id]))
    else                   setPicked(p => (p.includes(s.id) ? p : [...p, s.id]))
    setMentionOpen(false)
    requestAnimationFrame(() => {
      el.focus()
      const pos = from + s.name.length + 2
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
      const r = await setTaskStage(task.id, next).catch(() => ({ success: false as const, error: undefined, shouldCelebrate: false }))
      const handoff = handoffRequest(r, task, spaces, taskSpaces, members, tSpaces)
      if (handoff) { openHandoff(handoff); return }
      if (!r.success) {
        flagRequired(r)
        setError(r.error === 'not_authorized'
          ? 'That stage belongs to someone else — ask an admin to move it.'
          : moveErr(r) ?? errorText(r.error, 'Could not move the task — check your connection and try again.'))
        return
      }
      router.refresh()
      if (r.shouldCelebrate) {
        setCelebration({ taskName: task.name, stageLabel: STAGE_META[next].label_en })
      }
    })
  }

  function handleComment() {
    // Files on the comment travel as tokens in its text (spec 007 R10): one per
    // line after what was typed. A comment may be files only.
    const tokens = draftFiles
      .map(id => attachments.find(f => f.id === id))
      .filter((f): f is TaskAttachment => !!f)
      .map(f => formatFileToken(f.filename, f.id))
    const text = [cmtText.trim(), ...tokens].filter(Boolean).join('\n')
    // ⌘Enter while one is on its way would post it twice.
    if (!text || posting) return
    const ids   = mentioned.map(m => m.id)
    const links = linkedTasks.map(t => t.id)
    setCmtError('')
    startPost(async () => {
      const r = await addComment(task.id, text, ids, links).catch(() => ({ success: false, error: undefined }))
      if (!r.success) {
        setCmtError(errorText(r.error, 'Could not post your comment. It’s still in the box — check your connection and try again.'))
        return
      }
      say('Comment posted')
      router.refresh()
      setCmtText('')
      setDraftFiles([])
      setPicked([])
      setPickedTasks([])
      setMentionOpen(false)
      setEmojiOpen(false)
    })
  }

  /* ── the plan ────────────────────────────────────────────────────────── */

  /** Asked first: the × turns the row into "Unlink this task from the step?". */
  function handleUnlinkPlan() {
    if (!task.plan_step) return
    const stepId = task.plan_step.id
    setError('')
    startTransition(async () => {
      const r = await unlinkStepFromTask(stepId).catch(() => ({ success: false, error: undefined }))
      if (!r.success) {
        setConfirmUnlink(false)
        setError(errorText(r.error, 'Could not unlink the step — check your connection and try again.'))
        return
      }
      setConfirmUnlink(false)
      say('Unlinked from the plan step')
      router.refresh()
    })
  }

  function cancelUnlink() {
    setConfirmUnlink(false)
    requestAnimationFrame(() => unlinkBtnRef.current?.focus())
  }

  /** The brief editor's image paste and drop (spec 005 R5) use the same path. */
  async function uploadOne(file: File): Promise<UploadResult> {
    const r = await uploadToStorage(task.id, file, file.name, () => {}, ta)
    if (!r.ok) return { ok: false, error: `${file.name} — ${r.error}` }
    return { ok: true, url: r.attachment.url ?? '', filename: r.attachment.filename }
  }

  /**
   * The Attachments section's upload (contracts/attachments-section.md), shared
   * with the video sheet's Files cell: src/lib/attachment-upload.ts. Nothing is
   * shrunk or re-encoded (spec 007 FR-059).
   */
  const uploadForSection: UploadFn = makeUploader({
    taskId: task.id, hasStorage, t: ta, onStored: () => router.refresh(),
  })

  async function loadForSection(): Promise<TaskAttachment[]> {
    const rows = await loadAttachments(task.id)
    return rows.map(r => ({
      id: r.id, task_id: task.id, filename: r.filename,
      url: r.url ?? undefined, data: r.data ?? undefined,
      size_bytes: r.size_bytes, content_type: r.content_type,
      uploaded_by: r.uploaded_by ?? undefined, uploaded_at: r.uploaded_at,
    }))
  }

  /**
   * Catch a file dropped anywhere on the panel, not just the dedicated zone.
   *
   * Without this, a drop outside that one box falls through to the browser's
   * own handling of a dragged file, which is to navigate the tab to it — the
   * task panel vanishes and is replaced by a raw PDF or image with no way
   * back but the back button. Every drag over the panel is intercepted so
   * that never happens, but only ones actually carrying files: a drag
   * reordering selected text inside a field must still work normally.
   */
  useEffect(() => {
    const isFileDrag = (e: DragEvent) => Array.from(e.dataTransfer?.types ?? []).includes('Files')

    function onDragOver(e: DragEvent) {
      if (isFileDrag(e)) e.preventDefault()
    }
    function onDrop(e: DragEvent) {
      if (!isFileDrag(e)) return
      // Already handled: the brief editor takes image drops itself and inserts
      // them, and must not have them uploaded a second time here (R5).
      if (e.defaultPrevented) return
      e.preventDefault()
      // The section says why when this person can't attach (FR-058).
      const dropped = e.dataTransfer?.files
      if (dropped?.length) sectionRef.current?.addFiles(Array.from(dropped), { source: 'drop' })
    }

    window.addEventListener('dragover', onDragOver)
    window.addEventListener('drop', onDrop)
    return () => {
      window.removeEventListener('dragover', onDragOver)
      window.removeEventListener('drop', onDrop)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canEdit])

  /**
   * Paste a file anywhere in the panel to attach it (spec 007 FR-051, research R9).
   * The brief editor handles pastes inside it and marks them handled, so a file
   * is never added twice; pasted into the comment box, it also becomes a chip on
   * the comment being written (FR-073).
   */
  useEffect(() => {
    function onPaste(e: ClipboardEvent) {
      if (e.defaultPrevented) return
      const pasted = Array.from(e.clipboardData?.files ?? [])
      if (!pasted.length) return
      e.preventDefault()
      sectionRef.current?.addFiles(pasted, { source: 'paste', forComment: e.target === cmtRef.current })
    }
    window.addEventListener('paste', onPaste)
    return () => window.removeEventListener('paste', onPaste)
  }, [])

  function copy(what: 'link' | 'id') {
    const value = what === 'id'
      ? task.id
      : `${window.location.origin}/board?task=${task.id}`
    setMenuOpen(false)
    const failed = () => setError(`Could not copy the ${what === 'id' ? 'ID' : 'link'} — your browser blocked it. Copy it from the address bar instead.`)
    if (!navigator.clipboard) { failed(); return }
    navigator.clipboard.writeText(value).then(() => {
      setCopied(what)
      say(what === 'id' ? 'Task ID copied' : 'Link copied')
      window.setTimeout(() => setCopied(''), 1800)
    }, failed)
  }

  /**
   * The Fields block. `filled` decides whether a row shows up front or waits
   * behind "Show N empty fields" — an imported task with six blank attributes
   * reads as a form to complete rather than a brief to work from.
   */
  // Spec 021 (US4): a field switched off for the task's brand is hidden, never cleared.
  const taskBrand = brands.find(b => b.id === task.brand_id) ?? task.brand ?? null
  // Fields (25 Nov 2026): a custom field shows where its Space has it on (the Space looked at, else the task's own).
  const fieldSpace = cardFields ? cardFields.spaces.find(s => s.id === (cardFields.viewSpaceId ?? (task as { home_space_id?: string | null }).home_space_id)) : undefined
  const onHere = (key: string) => !fieldSpace || fieldOnIn(key, fieldSpace.settings.fields, cardFields?.promoted ?? [])
  const on = (k: BrandFeatureKey) => featureOn(taskBrand, k) && (k === 'priorities' ? onHere('priority') : k === 'tags' ? onHere('tags') : true)
  const FIELD_FEATURE: Record<string, BrandFeatureKey> = { type: 'type', platform: 'platform', cover: 'covers' }
  const allFields: { key: string; filled: boolean; node: React.ReactNode }[] = [
    {
      key: 'brand', filled: Boolean(task.brand?.name),
      node: (
        <Field key="brand" icon="brand" label="Brand">
          <InlineValue
            canEdit={canEdit} type="select" value={task.brand_id ?? ''}
            display={task.brand?.name ? (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 9 }}>
                <BrandMark brand={task.brand} size={20} />
                {task.brand.name}
              </span>
            ) : ''}
            options={brands.map(b => ({ value: b.id, label: b.name }))}
            emptyLabel="–"
            ariaLabel="Brand"
            onCommit={v => saveField('Brand', { brand_id: v })}
          />
        </Field>
      ),
    },
    {
      key: 'type', filled: Boolean(task.content_type_label),
      node: (
        <Field key="type" icon="type" label="Type">
          {/* Spec 023: the type's icon and colour; admins add a type from the menu ("+ Type"). */}
          <TypePicker value={task.content_type_label} types={contentTypes} canEdit={canEdit} canAdd={isAdmin}
            onPick={v => saveField('Type', { content_type_label: v })} />
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
            ariaLabel="Platform"
            onCommit={v => saveField('Platform', { platform: v })}
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
                <Avatar name={task.task_owner.name} size={26} color="#8AA50D" />
                {task.task_owner.name}
              </span>
            }
            options={members.map(m => ({ value: m.id, label: m.name }))}
            ariaLabel="Owner"
            onCommit={v => saveField('Owner', { task_owner_id: v })}
          />
        </Field>
      ),
    },
    {
      // Spec 021: the team Spaces this task shows in.
      key: 'spaces', filled: true,
      node: (
        <Field key="spaces" icon="folder" label={tSpaces('showsIn')}>
          <ShowsIn taskId={task.id} spaces={spaces} rows={taskSpaces} canEdit={canEdit} />
        </Field>
      ),
    },
    {
      /* The project this work serves.
         The container, not a label. The picker this replaced listed every free
         plan step in every project — 311 flat rows — because a task could only
         attach to a step, one to one. A campaign of twenty posts has one Design
         step, so there were never going to be enough. */
      key: 'project', filled: Boolean(task.project),
      node: (
        <Field key="project" icon="folder" label="Project">
          <span style={{
            position: 'relative', display: 'inline-flex', alignItems: 'center', gap: 8,
            maxWidth: '100%', minWidth: 0,
            // The wrapper carries the stacking, not the popup: a z-index on the
            // popup alone is measured inside a parent that still sits below
            // everything after it in the panel.
            zIndex: pickerOpen ? 40 : undefined,
          }}>
            {task.project ? (
              <button
                type="button"
                onClick={() => canEdit && setPickerOpen(v => !v)}
                title={canEdit ? `Change the project (${task.project.name})` : task.project.name}
                className={canEdit ? 'fx-hov' : undefined}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 7,
                  border: 'none', borderRadius: 8, padding: '3px 10px',
                  background: CU.greenSoft, color: '#47755D',
                  font: 'inherit', fontSize: 14.5, fontWeight: 600,
                  cursor: canEdit ? 'pointer' : 'default',
                  maxWidth: '100%', minWidth: 0,
                }}
              >
                <Icon name="folder" size={13} color={CU.green} width={2.2} />
                {/* A long project name ends in … rather than pushing the row wide. */}
                <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {task.project.name}
                </span>
              </button>
            ) : canEdit ? (
              <button
                type="button"
                onClick={() => setPickerOpen(v => !v)}
                className="fx-hov-tint"
                style={{
                  border: 'none', background: 'transparent', cursor: 'pointer', padding: '2px 6px',
                  margin: '0 -6px', borderRadius: 6, font: 'inherit', fontSize: 15, color: CU.faint,
                }}
              >
                Put this under a project
              </button>
            ) : (
              <span style={{ color: CU.faint }}>–</span>
            )}

            {pickerOpen && (
              <ProjectPicker
                current={task.project ?? null}
                onClose={() => setPickerOpen(false)}
                onPick={p => { setPickerOpen(false); applyPatch({ project_id: p?.id ?? null }) }}
              />
            )}
          </span>
        </Field>
      ),
    },
    {
      /* The plan step, when this task is the delivery of one. Optional
         precision beneath the project rather than the only way in. */
      key: 'planstep', filled: Boolean(task.plan_step),
      node: (
        <Field key="planstep" icon="link" label="Plan step">
          {task.plan_step && confirmUnlink ? (
            // Asked in place, as the close guard asks: unlinking takes effect
            // on the plan straight away, and there is no relink from here.
            <span role="group" aria-label="Unlink from the plan step"
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', minWidth: 0 }}>
              <span style={{ color: CU.text }}>Unlink this task from the step?</span>
              <button type="button" onClick={handleUnlinkPlan} disabled={isPending}
                      className="fx-hov"
                      style={{ height: 28, padding: '0 12px', border: 'none', borderRadius: 7, background: COLORS.coral, color: '#fff', fontWeight: 700, fontSize: 13.5, cursor: 'pointer', fontFamily: 'inherit', opacity: isPending ? 0.6 : 1 }}>
                {isPending ? 'Unlinking…' : 'Unlink'}
              </button>
              <button type="button" onClick={cancelUnlink} autoFocus
                      className="fx-hov-tint"
                      style={{ height: 28, padding: '0 10px', border: 'none', borderRadius: 7, background: 'transparent', color: CU.text, fontWeight: 600, fontSize: 13.5, cursor: 'pointer', fontFamily: 'inherit' }}>
                Keep
              </button>
            </span>
          ) : task.plan_step ? (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', minWidth: 0 }}>
              <span style={{ color: CU.label, minWidth: 0, overflowWrap: 'anywhere' }}>{task.plan_step.name}</span>
              {canEdit && (
                <button type="button" ref={unlinkBtnRef} onClick={() => setConfirmUnlink(true)}
                        aria-label="Unlink from the plan step" title="Unlink from the plan step"
                        className="fx-hov-tint"
                        style={{ border: 'none', background: 'transparent', cursor: 'pointer', padding: 2, display: 'inline-flex', borderRadius: 5 }}>
                  <Icon name="close" size={12} color={CU.faint} width={2.2} />
                </button>
              )}
            </span>
          ) : (
            <span style={{ color: CU.faint }}>–</span>
          )}
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
            ariaLabel="Cover image"
            onCommit={v => saveField('Cover image', { cover_image_url: v })}
          />
        </Field>
      ),
    },
    {
      key: 'stage-since', filled: true,
      node: (
        <Field key="stage-since" icon="clock" label="In this stage since">
          <span style={{ color: CU.text }}>{fmtDate(task.stage_date, loc)}</span>
        </Field>
      ),
    },
  ]
  const fields = allFields.filter(f => !FIELD_FEATURE[f.key] || on(FIELD_FEATURE[f.key]))
  const emptyCount = fields.filter(f => !f.filled).length

  /**
   * The activity rail.
   *
   * ClickUp's is an event log with the comments folded into it; ours is built
   * from what the row can actually prove — when it was created, when it
   * entered the stage it is in, and every comment since. Nothing is inferred:
   * we do not keep a per-move history, so the log does not claim one.
   */
  /* Top-level comments, and each one's replies (spec 012 R4). A reply whose
     comment is gone shows on its own rather than vanishing. */
  const { topComments, repliesOf } = useMemo(() => {
    const ids = new Set(task.comments.map(c => c.id))
    const tops: typeof task.comments = []
    const by = new Map<string, typeof task.comments>()
    for (const c of task.comments) {
      if (c.parent_id && ids.has(c.parent_id)) by.set(c.parent_id, [...(by.get(c.parent_id) ?? []), c])
      else tops.push(c)
    }
    for (const list of by.values()) list.sort((a, b) => a.created_at.localeCompare(b.created_at))
    return { topComments: tops, repliesOf: by }
  }, [task.comments])

  /** A comment's text in its bubble: names, task links, files and link cards. */
  function commentBody(c: TaskComment & { author?: Member }, atMe: boolean) {
    // A comment that is nothing but a pasted link is fully represented by
    // the rich preview card below it — showing the same address again as
    // shortened inline text would just be the raw URL twice over.
    const bodyUrls = urlsIn(c.body)
    const onlyLinks = bodyUrls.length > 0 &&
      !bodyUrls.reduce((acc, u) => acc.split(u).join(''), c.body).trim()
    return (
      <span style={{
        display: 'block', marginTop: 6, padding: onlyLinks ? 0 : '8px 11px', borderRadius: 9,
        background: onlyLinks ? 'transparent' : '#FFFFFF', color: CU.text, lineHeight: 1.55, whiteSpace: 'pre-wrap',
        border: onlyLinks ? 'none' : `1px solid ${atMe ? '#C9D9FF' : CU.line}`,
        // A pasted URL is one unbroken word and will happily run out
        // of the bubble and off the panel unless it is allowed to
        // break mid-word.
        overflowWrap: 'anywhere', minWidth: 0,
      }}>
        {!onlyLinks && withRefs(
          c.body,
          members,
          (c.task_refs ?? [])
            .map(id => allTasks.find(t => t.id === id))
            .filter((t): t is TaskRef => !!t),
          selectTask,
          { list: attachments, open: id => { sectionRef.current?.openPreview(id) } },
        )}
        {/* Two cards at most: a comment that is a list of links should
            stay a comment, not become a page of thumbnails. */}
        {bodyUrls.slice(0, 2).map(u => <LinkCard key={u} url={u} />)}
      </span>
    )
  }

  const activity = useMemo(() => {
    const items: { id: string; when: Date; dot: string; node: React.ReactNode }[] = [
      {
        id: 'created', when: new Date(task.created_at), dot: CU.green,
        node: <><strong style={{ fontWeight: 600 }}>{task.task_owner.name}</strong> created this task</>,
      },
      {
        id: 'stage', when: new Date(task.stage_date), dot: CU.green,
        node: <>Moved to <strong style={{ fontWeight: 600 }}>{stageMeta.label_en}</strong></>,
      },
      ...topComments.map(c => {
        const atMe = (c.mentions ?? []).includes(currentUser.id)
        const replies = repliesOf.get(c.id) ?? []
        return {
          id: c.id, when: new Date(c.created_at), dot: CU.blue,
          node: (
            <>
              <strong style={{ fontWeight: 600 }}>{c.author?.name ?? 'Someone'}</strong> commented
              {atMe && (
                <span style={{
                  marginInlineStart: 7, padding: '2px 7px', borderRadius: 999,
                  background: CU.blueLight, color: CU.blue, fontSize: 11.5, fontWeight: 700,
                }}>
                  mentioned you
                </span>
              )}
              {commentBody(c, atMe)}
              {/* Replies (spec 012 R4): one level, oldest first, under their comment. */}
              <button type="button" className="fx-nt-reply-btn" data-reply={c.id}
                      onClick={() => setReplyTo(replyTo === c.id ? null : c.id)}>
                {tn('reply')}{replies.length > 0 && ` · ${tn('replies', { n: replies.length })}`}
              </button>
              {(replies.length > 0 || replyTo === c.id) && (
                <div className="fx-nt-thread" data-thread={c.id}>
                  {replies.map(r => (
                    <div key={r.id} className="fx-nt-reply" data-comment-id={r.id} data-reply-of={c.id}>
                      <span className="fx-nt-reply-head">
                        <strong style={{ fontWeight: 600 }}>{r.author?.name ?? 'Someone'}</strong>
                        <time dateTime={r.created_at}>{fmtTime(r.created_at, loc)}</time>
                      </span>
                      {commentBody(r, (r.mentions ?? []).includes(currentUser.id))}
                      <button type="button" className="fx-nt-reply-btn" data-reply={r.id}
                              onClick={() => setReplyTo(c.id)}>
                        {tn('reply')}
                      </button>
                    </div>
                  ))}
                  {replyTo === c.id && (
                    <ReplyComposer
                      members={members}
                      meId={currentUser.id}
                      replyingTo={c.author?.name ?? ''}
                      onSend={(body, mentions) => sendReply(c.id, body, mentions)}
                      onCancel={() => setReplyTo(null)}
                    />
                  )}
                </div>
              )}
            </>
          ),
        }
      }),
    ]
    return items.sort((a, b) => a.when.getTime() - b.when.getTime())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [task.created_at, task.stage_date, topComments, repliesOf, task.task_owner.name,
      stageMeta.label_en, members, currentUser.id, allTasks, selectTask, replyTo, attachments, tn, loc])

  // ClickUp shows the first couple and hides the rest behind "Show more".
  const HEAD = 1
  const collapsible = activity.length > HEAD + 1
  const shown = !collapsible || showAllActivity
    ? activity
    : [...activity.slice(0, HEAD), ...activity.slice(-1)]
  const hiddenActivity = activity.length - shown.length

  return (
    <div
      onClick={requestClose}
      className="fx-task-overlay"
      style={{
        position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.42)',
        zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '2vh 2vw',
      }}
    >
      <div
        ref={dialog.ref}
        onClick={e => e.stopPropagation()}
        onKeyDown={dialog.onKeyDown}
        role="dialog"
        aria-modal="true"
        aria-label={task.name}
        tabIndex={-1}
        className="fx-task-panel"
        style={{
          background: '#fff', borderRadius: 12, width: '100%', maxWidth: 1280,
          height: '94vh', display: 'flex', flexDirection: 'column', overflow: 'hidden',
          boxShadow: '0 2px 6px rgba(20,20,20,.06), 0 24px 68px rgba(20,20,20,.22)',
          color: CU.text, fontSize: 15.5,
          // The panel takes focus only to hold it on open; it isn't a control.
          outline: 'none',
        }}
      >
        <span role="status" aria-live="polite" className="sr-only">{status}</span>

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
                        className="fx-hov-tint"
                        style={{
                          background: 'none', border: 'none', padding: 0, cursor: 'pointer',
                          fontFamily: 'inherit', fontSize: 15, fontWeight: 600, color: CU.blue,
                          maxWidth: 190, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                        }}>
                  {task.parent.name}
                </button>
              </>
            )}

            {task.content_type_label && on('type') && (
              <>
                <span style={{ color: CU.faint }}>/</span>
                <span style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  fontWeight: 700, fontSize: 14, letterSpacing: '.02em',
                  color: CU.text, textTransform: 'uppercase',
                  whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 220,
                }}>
                  <TypeIcon icon={typeOf?.icon} color={typeOf?.color ?? CU.label} size={15} />
                  {typeOf ? typeName(typeOf, locale) : task.content_type_label}
                </span>
              </>
            )}
          </div>

          {notify && following !== null && (
            <button type="button" className="fx-nt-follow" data-follow="" aria-pressed={following}
                    disabled={followBusy} title={tn('followHint')} onClick={() => void toggleFollow()}>
              <span aria-hidden="true">{following ? '✓' : '＋'}</span>
              {/* Hidden visually on a phone, still the button's name. */}
              <span className="fx-nt-follow-lbl">{following ? tn('following') : tn('follow')}</span>
            </button>
          )}

          <span className="fx-tm-created" style={{ fontSize: 14, color: CU.label, whiteSpace: 'nowrap', marginInlineEnd: 4 }}>
            Created {fmtShort(task.created_at, loc)}
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
                  <MenuSplit label="New tab" divider href={`/board?task=${task.id}`}
                             onClick={() => setMenuOpen(false)} />
                </div>
                <MenuItem icon="subtask" label="Add subtask"
                          onClick={() => { setMenuOpen(false); setAddingSubtask(true) }} />
                <MenuItem icon="openIn" label="Open the board behind this"
                          onClick={() => { setMenuOpen(false); requestClose() }} />
                {/* Spec 023 (US7): admins and superusers save a task as a template of its type. */}
                {currentUser.access !== 'user' && task.content_type_label && !task.parent_task_id && (
                  <MenuItem icon="subtask" label={tTpl('saveAs')}
                            onClick={() => {
                              setMenuOpen(false)
                              const name = window.prompt(tTpl('namePrompt'), task.name)
                              if (!name?.trim()) return
                              startTransition(async () => {
                                const r = await templateFromTask(task.id, name.trim())
                                if (r.success) { setCopied('template'); setTimeout(() => setCopied(''), 2500) }
                                else setError(tTpl('failed'))
                              })
                            }} />
                )}
              </div>
            )}
          </div>

          <IconButton name="close" label="Close task" onClick={requestClose} size={18} />
        </div>

        {closeGuard && (
          <div role="alertdialog" aria-live="assertive" style={{
            display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', flexShrink: 0,
            padding: '9px 16px', background: alpha(COLORS.coral, 0.08), borderBottom: `1px solid ${CU.line}`, fontSize: 13.5,
          }}>
            <b style={{ color: COLORS.coral }}>
              {closeGuard === 'unsaved'    ? 'Your last changes to the brief aren’t saved.'
                : closeGuard === 'uploading' ? 'An image is still uploading to the brief.'
                : closeGuard === 'comment'   ? 'Your comment isn’t sent yet — leaving discards it.'
                : 'Your subtask isn’t added yet — leaving discards it.'}
            </b>
            <span style={{ flex: 1 }} />
            <button type="button" onClick={() => setCloseGuard(null)} autoFocus
                    className="fx-hov"
                    style={{ height: 30, padding: '0 14px', border: 'none', borderRadius: 8, background: CU.blue, color: COLORS.panel, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
              Stay
            </button>
            <button type="button" onClick={() => { setCloseGuard(null); onClose() }}
                    className="fx-hov-tint"
                    style={{ height: 30, padding: '0 12px', border: 'none', borderRadius: 8, background: 'transparent', color: CU.text, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
              Leave anyway
            </button>
          </div>
        )}

        {/* ── Task / Activity, on a phone ──────────────────────────────────
            Below 767px the 400px Activity column has nowhere to be: side by
            side it would leave the task itself under 40px. The two become
            tabs instead.

            This is the case the useIsPhone hook exists for — the markup
            differs, not just its size, and CSS cannot choose between two
            subtrees. The usual cost of the hook, a frame of desktop layout
            before hydration, is not paid here: the panel only ever opens on a
            tap, long after the page has hydrated. */}
        {isPhone && (
          <div role="tablist" aria-label="Task sections" style={{
            display: 'flex', gap: 4, padding: '8px 12px 0', flexShrink: 0,
            borderBottom: `1px solid ${CU.line}`,
          }}>
            {(['task', 'activity'] as const).map(id => (
              <button
                key={id}
                role="tab"
                type="button"
                aria-selected={pane === id}
                onClick={() => setPane(id)}
                className="fx-hov-tint"
                style={{
                  border: 'none', background: 'none', cursor: 'pointer', fontFamily: 'inherit',
                  padding: '8px 14px', minHeight: 44, fontSize: 14.5,
                  fontWeight: pane === id ? 700 : 600,
                  color: pane === id ? CU.ink : CU.faint,
                  boxShadow: pane === id ? `inset 0 -2.5px 0 ${CU.blue}` : 'none',
                }}
              >
                {id === 'task' ? 'Task' : `Activity ${task.comments.length || ''}`.trim()}
              </button>
            ))}
          </div>
        )}

        {/* On a phone the task's errors sit above both tabs: a failed follow
            or stage move has to show from Activity too. On a desktop they
            stay under the properties, below. */}
        {isPhone && error && (
          <p role="alert" style={{
            margin: 0, padding: '9px 16px', flexShrink: 0, fontSize: 14, color: '#D22040',
            background: alpha(COLORS.coral, 0.06), borderBottom: `1px solid ${CU.line}`,
          }}>
            {error}
          </p>
        )}

        {/* ── BODY ──────────────────────────────────────────────────────── */}
        <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>

          {/* ── LEFT COLUMN ─────────────────────────────────────────────── */}
          <div hidden={isPhone && pane !== 'task'}
               style={{ flex: '1 1 auto', display: isPhone && pane !== 'task' ? 'none' : 'flex', flexDirection: 'column', minWidth: 0 }}>

            {/* chip row */}
            <div style={{
              display: 'flex', alignItems: 'center', gap: 10, padding: '12px 26px 0', flexShrink: 0,
            }}>
              <span style={{
                display: 'inline-flex', alignItems: 'center', gap: 7, height: 30, padding: '0 11px',
                border: 'none', borderRadius: 8, fontSize: 15, fontWeight: 600,
                background: CU.blueLight, color: CU.blue,
              }}>
                <Icon name="target" size={15} color={CU.blue} />
                Task
              </span>
              <button type="button" onClick={() => copy('id')} title="Copy task ID"
                      className="fx-hov"
                      style={{
                        display: 'inline-flex', alignItems: 'center', gap: 6, height: 28, padding: '0 9px',
                        border: 'none', background: CU.chipBg, borderRadius: 7, cursor: 'pointer',
                        fontFamily: 'inherit', fontSize: 13, fontWeight: 600, color: CU.label,
                      }}>
                <Icon name="link" size={13} color={CU.label} />
                {copied === 'id' ? 'Copied' : 'ID'}
              </button>
              {attachments.length > 0 && (
                // Jumps to the Attachments section, opening it if folded (spec 007 FR-072).
                <button type="button" onClick={() => sectionRef.current?.reveal()}
                        aria-label={ta('goToAttachments')} title={ta('goToAttachments')}
                        data-att-count=""
                        className="fx-hov"
                        style={{
                          display: 'inline-flex', alignItems: 'center', gap: 6, height: 28, padding: '0 9px',
                          border: 'none', background: CU.chipBg, borderRadius: 7, cursor: 'pointer',
                          fontFamily: 'inherit', fontSize: 13, fontWeight: 600, color: CU.label,
                        }}>
                  <Icon name="clip" size={13} color={CU.label} />
                  {attachments.length}
                </button>
              )}
              {sheetTarget && (
                <button type="button" onClick={openSheet} data-open-sheet=""
                        className="fx-hov"
                        style={{
                          display: 'inline-flex', alignItems: 'center', gap: 6, height: 28, padding: '0 9px',
                          border: 'none', background: CU.chipBg, borderRadius: 7, cursor: 'pointer',
                          fontFamily: 'inherit', fontSize: 13, fontWeight: 600, color: CU.label,
                        }}>
                  <Icon name="subtask" size={13} color={CU.label} />
                  {tsheet('openSheet')}
                </button>
              )}
              {copied === 'link' && (
                <span style={{ fontSize: 13, color: CU.label }}>Link copied</span>
              )}
              {copied === 'template' && (
                <span data-template-saved="" style={{ fontSize: 13, color: CU.label }}>{tTpl('savedFromTask')}</span>
              )}
            </div>

            {/* scrolls */}
            <div style={{ flex: 1, overflowY: 'auto', overscrollBehavior: 'contain', padding: '18px 26px 40px' }}>

              {/* Title */}
              {editingName ? (
                <input
                  value={nameText}
                  autoFocus
                  aria-label="Task name"
                  name="task-name"
                  autoComplete="off"
                  onChange={e => setNameText(e.target.value)}
                  onBlur={() => {
                    setEditingName(false)
                    if (nameText.trim() && nameText !== task.name) applyPatch({ name: nameText }, () => say('Task renamed'))
                  }}
                  onKeyDown={e => {
                    if (e.key === 'Enter')  { e.preventDefault(); refocusTitle.current = true; e.currentTarget.blur() }
                    if (e.key === 'Escape') { refocusTitle.current = true; setNameText(task.name); setEditingName(false) }
                  }}
                  style={{
                    width: '100%', boxSizing: 'border-box', fontFamily: 'inherit',
                    fontSize: 32, fontWeight: 700, letterSpacing: '-.02em', color: CU.ink,
                    border: `1px solid ${CU.line}`, borderRadius: 8, padding: '4px 8px',
                    margin: '0 -8px 20px',
                  }}
                  className="fx-focus"
                />
              ) : (
                <h1
                  style={{
                    fontSize: 32, fontWeight: 700, letterSpacing: '-.02em', lineHeight: 1.25,
                    color: CU.ink, margin: '0 0 22px', overflowWrap: 'anywhere',
                  }}
                >
                  {/* Still the heading; the button inside is what makes the
                      rename reachable from the keyboard as well as the mouse. */}
                  {canEdit ? (
                    <button
                      type="button"
                      ref={titleRef}
                      onClick={() => { setNameText(task.name); setEditingName(true) }}
                      title="Rename this task"
                      className="fx-focus fx-hov-tint"
                      style={{
                        display: 'block', width: 'calc(100% + 16px)', margin: '0 -8px', padding: '0 8px',
                        border: 'none', borderRadius: 8, background: 'none', cursor: 'text',
                        font: 'inherit', letterSpacing: 'inherit', color: 'inherit',
                        textAlign: 'start', overflowWrap: 'anywhere',
                      }}
                    >
                      {task.name}
                    </button>
                  ) : task.name}
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
                      disabled={isPending || advancing}
                      aria-haspopup="listbox"
                      aria-expanded={stageOpen}
                      aria-label={`Stage: ${nameOf(task.status as StageId)}. Change it`}
                      title="Change the stage"
                      className="fx-hov"
                      style={{
                        display: 'inline-flex', alignItems: 'center', gap: 6, border: 'none',
                        background: stageMeta.color, color: '#fff', borderRadius: 5,
                        padding: '4px 8px 4px 10px', fontSize: 12.5, fontWeight: 800,
                        letterSpacing: '.04em', textTransform: 'uppercase', whiteSpace: 'nowrap',
                        cursor: 'pointer', fontFamily: 'inherit', opacity: isPending || advancing ? 0.6 : 1,
                      }}
                    >
                      {nameOf(task.status as StageId)}
                      <Icon name="chevron" size={13} color="#fff" width={2.6} />
                    </button>

                    {stageOpen && (
                      <div role="listbox" aria-label="Move to a stage" ref={stageMenuRef} style={{
                        position: 'absolute', top: 'calc(100% + 6px)', insetInlineStart: 0, zIndex: 5,
                        minWidth: 232, maxHeight: 330, overflowY: 'auto', overscrollBehavior: 'contain',
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
                              <span style={{ flex: 1, minWidth: 0 }}>{nameOf(id)}</span>
                              {here && <span style={{ fontSize: 12, color: CU.faint }}>now</span>}
                              {!here && back && <span style={{ fontSize: 12, color: CU.faint }}>back</span>}
                            </button>
                          )
                        })}
                      </div>
                    )}

                    {canAdvance && nextMeta && (
                      <button
                        type="button"
                        onClick={handleAdvance}
                        disabled={isPending || advancing}
                        title={`Move to ${nameOf(nextMeta.id)}`}
                        aria-label={advancing ? `Moving to ${nameOf(nextMeta.id)}…`
                          : `Move to ${nameOf(nextMeta.id)}${isOverride ? ' (admin override)' : ''}`}
                        className="fx-hov"
                        style={{
                          border: 'none', background: isOverride ? CU.ink : CU.blueLight,
                          color: isOverride ? CU.green : CU.blue,
                          borderRadius: 8, cursor: 'pointer', padding: '5px 10px',
                          fontFamily: 'inherit', fontSize: 13, fontWeight: 600,
                          opacity: isPending || advancing ? 0.6 : 1, whiteSpace: 'nowrap',
                          boxShadow: isOverride ? 'none' : '0 1px 2px rgba(24,35,63,0.03)',
                        }}
                      >
                        {advancing ? 'Moving…' : (
                          <>
                            {isOverride && <span aria-hidden="true">⚡ </span>}
                            <span aria-hidden="true">→ </span>
                            {nameOf(nextMeta.id)}
                          </>
                        )}
                      </button>
                    )}
                  </span>
                </Prop>

                {/* Assignee is who is doing it; Owner sits in Fields below and
                    is who is answerable for it. Everything personal — My Day,
                    the attention card, the bell — follows this one. */}
                <Prop icon="user" label={tAs('label')}>
                  {/* Spec 023 (US5): several assignees, the first is the lead. */}
                  <AssigneesPicker taskId={task.id} ids={task.assignee_ids?.length ? task.assignee_ids : task.assignee_id ? [task.assignee_id] : []}
                    hours={task.assignee_hours ?? {}} estimate={Number(task.hours_estimate ?? 0)} members={members} canEdit={canEdit} />
                </Prop>

                {/* Spec 023: fields placed in the top rows (Channels), after Assignee. */}
                <PanelTopFields task={task} canEdit={canEdit} Row={({ label, kind, children }) => <Prop icon={KIND_ICON[kind] ?? 'type'} label={label}>{children}</Prop>} />

                {/* Spec 023 (US4): tags, unless the brand has them switched off. */}
                {on('tags') && <Prop icon="tag" label={tTags('title')}>
                  <TagPicker taskId={task.id} value={task.tag_ids ?? []} tags={cardFields?.tags ?? []} canEdit={canEdit} />
                </Prop>}

                {/* Publishing date: set by people. It moves an automatic due date. */}
                <Prop icon="calendar" label={tDates('publish')}>
                  <span data-publish-date={task.publish_date ?? ''} style={{ flex: '0 1 auto', minWidth: 0 }}>
                    <InlineValue
                      canEdit={canEdit} type="date" value={task.publish_date ?? ''}
                      display={task.publish_date ? formatDay(task.publish_date, locale) : ''}
                      onCommit={v => applyPatch({ publish_date: v || null })}
                    />
                  </span>
                </Prop>

                {/* Spec 023 (US6): optional start date; never after the due date. A custom field (25 Nov 2026). */}
                {onHere('start') && <Prop icon="calendar" label={tDates('start')}>
                  <span data-start-date={task.start_date ?? ''} style={{ flex: '0 1 auto', minWidth: 0 }}>
                    <InlineValue
                      canEdit={canEdit} type="date" value={task.start_date ?? ''}
                      display={task.start_date ? formatDay(task.start_date, locale) : ''}
                      onCommit={v => applyPatch({ start_date: v || null })}
                    />
                  </span>
                </Prop>}

                <Prop icon="calendar" label={tDates('due')}>
                  {/* The InlineValue button fills its parent, so it gets a
                      shrink-to-fit box of its own — otherwise it claims the
                      whole row and knocks the overdue count onto a line by
                      itself, which then drags the label out of alignment. */}
                  <span style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0, flexWrap: 'wrap' }}>
                    <span data-due-date={task.due_date ?? ''} data-due-manual={task.due_manual ? 'true' : 'false'} style={{ flex: '0 1 auto', minWidth: 0 }}
                          title={task.due_date ? (task.due_manual ? tDates('manualHint') : task.publish_date ? tDates('autoHint', { days: dueDaysBefore }) : undefined) : undefined}>
                      <InlineValue
                        canEdit={canEdit} type="date" value={task.due_date ?? ''}
                        display={task.due_date ? <>{formatDay(task.due_date, locale)}{task.due_manual && <ManualMark label={tDates('manual')} />}</> : ''}
                        ariaLabel="Due date"
                        onCommit={v => saveField('Due date', { due_date: v || null })}
                      />
                    </span>
                    {daysLeft !== null && (task.status !== 'publish') && (
                      <span data-due-count="" style={{
                        flexShrink: 0, fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap',
                        color: overdue ? '#D22040' : CU.faint,
                      }}>
                        {overdue ? tDates('overdue', { n: Math.abs(daysLeft) }) : daysLeft === 0 ? tDates('today') : tDates('left', { n: daysLeft })}
                      </span>
                    )}
                    {canEdit && task.due_manual && (
                      <button type="button" data-due-reset="" onClick={() => void applyPatch({ due_reset: true })}
                              style={{ border: 'none', background: 'none', padding: '0 2px', fontFamily: 'inherit', fontSize: 12.5, fontWeight: 600, color: CU.label, textDecoration: 'underline', cursor: 'pointer' }}>
                        {tDates('reset')}
                      </button>
                    )}
                  </span>
                </Prop>

                {/* Spec 023 (US8): repeat this task on publishing dates. */}
                {!task.parent_task_id && <Prop icon="calendar" label={tRepeat('title')}>
                  <RepeatEditor taskId={task.id} repeating={!!task.repeat_rule_id} canEdit={canEdit} />
                </Prop>}

                {on('priorities') && <Prop icon="flag" label="Priority">
                  <InlineValue
                    canEdit={canEdit} type="select" value={task.priority}
                    display={
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                        <Icon name="flag" size={15} color={priorityColor(task.priority)} />
                        <span data-priority={asPriority(task.priority) ?? 'None'}>{tPri(asPriority(task.priority) ?? 'None')}</span>
                      </span>
                    }
                    options={PRIORITIES.map(p => ({ value: p, label: tPri(p) }))}
                    ariaLabel="Priority"
                    onCommit={v => saveField('Priority', { priority: v as Priority })}
                  />
                </Prop>}

                {on('hours') && <Prop icon="clock" label="Time estimate">
                  <InlineValue
                    canEdit={canEdit} type="number" min={0} step={0.5}
                    value={task.hours_estimate}
                    display={(task.hours_estimate ?? 0) > 0 ? fmtUnit(task.hours_estimate, 'hour', loc) : ''}
                    ariaLabel="Time estimate"
                    onCommit={v => saveField('Time estimate', { hours_estimate: parseFloat(v) })}
                  />
                </Prop>}

                <Prop icon="folder" label="Pipeline">
                  <span style={{ color: CU.label }}>{task.nine_stage ? '9-stage' : '8-stage'}</span>
                </Prop>
              </div>

              {!isPhone && error && (
                <p role="alert" style={{ color: '#D22040', fontSize: 14, margin: '12px 0 0' }}>{error}</p>
              )}

              <div style={{ height: 1, background: CU.line, margin: '22px 0 18px' }} />

              {/* Spec 024 (§4): inside a Space, these sections follow its order. */}
              <div data-panel-sections="" style={{ display: 'flex', flexDirection: 'column' }}>
              {/* ── Spec 023: field sections around the Description (Caption above, TOV below) ── */}
              <div data-panel-section="above" style={{ order: orderOf('above') }}>
              <PanelFieldSections task={task} canEdit={canEdit} place="above" />
              </div>

              {/* ── Description ──────────────────────────────────────────── */}
              <div data-panel-section="description" style={{ order: orderOf('description') }}>
              {withSections && <DescriptionLabel />}
              {editingBrief ? (
                <BriefEditor
                  value={briefText}
                  onSave={next => applyPatch({ description: next, description_mentions: mentionedIn(next, members.filter(m => m.id !== currentUser.id)) })}
                  people={members.filter(m => m.id !== currentUser.id).map(m => ({ id: m.id, name: m.name, role: m.role, avatar_url: m.avatar_url }))}
                  onSaveStateChange={(state, pending) => { briefState.current = { state, pending } }}
                  onUploadImages={canEdit && hasStorage ? async file => {
                    const r = await uploadOne(file)
                    if (r.ok) {
                      if (file.type.startsWith('image/')) {
                        try { await setCoverThumb(task.id, await shrinkImage(file, 360, 0.62)) } catch { /* preview only */ }
                      }
                      sectionRef.current?.reload()
                      router.refresh()
                    }
                    return r
                  } : undefined}
                  uploadUnavailableReason={!canEdit ? 'no-permission' : 'no-storage'}
                  onDone={() => setEditingBrief(false)}
                  initialCursor={briefCursor}
                  attachments={attachments}
                  onCreateSubtask={canEdit ? name => handleCreateSubtask(name) : undefined}
                />
              ) : (
                <>
                  <div
                    onClick={e => {
                      if (!canEdit) return
                      if ((e.target as HTMLElement).closest('a, input, button, summary, iframe, label')) return
                      const root = e.currentTarget.querySelector<HTMLElement>('.fx-brief')
                      setBriefCursor(root ? anchorFromPoint(root, e.clientX, e.clientY) ?? undefined : undefined)
                      setBriefText(task.description ?? '')
                      setEditingBrief(true)
                    }}
                    role={canEdit ? 'button' : undefined}
                    tabIndex={canEdit ? 0 : undefined}
                    onKeyDown={e => {
                      if (!canEdit) return
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault(); setBriefCursor(undefined); setBriefText(task.description ?? ''); setEditingBrief(true)
                      }
                    }}
                    title={canEdit ? 'Click to edit' : undefined}
                    aria-label={canEdit ? 'Edit the brief' : undefined}
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
                              aria-expanded={briefOpen}
                              className="fx-hov"
                              style={{
                                display: 'inline-flex', alignItems: 'center', gap: 6, height: 30,
                                padding: '0 12px', borderRadius: 10, cursor: 'pointer',
                                border: 'none', background: '#fff',
                                fontFamily: 'inherit', fontSize: 14, fontWeight: 600, color: CU.text,
                                boxShadow: '0 4px 20px rgba(23,36,65,0.06)',
                              }}>
                        <Icon name={briefOpen ? 'chevronUp' : 'chevron'} size={15} color={CU.label} />
                        {briefOpen ? 'Collapse' : 'Expand'}
                      </button>
                    </div>
                  )}
                </>
              )}
              </div>

              <div data-panel-section="below" style={{ order: orderOf('below') }}>
              <PanelFieldSections task={task} canEdit={canEdit} place="below" />
              </div>

              {/* ── Fields ───────────────────────────────────────────────── */}
              <div data-panel-section="fields" style={{ order: orderOf('fields'), marginTop: 26, background: '#F7F9FE', borderRadius: 22, padding: '14px 14px 10px' }}>
                <h2 style={{ margin: '0 0 10px', font: 'inherit' }}>
                  <button type="button" onClick={() => setFieldsOpen(v => !v)}
                          aria-expanded={fieldsOpen}
                          className="fx-hov-tint"
                          style={{
                            display: 'inline-flex', alignItems: 'center', gap: 8, border: 'none',
                            background: 'transparent', cursor: 'pointer', padding: '2px 6px', margin: '-2px -6px',
                            borderRadius: 8, fontFamily: 'inherit', fontSize: 16.5, fontWeight: 600, color: CU.text,
                          }}>
                    <Icon name="chevron" size={14} color={CU.label}
                          style={{ transform: fieldsOpen ? 'none' : 'rotate(-90deg)', transition: 'transform .15s' }} />
                    Fields
                    <BrandMotif />
                  </button>
                </h2>

                {fieldsOpen && (
                  <div>
                    {fields.filter(f => f.filled).map(f => f.node)}
                    {linksSection}
                    {showEmpty && fields.filter(f => !f.filled).map(f => f.node)}
                    {emptyCount > 0 && (
                      <button type="button" onClick={() => setShowEmpty(v => !v)}
                              aria-expanded={showEmpty}
                              className="fx-hov-tint"
                              style={{
                                display: 'inline-flex', alignItems: 'center', gap: 8, border: 'none',
                                background: 'transparent', cursor: 'pointer', padding: '9px 4px 4px',
                                borderRadius: 8, fontFamily: 'inherit', fontSize: 14.5, color: CU.label,
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
              {/* Spec 021 (US4): a video's clips are hidden when its brand has Video clips off. */}
              {(task.subtasks?.length ?? 0) > 0 && !(task.content_type_label === 'Video' && !on('clips')) && (
                <div data-panel-section="subtasks" style={{ order: orderOf('subtasks'), marginTop: 20 }}>
                  <h2 style={{ fontSize: 16.5, fontWeight: 600, color: CU.text, margin: '0 0 8px' }}>
                    Subtasks <span style={{ color: CU.faint, fontWeight: 500 }}>{task.subtasks!.length}</span>
                  </h2>
                  <div style={{ display: 'grid', gap: 4 }}>
                    {task.subtasks!.map(s => {
                      const meta = STAGE_META[s.status]
                      return (
                        <button key={s.id} type="button" onClick={() => selectTask(s.id)}
                                className="fx-hov"
                                style={{
                                  display: 'flex', alignItems: 'center', gap: 10, width: '100%',
                                  padding: '9px 10px', borderRadius: 12, cursor: 'pointer',
                                  border: 'none', background: '#fff',
                                  boxShadow: '0 1px 2px rgba(24,35,63,0.03)',
                                  fontFamily: 'inherit', fontSize: 15, color: CU.text, textAlign: 'start',
                                }}>
                          <span style={{ width: 8, height: 8, borderRadius: '50%', background: meta.color, flexShrink: 0 }} />
                          <span style={{
                            flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                            // A dropped clip (spec 008 FR-060): kept, greyed, struck through.
                            ...(s.dropped_at ? { textDecoration: 'line-through', color: CU.faint } : {}),
                          }}>
                            {s.name}
                          </span>
                          <span style={{ fontSize: 13, color: CU.label, whiteSpace: 'nowrap' }}>
                            {s.dropped_at ? tsheet('drop.droppedSr') : meta.label_en}
                          </span>
                        </button>
                      )
                    })}
                  </div>
                </div>
              )}

              {canEdit && (
                <div style={{ marginTop: 10 }}>
                  {addingSubtask ? (
                    <>
                    <div style={{ display: 'flex', gap: 8, padding: '4px 0' }}>
                      <input
                        value={subtaskName}
                        autoFocus
                        aria-label="Subtask name"
                        name="subtask-name"
                        autoComplete="off"
                        placeholder="Subtask name…"
                        onChange={e => setSubtaskName(e.target.value)}
                        onKeyDown={e => {
                          if (e.key === 'Enter')  { if (!addingSub) submitSubtask() }
                          if (e.key === 'Escape') { setSubtaskName(''); setSubtaskError(''); setAddingSubtask(false) }
                        }}
                        style={{
                          flex: 1, minWidth: 0, height: 38, padding: '0 11px', fontFamily: 'inherit',
                          fontSize: 15.5, border: `1px solid ${CU.line}`, borderRadius: 8,
                        }}
                        className="fx-focus"
                      />
                      <button type="button" onClick={submitSubtask} disabled={addingSub}
                              className="fx-hov"
                              style={{
                                height: 38, padding: '0 16px', border: 'none', borderRadius: 8,
                                background: CU.blue, color: '#fff', cursor: addingSub ? 'default' : 'pointer',
                                fontFamily: 'inherit', fontSize: 15, fontWeight: 700,
                                opacity: addingSub ? 0.7 : 1,
                              }}>
                        {addingSub ? 'Adding…' : 'Add'}
                      </button>
                    </div>
                    {subtaskError && (
                      <p role="alert" style={{ color: '#D22040', fontSize: 14, margin: '4px 0 0' }}>{subtaskError}</p>
                    )}
                    </>
                  ) : (
                    <ActionRow label="Add subtask" onClick={() => setAddingSubtask(true)} />
                  )}
                </div>
              )}

              {/* ── Attachments (spec 007) ─────────────────────────────── */}
              <div data-panel-section="attachments" style={{ order: orderOf('attachments') }}>
              <AttachmentsSection
                handle={sectionRef}
                taskId={task.id}
                initialRows={task.attachments ?? []}
                load={loadForSection}
                members={members}
                ownerName={task.task_owner.name}
                canEdit={canEdit}
                hasStorage={hasStorage}
                upload={uploadForSection}
                rename={renameAttachment}
                onChanged={() => router.refresh()}
                onStoredForComment={a => setDraftFiles(d => (d.includes(a.id) ? d : [...d, a.id]))}
                onFilesChange={setFiles}
              />
              </div>
              </div>

              {isPublished && (
                <div style={{
                  marginTop: 22, padding: '11px 14px', borderRadius: 9,
                  background: '#F0FDF4', color: '#15803D', fontSize: 15, fontWeight: 600,
                }}>
                  <span aria-hidden="true">✓ </span>Published — this task is complete
                </div>
              )}

              {/* Fields (25 Nov 2026, §1): system info — read only, not fields. */}
              <p data-task-system-info="" style={{ margin: '26px 0 0', display: 'flex', flexWrap: 'wrap', gap: '4px 16px', fontSize: 12, color: '#6B7080' }}>
                {(() => {
                  const names = taskSpaces.filter(r => r.task_id === task.id).map(r => spaces.find(s => s.id === r.space_id)?.name).filter(Boolean)
                  const days = task.stage_date ? Math.max(0, Math.round((Date.parse(cairoToday()) - Date.parse(task.stage_date.slice(0, 10))) / 86_400_000)) : null
                  const by = members.find(m => m.id === task.created_by)?.name
                  return <>
                    {names.length > 0 && <span data-info="space">{tInfo('space', { names: names.join(', ') })}</span>}
                    {days !== null && <span data-info="in-stage">{tInfo('inStage', { n: days })}</span>}
                    <span data-info="created">{by ? tInfo('createdBy', { name: by, date: formatDay(task.created_at, locale) }) : tInfo('created', { date: formatDay(task.created_at, locale) })}</span>
                    <span data-info="updated">{tInfo('updated', { date: formatDay(task.updated_at, locale) })}</span>
                  </>
                })()}
              </p>
            </div>
          </div>

          {/* ── RIGHT — Activity rail ───────────────────────────────────── */}
          <aside
            hidden={isPhone && pane !== 'activity'}
            className="fx-task-activity"
            style={{
              flex: '0 0 400px',
              display: isPhone && pane !== 'activity' ? 'none' : 'flex',
              flexDirection: 'column',
              borderInlineStart: `1px solid ${CU.lineSoft}`, minWidth: 0, background: '#fff',
            }}>
            <div style={{
              height: 52, flexShrink: 0, display: 'flex', alignItems: 'center', gap: 2,
              padding: '0 12px 0 18px', borderBottom: `1px solid ${CU.line}`,
            }}>
              <h2 style={{ flex: 1, margin: 0, fontSize: 17.5, fontWeight: 700, color: CU.ink }}>Activity</h2>
              {/* Search and filter buttons sat here, wired to nothing: left out,
                  like every other control we hold no behaviour for. */}
              <span title={`${task.comments.length} comments`}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 4, paddingInlineEnd: 8 }}>
                <Icon name="bell" size={17} color={CU.blue} />
                <span style={{ fontSize: 14, fontWeight: 600, color: CU.blue }}>
                  {task.comments.length}
                  <span className="sr-only"> comments</span>
                </span>
              </span>
            </div>

            <div style={{ flex: 1, overflowY: 'auto', overscrollBehavior: 'contain', padding: '16px 18px' }}>
              <div style={{ position: 'relative' }}>
                {/* The connecting timeline line, drawn once behind every dot
                    rather than per row — a row's own height is not known
                    until it wraps, so a line per row never quite meets the
                    next one. */}
                {shown.length > 1 && (
                  <div aria-hidden="true" style={{
                    position: 'absolute', insetInlineStart: 4, top: 8, bottom: 22,
                    width: 1.5, background: '#E8EDF5',
                  }} />
                )}
                {shown.map((a, i) => (
                  <div key={a.id} data-comment-id={a.id}>
                    {/* ClickUp folds the middle of a long log away */}
                    {collapsible && !showAllActivity && i === HEAD && (
                      <button type="button" onClick={() => setShowAllActivity(true)}
                              className="fx-hov-tint"
                              style={{
                                display: 'flex', alignItems: 'center', gap: 8, border: 'none',
                                background: 'transparent', cursor: 'pointer', padding: '4px 6px 12px', margin: '0 -6px',
                                borderRadius: 8, fontFamily: 'inherit', fontSize: 15, color: CU.text,
                              }}>
                        <Icon name="chevronR" size={14} color={CU.label} />
                        Show more {hiddenActivity > 0 && <span style={{ color: CU.faint }}>({hiddenActivity})</span>}
                      </button>
                    )}
                    <div style={{
                      display: 'grid', gridTemplateColumns: '10px minmax(0, 1fr) auto',
                      gap: 8, alignItems: 'start', marginBottom: 14, position: 'relative',
                    }}>
                      <span style={{
                        width: 8, height: 8, borderRadius: '50%', background: a.dot,
                        marginTop: 6, flexShrink: 0,
                      }} />
                      <span style={{ fontSize: 15, color: CU.text, lineHeight: 1.5 }}>{a.node}</span>
                      <span style={{ fontSize: 13.5, color: CU.label, whiteSpace: 'nowrap', lineHeight: '20px' }}>
                        {fmtTime(a.when, loc)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>

              {collapsible && showAllActivity && (
                <button type="button" onClick={() => setShowAllActivity(false)}
                        className="fx-hov-tint"
                        style={{
                          display: 'flex', alignItems: 'center', gap: 8, border: 'none',
                          background: 'transparent', cursor: 'pointer', padding: '2px 6px 8px', margin: '0 -6px',
                          borderRadius: 8, fontFamily: 'inherit', fontSize: 15, color: CU.text,
                        }}>
                  <Icon name="chevronUp" size={14} color={CU.label} />
                  Hide
                </button>
              )}
            </div>

            {/* Composer */}
            {/* On a phone the composer is the bottom of the screen: it clears
                the home indicator rather than sitting under it. */}
            <div style={{
              padding: isPhone ? '10px 14px calc(14px + env(safe-area-inset-bottom, 0px))' : '10px 14px 14px',
              flexShrink: 0, position: 'relative',
            }}>

              {/* Who you can name and what you can link to. Opens on the @
                  button, on typing an @, and on typing a # — and filters as
                  you keep typing after it. */}
              {mentionOpen && (
                <div role="listbox" aria-label="Name someone or link a task" style={{
                  position: 'absolute', insetInline: 14, bottom: '100%', marginBottom: 4, zIndex: 4,
                  background: '#fff', border: `1px solid ${CU.line}`, borderRadius: 10,
                  boxShadow: '0 10px 30px rgba(20,20,20,.16)', padding: 6,
                  maxHeight: 268, overflowY: 'auto', overscrollBehavior: 'contain',
                }}>
                  {mentionMatches.length === 0 && (
                    <p style={{ margin: 0, padding: '10px 10px', fontSize: 14, color: CU.faint }}>
                      {mentionSigil === '#' ? 'No task by that name.' : 'Nothing by that name.'}
                    </p>
                  )}
                  {mentionMatches.map((s, i) => {
                    // The heading appears on the first task row, and only when
                    // people came before it — otherwise the list needs no
                    // dividing.
                    const opensTasks = s.kind === 'task' && mentionMatches[i - 1]?.kind === 'member'
                    return (
                      <div key={`${s.kind}-${s.id}`}>
                        {opensTasks && (
                          <p style={{
                            margin: '6px 0 2px', padding: '0 10px', fontSize: 11, fontWeight: 800,
                            letterSpacing: '.07em', textTransform: 'uppercase', color: CU.faint,
                            borderTop: `1px solid ${CU.lineSoft}`, paddingTop: 8,
                          }}>
                            Tasks
                          </p>
                        )}
                        <button
                          type="button"
                          role="option"
                          aria-selected={i === mentionIndex}
                          onMouseEnter={() => setMentionIndex(i)}
                          onClick={() => insertMention(s)}
                          style={{
                            display: 'flex', alignItems: 'center', gap: 10, width: '100%',
                            padding: '8px 10px', border: 'none', borderRadius: 8, cursor: 'pointer',
                            background: i === mentionIndex ? CU.hover : 'transparent',
                            fontFamily: 'inherit', fontSize: 14.5, color: CU.text, textAlign: 'start',
                          }}
                        >
                          {s.kind === 'member' ? <Avatar name={s.name} size={26} /> : (
                            <span style={{
                              width: 26, height: 26, borderRadius: 7, background: '#F3EEFF',
                              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                              flexShrink: 0,
                            }}>
                              <Icon name="link" size={14} color="#6D28D9" width={2.2} />
                            </span>
                          )}
                          <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {s.name}
                          </span>
                          <span style={{ fontSize: 12.5, color: CU.faint, whiteSpace: 'nowrap' }}>
                            {s.kind === 'member' ? s.role : STAGE_META[s.status].label_en}
                          </span>
                        </button>
                      </div>
                    )
                  })}
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

              {/* A failed post says so here, beside the comment that is still in the box. */}
              {cmtError && (
                <p role="alert" style={{ color: '#D22040', fontSize: 13.5, margin: '0 4px 8px' }}>{cmtError}</p>
              )}

              {/* The borderless textarea and its buttons read as one box, so
                  the box carries the focus ring. */}
              <div className="fx-focus-within" style={{
                border: 'none', borderRadius: 14, background: '#fff',
                boxShadow: '0 4px 20px rgba(23,36,65,0.04)',
              }}>
                <textarea
                  ref={cmtRef}
                  value={cmtText}
                  onChange={e => { setCmtText(e.target.value); syncMentionQuery(e.target) }}
                  onKeyDown={onComposerKey}
                  onBlur={() => window.setTimeout(() => setMentionOpen(false), 150)}
                  aria-label="Comment"
                  name="comment"
                  autoComplete="off"
                  placeholder="Write a comment — @ names, # links a task…"
                  rows={2}
                  style={{
                    width: '100%', boxSizing: 'border-box', border: 'none',
                    resize: 'none', fontFamily: 'inherit', fontSize: 15.5, color: CU.text,
                    padding: '12px 14px 4px', background: 'transparent', borderRadius: 10,
                  }}
                />

                {draftFiles.length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, padding: '0 14px 6px' }} data-comment-draft-files="">
                    {draftFiles.map(id => (
                      <CommentFileChip key={id} file={attachments.find(f => f.id === id) ?? null} name=""
                                       onOpen={fid => { sectionRef.current?.openPreview(fid) }}
                                       onRemove={() => setDraftFiles(d => d.filter(x => x !== id))} />
                    ))}
                  </div>
                )}

                {(mentioned.length > 0 || linkedTasks.length > 0) && (
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
                    {linkedTasks.map(t => (
                      <span key={t.id} style={{
                        display: 'inline-flex', alignItems: 'center', gap: 6, height: 24,
                        maxWidth: 240, padding: '0 9px', borderRadius: 999, background: '#F3EEFF',
                        fontSize: 12.5, fontWeight: 600, color: '#6D28D9',
                      }}>
                        <Icon name="link" size={12} color="#6D28D9" width={2} />
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {t.name}
                        </span>
                      </span>
                    ))}
                  </div>
                )}

                <div style={{
                  display: 'flex', alignItems: 'center', gap: 2, padding: '4px 8px 8px',
                }}>
                  {/* Attach: the file goes to the task's Attachments, and a chip
                      for it onto this comment (spec 007 FR-073). */}
                  {canEdit && (
                    <IconButton name="clip" label={ta('attachToComment')}
                                onClick={() => sectionRef.current?.pick({ forComment: true })} size={16} />
                  )}
                  <IconButton name="at" label="Mention someone" size={16}
                              onClick={() => { setEmojiOpen(false); openMentionPicker() }} />
                  <IconButton name="emoji" label="Insert an emoji" size={16}
                              onClick={() => { setMentionOpen(false); setEmojiOpen(v => !v) }} />
                  <span style={{ flex: 1 }} />
                  <button
                    type="button"
                    onClick={handleComment}
                    disabled={posting || (!cmtText.trim() && !draftFiles.length)}
                    aria-label={posting ? 'Posting comment…' : 'Send comment'}
                    title={posting ? 'Posting…' : 'Send — ⌘Enter'}
                    style={{
                      width: 34, height: 30, borderRadius: 9, border: 'none',
                      cursor: !posting && (cmtText.trim() || draftFiles.length) ? 'pointer' : 'default',
                      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                      background: sendHover && (cmtText.trim() || draftFiles.length) && !posting ? CU.blue : CU.blueLight,
                      opacity: !posting && !cmtText.trim() && !draftFiles.length ? 0.55 : 1,
                      transition: 'background .12s',
                    }}
                    onMouseEnter={() => setSendHover(true)}
                    onMouseLeave={() => setSendHover(false)}
                  >
                    {/* While posting, the arrow becomes a spinner. */}
                    {posting ? (
                      <span aria-hidden="true" style={{
                        width: 13, height: 13, borderRadius: '50%', boxSizing: 'border-box',
                        border: `2px solid ${CU.blue}`, borderTopColor: 'transparent',
                        animation: 'fx-spin .8s linear infinite',
                      }} />
                    ) : (
                      <Icon name="send" size={15}
                            color={sendHover && (cmtText.trim() || draftFiles.length) ? '#fff' : CU.blue} width={2} />
                    )}
                  </button>
                </div>
              </div>
            </div>
          </aside>
        </div>
      </div>


    </div>
  )
}

/* ── menu pieces ─────────────────────────────────────────────────────── */

/** One cell of the menu's top strip. With `href` it is a real link (New tab),
 *  so it also middle-clicks, Cmd-clicks and copies like one — drawn the same. */
function MenuSplit({ label, onClick, divider, href }: {
  label: string; onClick: () => void; divider?: boolean; href?: string
}) {
  const style: React.CSSProperties = {
    height: 34, border: 'none', background: '#fff', cursor: 'pointer',
    fontFamily: 'inherit', fontSize: 13.5, color: CU.text,
    borderInlineStart: divider ? `1px solid ${CU.line}` : 'none',
  }
  const hover = {
    onMouseEnter: (e: React.MouseEvent<HTMLElement>) => { e.currentTarget.style.background = CU.hover },
    onMouseLeave: (e: React.MouseEvent<HTMLElement>) => { e.currentTarget.style.background = '#fff' },
  }
  if (href) {
    return (
      <a href={href} target="_blank" rel="noopener" onClick={onClick} {...hover}
         style={{ ...style, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', textDecoration: 'none' }}>
        {label}
      </a>
    )
  }
  return (
    <button type="button" onClick={onClick} style={style} {...hover}>
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

