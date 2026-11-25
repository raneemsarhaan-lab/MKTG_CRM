'use client'

import { useEffect, useId, useRef, useState } from 'react'
import { useDndContext } from '@dnd-kit/core'
import { useSortable } from '@dnd-kit/sortable'
import { CSS, isKeyboardEvent } from '@dnd-kit/utilities'
import type { Task, Member, SLAConfig, AlertStatus } from '@/types/index'
import { getAlertStatus } from '@/lib/alert-status'
import { featureOn } from '@/lib/brand-features'
import { useTaskLinkNames } from './TaskLinks'
import { CardMedia } from '@/components/media/MediaLinks'
import { TaskDates } from '@/components/shared/DueDates'
import { cairoToday, daysBetween, isOverdue } from '@/lib/due-dates'
import { useLocale, useTranslations } from 'next-intl'
import { initials, avatarColor, calDaysBetween } from '@/lib/utils'
import { attachmentKind, coverImageFor, isLinkAttachment } from '@/lib/attachments'
import { ImageWithFallback } from '@/components/shared/ImageWithFallback'
import { PIPE } from '@/lib/pipeline-tokens'
import { CardFieldValues, useCardFields, useCardShows } from '@/components/fields/CardFields'
import { TypeIcon } from '@/components/types/TypeIcon'
import { typeName } from '@/lib/task-types'
import { TagChip } from '@/components/tags/TagPicker'

/**
 * Board task card — Pipeline handoff §7 "Task card".
 *
 * Cover, brand badge, title, status + type chips, then a footer of assignee
 * avatars against the due date. Every value below is literal from the spec.
 */

interface TaskCardProps {
  task: Task & { brand: { id: string; name: string; color: string; logo_url?: string }; task_owner: Member }
  currentStageOwner: Member | null
  currentUser: Member
  slaConfig: SLAConfig
  today: Date
  onSelect: (id: string) => void
  /** Selection state for bulk actions. Absent on the drag overlay. */
  selected?: boolean
  selecting?: boolean
  onToggleSelect?: (id: string, shiftKey: boolean) => void
}

/**
 * The handoff draws three status chips; the pipeline computes six.
 *
 * Stuck is a worse Overdue and Will Miss a worse At Risk, so they take those
 * treatments rather than inventing colour the design never specified. Idle is
 * neither good nor bad and uses the neutral chip.
 */
const CHIP: Record<AlertStatus, { bg: string; color: string; weight: number; upper?: boolean }> = {
  'On Track':  { bg: '#E9F8EE', color: '#16A34A', weight: 700 },
  'At Risk':   { bg: '#FFF1E3', color: '#E07C0B', weight: 700 },
  'Will Miss': { bg: '#FFF1E3', color: '#E07C0B', weight: 700 },
  'Idle':      { bg: PIPE.surface, color: PIPE.textMuted, weight: 600 },
  'Stuck':     { bg: '#FDE7EA', color: '#D22040', weight: 800, upper: true },
  'Overdue':   { bg: '#FDE7EA', color: '#D22040', weight: 800, upper: true },
}

/** The card's padding, and the cover's height (user, 25 Nov 2026). */
const PAD = 10
const COVER_H = 140

/** "1:12" — a video's length. */
const clock = (sec: number) => { const s = Math.round(sec); const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60; return `${h ? `${h}:${String(m).padStart(2, '0')}` : m}:${String(r).padStart(2, '0')}` }

/**
 * A video card's cover: the video's own frame (or the task's cover image), a play button and the length
 * in the corner. Only the file's header is read (preload="metadata"), and only once the card is near the
 * screen, so a long board doesn't fetch every video.
 */
