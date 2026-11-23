/**
 * Status groups (spec 023 US3, research R5): ClickUp's four groups over
 * Momentum's pipeline, for filters, list grouping and reports. Space stages
 * belong to their original stage's group. Pure.
 */
import type { StageId } from '@/types/index'

export type StatusGroup = 'not_started' | 'active' | 'done' | 'closed'
export const STATUS_GROUPS: StatusGroup[] = ['not_started', 'active', 'done', 'closed']

const GROUP: Record<StageId, StatusGroup> = {
  'todo': 'not_started',
  'c-prog': 'active', 'c-final': 'active', 'c-check': 'active',
  'r-design': 'active', 'd-prog': 'active', 'd-check': 'active', 'final-check': 'active',
  'ready-publish': 'done', 'scheduled': 'done',
  'publish': 'closed',
}

export const statusGroupOf = (stage: string): StatusGroup => GROUP[stage as StageId] ?? 'active'
