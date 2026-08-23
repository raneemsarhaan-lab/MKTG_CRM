'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import type { Member, Brand, ContentType } from '@/types/index'
import { createTask, createTasks } from '@/actions/tasks'
import { useUIStore } from '@/store/useUIStore'
import { ProjectPicker } from '@/components/shared/ProjectPicker'
import { COLORS } from '@/lib/tokens'
import { FieldPill, PillOption, PillInput } from './FieldPill'
import { shortDate } from '@/lib/myboard'
import { looksLikeList, parsePastedList, MAX_PASTED } from '@/lib/paste-list'

/**
 * New task — intake modal.
 *
 * Follows ClickUp's intake pattern: a borderless title, an inline description,
 * and a row of pills that open popovers, rather than a stack of permanently
 * visible labelled selects. Rendered in Momentum's tokens, so the interaction
 * model is ClickUp's and the visual language stays this product's.
 *
 * Two Momentum rules constrain it:
 *  - The status chip is read-only. New tasks always enter the first stage and
 *    the 8-vs-9-stage flow is stamped at creation (HANDOVER §8), so offering a
 *    stage picker here would let intake skip a required approval.
 *  - Only title and brand are required; everything else defaults, so intake
 *    stays fast (wireframe 1i).
 */

interface TaskFormProps {
  currentUser:  Member
  brands:       Brand[]
  contentTypes: ContentType[]
  members:      Member[]
}

const PLATFORMS  = ['LinkedIn', 'Instagram', 'TikTok', 'Facebook', 'Twitter', 'YouTube', 'Email'] as const
const PRIORITIES = ['High', 'Medium', 'Low'] as const

const PRIORITY_COLOR: Record<string, string> = {
  High:   '#D57D6F',
  Medium: '#E0A23F',
  Low:    '#7C8288',
}

/**
 * A brand's own mark.
 *
 * The colour square said which brand only to someone who had learnt the
 * colours; the logo is the thing people actually recognise, and it is the same
 * mark the board's brand filter uses. Brands with no artwork keep the colour,
 * now as a lettered disc rather than a chip of paint.
 */
function BrandMark({ brand, size = 18 }: { brand: { name: string; color: string; logo_url?: string | null }; size?: number }) {
  return (
    <span aria-hidden="true" style={{
      width: size, height: size, borderRadius: '50%', flexShrink: 0, overflow: 'hidden',
      background: brand.color, color: '#FFFFFF',
      fontSize: size * 0.5, fontWeight: 800, lineHeight: 1,
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    }}>
      {brand.logo_url
        // eslint-disable-next-line @next/next/no-img-element
        ? <img src={brand.logo_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        : brand.name.trim()[0]?.toUpperCase()}
    </span>
  )
}

function Icon({ d, strokeWidth = 2 }: { d: string; strokeWidth?: number }) {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor"
         strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={d} />
    </svg>
  )
}

