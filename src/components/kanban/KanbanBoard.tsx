'use client'

import { useState, useMemo, useEffect, useRef, useTransition } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import {
  DndContext, DragEndEvent, DragStartEvent, DragOverEvent, DragOverlay,
  PointerSensor, KeyboardSensor, useSensor, useSensors, closestCorners,
} from '@dnd-kit/core'
import { arrayMove, sortableKeyboardCoordinates } from '@dnd-kit/sortable'
import type { Task, Member, SLAConfig, Brand, ContentType, TaskComment, TaskAttachment, StageId } from '@/types/index'
import { STAGE_META, ALL_STAGES, NINE_STAGE, EIGHT_STAGE, UPSTREAM_STAGES, startsDownstream } from '@/lib/stage-meta'
import { PIPE } from '@/lib/pipeline-tokens'
import { attentionItems } from '@/lib/home-metrics'
import { initials, avatarColor } from '@/lib/utils'
import { setTaskStage, bulkUpdateTasks, bulkDeleteTasks } from '@/actions/tasks'
import { useUIStore } from '@/store/useUIStore'
import { KanbanColumn } from './KanbanColumn'
import { TaskCardOverlay } from './TaskCard'
import {
  BoardFilters, EMPTY_FILTERS, applyBoardFilters, type BoardFilterState,
} from './BoardFilters'
import { TaskModal } from './TaskModal'
import { HeroCards } from './HeroCards'
import { BulkBar, type BulkPatch } from './BulkBar'
import { TaskForm } from '@/components/shared/TaskForm'

type FullTask = Task & {
  brand: Brand
  task_owner: Member
  comments: (TaskComment & { author: Member })[]
  attachments?: TaskAttachment[]
}

interface KanbanBoardProps {
  initialTasks: FullTask[]
  currentUser: Member
  members: Member[]
  brands: Brand[]
  contentTypes: ContentType[]
  slaConfig: SLAConfig
  today: Date
}