function VideoCover({ src, poster }: { src: string; poster: string | null }) {
  const box = useRef<HTMLDivElement>(null)
  const [near, setNear] = useState(false)
  const [length, setLength] = useState<number | null>(null)
  useEffect(() => {
    const el = box.current
    if (!el || typeof IntersectionObserver === 'undefined') { setNear(true); return }
    const io = new IntersectionObserver(es => { if (es.some(e => e.isIntersecting)) { setNear(true); io.disconnect() } }, { rootMargin: '200px' })
    io.observe(el)
    return () => io.disconnect()
  }, [])
  return (
    <div ref={box} style={{ position: 'absolute', inset: 0 }}>
      {near && (
        <video src={`${src}#t=0.1`} poster={poster ?? undefined} preload="metadata" muted playsInline tabIndex={-1} aria-hidden="true"
          onLoadedMetadata={e => { const d = e.currentTarget.duration; if (Number.isFinite(d) && d > 0) setLength(d) }}
          style={{ width: '100%', height: COVER_H, objectFit: 'cover', display: 'block', pointerEvents: 'none' }} />
      )}
      <span aria-hidden="true" style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', width: 38, height: 38, borderRadius: '50%', background: 'rgba(20, 19, 26, .62)', display: 'grid', placeItems: 'center' }}>
        <svg width="14" height="14" viewBox="0 0 24 24"><path d="M8 5.5v13l11-6.5z" fill="#FFFFFF" /></svg>
      </span>
      {length !== null && (
        <span data-video-length="" style={{ position: 'absolute', insetInlineEnd: 8, bottom: 8, padding: '2px 6px', borderRadius: 5, background: 'rgba(20, 19, 26, .72)', color: '#FFFFFF', fontSize: 11, fontWeight: 700, direction: 'ltr' }}>{clock(length)}</span>
      )}
    </div>
  )
}

function Chip({ bg, color, weight, upper, children }: {
  bg: string; color: string; weight: number; upper?: boolean; children: React.ReactNode
}) {
  return (
    <span style={{
      background: bg, color, fontSize: 10.5, fontWeight: weight,
      padding: '4px 8px', borderRadius: 6, whiteSpace: 'nowrap',
      letterSpacing: upper ? '0.02em' : undefined,
    }}>
      {children}
    </span>
  )
}

function AssigneeDot({ name, stacked }: { name: string; stacked?: boolean }) {
  const label = initials(name)
  return (
    <span
      title={name}
      style={{
        width: 22, height: 22, borderRadius: '50%', background: avatarColor(name),
        color: '#FFFFFF', fontSize: label.length > 1 ? 9 : 10, fontWeight: 800,
        display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
        border: stacked ? '1.5px solid #FFFFFF' : undefined,
        marginLeft: stacked ? -7 : undefined,
      }}
    >
      {label}
    </span>
  )
}

/** Status and due date, worked out once for the card and for its description. */
function cardFacts(task: TaskCardProps['task'], slaConfig: SLAConfig, today: Date) {
  const alert    = getAlertStatus(task, slaConfig, today)
  // Whole days in Cairo, as everywhere else dates are compared (spec 022).
  const daysLeft = task.due_date ? daysBetween(cairoToday(), task.due_date.slice(0, 10)) : null
  // Published or done work is never overdue (and shows no count).
  const overdue  = isOverdue(task as Parameters<typeof isOverdue>[0])
  const open     = task.status !== 'publish'
  const dueLabel = daysLeft === null || !open
    ? ''
    : overdue ? `${Math.abs(daysLeft)}d over`
    : daysLeft === 0 ? 'Due today' : `${daysLeft}d left`
  return { alert, overdue, dueLabel }
}

/** The people the footer draws: the owner, then whoever holds the stage. */
function assigneesOf(task: TaskCardProps['task'], currentStageOwner: Member | null) {
  return currentStageOwner && currentStageOwner.id !== task.task_owner.id
    ? [task.task_owner, currentStageOwner]
    : [task.task_owner]
}

