'use client'

import { useMemo } from 'react'
import type { Task, Member, SLAConfig, Brand, TaskComment, TaskAttachment, BigStatMetric } from '@/types/index'
import { STAGE_META } from '@/lib/stage-meta'
import { getAlertStatus } from '@/lib/alert-status'
import { calDaysBetween, getGreeting } from '@/lib/utils'
import { useUIStore } from '@/store/useUIStore'
import { ProfileStrip } from './ProfileStrip'
import { BigStat } from './BigStat'
import { CapacityBar } from './CapacityBar'
import { TaskPanel } from './TaskPanel'
import { MemberCard } from './MemberCard'
import { TaskModal } from '@/components/kanban/TaskModal'

type TaskWithRelations = Task & {
  brand: Brand
  task_owner: Member
  comments: (TaskComment & { author: Member })[]
  attachments?: TaskAttachment[]
}

interface PersonalBoardProps {
  currentUser: Member
  myTasks: TaskWithRelations[]
  allTasks: Task[]
  members: Member[]
  slaConfig: SLAConfig
  today: Date
}

export function PersonalBoard({ currentUser, myTasks, allTasks, members, slaConfig, today }: PersonalBoardProps) {
  const selectedTaskId = useUIStore(s => s.selectedTaskId)
  const selectTask     = useUIStore(s => s.selectTask)

  const hour      = today.getHours()
  const greeting  = getGreeting(hour)
  const firstName = currentUser.name.split(' ')[0]

  const activeTasks = useMemo(() => allTasks.filter(t => t.status !== 'publish'), [allTasks])

  // BigStat metrics
  const myDayCount = useMemo(() =>
    myTasks.filter(t => calDaysBetween(today, new Date(t.due_date)) <= 0).length,
  [myTasks, today])

  const upNextCount = useMemo(() => {
    return myTasks.filter(t => {
      const d = calDaysBetween(today, new Date(t.due_date))
      return d >= 1 && d <= 7
    }).length
  }, [myTasks, today])

  const slaIssueCount = useMemo(() =>
    myTasks.filter(t => {
      const s = getAlertStatus(t, slaConfig, today)
      return s === 'Overdue' || s === 'Stuck' || s === 'Will Miss' || s === 'At Risk'
    }).length,
  [myTasks, slaConfig, today])

  const publishedCount = useMemo(() =>
    allTasks.filter(t => t.status === 'publish').length,
  [allTasks])

  // Capacity
  const hoursUsed = useMemo(() =>
    myTasks.reduce((sum, t) => sum + (t.hours_estimate ?? 0), 0),
  [myTasks])

  const bigStats: BigStatMetric[] = [
    { label: '☀️ My Day',      value: myDayCount,     sub: 'Due today',    theme: 'accent'  },
    { label: '📅 Up Next',     value: upNextCount,    sub: 'This week',    theme: 'default' },
    { label: '⚠️ SLA Issues',  value: slaIssueCount,  sub: 'At risk+',     theme: 'danger'  },
    { label: '✅ Published',   value: publishedCount, sub: 'All time',     theme: 'lime'    },
  ]

  // Active task count per member for the team digest
  const memberTaskCount = useMemo(() => {
    const counts: Record<string, number> = {}
    members.forEach(m => { counts[m.id] = 0 })
    activeTasks.forEach(t => {
      // Working stage: count for task owner
      const meta = STAGE_META[t.status]
      if (!meta) return
      if (!meta.owner_role) {
        if (counts[t.task_owner_id] !== undefined) counts[t.task_owner_id]++
      } else {
        // Review stage: count for the member with matching role
        const roleOwner = members.find(m => m.role === meta.owner_role)
        if (roleOwner && counts[roleOwner.id] !== undefined) counts[roleOwner.id]++
      }
    })
    return counts
  }, [activeTasks, members])

  // Selected task for modal
  const selectedTask = selectedTaskId
    ? myTasks.find(t => t.id === selectedTaskId) ?? null
    : null

  const isAdmin = currentUser.access === 'admin'

  return (
    <div style={{ overflowY: 'auto', height: '100%', background: '#F6F6F4' }}>
      <div style={{ maxWidth: 1060, margin: '0 auto', padding: '36px 40px 48px' }}>

        {/* Greeting header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
          <div>
            <h1 style={{
              fontFamily: 'var(--font-heading)', fontWeight: 800,
              fontSize: '1.7rem', color: 'var(--ink)', margin: 0,
            }}>
              Good {greeting}, {firstName} 👋
            </h1>
            <p style={{ fontSize: '0.9rem', color: 'var(--muted)', margin: '6px 0 0' }}>
              {today.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
            </p>
          </div>
        </div>

        {/* Profile strip */}
        <ProfileStrip member={currentUser} />

        {/* 4 BigStat cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 14, marginBottom: 18 }}>
          {bigStats.map(m => <BigStat key={m.label} metric={m} />)}
        </div>

        {/* Capacity bar */}
        <div style={{ marginBottom: 18 }}>
          <CapacityBar hoursUsed={hoursUsed} hoursTotal={currentUser.capacity_hrs_wk} />
        </div>

        {/* My Day + Up Next panels */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20 }}>
          <TaskPanel
            title="My Day"
            variant="my-day"
            tasks={myTasks}
            slaConfig={slaConfig}
            today={today}
            accentColor="#6E5BE6"
          />
          <TaskPanel
            title="Up Next"
            variant="up-next"
            tasks={myTasks}
            slaConfig={slaConfig}
            today={today}
            accentColor="#D18A15"
          />
        </div>

        {/* Team Digest */}
        <div style={{
          background: '#fff', border: '1px solid var(--line)',
          boxShadow: '0 1px 3px rgba(28,24,54,.04)',
          borderRadius: 18, padding: '20px 22px',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--muted)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
              <circle cx="9" cy="7" r="4" />
              <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
              <path d="M16 3.13a4 4 0 0 1 0 7.75" />
            </svg>
            <span style={{ fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--muted)' }}>
              Team Overview ({members.length})
            </span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))', gap: 12 }}>
            {members.map(m => (
              <MemberCard
                key={m.id}
                member={m}
                activeTaskCount={memberTaskCount[m.id] ?? 0}
                isAdminViewer={isAdmin}
              />
            ))}
          </div>
        </div>

      </div>

      {/* Task modal — opens when a TaskRow is clicked */}
      {selectedTask && (
        <TaskModal
          task={selectedTask}
          currentUser={currentUser}
          stages={[]}
          slaConfig={slaConfig}
          today={today}
          onClose={() => selectTask(null)}
        />
      )}
    </div>
  )
}
