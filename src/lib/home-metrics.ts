import type { AlertStatus, SLAConfig, StageId, Task } from '@/types/index'
import { STAGE_META } from '@/lib/stage-meta'
import { calDaysBetween } from '@/lib/utils'

/**
 * The numbers behind the hero cards.
 *
 * Every one is derived from tasks already loaded on the board — no extra
 * queries, and nothing invented. Where the handoff's mock shows a figure this
 * product does not record, the definition below says exactly what was
 * substituted rather than approximating the mock's value.
 */

/** Monday of the week containing `d`, at midnight. */
export function startOfWeek(d: Date): Date {
  const s = new Date(d)
  s.setHours(0, 0, 0, 0)
  const dow = (s.getDay() + 6) % 7   // Monday = 0
  s.setDate(s.getDate() - dow)
  return s
}

export function addDays(d: Date, n: number): Date {
  const x = new Date(d)
  x.setDate(x.getDate() + n)
  return x
}

function inRange(iso: string | null | undefined, from: Date, to: Date): boolean {
  if (!iso) return false
  const t = new Date(iso).getTime()
  return t >= from.getTime() && t < to.getTime()
}

const WORKING_STAGES: StageId[] = ['todo', 'c-prog', 'r-design', 'd-prog', 'ready-publish', 'scheduled']
const REVIEW_STAGES:  StageId[] = ['c-final', 'c-check', 'd-check', 'final-check']

/**
 * Week Momentum — how much of the week's work is finished.
 *
 * pct = tasks finished this week ÷ (tasks finished this week + tasks still
 * open that were due this week). A week with nothing planned and nothing done
 * is 0%, not 100% — an empty week is not a perfect one.
 *
 * `delta` is this week's percentage against the same measure for last week, in
 * percentage points. It is real: `stage_date` records when a task entered its
 * current stage, so a task sitting in `publish` carries the day it was
 * published.
 */
export function weekMomentum(tasks: Task[], today: Date): {
  pct: number
  completed: number
  planned: number
  delta: number
} {
  const thisFrom = startOfWeek(today)
  const thisTo   = addDays(thisFrom, 7)
  const lastFrom = addDays(thisFrom, -7)

  const pctFor = (from: Date, to: Date) => {
    const done = tasks.filter(t => t.status === 'publish' && inRange(t.stage_date, from, to))
    const open = tasks.filter(t => t.status !== 'publish' && inRange(t.due_date, from, to))
    const total = done.length + open.length
    return {
      pct: total === 0 ? 0 : Math.round((done.length / total) * 100),
      completed: done.length,
      planned: total,
    }
  }

  const now  = pctFor(thisFrom, thisTo)
  const prev = pctFor(lastFrom, thisFrom)
  return { ...now, delta: now.pct - prev.pct }
}

/**
 * The four stat boxes.
 *
 * Completed is scoped to this week — it is the counterpart to the momentum
 * figure above it. The other three are current standings, which is what makes
 * "Published" a larger number than "Completed" rather than a contradiction.
 */
export function statCounts(tasks: Task[], today: Date): {
  completed: number; inProgress: number; review: number; published: number
} {
  const from = startOfWeek(today)
  const to   = addDays(from, 7)
  return {
    completed:  tasks.filter(t => t.status === 'publish' && inRange(t.stage_date, from, to)).length,
    inProgress: tasks.filter(t => (WORKING_STAGES as string[]).includes(t.status)).length,
    review:     tasks.filter(t => (REVIEW_STAGES  as string[]).includes(t.status)).length,
    published:  tasks.filter(t => t.status === 'publish').length,
  }
}

export interface AttentionItem {
  id:      string
  title:   string
  due:     'today' | 'tomorrow' | 'overdue'
  dueText: string
  stage:   StageId
}

/**
 * Needs Your Attention — the user's own work that is due now or has slipped.
 *
 * Published tasks are excluded: a finished task cannot need attention, however
 * old its date.
 */
export function attentionItems(tasks: Task[], memberId: string, today: Date): AttentionItem[] {
  return tasks
    .filter(t => t.task_owner_id === memberId && t.status !== 'publish' && t.due_date)
    .map(t => {
      const days = calDaysBetween(today, new Date(t.due_date as string))
      return { t, days }
    })
    .filter(({ days }) => days <= 1)
    .sort((a, b) => a.days - b.days)
    .map(({ t, days }) => ({
      id:      t.id,
      title:   t.name,
      due:     days < 0 ? 'overdue' : days === 0 ? 'today' : 'tomorrow',
      dueText: days < 0 ? `${Math.abs(days)}d overdue` : days === 0 ? 'Due today' : 'Due tomorrow',
      stage:   t.status,
    }) as AttentionItem)
}

export interface ActivityItem {
  id:         string
  /** Whose avatar sits beside the line — always a person. */
  avatarName: string
  prefix:     string
  bold:       string
  suffix:     string
  target:     string
  at:         string
  taskId:     string
  dot:        string
}

/**
 * Activity — anything that happened on work the user owns, plus their own
 * comments elsewhere.
 *
 * Two sources, because those are the two this product actually records:
 * comments, and the moment a task entered its current stage. There is no
 * event log, so only the *current* stage entry is visible — an older move is
 * overwritten by a newer one rather than kept as history.
 */
