import React, { useMemo } from 'react'
import { useStore } from '../store/useStore'
import { Task } from '../types'
import { differenceInDays, parseISO, format, isToday, isThisWeek, startOfWeek, endOfWeek } from 'date-fns'
import { getStageOwner, STAGE_MAP } from '../data/stages'

const BRAND_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  'Islam Personal Branding':  { bg: '#fef3c7', text: '#92400e', border: '#fde68a' },
  'The Strategy Community':   { bg: '#dbeafe', text: '#1e40af', border: '#bfdbfe' },
  'Omnisight':                { bg: '#ede9fe', text: '#5b21b6', border: '#ddd6fe' },
  'Forefront':                { bg: '#d1fae5', text: '#065f46', border: '#a7f3d0' },
}

const PRIORITY_COLORS: Record<string, { dot: string; bg: string; text: string }> = {
  High:   { dot: '#ef4444', bg: '#fef2f2', text: '#991b1b' },
  Medium: { dot: '#f97316', bg: '#fff7ed', text: '#9a3412' },
  Low:    { dot: '#94a3b8', bg: '#f8fafc', text: '#475569' },
}

const CTYPE_ICONS: Record<string, string> = {
  Post: '📝', Video: '🎬', Reel: '🎞️', Design: '🎨',
  Email: '📧', Story: '📖', Deck: '📊', Other: '📌',
}

function greeting() {
  const h = new Date().getHours()
  if (h < 12) return 'Good morning'
  if (h < 17) return 'Good afternoon'
  return 'Good evening'
}

function StatCard({ label, value, sub, accent }: { label: string; value: string | number; sub?: string; accent?: string }) {
  return (
    <div style={{
      backgroundColor: '#fff', border: '1px solid #e2e8f0', borderRadius: 16,
      padding: '1.25rem 1.5rem', flex: 1, minWidth: 0,
    }}>
      <div style={{ fontSize: '0.72rem', color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '0.5rem' }}>{label}</div>
      <div style={{ fontSize: '2rem', fontWeight: 800, color: accent ?? '#0f172a', lineHeight: 1 }}>{value}</div>
      {sub && <div style={{ fontSize: '0.72rem', color: '#94a3b8', marginTop: '0.3rem' }}>{sub}</div>}
    </div>
  )
}

function MiniTaskCard({ task, showStage }: { task: Task; showStage?: boolean }) {
  const { selectTask } = useStore()
  const brand = BRAND_COLORS[task.account] ?? { bg: '#f8fafc', text: '#475569', border: '#e2e8f0' }
  const priority = PRIORITY_COLORS[task.priority] ?? PRIORITY_COLORS.Low
  const daysLeft = differenceInDays(parseISO(task.due), new Date())
  const overdue = daysLeft < 0

  return (
    <div
      onClick={() => selectTask(task.id)}
      style={{
        backgroundColor: '#fff', border: '1px solid #e2e8f0', borderRadius: 12,
        padding: '0.9rem 1rem', cursor: 'pointer', transition: 'all 0.12s',
        display: 'flex', alignItems: 'center', gap: '0.9rem',
      }}
      onMouseEnter={e => { e.currentTarget.style.borderColor = '#c7d2fe'; e.currentTarget.style.backgroundColor = '#fafbff' }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = '#e2e8f0'; e.currentTarget.style.backgroundColor = '#fff' }}
    >
      {/* Priority dot */}
      <div style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: priority.dot, flexShrink: 0 }} />

      {/* Content type */}
      <span style={{ fontSize: '1rem', flexShrink: 0 }}>{CTYPE_ICONS[task.ctype] ?? '📌'}</span>

      {/* Name + meta */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ color: '#0f172a', fontSize: '0.85rem', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {task.name}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.2rem' }}>
          <span style={{ fontSize: '0.65rem', backgroundColor: brand.bg, color: brand.text, border: `1px solid ${brand.border}`, borderRadius: 4, padding: '0.05rem 0.4rem', fontWeight: 600 }}>
            {task.account.split(' ')[0]}
          </span>
          {showStage && (
            <span style={{ fontSize: '0.65rem', color: '#94a3b8' }}>
              {STAGE_MAP[task.status]?.label ?? task.status}
            </span>
          )}
        </div>
      </div>

      {/* Due badge */}
      <div style={{ textAlign: 'right', flexShrink: 0 }}>
        <div style={{ fontSize: '0.72rem', fontWeight: 600, color: overdue ? '#ef4444' : daysLeft === 0 ? '#f97316' : '#64748b' }}>
          {overdue ? `${Math.abs(daysLeft)}d late` : daysLeft === 0 ? 'Today' : `${daysLeft}d`}
        </div>
        <div style={{ fontSize: '0.65rem', color: '#cbd5e1' }}>{format(parseISO(task.due), 'MMM d')}</div>
      </div>
    </div>
  )
}

