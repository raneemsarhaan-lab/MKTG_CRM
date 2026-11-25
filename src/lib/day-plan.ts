/**
 * Laying out a working day.
 *
 * Takes the tasks somebody owns and fills their working hours with them,
 * earliest deadline first, breaking for a rest when a focus block is up and
 * flowing around anything already in the diary.
 *
 * Pure on purpose: no React, no Prisma, no clock of its own. `now` and the
 * task list are handed in, so the same input always gives the same day and the
 * whole thing can be reasoned about without a browser.
 */

export interface PlanTask {
  id:    string
  name:  string
  /** How long the work takes. Zero means nobody has estimated it yet. */
  mins:  number
  /** Days from today — negative is overdue, null is undated. */
  due:   number | null
  /** Ordering hint inside a deadline. */
  priority?: 'High' | 'Medium' | 'Low'
  /** True when `mins` is a default rather than somebody's estimate. */
  assumed?: boolean
}

export interface Held {
  name: string
  /** Minutes from midnight. */
  from: number
  to:   number
}

export interface DaySettings {
  /** Minutes from midnight. */
  dayStart: number
  dayEnd:   number
  /** How long to work before a break is due. */
  focus:    number
  /** How long that break lasts. */
  rest:     number
  /**
   * Refuse to cut a task into a piece smaller than MIN_CHUNK.
   *
   * On, the day breaks early or sits out the gap before a meeting rather than
   * handing you eight minutes of something. Off, every remaining minute gets
   * filled, which is denser and more fragmented.
   */
  minChunk: boolean
  /**
   * Let work with no due date drift towards the front as it gets older.
   *
   * On, an undated task enters the queue as though it were due AGE_FROM days
   * out, so it eventually competes with dated work. Off, undated work sits
   * behind everything with a date — which in a backlog nobody empties means
   * it is never done.
   */
  ageUndated: boolean
  /** Plan around anything already in today's diary rather than through it. */
  holdMeetings: boolean
}

export type SlotKind = 'work' | 'rest' | 'held'

export interface Slot {
  kind: SlotKind
  name: string
  from: number
  to:   number
  taskId?: string
  /** A later piece of a task that was split. */
  cont?: boolean
  late?: boolean
  due?:  number | null
  assumed?: boolean
}

export const DEFAULTS: DaySettings = {
  dayStart: 9 * 60, dayEnd: 17 * 60 + 30, focus: 120, rest: 30,
  minChunk: true, ageUndated: true, holdMeetings: true,
}

/** Below this, splitting produces a fragment not worth having. */
export const MIN_CHUNK = 15

/** What a task with no estimate is assumed to take. */
export const ASSUMED_MINS = 60

const RANK: Record<string, number> = { High: 0, Medium: 1, Low: 2 }

/** An undated task starts three weeks out and walks towards the present. */
const AGE_FROM = 21

/** Where undated work sits when it is not allowed to age: after everything. */
const NEVER = 3650

export const hhmm = (m: number) =>
  `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(Math.round(m) % 60).padStart(2, '0')}`

export const durLabel = (m: number) =>
  m >= 60 ? `${Math.floor(m / 60)}h${m % 60 ? String(m % 60).padStart(2, '0') : ''}` : `${m}m`

/**
 * Order the work.
 *
 * Earliest deadline first, priority inside a deadline, then the order it came
 * in. Undated work is not parked behind everything dated by default — it ages
 * towards the front instead, because in a backlog where nothing is ever
 * finished "last" means "never". Turn `ageUndated` off to park it anyway.
 */
export function orderTasks(tasks: PlanTask[], ageUndated = true): PlanTask[] {
  return tasks
    .map((t, i) => ({
      t,
      key: t.due ?? (ageUndated ? AGE_FROM : NEVER),
      rank: RANK[t.priority ?? 'Medium'] ?? 1,
      seq: i,
    }))
    .sort((a, b) => a.key - b.key || a.rank - b.rank || a.seq - b.seq)
    .map(x => x.t)
}

/**
 * Lay out one day.
 *
 * `now` is minutes from midnight; today's plan starts from it rather than from
 * the top of the working day, so the answer to "what should I be doing" is
 * always about the time that is left.
 */