export function activityItems(
  tasks: (Task & {
    task_owner?: { name: string }
    comments?: { id: string; body: string; created_at: string; author_id: string; author?: { name: string } }[]
  })[],
  memberId: string,
  limit = 4,
): ActivityItem[] {
  const items: ActivityItem[] = []

  for (const t of tasks) {
    const mine = t.task_owner_id === memberId

    for (const c of t.comments ?? []) {
      if (!mine && c.author_id !== memberId) continue
      const author = c.author?.name ?? 'Someone'
      items.push({
        id:         `c-${c.id}`,
        avatarName: author,
        prefix:     '',
        bold:       author,
        suffix:     'commented on',
        target:     t.name,
        at:         c.created_at,
        taskId:     t.id,
        dot:        '#2563EB',
      })
    }

    if (mine && t.stage_date) {
      // The avatar is the task's owner. Who performed the move is not
      // recorded — there is no event log — so the line names the stage rather
      // than claiming a person did it.
      items.push({
        id:         `s-${t.id}`,
        avatarName: t.task_owner?.name ?? 'Task',
        prefix:     t.status === 'publish' ? '' : 'Moved to',
        bold:       t.status === 'publish' ? 'Published' : STAGE_META[t.status].label_en,
        suffix:     '',
        target:     t.name,
        at:         t.stage_date,
        taskId:     t.id,
        dot:        t.status === 'publish' ? '#C9D633' : '#7C3AED',
      })
    }
  }

  return items
    .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
    .slice(0, limit)
}

/** "2m ago" · "3h ago" · "5d ago" — the activity feed's timestamp. */
export function timeAgo(iso: string, now: Date): string {
  const mins = Math.max(0, Math.round((now.getTime() - new Date(iso).getTime()) / 60000))
  if (mins < 1)    return 'just now'
  if (mins < 60)   return `${mins}m ago`
  const hrs = Math.round(mins / 60)
  if (hrs < 24)    return `${hrs}h ago`
  const days = Math.round(hrs / 24)
  if (days < 30)   return `${days}d ago`
  return `${Math.round(days / 30)}mo ago`
}

/**
 * Daily Spark — 30 quotes, one per day, rotating through the month.
 *
 * Indexed by day of month so everyone sees the same quote on the same day and
 * it changes at midnight without any stored state. Day 31 repeats day 1's,
 * which is the only way 30 quotes can cover a 31-day month.
 */
export const QUOTES: { text: string; author: string }[] = [
  { text: 'Creativity is intelligence having fun.',                                 author: 'Albert Einstein' },
  { text: 'Simplicity is the ultimate sophistication.',                             author: 'Leonardo da Vinci' },
  { text: 'Done is better than perfect.',                                           author: 'Sheryl Sandberg' },
  { text: 'The details are not the details. They make the design.',                 author: 'Charles Eames' },
  { text: 'You can’t use up creativity. The more you use, the more you have.', author: 'Maya Angelou' },
  { text: 'Have no fear of perfection — you’ll never reach it.',           author: 'Salvador Dalí' },
  { text: 'Design is not just what it looks like. Design is how it works.',         author: 'Steve Jobs' },
  { text: 'The best way out is always through.',                                    author: 'Robert Frost' },
  { text: 'Start where you are. Use what you have. Do what you can.',               author: 'Arthur Ashe' },
  { text: 'Content is fire. Social media is gasoline.',                             author: 'Jay Baer' },
  { text: 'Make it simple, but significant.',                                       author: 'Don Draper' },
  { text: 'Ideas are easy. Implementation is hard.',                                author: 'Guy Kawasaki' },
  { text: 'A goal without a plan is just a wish.',                                  author: 'Antoine de Saint-Exupéry' },
  { text: 'Quality is not an act, it is a habit.',                                  author: 'Aristotle' },
  { text: 'The secret of getting ahead is getting started.',                        author: 'Mark Twain' },
  { text: 'If you can’t explain it simply, you don’t understand it well enough.', author: 'Albert Einstein' },
  { text: 'Great things are done by a series of small things brought together.',    author: 'Vincent van Gogh' },
  { text: 'Marketing is no longer about the stuff you make, but the stories you tell.', author: 'Seth Godin' },
  { text: 'Perfection is achieved when there is nothing left to take away.',        author: 'Antoine de Saint-Exupéry' },
  { text: 'Amateurs sit and wait for inspiration. The rest of us just get up and go to work.', author: 'Stephen King' },
  { text: 'People do not buy goods and services. They buy relations and stories.',  author: 'Seth Godin' },
  { text: 'Well begun is half done.',                                               author: 'Aristotle' },
  { text: 'Creativity takes courage.',                                              author: 'Henri Matisse' },
  { text: 'The way to get started is to quit talking and begin doing.',             author: 'Walt Disney' },
  { text: 'Clarity beats persuasion.',                                              author: 'Ann Handley' },
  { text: 'Focus is about saying no.',                                              author: 'Steve Jobs' },
  { text: 'Everything is designed. Few things are designed well.',                  author: 'Brian Reed' },
  { text: 'Don’t find customers for your products. Find products for your customers.', author: 'Seth Godin' },
  { text: 'Action is the foundational key to all success.',                         author: 'Pablo Picasso' },
  { text: 'Small wins, every day.',                                                 author: 'Fluxo' },
]

export function quoteOfDay(date: Date): { text: string; author: string; index: number } {
  const index = (date.getDate() - 1) % QUOTES.length
  return { ...QUOTES[index], index }
}

/** The badge/dot colour used for a stage in the hero cards. */
export function stageTone(stage: StageId): string {
  return STAGE_META[stage].color
}

export type { AlertStatus, SLAConfig }