/** Card body with no drag wiring, so DragOverlay can reuse it. */
function CardBody({ task, currentStageOwner, slaConfig, today }: {
  task: TaskCardProps['task']
  currentStageOwner: Member | null
  slaConfig: SLAConfig
  today: Date
}) {
  const tViews   = useTranslations('views')
  const { alert } = cardFacts(task, slaConfig, today)
  const chip = CHIP[alert]

  const attachmentCount = task.attachments?.length ?? 0
  const commentCount    = task.comments?.length ?? 0

  const brandColor = task.brand?.color ?? PIPE.textFaint
  const brandMark  = (task.brand?.name ?? '—').split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase()
  const cover      = coverImageFor(task)
  // Spec 021: the tasks this one links to (Task link fields), e.g. "↗ Ramadan launch plan".
  const linkNames  = useTaskLinkNames(task.id)

  // Spec 023: the page's Fields button decides which standard fields the card shows.
  const shows = useCardShows()
  const locale = useLocale()
  const types = useCardFields()?.types
  const type = types?.find(x => x.label === task.content_type_label)
  const ctx = useCardFields()
  const tPri = useTranslations('priority')
  const tRepeat = useTranslations('repeat')
  const tagList = (task.tag_ids ?? []).map(id => ctx?.tags.find(x => x.id === id)).filter((x): x is NonNullable<typeof x> => !!x)
  const people = (task.assignee_ids ?? (task.assignee_id ? [task.assignee_id] : [])).map(id => ctx?.members.find(m => m.id === id)).filter((x): x is NonNullable<typeof x> => !!x)
  // A video file on the task (newest first): the card shows its frame, a play button and its length.
  const video = [...(task.attachments ?? [])].reverse().find(a => !isLinkAttachment(a) && a.url && (a.content_type?.startsWith('video/') || attachmentKind(a.filename) === 'video'))?.url ?? null

  return (
    <>
      {/* Boards UI (user, 25 Nov 2026): a card with an image shows it as a full-width cover, 140px tall,
          flush with the card's edges and a thin line under it; a video shows its frame with a play
          button and its length; a card with neither stays compact, text only.
          Spec 021 (US4): no cover when the brand has Cover images off. */}
      {featureOn(task.brand, 'covers') && (video || cover) && (
        <div data-card-cover={video ? 'video' : 'image'} style={{ position: 'relative', margin: `-${PAD}px -${PAD}px ${PAD}px`, height: COVER_H, overflow: 'hidden', borderRadius: '11px 11px 0 0', borderBottom: `1px solid ${PIPE.border}`, background: video ? '#14131A' : PIPE.surface }}>
          {video
            ? <VideoCover src={video} poster={cover} />
            : <ImageWithFallback src={cover} alt="" loading="lazy" style={{ width: '100%', height: COVER_H, objectFit: 'cover', display: 'block' }}
                fallback={<div style={{ width: '100%', height: COVER_H, background: 'linear-gradient(140deg, #F1F1F5 0%, #E7E7EE 100%)' }} />} />}
        </div>
      )}

      {/* The brand on one small line, with its icon. */}
      {shows('brand') && <div data-card-brand="" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span aria-hidden="true" style={{
          width: 16, height: 16, borderRadius: 4, flexShrink: 0, overflow: 'hidden',
          background: task.brand ? brandColor : PIPE.surface,
          color: '#FFFFFF', fontSize: 8, fontWeight: 800,
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        }}>
          {task.brand
            ? <ImageWithFallback
                src={task.brand.logo_url}
                alt=""
                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                fallback={<>{brandMark}</>}
              />
            : null}
        </span>
        <span style={{
          minWidth: 0, fontSize: 11.5, fontWeight: 500, color: PIPE.textSecondary,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {task.brand?.name ?? 'No brand'}
        </span>
      </div>}

      {/* Title, in medium weight. */}
      <div data-card-title="" style={{
        marginTop: shows('brand') ? 6 : 0,
        fontSize: 13.5, fontWeight: 500, lineHeight: 1.4,
        color: PIPE.textPrimary, textWrap: 'pretty', overflowWrap: 'anywhere',
      }}>
        {task.name}
      </div>

      {/* Spec 023: custom field values the page shows. */}
      <CardFieldValues taskId={task.id} typeLabel={task.content_type_label} status={task.status} brand={task.brand} homeSpaceId={task.home_space_id} />

      {/* Chips the page and the brand turn on (SLA, media links, task links, tags, urgent, type). */}
      <div data-card-chips="" style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
        {featureOn(task.brand, 'sla') && <span data-sla-chip style={{ display: 'contents' }}><Chip {...chip}>{chip.upper ? alert.toUpperCase() : alert}</Chip></span>}
        {/* Spec 022: media links (content: per-board stage; media: its content task, or Unlinked). */}
        <CardMedia task={task as never} />
        {linkNames.map(n => (
          <span key={n} data-card-task-link="" title={n} style={{ display: 'inline-flex', alignItems: 'center', maxWidth: 170, height: 22, padding: '0 8px', borderRadius: 6, fontSize: 11.5, fontWeight: 600, background: 'color-mix(in srgb, #5B5FC7 10%, transparent)', color: '#3B3F9E' }}>
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>↗ {n}</span>
          </span>
        ))}
        {/* Spec 023 (US4): up to three tags, then +N. */}
        {featureOn(task.brand, 'tags') && tagList.slice(0, 3).map(tg => <TagChip key={tg.id} tag={tg} small />)}
        {featureOn(task.brand, 'tags') && tagList.length > 3 && <span style={{ fontSize: 10.5, fontWeight: 700, color: PIPE.textFaint, alignSelf: 'center' }}>+{tagList.length - 3}</span>}
        {/* Spec 023 (US8): a repeating task. */}
        {task.repeat_rule_id && (
          <span data-repeat-mark="" title={tRepeat('mark')} aria-label={tRepeat('mark')} style={{ display: 'inline-flex', alignItems: 'center', fontSize: 12, fontWeight: 800, padding: '2px 7px', borderRadius: 6, background: PIPE.surface, color: PIPE.textSecondary }}>↻</span>
        )}
        {task.priority === 'Urgent' && featureOn(task.brand, 'priorities') && (
          <span data-card-urgent="" style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 10.5, fontWeight: 800, padding: '4px 8px', borderRadius: 6, background: '#FDE7EA', color: '#D22040', whiteSpace: 'nowrap' }}>⚑ {tPri('Urgent')}</span>
        )}
        {task.content_type_label && featureOn(task.brand, 'type') && shows('type') && (
          <span data-card-type={task.content_type_label} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 10.5, fontWeight: 600, padding: '4px 8px', borderRadius: 6, whiteSpace: 'nowrap',
            background: type?.color ? `${type.color}1A` : PIPE.surface, color: type?.color ?? PIPE.textMuted }}>
            <TypeIcon icon={type?.icon} color={type?.color ?? PIPE.textMuted} size={11} />
            {type ? typeName(type, locale) : task.content_type_label}
          </span>
        )}
      </div>

      {/* One meta row: attachments, comments and dates (the due date red when overdue), the assignee on the right. */}
      <div data-card-meta="" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 9, gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 9, minWidth: 0, flexWrap: 'wrap', color: PIPE.textFaint }}>
          {attachmentCount > 0 && (
            <span data-card-files={attachmentCount} title={`${attachmentCount} attachment${attachmentCount === 1 ? '' : 's'}`}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 11, fontWeight: 600 }}>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                   strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
              </svg>
              {attachmentCount}
            </span>
          )}
          {commentCount > 0 && (
            <span title={`${commentCount} comment${commentCount === 1 ? '' : 's'}`}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 11, fontWeight: 600 }}>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                   strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
              </svg>
              {commentCount}
            </span>
          )}
          {/* Publishing and due dates, each labelled (✎ on a due date set by hand; red when overdue). */}
          {(shows('publish') || shows('due')) && <TaskDates task={shows('publish') && shows('due') ? task : { ...task, publish_date: shows('publish') ? task.publish_date : null, due_date: shows('due') ? task.due_date : null } as typeof task} size={11} />}
        </div>
        <div style={{ display: 'flex', flexShrink: 0, visibility: shows('assignee') ? undefined : 'hidden' }}>
          {/* Spec 023 (US5): up to three assignees, the lead first; otherwise the owner. */}
          {people.length
            ? people.slice(0, 3).map((m, i) => <AssigneeDot key={m.id} name={m.name} stacked={i > 0} />)
            : <AssigneeDot name={task.task_owner.name} />}
          {people.length > 3 && <span style={{ fontSize: 10.5, fontWeight: 700, color: PIPE.textFaint, marginInlineStart: 3 }}>+{people.length - 3}</span>}
          {!people.length && currentStageOwner && currentStageOwner.id !== task.task_owner.id && (
            <AssigneeDot name={currentStageOwner.name} stacked />
          )}
        </div>
      </div>

      {/* A subtask says whose it is — otherwise it is indistinguishable from a
          top-level task once it is sitting in a column. */}
      {task.parent && (
        <div
          title={`Clip of ${task.parent.name}`}
          style={{
            marginTop: 8, paddingTop: 7, borderTop: `1px solid ${PIPE.border}`,
            fontSize: 10.5, fontWeight: 600, color: PIPE.textFaint,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}
        >
          ↳ {task.parent.name}
        </div>
      )}
    </>
  )
}