export function TaskForm({ currentUser, brands, contentTypes, members }: TaskFormProps) {
  const setShowTaskForm = useUIStore(s => s.setShowTaskForm)
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState('')
  const [projectPicker, setProjectPicker] = useState(false)
  const [showMore, setShowMore] = useState(false)

  /** Non-null once a list has been pasted: one entry per task to create. */
  const [bulk, setBulk] = useState<string[] | null>(null)
  const [droppedCount, setDroppedCount] = useState(0)

  const today = new Date().toISOString().slice(0, 10)
  const [form, setForm] = useState({
    name: '',
    description: '',
    brand_id: brands[0]?.id ?? '',
    content_type_label: contentTypes[0]?.label ?? 'Post',
    platform: 'LinkedIn' as typeof PLATFORMS[number],
    // The owner is whoever raises the task — they are accountable for it.
    // The assignee starts as them too and is the thing intake actually picks.
    task_owner_id: currentUser.id,
    assignee_id:   currentUser.id,
    due_date: today,
    hours_estimate: 2,
    priority: 'Medium' as typeof PRIORITIES[number],
    project_id: '',
    project_name: '',
    cover_image_url: '',
  })

  // Mirrors requireTaskCreator() in the server action — the check that counts
  // is the server one; this only avoids rendering a form that cannot submit.
  if (currentUser.access === 'user') return null

  function patch<K extends keyof typeof form>(k: K, v: typeof form[K]) {
    setForm(p => ({ ...p, [k]: v }))
  }

  /**
   * Catch a pasted list before the browser flattens it.
   *
   * Pasting multi-line text into `<input type="text">` does not give you the
   * newlines — the browser joins or truncates the value, so by the time
   * onChange fires the list is already gone. The clipboard has to be read in
   * the paste event itself, which is why this cannot be done in onChange.
   */
  function handlePaste(e: React.ClipboardEvent<HTMLInputElement>) {
    const text = e.clipboardData.getData('text/plain')
    if (!text || !looksLikeList(text)) return   // one name — behave as always
    e.preventDefault()
    const { names, dropped } = parsePastedList(text)
    setBulk(names)
    setDroppedCount(dropped)
    setError('')
  }

  function submitBulk() {
    const names = (bulk ?? []).map(n => n.trim()).filter(Boolean)
    if (!names.length)     { setError('Nothing to create'); return }
    if (!form.brand_id)    { setError('Select a brand'); return }
    setError('')

    startTransition(async () => {
      const result = await createTasks(names, {
        description:        form.description || undefined,
        brand_id:           form.brand_id,
        content_type_label: form.content_type_label,
        platform:           form.platform,
        task_owner_id:      form.task_owner_id,
        assignee_id:        form.assignee_id,
        due_date:           form.due_date,
        hours_estimate:     form.hours_estimate,
        priority:           form.priority,
        project_id:         form.project_id || null,
        cover_image_url:    form.cover_image_url || undefined,
      })
      if (!result.success) { setError(result.error ?? 'Failed to create those tasks'); return }
      router.refresh()
      setShowTaskForm(false)
    })
  }

  function submit(andAnother: boolean) {
    if (bulk) { submitBulk(); return }
    if (!form.name.trim()) { setError('Task name is required'); return }
    if (!form.brand_id)    { setError('Select a brand'); return }
    setError('')

    startTransition(async () => {
      const result = await createTask({
        name:               form.name.trim(),
        description:        form.description || undefined,
        brand_id:           form.brand_id,
        content_type_label: form.content_type_label,
        platform:           form.platform,
        task_owner_id:      form.task_owner_id,
        assignee_id:        form.assignee_id,
        due_date:           form.due_date,
        hours_estimate:     form.hours_estimate,
        priority:           form.priority,
        project_id:         form.project_id || null,
        cover_image_url:    form.cover_image_url || undefined,
      })
      if (!result.success) { setError(result.error ?? 'Failed to create task'); return }

      // The board keeps its own copy of the task list — pull the new one in.
      router.refresh()

      if (andAnother) {
        // Keep the context fields, clear what is task-specific.
        setForm(p => ({ ...p, name: '', description: '' }))
      } else {
        setShowTaskForm(false)
      }
    })
  }

  const brand  = brands.find(b => b.id === form.brand_id)
  const assignee = members.find(m => m.id === form.assignee_id)
  const close  = () => setShowTaskForm(false)

  return (
    <div
      onClick={close}
      style={{
        position: 'fixed', inset: 0, zIndex: 50,
        background: 'rgba(23,19,33,.58)', backdropFilter: 'blur(8px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.5rem',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="New task"
        style={{
          background: '#fff', borderRadius: 16, width: '100%', maxWidth: 660,
          maxHeight: '90vh', display: 'flex', flexDirection: 'column',
          boxShadow: '0 28px 80px rgba(23,19,33,.38)',
        }}
      >
        {/* ── Header ─────────────────────────────────────────────────────── */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '14px 18px', borderBottom: `1px solid ${COLORS.line}`,
        }}>
          <span style={{
            fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 17,
            color: COLORS.ink, paddingBottom: 10, borderBottom: '2.5px solid #5B4CF0',
            marginBottom: -15,
          }}>
            Task
          </span>
          <button
            onClick={close}
            aria-label="Close"
            style={{
              width: 28, height: 28, borderRadius: '50%', background: '#F7F8FA',
              border: 'none', cursor: 'pointer', color: COLORS.muted,
              display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13,
            }}
          >
            ✕
          </button>
        </div>

        <div style={{ padding: '16px 18px', overflowY: 'auto', flex: 1 }}>
          {/* ── Context chips: brand + content type ──────────────────────── */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
            <FieldPill
              label="Brand"
              value={brand?.name}
              active
              iconOnly
              icon={brand ? <BrandMark brand={brand} size={22} /> : undefined}
            >
              {closePill => brands.map(b => (
                <PillOption
                  key={b.id}
                  selected={b.id === form.brand_id}
                  onClick={() => { patch('brand_id', b.id); closePill() }}
                >
                  <BrandMark brand={b} size={20} />
                  {b.name}
                </PillOption>
              ))}
            </FieldPill>

            <FieldPill
              label="Type"
              value={form.content_type_label}
              active
              icon={
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                     strokeWidth="2" aria-hidden="true">
                  <circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="3.5" fill="currentColor" stroke="none" />
                </svg>
              }
            >
              {closePill => contentTypes.map(c => (
                <PillOption
                  key={c.id}
                  selected={c.label === form.content_type_label}
                  onClick={() => { patch('content_type_label', c.label); closePill() }}
                >
                  {c.label}
                </PillOption>
              ))}
            </FieldPill>
          </div>

          {/* ── Title ────────────────────────────────────────────────────── */}
          {bulk ? (
            <BulkNames
              names={bulk}
              onChange={setBulk}
              onCancel={() => setBulk(null)}
              dropped={droppedCount}
            />
          ) : (
            <input
              type="text"
              value={form.name}
              onChange={e => patch('name', e.target.value)}
              onPaste={handlePaste}
              placeholder="Task name — or paste a list"
              autoFocus
              aria-label="Task name"
              style={{
                width: '100%', fontSize: 21, fontWeight: 400, color: COLORS.ink,
                background: 'transparent', border: 'none', borderRadius: 10,
                outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box',
                padding: '10px 2px 6px', marginBottom: 6,
              }}
            />
          )}

          {/* ── Description ──────────────────────────────────────────────── */}
          <textarea
            value={form.description}
            onChange={e => patch('description', e.target.value)}
            placeholder="Add description"
            aria-label="Description"
            rows={3}
            style={{
              width: '100%', fontSize: 15, color: COLORS.ink, background: 'transparent',
              border: 'none', outline: 'none', resize: 'vertical', minHeight: 96,
              fontFamily: 'inherit', boxSizing: 'border-box', padding: '2px 2px',
              marginBottom: 18, lineHeight: 1.5,
            }}
          />

          {/* ── Attribute pills ──────────────────────────────────────────── */}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            {/* Status is fixed: new tasks always enter the first stage (§8) */}
            <span
              title="New tasks always start in To Do"
              style={{
                display: 'inline-flex', alignItems: 'center', padding: '7px 12px',
                borderRadius: 8, background: '#F7F8FA', color: COLORS.muted,
                fontSize: 11.5, fontWeight: 700, letterSpacing: '.05em',
                textTransform: 'uppercase', whiteSpace: 'nowrap',
              }}
            >
              To Do
            </span>

            <FieldPill label="Assignee" value={assignee?.name} active
                       icon={<Icon d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M12 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8" />}>
              {closePill => members.map(m => (
                <PillOption
                  key={m.id}
                  selected={m.id === form.assignee_id}
                  onClick={() => { patch('assignee_id', m.id); closePill() }}
                >
                  {m.name}
                  <span style={{ color: COLORS.muted, fontWeight: 500, fontSize: 12 }}>· {m.role}</span>
                </PillOption>
              ))}
            </FieldPill>

            <FieldPill label="Due date" value={shortDate(form.due_date)} active width={220}
                       icon={<Icon d="M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z" />}>
              {closePill => (
                <PillInput
                  type="date"
                  value={form.due_date}
                  min={today}
                  onChange={e => patch('due_date', e.target.value)}
                  onBlur={closePill}
                />
              )}
            </FieldPill>

            <FieldPill
              label="Priority"
              value={form.priority}
              active
              icon={<span aria-hidden="true" style={{
                width: 8, height: 8, borderRadius: '50%',
                background: PRIORITY_COLOR[form.priority], display: 'inline-block',
              }} />}
              width={180}
            >
              {closePill => PRIORITIES.map(p => (
                <PillOption
                  key={p}
                  selected={p === form.priority}
                  onClick={() => { patch('priority', p); closePill() }}
                >
                  <span aria-hidden="true" style={{
                    width: 8, height: 8, borderRadius: '50%', background: PRIORITY_COLOR[p],
                  }} />
                  {p}
                </PillOption>
              ))}
            </FieldPill>

            {/* Overflow — secondary fields, ClickUp's "…" */}
            <button
              type="button"
              onClick={() => setShowMore(s => !s)}
              aria-expanded={showMore}
              aria-label="More fields"
              title="More fields"
              style={{
                width: 34, height: 34, borderRadius: 9,
                border: 'none', background: '#F7F8FA',
                color: COLORS.muted, cursor: 'pointer', fontSize: 15, lineHeight: 1,
              }}
            >
              …
            </button>
          </div>

          {/* ── Fields ───────────────────────────────────────────────────
              The reference keeps its custom fields behind a button so intake
              stays a title and a brand. Ours holds the four that are not part
              of getting a task onto the board. */}
          <div style={{ marginTop: 22 }}>
            <div style={{ fontSize: 13.5, color: COLORS.muted, marginBottom: 8 }}>Fields</div>
            {!showMore ? (
              <button
                type="button"
                onClick={() => setShowMore(true)}
                style={{
                  padding: '9px 14px', borderRadius: 9, border: 'none', background: '#F7F8FA',
                  color: COLORS.ink, fontSize: 14, fontWeight: 500, cursor: 'pointer',
                  fontFamily: 'inherit',
                }}
              >
                Show custom fields
              </button>
            ) : (
              <>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <FieldPill label="Platform" value={form.platform} active width={190}>
              {closePill => PLATFORMS.map(p => (
                <PillOption
                  key={p}
                  selected={p === form.platform}
                  onClick={() => { patch('platform', p); closePill() }}
                >
                  {p}
                </PillOption>
              ))}
            </FieldPill>

            {/* Project, where Campaign used to be. Campaign was free text that
                grouped nothing — not one of the 316 tasks ever had a value in
                it — and a second grouping beside the project is one idea too
                many. */}
            <span style={{
              position: 'relative', display: 'inline-flex',
              zIndex: projectPicker ? 40 : undefined,
            }}>
              <button
                type="button"
                onClick={() => setProjectPicker(v => !v)}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 7, height: 34,
                  padding: '0 12px', borderRadius: 9, border: 'none', cursor: 'pointer',
                  background: form.project_id ? '#F3EEFF' : '#F7F8FA',
                  color: form.project_id ? '#6D28D9' : '#7C828D',
                  font: 'inherit', fontSize: 13, fontWeight: form.project_id ? 600 : 500,
                  maxWidth: 260,
                }}
              >
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {form.project_name || 'Project'}
                </span>
              </button>
              {projectPicker && (
                <ProjectPicker
                  current={form.project_id ? { id: form.project_id, name: form.project_name } : null}
                  onClose={() => setProjectPicker(false)}
                  onPick={p => {
                    setProjectPicker(false)
                    setForm(f => ({ ...f, project_id: p?.id ?? '', project_name: p?.name ?? '' }))
                  }}
                />
              )}
            </span>

            <FieldPill label="Estimate" value={`${form.hours_estimate}h`} active width={180}>
              {closePill => (
                <PillInput
                  type="number"
                  min={0.5}
                  max={200}
                  step={0.5}
                  value={form.hours_estimate}
                  onChange={e => patch('hours_estimate', parseFloat(e.target.value) || 1)}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); closePill() } }}
                />
              )}
            </FieldPill>
                </div>
                <div style={{ marginTop: 12 }}>
                  <label style={{
                    display: 'block', fontSize: 10, fontWeight: 700, letterSpacing: '.06em',
                    textTransform: 'uppercase', color: COLORS.muted, marginBottom: 6,
                  }}>
                    Cover image URL
                  </label>
                  <PillInput
                    type="url"
                    value={form.cover_image_url}
                    placeholder="https://…"
                    onChange={e => patch('cover_image_url', e.target.value)}
                  />
                </div>
                <button
                  type="button"
                  onClick={() => setShowMore(false)}
                  style={{
                    marginTop: 12, padding: 0, border: 'none', background: 'transparent',
                    color: COLORS.muted, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit',
                  }}
                >
                  Hide custom fields
                </button>
              </>
            )}
          </div>

          {/* Pipeline note — the stage count is decided here and then frozen */}
          <p style={{ fontSize: 12, color: COLORS.muted, margin: '16px 0 0' }}>
            Enters <strong style={{ color: COLORS.ink }}>To Do</strong>; SLA starts on creation.
            Creating as {currentUser.role}.
          </p>

          {error && (
            <p role="alert" style={{ color: '#ef4444', fontSize: 13, margin: '10px 0 0' }}>
              {error}
            </p>
          )}
        </div>

        {/* ── Footer ─────────────────────────────────────────────────────── */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'flex-end',
          padding: '12px 18px', borderTop: `1px solid ${COLORS.line}`, gap: 10,
        }}>
          {/* Attachment: TaskAttachment rows carry a URL, and file upload is
              still an open item (HANDOVER §14), so this reveals the URL field
              rather than pretending to be an uploader. */}
          <button
            type="button"
            onClick={() => setShowMore(true)}
            aria-label="Add cover image by URL"
            title="Add cover image by URL"
            style={{
              width: 32, height: 32, borderRadius: 8, border: 'none',
              background: 'transparent', color: COLORS.muted, cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            <Icon d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
          </button>

          {/* Split button — create, or create and keep going */}
          <div style={{ display: 'flex', alignItems: 'stretch' }}>
            <button
              type="button"
              onClick={() => submit(false)}
              disabled={isPending}
              style={{
                padding: '10px 20px', background: COLORS.ink, border: 'none',
                borderRadius: '10px 0 0 10px', color: COLORS.lime,
                fontSize: 14, fontWeight: 800, cursor: 'pointer',
                fontFamily: 'var(--font-heading)', opacity: isPending ? 0.7 : 1,
              }}
            >
              {isPending
                ? 'Creating…'
                : bulk
                  ? `Create ${bulk.filter(n => n.trim()).length} Tasks`
                  : 'Create Task'}
            </button>
            <button
              type="button"
              onClick={() => submit(true)}
              disabled={isPending}
              title="Create and add another"
              aria-label="Create and add another"
              style={{
                padding: '10px 12px', background: COLORS.ink,
                border: 'none', borderInlineStart: '1px solid rgba(255,255,255,.18)',
                borderRadius: '0 10px 10px 0', color: COLORS.lime,
                cursor: 'pointer', opacity: isPending ? 0.7 : 1,
                display: 'flex', alignItems: 'center',
              }}
            >
              <Icon d="M6 9l6 6 6-6" strokeWidth={2.5} />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

/**
 * The pasted list, before it becomes tasks.
 *
 * Shown rather than created straight away. A paste is the one moment where a
 * stray line or a heading the parser could not tell from a task is likely, and
 * twenty wrong tasks are far more work to undo than to review — so every line
 * is editable and removable first. Everything else on the form (brand, owner,
 * due date, priority) applies to all of them, which is the point.
 */
function BulkNames({ names, onChange, onCancel, dropped }: {
  names: string[]
  onChange: (next: string[]) => void
  onCancel: () => void
  dropped: number
}) {
  const kept = names.filter(n => n.trim()).length

  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        gap: 10, marginBottom: 8, flexWrap: 'wrap',
      }}>
        <span style={{
          fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 15, color: COLORS.ink,
        }}>
          {kept} task{kept === 1 ? '' : 's'} from your list
        </span>
        <button
          type="button"
          onClick={onCancel}
          style={{
            border: 'none', background: 'transparent', color: COLORS.muted,
            fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
            textDecoration: 'underline', padding: 0,
          }}
        >
          Back to a single task
        </button>
      </div>

      <div style={{
        maxHeight: 240, overflowY: 'auto', border: `1px solid ${COLORS.line}`,
        borderRadius: 10, padding: 6, display: 'grid', gap: 4,
      }}>
        {names.map((n, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{
              width: 22, textAlign: 'right', fontSize: 11, fontWeight: 700,
              color: COLORS.muted, flexShrink: 0, fontVariantNumeric: 'tabular-nums',
            }}>
              {i + 1}
            </span>
            <input
              value={n}
              aria-label={`Task ${i + 1} of ${names.length}`}
              onChange={e => {
                const next = [...names]
                next[i] = e.target.value
                onChange(next)
              }}
              style={{
                flex: 1, minWidth: 0, fontSize: 13.5, fontWeight: 600, color: COLORS.ink,
                background: '#F6F6F4', border: `1px solid ${COLORS.line}`, borderRadius: 7,
                padding: '6px 9px', outline: 'none', fontFamily: 'inherit',
              }}
            />
            <button
              type="button"
              onClick={() => onChange(names.filter((_, j) => j !== i))}
              aria-label={`Remove "${n}"`}
              title="Remove this line"
              style={{
                border: 'none', background: 'transparent', color: COLORS.coral,
                cursor: 'pointer', fontSize: 13, padding: 4, flexShrink: 0, lineHeight: 1,
              }}
            >
              ✕
            </button>
          </div>
        ))}
      </div>

      {dropped > 0 && (
        <p role="alert" style={{ margin: '8px 0 0', fontSize: 12, color: COLORS.coral, fontWeight: 600 }}>
          Only the first {MAX_PASTED} lines were taken — {dropped} more were left out.
        </p>
      )}
    </div>
  )
}
