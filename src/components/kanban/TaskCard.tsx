'use client'

import { useId } from 'react'
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
import { coverImageFor } from '@/lib/attachments'
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

/** The placeholder cover: three bars on a grey gradient (§7.1). */
const BAR_SETS = [[14, 30, 20], [24, 14, 32], [16, 32, 22], [22, 30, 16], [20, 32, 16]]

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
  const { alert, overdue, dueLabel } = cardFacts(task, slaConfig, today)
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
  // Stable per task, so a card does not reshuffle its bars on every render.
  const bars = BAR_SETS[task.id.charCodeAt(0) % BAR_SETS.length]

  return (
    <>
      {/* Cover — spec 021 (US4): none when the brand has Cover images off. */}
      {featureOn(task.brand, 'covers') && <div data-card-cover style={{ position: 'relative', marginBottom: 9 }}>
        <ImageWithFallback
          src={cover}
          alt=""
          loading="lazy"
          style={{
            width: '100%', height: 126, objectFit: 'cover', display: 'block',
            borderRadius: 8, border: `1px solid ${PIPE.borderFaint}`,
          }}
          fallback={
            <div style={{
              width: '100%', height: 126, borderRadius: 8,
              background: 'linear-gradient(140deg, #F1F1F5 0%, #E7E7EE 100%)',
              border: `1px solid ${PIPE.borderFaint}`, display: 'flex',
              alignItems: 'flex-end', justifyContent: 'center', gap: 5,
              padding: '12px 16px', boxSizing: 'border-box', overflow: 'hidden',
            }}>
              {bars.map((h, i) => (
                <div key={i} style={{
                  flex: 1, height: h, borderRadius: 2,
                  background: h >= 30 ? '#B3B8C6' : '#C9CDD8',
                }} />
              ))}
            </div>
          }
        />

      </div>}

      {/* Brand, then the project it serves.
          Two short lines above the title so a column can be read for
          direction without opening anything. The brand mark moved here from
          the cover's corner rather than being drawn twice. */}
      {shows('brand') && <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 1 }}>
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
          minWidth: 0, fontSize: 10.5, fontWeight: 700, color: PIPE.textSecondary,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {task.brand?.name ?? 'No brand'}
        </span>
      </div>}

      <div style={{
        display: 'flex', alignItems: 'center', gap: 4,
        margin: '2px 0 6px 22px', fontSize: 10, fontWeight: 600,
        color: task.project ? '#6D28D9' : PIPE.textFaintest,
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
      }}>
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor"
             strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
             style={{ flexShrink: 0 }}>
          <path d="M3 7a2 2 0 0 1 2-2h4l2 2.5h8a2 2 0 0 1 2 2V17a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
        </svg>
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {task.project?.name ?? 'No project'}
        </span>
      </div>

      {/* Title */}
      <div style={{
        fontSize: 12.5, fontWeight: 600, lineHeight: 1.35,
        color: PIPE.textPrimary, textWrap: 'pretty', overflowWrap: 'anywhere',
      }}>
        {task.name}
      </div>

      {/* Spec 023: custom field values the page shows. */}
      <CardFieldValues taskId={task.id} typeLabel={task.content_type_label} status={task.status} brand={task.brand} homeSpaceId={task.home_space_id} />

      {/* Publishing and due dates, each labelled (✎ on a due date set by hand). */}
      {(shows('publish') || shows('due')) && <div style={{ marginTop: 5 }}><TaskDates task={shows('publish') && shows('due') ? task : { ...task, publish_date: shows('publish') ? task.publish_date : null, due_date: shows('due') ? task.due_date : null } as typeof task} size={10.5} /></div>}

      {/* Chips */}
      <div style={{ display: 'flex', gap: 6, marginTop: 9, flexWrap: 'wrap' }}>
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

      {/* Footer */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginTop: 10, gap: 8,
      }}>
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

        <div style={{ display: 'flex', alignItems: 'center', gap: 7, minWidth: 0 }}>
          {/* Not in the handoff, but asked for earlier — kept at the footer's
              own muted weight so it reads as metadata, not a third chip. */}
          {attachmentCount > 0 && (
            <span title={`${attachmentCount} attachment${attachmentCount === 1 ? '' : 's'}`}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 10.5, fontWeight: 600, color: PIPE.textFaintest }}>
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                   strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
              </svg>
              {attachmentCount}
            </span>
          )}
          {commentCount > 0 && (
            <span title={`${commentCount} comment${commentCount === 1 ? '' : 's'}`}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 10.5, fontWeight: 600, color: PIPE.textFaintest }}>
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                   strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
              </svg>
              {commentCount}
            </span>
          )}
          {dueLabel && (
            <span style={{
              fontSize: 10.5, fontWeight: overdue ? 800 : 600,
              color: overdue ? '#D22040' : PIPE.textFaintest, whiteSpace: 'nowrap',
            }}>
              {dueLabel}
            </span>
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
  padding: 8,
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
        <div style={{ contentVisibility: 'auto', containIntrinsicSize: 'auto 272px' }}>
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
