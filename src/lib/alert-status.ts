// Alert status computation — pure function, called at render time
// research.md Decision 1, spec.md FR-023, FR-025
// Never stored in DB; recomputed on every render from live data.

import type { Task, SLAConfig, AlertStatus } from '@/types/index'
import { businessDaysBetween, calDaysBetween } from '@/lib/utils'

/**
 * Compute alert status for a task.
 *
 * Priority order (first matching wins):
 *   1. Overdue  — calendar due_date has passed (calDays < 0)
 *   2. Stuck    — business days in stage > SLA + 2 grace days
 *   3. Will Miss — business days in stage > SLA limit
 *   4. At Risk  — business days in stage === SLA limit
 *   5. Idle     — task has not moved in 2+ calendar days and stageDays === 0
 *   6. On Track — default
 */
export function getAlertStatus(
  task: Task,
  slaConfig: SLAConfig,
  today: Date
): AlertStatus {
  const stageDate = new Date(task.stage_date)

  const stageDays = businessDaysBetween(stageDate, today)
  const slaLimit  = slaConfig[task.status]?.[task.content_type_label] ?? 1

  // Imported tasks may have no deadline. Absent a due date nothing can be
  // overdue, but time-in-stage still measures against the SLA.
  if (task.due_date) {
    const calDaysToDeadline = calDaysBetween(today, new Date(task.due_date))
    if (calDaysToDeadline < 0) return 'Overdue'
  }
  if (stageDays > slaLimit + 2) return 'Stuck'
  if (stageDays > slaLimit) return 'Will Miss'
  if (stageDays === slaLimit) return 'At Risk'

  // Idle: has been sitting in stage for 2+ calendar days but counted 0 business days
  // (e.g., started on Friday, no action over the weekend)
  const calDaysInStage = calDaysBetween(stageDate, today)
  if (calDaysInStage >= 2 && stageDays === 0) return 'Idle'

  return 'On Track'
}