export function KanbanBoard({
  initialTasks,
  currentUser,
  members,
  brands,
  contentTypes,
  slaConfig,
  today,
}: KanbanBoardProps) {
  const [tasks, setTasks]         = useState<FullTask[]>(initialTasks)
  const [activeDragId, setActiveDragId] = useState<string | null>(null)
  const [overStage, setOverStage] = useState<StageId | null>(null)
  const [filters, setFilters]     = useState<BoardFilterState>(EMPTY_FILTERS)
  const [dragError, setDragError] = useState('')
  const [selected, setSelected]   = useState<Set<string>>(new Set())
  const [bulkBusy, setBulkBusy]   = useState(false)
  const [bulkNote, setBulkNote]   = useState('')
  const [, startTransition]       = useTransition()
  const router = useRouter()

  // Server data is copied into local state so drag can reorder within a column
  // without a round trip. That copy has to be re-synced when the server sends
  // new data, or every mutation appears to do nothing until a full reload.
  // Local drag order is intentionally discarded here — it is never persisted.
  useEffect(() => { setTasks(initialTasks) }, [initialTasks])


  const selectedTaskId = useUIStore(s => s.selectedTaskId)
  const selectTask     = useUIStore(s => s.selectTask)
  const showTaskForm   = useUIStore(s => s.showTaskForm)
  const setShowTaskForm = useUIStore(s => s.setShowTaskForm)
  const setCelebration = useUIStore(s => s.setCelebration)
  const searchParams   = useSearchParams()

  // My Board's "+ Add task" links here with ?new=1 — open the composer on
  // arrival so the action works from off-board.
  const wantsNewTask = searchParams.get('new') === '1'
  useEffect(() => {
    if (wantsNewTask) setShowTaskForm(true)
  }, [wantsNewTask, setShowTaskForm])

  // ...and its task rows link with ?task=<id>. Without this the link lands on
  // the board with nothing open.
  const deepLinkTaskId = searchParams.get('task')
  useEffect(() => {
    if (deepLinkTaskId) selectTask(deepLinkTaskId)
  }, [deepLinkTaskId, selectTask])

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  /**
   * Whose board this is.
   *
   * Defaults to your own work, because the board is a place to do a job
   * rather than a status report — three hundred tasks, most of them somebody
   * else's, is a wall to read past before you find yours. Team is one click
   * away and the choice is remembered per browser.
   *
   * Read after mount like every other stored preference: reading
   * localStorage during render makes the server and client disagree.
   */
  const [scope, setScope] = useState<'me' | 'team'>('me')
  useEffect(() => {
    if (window.localStorage.getItem('momentum.board.scope') === 'team') setScope('team')
  }, [])
  function chooseScope(next: 'me' | 'team') {
    setScope(next)
    try { window.localStorage.setItem('momentum.board.scope', next) } catch { /* private mode */ }
  }

  const scopedTasks = useMemo(
    () => (scope === 'me' ? tasks.filter(t => t.task_owner_id === currentUser.id) : tasks),
    [tasks, scope, currentUser.id],
  )

  const filteredTasks = useMemo(
    () => applyBoardFilters(scopedTasks, filters, {
      currentUserId: currentUser.id, slaConfig, today,
    }),
    [scopedTasks, filters, currentUser.id, slaConfig, today],
  )

  const tasksByStage = useMemo(() => {
    const map: Record<string, FullTask[]> = {}
    ALL_STAGES.forEach(s => { map[s] = [] })
    filteredTasks.forEach(t => { if (map[t.status]) map[t.status].push(t) })
    return map
  }, [filteredTasks])

  function handleDragStart({ active }: DragStartEvent) {
    setActiveDragId(active.id as string)
  }

  /** A drop lands either on a column (its stage id) or on a card in one. */
  function stageOfDropTarget(overId: string): StageId | null {
    if ((ALL_STAGES as string[]).includes(overId)) return overId as StageId
    return (tasks.find(t => t.id === overId)?.status as StageId) ?? null
  }

  // Collision resolves to whichever card is nearest, so the column under the
  // pointer has to be derived rather than read off `isOver` — otherwise no
  // column ever highlights while a card is over another card.
  function handleDragOver({ over }: DragOverEvent) {
    setOverStage(over ? stageOfDropTarget(over.id as string) : null)
  }

  function handleDragEnd({ active, over }: DragEndEvent) {
    setActiveDragId(null)
    setOverStage(null)
    if (!over || active.id === over.id) return

    const dragged = tasks.find(t => t.id === active.id)
    if (!dragged) return

    const fromStage = dragged.status as StageId
    const toStage   = stageOfDropTarget(over.id as string)
    if (!toStage) return

    // Same column — a reorder. Position isn't persisted (there is no order
    // column), so this stays local and is discarded on the next server render.
    if (toStage === fromStage) {
      setTasks(prev => {
        const oldIdx = prev.findIndex(t => t.id === active.id)
        const newIdx = prev.findIndex(t => t.id === over.id)
        if (oldIdx === -1 || newIdx === -1) return prev
        return arrayMove(prev, oldIdx, newIdx)
      })
      return
    }

    // An 8-stage task has no C-Check column to land in; refuse before the
    // optimistic move so the card never visibly jumps and snap back.
    const path = dragged.nine_stage ? NINE_STAGE : EIGHT_STAGE
    if (!path.includes(toStage)) {
      setDragError(`${STAGE_META[toStage].label_en} isn't part of this task's pipeline`)
      return
    }

    // Optimistic: move it now, put it back if the server says no.
    setDragError('')
    setTasks(prev => prev.map(t => (t.id === dragged.id ? { ...t, status: toStage } : t)))

    startTransition(async () => {
      const res = await setTaskStage(dragged.id, toStage)
      if (!res.success) {
        setTasks(prev => prev.map(t => (t.id === dragged.id ? { ...t, status: fromStage } : t)))
        setDragError(
          res.error === 'not_authorized'
            ? `Only ${STAGE_META[fromStage].owner_role ?? 'the task owner'} can move this out of ${STAGE_META[fromStage].label_en}`
            : 'Could not move that task',
        )
        return
      }
      router.refresh()
      if (res.shouldCelebrate) {
        setCelebration({ taskName: dragged.name, stageLabel: STAGE_META[toStage].label_en })
      }
    })
  }

  const selectedTask = selectedTaskId ? tasks.find(t => t.id === selectedTaskId) ?? null : null
  const draggedTask  = activeDragId ? tasks.find(t => t.id === activeDragId) ?? null : null

  const attention = useMemo(
    () => attentionItems(tasks, currentUser.id, today),
    [tasks, currentUser.id, today],
  )

  /**
   * The bell's contents.
   *
   * Two kinds of thing arrive here: somebody named you in a comment, and work
   * of yours that is due or has slipped. Mentions come first — a person is
   * waiting on an answer, which a date is not — and newest first inside that.
   */
  const notices = useMemo(() => {
    const mentions = tasks.flatMap(t =>
      (t.comments ?? [])
        .filter(c => (c.mentions ?? []).includes(currentUser.id))
        .map(c => ({
          kind: 'mention' as const,
          id: c.id,
          taskId: t.id,
          who: c.author?.name ?? 'Someone',
          taskName: t.name,
          body: c.body,
          when: new Date(c.created_at).getTime(),
        })),
    ).sort((a, b) => b.when - a.when)

    const due = attention
      .filter(a => a.due === 'overdue' || a.due === 'today')
      .map(a => ({ kind: 'due' as const, id: a.id, taskId: a.id, taskName: a.title, dueText: a.dueText }))

    return { mentions, due, total: mentions.length + due.length }
  }, [tasks, currentUser.id, attention])

  const [bellOpen, setBellOpen] = useState(false)
  const bellRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!bellOpen) return
    function onDown(e: MouseEvent) {
      if (bellRef.current && !bellRef.current.contains(e.target as Node)) setBellOpen(false)
    }
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') setBellOpen(false) }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [bellOpen])

  /**
   * The stages before Ready to Design.
   *
   * A designer's work starts at r-design; four columns of content drafting in
   * front of it is somebody else's queue. Hidden by default for design-side
   * roles — but only defaulted, never enforced, because seeing what is coming
   * is the whole reason to look upstream.
   *
   * The preference is read after mount, not during render: reading
   * localStorage while rendering makes the server and client disagree.
   */
  const [showUpstream, setShowUpstream] = useState(true)
  useEffect(() => {
    const stored = window.localStorage.getItem('momentum.board.upstream')
    setShowUpstream(stored !== null ? stored === '1' : !startsDownstream(currentUser.role))
  }, [currentUser.role])
  function toggleUpstream() {
    setShowUpstream(v => {
      window.localStorage.setItem('momentum.board.upstream', v ? '0' : '1')
      return !v
    })
  }
  const upstreamCount = tasks.filter(
    t => (UPSTREAM_STAGES as string[]).includes(t.status),
  ).length
  const shownStages = showUpstream
    ? ALL_STAGES
    : ALL_STAGES.filter(id => !(UPSTREAM_STAGES as string[]).includes(id))


  // ── Bulk selection ────────────────────────────────────────────────────────
  // Shift-click extends from the last click through the *visible* order, which
  // is what the eye expects — the filtered, column-grouped sequence, not the
  // order the server happened to send.
  // "Visible" has to mean visible: with the upstream columns hidden, a
  // shift-click must not sweep up cards that are not on screen.
  const visibleOrder = useMemo(
    () => shownStages.flatMap(id => (tasksByStage[id] ?? []).map(t => t.id)),
    [tasksByStage, shownStages],
  )
  const [lastClicked, setLastClicked] = useState<string | null>(null)

  function toggleSelect(id: string, shiftKey: boolean) {
    setBulkNote('')
    setSelected(prev => {
      const next = new Set(prev)
      if (shiftKey && lastClicked) {
        const a = visibleOrder.indexOf(lastClicked)
        const b = visibleOrder.indexOf(id)
        if (a !== -1 && b !== -1) {
          const [from, to] = a < b ? [a, b] : [b, a]
          for (let i = from; i <= to; i++) next.add(visibleOrder[i])
          return next
        }
      }
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
    setLastClicked(id)
  }

  function selectStage(stageId: StageId, on: boolean) {
    const ids = (tasksByStage[stageId] ?? []).map(t => t.id)
    setBulkNote('')
    setSelected(prev => {
      const next = new Set(prev)
      ids.forEach(id => (on ? next.add(id) : next.delete(id)))
      return next
    })
  }

  /**
   * `clearAfter` is true only for delete. An edit keeps the selection so a
   * second change can be chained onto the same set — and so the "N changed"
   * note has a bar left to sit in, since the bar disappears at zero.
   */
  function runBulk(
    fn: () => Promise<{ changed: number; refused: number; error?: string }>,
    clearAfter = false,
  ) {
    setBulkBusy(true)
    setBulkNote('')
    startTransition(async () => {
      const res = await fn()
      setBulkBusy(false)
      if (res.error) { setBulkNote(res.error); return }
      setBulkNote(
        res.refused > 0
          ? `${res.changed} changed · ${res.refused} not yours`
          : `${res.changed} changed`,
      )
      if (clearAfter) setSelected(new Set())
      router.refresh()
      setTimeout(() => setBulkNote(''), 5000)
    })
  }

  // Escape drops the selection — the same key that closes everything else.
  useEffect(() => {
    if (selected.size === 0) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setSelected(new Set())
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [selected.size])

  // Time-derived, and computed on the client only — rendering it on the server
  // would freeze whatever hour the page was built at.
  const [greeting, setGreeting] = useState('Hello')
  useEffect(() => {
    const h = new Date().getHours()
    setGreeting(h < 12 ? 'Good morning' : h < 18 ? 'Hey' : 'Good evening')
  }, [])

  return (
    <div
      className={selected.size > 0 ? 'fx-board-selecting' : undefined}
      style={{
        minHeight: '100vh', display: 'flex', flexDirection: 'column',
        gap: 22, paddingBottom: selected.size > 0 ? 90 : 30, background: '#FFFFFF',
      }}
    >
      {/* Greeting header — Pipeline handoff §4. */}
      <div style={{
        padding: '24px 26px 0 38px', flexShrink: 0, display: 'flex',
        alignItems: 'flex-start', justifyContent: 'space-between', gap: 24, flexWrap: 'wrap',
      }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{
              fontFamily: 'var(--font-accent)', fontWeight: 700, fontSize: 44,
              lineHeight: 1, color: PIPE.ink,
            }}>
              {greeting}, {currentUser.name.split(' ')[0]}
            </span>
            <span aria-hidden="true" style={{ fontSize: 26 }}>👋</span>
          </div>
          <svg width="222" height="12" viewBox="0 0 222 12" fill="none" aria-hidden="true"
               style={{ display: 'block', margin: '2px 0 0 2px' }}>
            <path d="M4 8C50 3 160 2 218 6" stroke={PIPE.purpleStroke} strokeWidth="3.2" strokeLinecap="round" />
          </svg>
          <div style={{ marginTop: 6, fontWeight: 500, fontSize: 14.5, color: PIPE.textSecondary }}>
            Let&apos;s create, ship and move the needle.
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 18, paddingTop: 6, flexWrap: 'wrap' }}>
          <div style={{ position: 'relative' }}>
            <input
              value={filters.search}
              onChange={e => setFilters({ ...filters, search: e.target.value })}
              placeholder="Search tasks, campaigns, assets..."
              aria-label="Search tasks"
              style={{
                width: 362, height: 46, boxSizing: 'border-box',
                border: `1px solid ${PIPE.borderInput}`, borderRadius: 999,
                background: '#FFFFFF', padding: '0 12px 0 44px',
                fontSize: 13.5, fontWeight: 500, color: PIPE.textPrimary,
                fontFamily: 'inherit', outline: 'none',
              }}
            />
            <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke={PIPE.textFaint}
                 strokeWidth="2.2" strokeLinecap="round" aria-hidden="true"
                 style={{ position: 'absolute', left: 16, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}>
              <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
            </svg>
          </div>

          {/* The bell used to be a bare <svg> with a count on it — a number on
              the screen you could not do anything with. It opens now, because
              since mentions arrived there is something behind it: people
              waiting on you, then your own work that is due or has slipped. */}
          <div ref={bellRef} style={{ position: 'relative' }}>
            <button
              type="button"
              onClick={() => setBellOpen(v => !v)}
              aria-haspopup="dialog"
              aria-expanded={bellOpen}
              aria-label={notices.total
                ? `Notifications — ${notices.mentions.length} mention${notices.mentions.length === 1 ? '' : 's'}, ${notices.due.length} due`
                : 'Notifications — nothing waiting'}
              title="Notifications"
              style={{
                width: 38, height: 38, borderRadius: 10, border: 'none', padding: 0,
                background: bellOpen ? PIPE.surface : 'transparent', cursor: 'pointer',
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              }}
              onMouseEnter={e => { if (!bellOpen) e.currentTarget.style.background = PIPE.surface }}
              onMouseLeave={e => { if (!bellOpen) e.currentTarget.style.background = 'transparent' }}
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={PIPE.ink}
                   strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.7 21a2 2 0 0 1-3.4 0" />
              </svg>
            </button>
            {notices.total > 0 && (
              <span aria-hidden="true" style={{
                position: 'absolute', top: -2, right: -2, minWidth: 20, height: 20,
                borderRadius: 999, background: PIPE.purple, color: '#FFF',
                fontWeight: 700, fontSize: 11, border: '2px solid #FFFFFF',
                display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 4px',
                pointerEvents: 'none',
              }}>
                {notices.total > 99 ? '99+' : notices.total}
              </span>
            )}

            {bellOpen && (
              <div role="dialog" aria-label="Notifications" style={{
                position: 'absolute', top: 46, insetInlineEnd: 0, zIndex: 20, width: 372,
                maxHeight: 460, overflowY: 'auto', background: '#FFFFFF',
                border: `1px solid ${PIPE.border}`, borderRadius: 14,
                boxShadow: '0 14px 40px rgba(20,19,26,.18)', padding: 8,
              }}>
                {notices.total === 0 && (
                  <p style={{ margin: 0, padding: '26px 12px', textAlign: 'center', fontSize: 13.5, color: PIPE.textMuted }}>
                    Nothing waiting on you 🎉
                  </p>
                )}

                {notices.mentions.length > 0 && (
                  <div style={{
                    padding: '8px 10px 6px', fontSize: 11, fontWeight: 800, letterSpacing: '.08em',
                    textTransform: 'uppercase', color: PIPE.textMuted,
                  }}>
                    Mentions
                  </div>
                )}
                {notices.mentions.map(n => (
                  <button key={n.id} type="button"
                          onClick={() => { setBellOpen(false); selectTask(n.taskId) }}
                          style={NOTICE_ROW}
                          onMouseEnter={e => { e.currentTarget.style.background = PIPE.surface }}
                          onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}>
                    <span style={{ fontSize: 13.5, color: PIPE.textPrimary }}>
                      <strong style={{ fontWeight: 700 }}>{n.who}</strong> mentioned you
                    </span>
                    <span style={{
                      fontSize: 12.5, color: PIPE.textSecondary, marginTop: 3,
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}>
                      {n.body}
                    </span>
                    <span style={{
                      fontSize: 11.5, color: PIPE.textFaint, marginTop: 3,
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}>
                      {n.taskName}
                    </span>
                  </button>
                ))}

                {notices.due.length > 0 && (
                  <div style={{
                    padding: '10px 10px 6px', fontSize: 11, fontWeight: 800, letterSpacing: '.08em',
                    textTransform: 'uppercase', color: PIPE.textMuted,
                    borderTop: notices.mentions.length ? `1px solid ${PIPE.border}` : 'none',
                    marginTop: notices.mentions.length ? 6 : 0,
                  }}>
                    Due
                  </div>
                )}
                {notices.due.map(n => (
                  <button key={n.id} type="button"
                          onClick={() => { setBellOpen(false); selectTask(n.taskId) }}
                          style={NOTICE_ROW}
                          onMouseEnter={e => { e.currentTarget.style.background = PIPE.surface }}
                          onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}>
                    <span style={{
                      fontSize: 13.5, color: PIPE.textPrimary,
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}>
                      {n.taskName}
                    </span>
                    <span style={{ fontSize: 12.5, fontWeight: 600, color: '#D22040', marginTop: 3 }}>
                      {n.dueText}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>

            {/* Upstream columns. Always present rather than only when hidden,
                so the control does not move about depending on state. */}
            <button
              type="button"
              onClick={toggleUpstream}
              aria-pressed={showUpstream}
              title={showUpstream
                ? 'Hide the stages before Ready to Design'
                : 'See what is coming before it reaches you'}
              style={{
                display: 'flex', alignItems: 'center', gap: 7, height: 38, padding: '0 14px',
                borderRadius: 999, cursor: 'pointer', fontFamily: 'inherit', fontSize: 12.5,
                fontWeight: 700, whiteSpace: 'nowrap',
                border: `1.5px solid ${showUpstream ? PIPE.ink : PIPE.border}`,
                background: showUpstream ? '#F4FBD6' : '#FFFFFF',
                color: PIPE.ink,
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                   strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z" />
                <circle cx="12" cy="12" r="2.6" />
              </svg>
              {showUpstream ? 'Hide what\u2019s upstream' : 'Preview what\u2019s coming'}
              {!showUpstream && upstreamCount > 0 && (
                <span style={{
                  minWidth: 18, height: 18, padding: '0 5px', borderRadius: 999,
                  background: PIPE.ink, color: '#FFFFFF', fontSize: 10.5, fontWeight: 800,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  {upstreamCount}
                </span>
              )}
            </button>

            <span style={{
              width: 42, height: 42, borderRadius: '50%', boxSizing: 'border-box',
              border: '2.5px solid #A855F7', background: avatarColor(currentUser.name),
              color: '#FFF', fontWeight: 700, fontSize: 14,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }} aria-hidden="true">
              {initials(currentUser.name)}
            </span>
            <span style={{ lineHeight: 1.25 }}>
              <span style={{ display: 'block', fontWeight: 700, fontSize: 14, color: PIPE.ink }}>
                {currentUser.name}
              </span>
              <span style={{ display: 'block', fontWeight: 500, fontSize: 12, color: PIPE.textFaint }}>
                {currentUser.access === 'admin' ? 'Admin' : currentUser.role}
              </span>
            </span>
          </div>

          {currentUser.access !== 'user' && (
            <button
              onClick={() => setShowTaskForm(true)}
              style={{
                display: 'flex', alignItems: 'center', gap: 9, height: 46,
                padding: '0 18px', borderRadius: 999, border: 'none',
                background: PIPE.limeCta, color: PIPE.ink,
                fontWeight: 700, fontSize: 14.5, cursor: 'pointer', fontFamily: 'inherit',
              }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                   strokeWidth="2.6" strokeLinecap="round" aria-hidden="true">
                <path d="M12 5v14M5 12h14" />
              </svg>
              New task
            </button>
          )}
        </div>
      </div>

      <HeroCards
        tasks={tasks}
        currentUser={currentUser}
        members={members}
        today={today}
        onOpenTask={id => selectTask(id)}
      />

      <BoardFilters
        filters={filters}
        onChange={setFilters}
        tasks={tasks}
        brands={brands}
        members={members}
        shown={filteredTasks.length}
        total={scopedTasks.length}
        scope={scope}
        onScope={chooseScope}
      />


      {/* PIPELINE heading — handoff §7. Caveat, with the hand-drawn ticks and
          underline that carry the rest of the design's voice. */}
      <div style={{ padding: '0 26px 0 38px', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M12 2l2.1 6.1L20 10l-5.9 2.1L12 18l-2.1-5.9L4 10l5.9-1.9L12 2z"
                  fill={PIPE.limePrimary} stroke={PIPE.ink} strokeWidth="1.3" strokeLinejoin="round" />
          </svg>
          <h1 style={{
            fontFamily: 'var(--font-accent)', fontWeight: 700, fontSize: 30,
            letterSpacing: '0.04em', color: PIPE.ink, lineHeight: 1, margin: 0,
          }}>
            PIPELINE
          </h1>
          <svg width="26" height="22" viewBox="0 0 26 22" fill="none" aria-hidden="true">
            <path d="M3 18L8 4M14 17l5-12" stroke={PIPE.purpleStroke} strokeWidth="2.4" strokeLinecap="round" />
          </svg>
        </div>
        <svg width="148" height="9" viewBox="0 0 148 9" fill="none" aria-hidden="true"
             style={{ display: 'block', margin: '2px 0 0 32px' }}>
          <path d="M3 6C34 2 100 1.6 145 4.2" stroke={PIPE.purpleStroke} strokeWidth="2.6" strokeLinecap="round" />
        </svg>
      </div>

      {dragError && (
        <div
          role="alert"
          onClick={() => setDragError('')}
          style={{
            margin: '10px 26px 0 38px', padding: '7px 12px', borderRadius: 10,
            background: '#FDE7EA', color: '#D22040', fontSize: 12.5,
            fontWeight: 700, cursor: 'pointer', flexShrink: 0,
          }}
        >
          {dragError}
        </div>
      )}

      {/* closestCorners, not closestCenter: with multiple droppable columns a
          card dragged to the top of a neighbouring column still resolves to
          that column rather than snapping back to the one it came from. */}
      <DndContext
        // Without an explicit id, dnd-kit names its aria-describedby target
        // from a module-level counter that server and client disagree on, and
        // every card hydrates with a mismatched attribute.
        id="fluxo-board"
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
        onDragCancel={() => { setActiveDragId(null); setOverStage(null) }}
      >
        {/* §7 board: fixed 244px columns on a single scrolling row. */}
        <div style={{
          display: 'grid', gridAutoFlow: 'column', gridAutoColumns: '244px',
          gap: 14, marginTop: 14, alignItems: 'start', overflowX: 'auto',
          minWidth: 0, padding: '0 26px 16px 38px',
        }}>
          {shownStages.map(stageId => {
            const stage      = STAGE_META[stageId]
            const stageTasks = tasksByStage[stageId] ?? []

            return (
              <KanbanColumn
                key={stageId}
                stage={stage}
                tasks={stageTasks}
                currentUser={currentUser}
                members={members}
                slaConfig={slaConfig}
                today={today}
                highlight={overStage === stageId && activeDragId !== null}
                onSelectTask={id => selectTask(id)}
                onAddTask={currentUser.access !== 'user' ? () => setShowTaskForm(true) : undefined}
                selectedIds={selected}
                selecting={selected.size > 0}
                onToggleSelect={toggleSelect}
                onSelectAll={selectStage}
              />
            )
          })}
        </div>

        {/* The dragged card itself — a sortable item does not follow the
            pointer across columns, the overlay does. */}
        <DragOverlay dropAnimation={null}>
          {draggedTask && (
            <TaskCardOverlay
              task={draggedTask}
              currentStageOwner={
                STAGE_META[draggedTask.status].owner_role
                  ? members.find(m => m.role === STAGE_META[draggedTask.status].owner_role) ?? null
                  : null
              }
              slaConfig={slaConfig}
              today={today}
            />
          )}
        </DragOverlay>
      </DndContext>

      <BulkBar
        count={selected.size}
        members={members}
        brands={brands}
        types={contentTypes}
        busy={bulkBusy}
        note={bulkNote}
        onApply={(patch: BulkPatch) => runBulk(() => bulkUpdateTasks([...selected], patch))}
        onDelete={() => runBulk(() => bulkDeleteTasks([...selected]), true)}
        onClear={() => { setSelected(new Set()); setBulkNote('') }}
      />

      {/* Task modal */}
      {selectedTask && (
        <TaskModal
          task={selectedTask}
          currentUser={currentUser}
          stages={[]}
          slaConfig={slaConfig}
          today={today}
          brands={brands}
          members={members}
          contentTypes={contentTypes}
          onClose={() => selectTask(null)}
        />
      )}

      {/* Task creation form */}
      {showTaskForm && (
        <TaskForm
          currentUser={currentUser}
          brands={brands}
          contentTypes={contentTypes}
          members={members}
        />
      )}
    </div>
  )
}

/** A row in the bell's panel — three stacked lines, whole-row hit target. */
const NOTICE_ROW: React.CSSProperties = {
  display: 'flex', flexDirection: 'column', alignItems: 'flex-start',
  width: '100%', minWidth: 0, padding: '9px 10px', border: 'none',
  background: 'transparent', borderRadius: 9, cursor: 'pointer',
  fontFamily: 'inherit', textAlign: 'start',
}
