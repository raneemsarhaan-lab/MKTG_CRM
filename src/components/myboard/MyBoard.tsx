'use client'

import { GreetingHeader } from './GreetingHeader'
import { StatCards } from './StatCards'
import { ScopeToggle } from './ScopeToggle'
import { BoardTaskPanel, type PanelTask } from './BoardTaskPanel'
import { SlaBreachedPanel, type BreachRow } from './SlaBreachedPanel'
import { MotivationBanner } from './MotivationBanner'
import { MyDayTimeline } from '@/components/overview/MyDayTimeline'
import { PANEL_ROWS, COLUMN_ROWS } from '@/lib/myboard'
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
  /** Whether to offer the Mine / Team switch at all. Admins only. */
  canSeeTeam: boolean
  /** Whether the data below is the whole team's rather than the reader's. */
  teamView:   boolean
  stats: {
    today:             number
    week:              number
    breached:          number
    completedThisWeek: number
  }
  /** Today's work, ready for the planner to lay across the working hours. */
  myDayPlan: PlanTask[]
  /** The same work as a plain list — the team view's stand-in for the planner. */
  today:     PanelTask[]
  thisWeek:  PanelTask[]
  /** The week just gone: what shipped, and what was due and did not. */
  lastWeek:  PanelTask[]
  /** "Aug 23 – 29" — the dates each week panel covers, named on the panel. */
  thisWeekSpan: string
  lastWeekSpan: string
  breaches: BreachRow[]
}

export function MyBoard({
  firstName, canSeeTeam, teamView, stats, myDayPlan, today, thisWeek, lastWeek,
  thisWeekSpan, lastWeekSpan, breaches,
}: MyBoardProps) {
  return (
    <div className="fx-myboard" style={{ padding: '36px 44px 44px' }}>
      <GreetingHeader
        firstName={firstName}
        toggle={canSeeTeam ? <ScopeToggle teamView={teamView} /> : undefined}
      />

      <StatCards
        today={stats.today}
        week={stats.week}
        breached={stats.breached}
        completedThisWeek={stats.completedThisWeek}
        teamView={teamView}
      />

      <div className="fx-panel-grid" style={{
        display: 'grid',
        gridTemplateColumns: 'minmax(0, 1.45fr) minmax(0, 1fr)',
        gap: 16,
        marginBottom: 18,
      }}>
        {/* My Day is the working hours laid out rather than a list of what is
            late. The two weeks stack beside it as lists — a week is something
            you read, not something you are standing in.

            The planner only makes sense for one person's day: it lays tasks
            across *your* working hours. In the team view it becomes a list,
            because eight people's days do not fit on one clock. */}
        {teamView ? (
          <BoardTaskPanel
            title="Due Today"
            emoji="☀️"
            accent="var(--violet-link)"
            badgeBg="var(--violet-badge)"
            badgeText="var(--violet-label)"
            tasks={today}
            emptyCopy="Nothing due across the team 🎉"
            max={PANEL_ROWS}
          />
        ) : (
          <MyDayTimeline tasks={myDayPlan} accentColor="#6E5BE6" />
        )}

        {/* The two weeks share the right column, next week's work above the
            week just gone. Reading down the column is reading forwards in
            time from today, which is the order you think in. Both are auto
            height, so a quiet week takes the space it needs and no more. */}
        <div style={{ display: 'grid', gap: 16, alignContent: 'start' }}>
          <BoardTaskPanel
            title="This Week"
            emoji="📅"
            accent="var(--amber-accent-2)"
            badgeBg="var(--amber-badge)"
            badgeText="var(--amber-label)"
            tasks={thisWeek}
            subtitle={thisWeekSpan}
            emptyCopy="Nothing left due this week ✨"
            max={COLUMN_ROWS}
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

          {/* Last Week reads the other direction: what was due in it and is
              still open, then what actually shipped. */}
          <BoardTaskPanel
            title="Last Week"
            emoji="🗓️"
            accent="var(--green-accent)"
            badgeBg="var(--green-badge)"
            badgeText="var(--green-label)"
            tasks={lastWeek}
            subtitle={lastWeekSpan}
            emptyCopy="Nothing landed last week"
            showAdd={false}
            /* The page has already ordered these so both halves survive the cut. */
            max={COLUMN_ROWS}
          />
        </div>
      </div>

      <SlaBreachedPanel rows={breaches} />

      <MotivationBanner />
    </div>
  )
}
