// Stage pipeline metadata — the Islam Check config-flag module
// spec.md FR-005, research.md Decision 9, data-model.md §Stage Traversal
//
// ALL stage ordering logic lives here. No other file hardcodes pipeline sequences.
// The nine_stage boolean on each Task selects which path is used.

import type { StageId, StageMeta } from '@/types/index'
import { STAGE_COLORS } from '@/lib/tokens'

// ─── Ordered stage paths ──────────────────────────────────────────────────────

export const NINE_STAGE: StageId[] = [
  'todo', 'c-prog', 'c-final', 'c-check', 'r-design', 'd-prog', 'd-check', 'final-check', 'publish',
]

export const EIGHT_STAGE: StageId[] = [
  'todo', 'c-prog', 'c-final', 'r-design', 'd-prog', 'd-check', 'final-check', 'publish',
]

// ─── Stage metadata record ────────────────────────────────────────────────────
// Kept in sync with 005_seed.sql and constitution.md §II.
// English labels are canonical (spec.md FR-001, quickstart.md Scenario 3).

export const STAGE_META: Record<StageId, StageMeta> = {
  'todo': {
    id: 'todo',
    label_en: 'To Do',
    label_ar: 'افكار للتنفيذ',
    phase: 'Intake',
    color: STAGE_COLORS['todo'],
    owner_role: null,
    terminal_flag: false,
  },
  'c-prog': {
    id: 'c-prog',
    label_en: 'C-In Progress',
    label_ar: 'كتابة المحتوى',
    phase: 'Content',
    color: STAGE_COLORS['c-prog'],
    owner_role: null,
    terminal_flag: false,
  },
  'c-final': {
    id: 'c-final',
    label_en: 'C-Review',
    label_ar: 'مراجعة المحتوى',
    phase: 'Content',
    color: STAGE_COLORS['c-final'],
    owner_role: 'Marketing Manager',
    terminal_flag: false,
  },
  'c-check': {
    id: 'c-check',
    label_en: 'C-Check',
    label_ar: 'موافقة نهائية على المحتوى',
    phase: 'Content',
    color: STAGE_COLORS['c-check'],
    owner_role: 'Managing Director',
    terminal_flag: false,
  },
  'r-design': {
    id: 'r-design',
    label_en: 'Ready For Design',
    label_ar: 'جاهز للتصميم',
    phase: 'Design',
    color: STAGE_COLORS['r-design'],
    owner_role: null,
    terminal_flag: false,
  },
  'd-prog': {
    id: 'd-prog',
    label_en: 'D-In Progress',
    label_ar: 'تصميم',
    phase: 'Design',
    color: STAGE_COLORS['d-prog'],
    owner_role: null,
    terminal_flag: false,
  },
  'd-check': {
    id: 'd-check',
    label_en: 'D-Check',
    label_ar: 'مراجعة التصميم',
    phase: 'Design',
    color: STAGE_COLORS['d-check'],
    owner_role: 'Brand Director',
    terminal_flag: false,
  },
  'final-check': {
    id: 'final-check',
    label_en: 'F-Check',
    label_ar: 'المراجعة النهائية',
    phase: 'Ship',
    color: STAGE_COLORS['final-check'],
    owner_role: 'Marketing Manager',
    terminal_flag: false,
  },
  'publish': {
    id: 'publish',
    label_en: 'Published',
    label_ar: 'تم النشر',
    phase: 'Ship',
    color: STAGE_COLORS['publish'],
    owner_role: null,
    terminal_flag: true,
  },
}

// ─── Pipeline helpers ─────────────────────────────────────────────────────────

/**
 * Return the next stage ID given the current stage and the nine_stage flag.
 * Returns null when at the terminal stage (publish) or if current is unknown.
 *
 * Verification:
 *   nextStageId('c-final', false) === 'r-design'  (8-stage skips c-check)
 *   nextStageId('c-final', true)  === 'c-check'   (9-stage includes Islam Check)
 *   nextStageId('publish', true)  === null         (terminal)
 */
export function nextStageId(current: StageId, nineStage: boolean): StageId | null {
  const path = nineStage ? NINE_STAGE : EIGHT_STAGE
  const idx = path.indexOf(current)
  if (idx === -1 || idx === path.length - 1) return null
  return path[idx + 1]
}

/** True for stages where the task owner (not a role) drives progress. */
export function isWorkingStage(stageId: StageId): boolean {
  return !STAGE_META[stageId].owner_role && !STAGE_META[stageId].terminal_flag
}

/** Ordered list of all stage IDs by sort_order. */
export const ALL_STAGES: StageId[] = [
  'todo', 'c-prog', 'c-final', 'c-check', 'r-design', 'd-prog', 'd-check', 'final-check', 'publish',
]
