'use client'

import { useMemo } from 'react'
import type { Task, Member, SLAConfig, Brand, TaskComment, TaskAttachment, BigStatMetric } from '@/types/index'
import { STAGE_META } from '@/lib/stage-meta'
import { getAlertStatus } from '@/lib/alert-status'
import { calDaysBetween, getGreeting } from '@/lib/utils'
import { useUIStore } from '@/store/useUIStore'
import { useTranslations } from 'next-intl'
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
  const t              = useTranslations('greeting')
  const tOv            = useTranslations('overview')

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
    { label: tOv('myDay'),      value: myDayCount,     sub: tOv('dueToday'),  theme: 'accent'  },
    { label: tOv('upNext'),     value: upNextCount,    sub: tOv('thisWeek'),  theme: 'default' },
    { label: tOv('slaIssues'),  value: slaIssueCount,  sub: tOv('atRiskPlus'), theme: 'danger'  },
    { label: tOv('published'),  value: publishedCount, sub: tOv('allTime'),   theme: 'lime'    },
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

        {/* Page identity badge */}
        <div style={{ marginBottom: '12px' }}>
          <span
            style={{
              fontSize: '0.6rem',
              fontWeight: 700,
              letterSpacing: '0.14em',
              textTransform: 'uppercase',
              color: 'var(--muted)',
              background: '#EDEDEA',
              padding: '3px 10px',
              borderRadius: '99px',
            }}
          >
            Personal Command Center
          </span>
        </div>

        {/* Greeting header */}
        <div style={{ marginBottom: '28px' }}>
          <h1
            style={{
              fontFamily: 'var(--font-heading)',
              fontWeight: 800,
              fontSize: '1.7rem',
              color: 'var(--ink)',
              margin: 0,
            }}
          >
            {t(greeting)}, {firstName} 👋
          </h1>
          <p style={{ fontSize: '0.9rem', color: 'var(--muted)', margin: '6px 0 0' }}>
            {today.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
          </p>
        </div>

        {/* Admin: Profile card + Team grid */}
        {isAdmin && (
          <>
            <ProfileStrip member={currentUser} hoursUsed={hoursUsed} />

            <div style={{
              background: '#fff', border: '1px solid var(--line)',
              borderRadius: '18px', padding: '20px 22px',
              marginBottom: '20px',
            }}>
              <div style={{ fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--muted)', marginBottom: '14px' }}>
                Team ({members.length})
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
          </>
        )}

        {/* 4 BigStat cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 14, marginBottom: 18 }}>
          {bigStats.map(m => <BigStat key={m.label} metric={m} />)}
        </div>

        {/* Capacity bar */}
        <div style={{ marginBottom: '18px' }}>
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

        {/* Team Digest — non-admin also sees a lighter overview */}
        <div style={{
          background: '#fff', border: '1px solid var(--line)',
          boxShadow: '0 1px 3px rgba(28,24,54,.04)',
          borderRadius: 18, padding: '20px 22px',
        }}>
          <div style={{ fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--muted)', marginBottom: '14px' }}>
            {tOv('teamOverview')} ({members.length})
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

      {/* Task modal */}
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