export function planDay(
  tasks: PlanTask[],
  settings: DaySettings,
  now: number,
  held: Held[] = [],
): Slot[] {
  const s = settings
  if (s.dayEnd <= s.dayStart) return []

  const queue = orderTasks(tasks, s.ageUndated !== false)
    .map(t => ({ ...t, left: t.mins > 0 ? t.mins : ASSUMED_MINS, assumed: t.mins <= 0 }))
    .filter(t => t.left > 0)

  // Below this, splitting produces a fragment not worth having — unless the
  // reader has said they would rather have the fragment.
  const floor = s.minChunk === false ? 0 : MIN_CHUNK

  const slots: Slot[] = []
  const diary = (s.holdMeetings === false ? [] : held)
    .filter(h => h.to > Math.max(s.dayStart, now) && h.from < s.dayEnd)
    .sort((a, b) => a.from - b.from)

  // Round up to the next five minutes: a plan that starts at 10:27 reads as
  // though it were measured with a stopwatch.
  let cursor = Math.max(s.dayStart, Math.ceil(now / 5) * 5)
  let sinceRest = 0
  let guard = 0

  /**
   * Where a break starting now would end.
   *
   * Clamped by the next thing in the diary as well as by the end of the day.
   * Without that clamp a break falling due at 10:40 ran its full half hour
   * straight over an 11:00 meeting and swallowed it — the meeting was in the
   * diary, was never planned around, and simply did not appear in the day.
   */
  const restEnd = (from: number) => {
    const meeting = diary.find(h => h.from > from)
    return Math.min(from + s.rest, s.dayEnd, meeting ? meeting.from : Infinity)
  }

  while (cursor < s.dayEnd && guard++ < 500) {
    const next = diary.find(h => h.to > cursor)

    if (next && next.from <= cursor) {
      const to = Math.min(next.to, s.dayEnd)
      slots.push({ kind: 'held', name: next.name, from: cursor, to })
      cursor = to
      sinceRest = 0
      diary.splice(diary.indexOf(next), 1)
      continue
    }

    const task = queue.find(t => t.left > 0)
    if (!task) break

    const untilRest  = s.focus - sinceRest
    const untilHeld  = next ? next.from - cursor : Infinity
    const untilClose = s.dayEnd - cursor
    const room = Math.min(untilRest, untilHeld, untilClose)

    if (room <= 0) {
      const to = restEnd(cursor)
      slots.push({ kind: 'rest', name: 'Break', from: cursor, to })
      cursor = to
      sinceRest = 0
      continue
    }

    // Splitting here would leave a sliver. Take the break early instead, or
    // sit out the gap before a meeting, rather than cutting a task in two for
    // the sake of ten minutes.
    if (task.left > room && room < floor) {
      if (untilRest <= untilHeld && untilRest <= untilClose) {
        const to = restEnd(cursor)
        slots.push({ kind: 'rest', name: 'Break', from: cursor, to })
        cursor = to
        sinceRest = 0
      } else {
        cursor += room
      }
      continue
    }

    const take = Math.min(task.left, room)
    const started = task.left < (task.mins > 0 ? task.mins : ASSUMED_MINS)
    slots.push({
      kind: 'work', name: task.name, from: cursor, to: cursor + take,
      taskId: task.id, cont: started, late: task.due !== null && task.due < 0,
      due: task.due, assumed: task.assumed,
    })
    task.left -= take
    cursor    += take
    sinceRest += take

    // A break is due — unless the diary already claims this minute, in which
    // case the meeting is the break. Placing one here would draw over it, and
    // the top of the loop resets the focus clock for a meeting anyway.
    const claimed = diary.some(h => h.from <= cursor && h.to > cursor)

    if (sinceRest >= s.focus && !claimed && queue.some(t => t.left > 0) && cursor < s.dayEnd) {
      const to = restEnd(cursor)
      slots.push({ kind: 'rest', name: 'Break', from: cursor, to })
      cursor = to
      sinceRest = 0
    }
  }

  return slots
}

/**
 * What the header should say about right now.
 *
 * There are four answers, and an earlier version of this collapsed three of
 * them into "outside your working hours" — which was simply wrong at 10:27 on
 * a day whose first slot began at 10:30. Being between slots is not the same
 * as being off the clock.
 */
export function rightNow(slots: Slot[], now: number, s: DaySettings): {
  state: 'in' | 'gap' | 'before' | 'after' | 'empty'
  slot?: Slot
  next?: Slot
} {
  const slot = slots.find(x => now >= x.from && now < x.to)
  if (slot) return { state: 'in', slot }

  const next = slots.find(x => x.from > now)
  if (now < s.dayStart) return { state: 'before', next }
  if (now >= s.dayEnd)  return { state: 'after' }
  if (next)             return { state: 'gap', next }
  return { state: 'empty' }
}