const SHELL: React.CSSProperties = {
  background: '#FFFFFF',
  border: `1px solid ${PIPE.border}`,
  borderRadius: 12,
  padding: PAD,
}

export function TaskCard({
  task, currentStageOwner, currentUser: _currentUser, slaConfig, today, onSelect,
  selected, selecting, onToggleSelect,
}: TaskCardProps) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } =
    useSortable({ id: task.id })
  const { activatorEvent } = useDndContext()
  const summaryId = useId()

  // The overlay carries the card while it moves, so the copy left behind is
  // a ghost: out of the tab order and the accessibility tree. Not for a
  // keyboard drag, though — focus stays on this card for the whole move, and
  // taking it away would drop a screen reader user's place.
  const ghost = isDragging && !(activatorEvent && isKeyboardEvent(activatorEvent))

  // What the card shows, as a sentence: the card's name is the task, and
  // this is read after it, so status, due date and people are not lost
  // behind the label.
  const { alert, dueLabel } = cardFacts(task, slaConfig, today)
  const summary = [
    alert,
    dueLabel || 'No due date',
    `Assigned to ${assigneesOf(task, currentStageOwner).map(m => m.name).join(' and ')}`,
    task.brand?.name ?? 'No brand',
    task.project?.name ?? 'No project',
    task.parent ? `Clip of ${task.parent.name}` : '',
  ].filter(Boolean).join('. ')

  return (
    // The sortable node is this wrapper; the card proper is the button
    // inside it, with the selection checkbox beside it rather than in it — a
    // control inside a button is neither one thing nor the other to a screen
    // reader. The wrapper keeps .fx-task-card so hovering or focusing either
    // still reveals the checkbox.
    <div
      ref={setNodeRef}
      className="fx-task-card"
      inert={ghost}
      aria-hidden={ghost || undefined}
      style={{
        position: 'relative',
        transform: CSS.Transform.toString(transform),
        transition,
        // The overlay carries the card while it moves, so the original dims.
        opacity: isDragging ? 0.35 : 1,
      }}
    >
      <div
        ref={setActivatorNodeRef}
        {...attributes}
        {...listeners}
        style={{
          ...SHELL,
          // The padding sits on the inner box: content-visibility clips at its edge, and the cover reaches it.
          padding: 0,
          borderColor: selected ? PIPE.purple : PIPE.border,
          boxShadow: selected ? `0 0 0 2px ${PIPE.purple}33` : undefined,
          cursor: isDragging ? 'grabbing' : 'grab',
          // A touch drag starts on a press-and-hold (the board's TouchSensor),
          // so a swipe that starts on a card still scrolls the page.
          touchAction: 'manipulation',
          userSelect: 'none',
          WebkitTouchCallout: 'none',
        }}
        onClick={e => {
          // While a selection is running, a plain click extends it rather than
          // opening the task — the same bargain ClickUp makes.
          if (selecting && onToggleSelect) { onToggleSelect(task.id, e.shiftKey); return }
          onSelect(task.id)
        }}
        // Enter opens the task; every other key goes on to dnd-kit's keyboard
        // sensor (Space picks the card up). Setting onKeyDown after {...listeners}
        // replaces theirs, so it has to be passed on by hand.
        onKeyDown={e => {
          if (e.key === 'Enter') { onSelect(task.id); return }
          listeners?.onKeyDown?.(e)
        }}
        role="button"
        tabIndex={0}
        aria-label={`Task: ${task.name}`}
        aria-describedby={[summaryId, attributes['aria-describedby']].filter(Boolean).join(' ')}
        className="fx-focus"
        data-task-card={task.id}
      >
        <span id={summaryId} className="sr-only">{summary}</span>
        {/* Off-screen cards skip layout and paint until they scroll near —
            a Team board runs to hundreds of cards. Inside the shell, so the
            shell's selected ring and focus outline are never clipped. */}
        <div style={{ contentVisibility: 'auto', containIntrinsicSize: 'auto 272px', padding: PAD, borderRadius: 11 }}>
          <CardBody task={task} currentStageOwner={currentStageOwner} slaConfig={slaConfig} today={today} />
        </div>
      </div>

      {onToggleSelect && (
        // A real checkbox, drawn as the round-cornered tick over the cover.
        // Its click carries shiftKey for range selection; Space on the
        // focused box arrives as a click too, so one handler covers both.
        <span
          className="fx-card-check"
          data-on={selected ? 'true' : undefined}
          // 16, not 15: measured from the shell's outer edge now, not from
          // inside its 1px border.
          style={{ position: 'absolute', top: 16, left: 16, zIndex: 2, display: 'block' }}
        >
          <input
            type="checkbox"
            checked={Boolean(selected)}
            readOnly
            aria-label={`Select ${task.name}`}
            className="fx-focus"
            onClick={e => onToggleSelect(task.id, e.shiftKey)}
            // Enter toggled the old box too; a native checkbox only takes Space.
            onKeyDown={e => {
              if (e.key === 'Enter') { e.preventDefault(); onToggleSelect(task.id, e.shiftKey) }
            }}
            style={{
              appearance: 'none', WebkitAppearance: 'none', margin: 0, display: 'block',
              width: 20, height: 20, boxSizing: 'content-box', borderRadius: 6, cursor: 'pointer',
              border: `1.5px solid ${selected ? PIPE.purple : 'rgba(255,255,255,.9)'}`,
              background: selected ? PIPE.purple : 'rgba(255,255,255,.82)',
              boxShadow: '0 1px 4px rgba(20,19,26,.25)',
            }}
          />
          <span aria-hidden="true" style={{
            position: 'absolute', top: 1.5, left: 1.5, width: 20, height: 20, pointerEvents: 'none',
            color: '#FFFFFF', fontSize: 12, fontWeight: 900, lineHeight: '17px',
            textAlign: 'center',
          }}>
            {selected ? '✓' : ''}
          </span>
        </span>
      )}
    </div>
  )
}

/** What follows the cursor mid-drag. Same body, tilted and lifted. */
export function TaskCardOverlay({
  task, currentStageOwner, slaConfig, today,
}: Omit<TaskCardProps, 'onSelect' | 'currentUser'>) {
  return (
    <div style={{
      ...SHELL, width: 232, cursor: 'grabbing',
      transform: 'rotate(2deg)', boxShadow: '0 12px 32px rgba(26,28,30,.22)',
    }}>
      <CardBody task={task} currentStageOwner={currentStageOwner} slaConfig={slaConfig} today={today} />
    </div>
  )
}