function SectionHeader({ title, count, emoji }: { title: string; count: number; emoji: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
      <span style={{ fontSize: '1rem' }}>{emoji}</span>
      <span style={{ color: '#0f172a', fontWeight: 700, fontSize: '0.95rem' }}>{title}</span>
      {count > 0 && (
        <span style={{ backgroundColor: '#ede9fe', color: '#7c3aed', borderRadius: 99, padding: '0.1rem 0.55rem', fontSize: '0.7rem', fontWeight: 700 }}>
          {count}
        </span>
      )}
    </div>
  )
}

function EmptyState({ message }: { message: string }) {
  return (
    <div style={{ border: '1px dashed #e2e8f0', borderRadius: 12, padding: '1.5rem', textAlign: 'center', color: '#cbd5e1', fontSize: '0.8rem' }}>
      {message}
    </div>
  )
}

export function PersonalBoard() {
  const { currentUser, tasks, members, slaConfig } = useStore()
  if (!currentUser) return null

  const today = new Date()

  // My tasks = tasks where I'm the current stage owner OR the assignee
  const myTasks = useMemo(() => {
    return tasks.filter(t => {
      if (t.status === 'publish') return false
      const owner = getStageOwner(t, t.status)
      return t.assignee === currentUser.name || owner === currentUser.name
    })
  }, [tasks, currentUser])

  const todayTasks = useMemo(() =>
    myTasks.filter(t => {
      const due = parseISO(t.due)
      const daysLeft = differenceInDays(due, today)
      return isToday(due) || daysLeft < 0
    }),
    [myTasks]
  )

  const weekTasks = useMemo(() =>
    myTasks.filter(t => {
      const due = parseISO(t.due)
      const daysLeft = differenceInDays(due, today)
      return daysLeft > 0 && daysLeft <= 7
    }),
    [myTasks]
  )

  const totalHours = myTasks.reduce((s, t) => s + t.hours, 0)
  const highCount = myTasks.filter(t => t.priority === 'High').length

  // Workload by brand
  const byBrand = useMemo(() => {
    const map: Record<string, { hours: number; count: number }> = {}
    myTasks.forEach(t => {
      if (!map[t.account]) map[t.account] = { hours: 0, count: 0 }
      map[t.account].hours += t.hours
      map[t.account].count += 1
    })
    return Object.entries(map).sort((a, b) => b[1].hours - a[1].hours)
  }, [myTasks])

  // Stage distribution
  const byStage = useMemo(() => {
    const map: Record<string, number> = {}
    myTasks.forEach(t => { map[t.status] = (map[t.status] ?? 0) + 1 })
    return Object.entries(map)
  }, [myTasks])

  // SLA warnings — tasks that are overdue on their stage SLA
  const slaWarnings = useMemo(() =>
    myTasks.filter(t => {
      const limit = slaConfig[t.status] ?? 3
      return differenceInDays(today, parseISO(t.stageDate)) > limit
    }),
    [myTasks, slaConfig]
  )

  const WEEKLY_CAP = 40
  const pctLoad = Math.min(totalHours / WEEKLY_CAP, 1)
  const loadColor = totalHours > WEEKLY_CAP ? '#ef4444' : totalHours > WEEKLY_CAP * 0.75 ? '#f97316' : '#6366f1'

  return (
    <div style={{ overflowY: 'auto', height: '100%', backgroundColor: '#f8fafc' }}>
      <div style={{ maxWidth: 860, margin: '0 auto', padding: '1.75rem 1.5rem 3rem' }}>

        {/* Greeting */}
        <div style={{ marginBottom: '1.75rem' }}>
          <h1 style={{ color: '#0f172a', fontSize: '1.5rem', fontWeight: 800, margin: '0 0 0.25rem', letterSpacing: '-0.02em' }}>
            {greeting()}, {currentUser.name} 👋
          </h1>
          <p style={{ color: '#94a3b8', fontSize: '0.85rem', margin: 0 }}>
            {format(today, 'EEEE, MMMM d, yyyy')} — here's your day at a glance
          </p>
        </div>

        {/* Stat strip */}
        <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.75rem', flexWrap: 'wrap' }}>
          <StatCard label="Active Tasks"   value={myTasks.length}  sub={`${highCount} high priority`} />
          <StatCard label="Due Today"      value={todayTasks.length} sub="incl. overdue" accent={todayTasks.length > 0 ? '#ef4444' : undefined} />
          <StatCard label="Due This Week"  value={weekTasks.length}  sub="next 7 days" />
          <StatCard label="Hours Allocated" value={`${totalHours}h`} sub={`of ${WEEKLY_CAP}h capacity`} accent={loadColor} />
        </div>

        {/* Capacity bar */}
        <div style={{ backgroundColor: '#fff', border: '1px solid #e2e8f0', borderRadius: 16, padding: '1.25rem 1.5rem', marginBottom: '1.75rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.65rem' }}>
            <span style={{ fontSize: '0.8rem', fontWeight: 600, color: '#475569' }}>Weekly Capacity</span>
            <span style={{ fontSize: '0.8rem', fontWeight: 700, color: loadColor }}>{Math.round(pctLoad * 100)}%</span>
          </div>
          <div style={{ height: 8, backgroundColor: '#f1f5f9', borderRadius: 99, overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${pctLoad * 100}%`, backgroundColor: loadColor, borderRadius: 99, transition: 'width 0.5s ease' }} />
          </div>
          {/* Brand breakdown */}
          {byBrand.length > 0 && (
            <div style={{ display: 'flex', gap: '1.25rem', marginTop: '0.85rem', flexWrap: 'wrap' }}>
              {byBrand.map(([brand, { hours, count }]) => {
                const bc = BRAND_COLORS[brand]
                return (
                  <div key={brand} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    <div style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: bc?.text ?? '#94a3b8' }} />
                    <span style={{ fontSize: '0.72rem', color: '#64748b' }}>
                      <strong style={{ color: '#475569' }}>{brand.split(' ')[0]}</strong> {hours}h · {count} tasks
                    </span>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Two-column layout for today + week */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.25rem', marginBottom: '1.75rem' }}>
          {/* My Day */}
          <div>
            <SectionHeader title="My Day" count={todayTasks.length} emoji="☀️" />
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {todayTasks.length > 0
                ? todayTasks.map(t => <MiniTaskCard key={t.id} task={t} showStage />)
                : <EmptyState message="Nothing due today — enjoy the breathing room 🎉" />
              }
            </div>
          </div>

          {/* This Week */}
          <div>
            <SectionHeader title="Up Next This Week" count={weekTasks.length} emoji="📅" />
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {weekTasks.length > 0
                ? weekTasks.map(t => <MiniTaskCard key={t.id} task={t} showStage />)
                : <EmptyState message="No upcoming deadlines this week" />
              }
            </div>
          </div>
        </div>

        {/* SLA Warnings */}
        {slaWarnings.length > 0 && (
          <div style={{ marginBottom: '1.75rem' }}>
            <SectionHeader title="Needs Attention" count={slaWarnings.length} emoji="⚠️" />
            <div style={{ backgroundColor: '#fef2f2', border: '1px solid #fecaca', borderRadius: 16, padding: '1rem' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {slaWarnings.map(t => {
                  const daysIn = differenceInDays(today, parseISO(t.stageDate))
                  const limit = slaConfig[t.status] ?? 3
                  return (
                    <div
                      key={t.id}
                      onClick={() => useStore.getState().selectTask(t.id)}
                      style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', cursor: 'pointer', padding: '0.5rem 0.6rem', borderRadius: 8, backgroundColor: '#fff5f5' }}
                    >
                      <span style={{ fontSize: '0.8rem' }}>🔴</span>
                      <span style={{ flex: 1, color: '#7f1d1d', fontSize: '0.82rem', fontWeight: 500 }}>{t.name}</span>
                      <span style={{ fontSize: '0.7rem', color: '#ef4444', fontWeight: 600 }}>{daysIn}d / {limit}d in {STAGE_MAP[t.status]?.label}</span>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        )}

        {/* My Pipeline — stage distribution */}
        <div>
          <SectionHeader title="My Pipeline" count={myTasks.length} emoji="⚡" />
          {byStage.length > 0 ? (
            <div style={{ backgroundColor: '#fff', border: '1px solid #e2e8f0', borderRadius: 16, padding: '1.25rem 1.5rem' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
                {byStage.map(([stageId, count]) => {
                  const stage = STAGE_MAP[stageId as any]
                  const pct = count / myTasks.length
                  const isContent = stage?.phase === 'content'
                  const barColor = isContent ? '#6366f1' : '#ec4899'
                  return (
                    <div key={stageId} style={{ display: 'flex', alignItems: 'center', gap: '0.9rem' }}>
                      <div style={{ width: 120, fontSize: '0.75rem', color: '#64748b', fontWeight: 500, flexShrink: 0, direction: ['todo','c-prog','publish'].includes(stageId) ? 'rtl' : 'ltr', textAlign: 'right' }}>
                        {stage?.label ?? stageId}
                      </div>
                      <div style={{ flex: 1, height: 6, backgroundColor: '#f1f5f9', borderRadius: 99, overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${pct * 100}%`, backgroundColor: barColor, borderRadius: 99 }} />
                      </div>
                      <div style={{ width: 24, textAlign: 'right', fontSize: '0.78rem', fontWeight: 700, color: '#475569', flexShrink: 0 }}>{count}</div>
                    </div>
                  )
                })}
              </div>
            </div>
          ) : (
            <EmptyState message="No tasks in the pipeline — time to create some!" />
          )}
        </div>

      </div>
    </div>
  )
}
