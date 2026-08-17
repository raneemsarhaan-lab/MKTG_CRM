'use client'

import { GreetingHeader } from './GreetingHeader'
import { StatCards } from './StatCards'
import { BoardTaskPanel, type PanelTask } from './BoardTaskPanel'
import { SlaBreachedPanel, type BreachRow } from './SlaBreachedPanel'
import { MotivationBanner } from './MotivationBanner'
import { MyDayTimeline } from '@/components/overview/MyDayTimeline'
import type { PlanTask } from '@/lib/day-plan'

/**
 * My Board — developer handoff, whole screen.
 *
 * Section stack (§1.4): header 26px → stats 22px → panels 18px → SLA 18px →
 * banner. Main content padding is 36px 44px 44px and is applied here rather
 * than in AppShell, since the other screens do not share it.
 */

export interface MyBoardProps {
  firstName: string
  stats: {
    today:             number
    week:              number
    breached:          number
    completedThisWeek: number
  }
  /** Today's work, ready for the planner to lay across the working hours. */
  myDayPlan: PlanTask[]
  thisWeek:  PanelTask[]
  breaches: BreachRow[]
}

export function MyBoard({ firstName, stats, myDayPlan, thisWeek, breaches }: MyBoardProps) {
  return (
    <div className="fx-myboard" style={{ padding: '36px 44px 44px' }}>
      <GreetingHeader firstName={firstName} />

      <StatCards
        today={stats.today}
        week={stats.week}
        breached={stats.breached}
        completedThisWeek={stats.completedThisWeek}
      />

      <div className="fx-panel-grid" style={{
        display: 'grid',
        gridTemplateColumns: 'minmax(0, 1.45fr) minmax(0, 1fr)',
        gap: 16,
        marginBottom: 18,
      }}>
        {/* My Day is the working hours laid out rather than a list of what is
            late. This Week beside it stays a list — the week ahead is
            something you read, not something you are standing in. */}
        <MyDayTimeline tasks={myDayPlan} accentColor="#6E5BE6" />

        <BoardTaskPanel
          title="This Week"
          emoji="📅"
          accent="var(--amber-accent-2)"
          badgeBg="var(--amber-badge)"
          badgeText="var(--amber-label)"
          tasks={thisWeek}
          emptyCopy="Clear week ahead ✨"
          ornament={
            /* 34×50 violet lightning bolt, behind the content (§6) */
            <svg viewBox="0 0 40 60" aria-hidden="true" style={{
              position: 'absolute', right: 14, bottom: 14,
              width: 34, height: 50, opacity: 0.85, zIndex: 0,
            }}>
              <path d="M22 2 L8 34 L18 34 L14 58 L34 26 L22 26 Z" fill="var(--bolt-violet)" />
            </svg>
          }
        />
      </div>

      <SlaBreachedPanel rows={breaches} />

      <MotivationBanner />
    </div>
  )
}
