// Momentum CRM Core — complete type surface
// data-model.md §TypeScript Types

// ─── Primitive aliases ─────────────────────────────────────────────────────

export type StageId =
  | 'todo'          // To Do
  | 'c-prog'        // Writing
  | 'c-final'       // Content Review
  | 'c-check'       // Islam Check (9-stage only)
  | 'r-design'      // Ready to Design
  | 'd-prog'        // Designing
  | 'd-check'       // Design Review
  | 'final-check'   // Final Check
  | 'ready-publish' // Ready to Publish
  | 'scheduled'     // Scheduled
  | 'publish'       // Published (terminal)

export type AccessLevel = 'admin' | 'superuser' | 'user'
export type AlertStatus = 'On Track' | 'At Risk' | 'Will Miss' | 'Stuck' | 'Idle' | 'Overdue'
export type Priority = 'Low' | 'Medium' | 'High'

// ─── Core entities ─────────────────────────────────────────────────────────

export interface Member {
  id: string
  name: string
  email: string
  role: string
  access: AccessLevel
  capacity_hrs_wk: number
  status: 'Available' | 'Busy'
  color?: string
  avatar_url?: string
  /**
   * Whether this account can sign in at all. Never the hash itself — only
   * whether one exists. Set on the Settings page, which is admin-only.
   */
  has_password?: boolean
  /** Matches a SeniorityLevel key. Optional so older callers still compile. */
  seniority?: string
}

export interface Brand {
  id: string
  name: string
  color: string
  logo_url?: string
  description?: string
}

export interface ContentType {
  id: string
  label: string
}

export interface Stage {
  id: StageId
  label_en: string
  label_ar: string
  phase: 'Intake' | 'Content' | 'Design' | 'Ship'
  owner_role: string | null
  terminal_flag: boolean
  sort_order: number
}

export interface SLAConfig {
  [stageId: string]: {
    [contentTypeLabel: string]: number
  }
}

export interface Task {
  id: string
  name: string
  description?: string
  brand_id: string
  brand?: Brand
  content_type_label: string
  platform?: string
  campaign?: string
  task_owner_id: string
  /** Who is doing the work. Null when nobody has picked it up. */
  assignee_id?: string | null
  assignee?: Member
  task_owner?: Member
  initiator_role: string
  nine_stage: boolean
  status: StageId
  stage_date: string
  due_date: string | null
  hours_estimate: number
  cover_image_url?: string
  /** Auto-preview of the newest uploaded image. Not a user field. */
  cover_thumb?: string
  priority: Priority
  created_by?: string
  created_at: string
  updated_at: string
  parent_task_id?: string | null
  parent?: { id: string; name: string } | null
  subtasks?: { id: string; name: string; status: StageId }[]
  comments?: TaskComment[]
  attachments?: TaskAttachment[]
}

export interface TaskComment {
  id: string
  task_id: string
  author_id: string
  author?: Member
  body: string
  /** Member ids named with @ in the body. */
  mentions?: string[]
  created_at: string
}

export interface TaskAttachment {
  id: string
  task_id: string
  filename: string
  /** A link to a file living elsewhere — every imported ClickUp row. */
  url?: string
  /**
   * A file uploaded here, inlined as a data URL. Absent on the board, which
   * reads every task and cannot afford to carry these; the task panel loads
   * them for its own task. See the model comment in schema.prisma.
   */
  data?: string
  uploaded_by?: string
  uploaded_at: string
}

// ─── Derived / UI types ────────────────────────────────────────────────────

export interface PanelTask {
  task: Task
  alertStatus: AlertStatus
}

export interface BigStatMetric {
  label: string
  value: number | string
  sub?: string
  theme: 'danger' | 'accent' | 'lime' | 'default'
}

export interface StageMeta {
  id: StageId
  label_en: string
  label_ar: string
  phase: string
  color: string
  owner_role: string | null
  terminal_flag: boolean
}

export interface CelebrationPayload {
  taskName: string
  stageLabel: string
}

export interface UIStore {
  celebration: CelebrationPayload | null
  selectedTaskId: string | null
  showTaskForm: boolean
  profileOpen: boolean

  setCelebration: (payload: CelebrationPayload | null) => void
  selectTask: (id: string | null) => void
  setShowTaskForm: (show: boolean) => void
  setProfileOpen: (open: boolean) => void
}

export interface MoveTaskResult {
  success: boolean
  shouldCelebrate: boolean
  error?: string
}

export interface WorkspaceSettings {
  id: number
  capacity_hrs_per_wk: number
  nine_stage_default: boolean
  updated_at: string
}
