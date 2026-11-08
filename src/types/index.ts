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

/** The board page's two views of the same tasks (spec 008). */
export type BoardView = 'board' | 'sheet' | 'content'
/** The Board page's tabs (spec 011): Pipeline holds Board and Sheet; Content is its own page. */
export type BoardTab = 'pipeline' | 'content'

// ─── Sheet columns (spec 010) ─────────────────────────────────────────────────

export type SheetId = 'content' | 'video'
export type ColumnKind = 'text' | 'number' | 'date' | 'link' | 'person' | 'choice' | 'checkbox'
export interface ChoiceOption { id: string; name: string; color: string }
/** One column of a sheet the team has shaped (data-model §1). */
export interface SheetColumnRecord {
  id: string
  sheet: SheetId
  /** A built-in key (status, fileName…) or c:<id>. */
  key: string
  name: string | null
  position: number
  width: number | null
  shownDefault: boolean
  shownIn: string[]
  kind: ColumnKind | null
  options: ChoiceOption[]
  updatedBy: string | null
  updatedByName: string | null
  updatedAt: string
}
/** Custom values: column id → task id → normalised value. */
export type SheetValues = Record<string, Record<string, string>>

// ─── Board Inbox (spec 006) ──────────────────────────────────────────────────

/** The Inbox panel's tabs, in order (FR-015). */
export type InboxTab = 'todo' | 'mentions' | 'team' | 'done'
/** Why one of your own tasks is in To do (FR-022). */
export type InboxReason = 'late' | 'today' | 'undated'

/** The signed-in member's Inbox records (data-model §2). Never another member's. */
export interface InboxState {
  /** Comment ids this member has read (mentions only). */
  readIds: string[]
  /** Live snoozes: task id → ISO time it comes back. */
  snoozes: Record<string, string>
  /** ISO. Mentions written before this minus 7 days count as read (R5). */
  since: string
  pinned: boolean
  showWeek: boolean
}
/** A theme's cadence period (spec 009). */
export type FrequencyPeriod = 'week' | 'month'
/** The team's fixed audience segments (spec 009). */
export type AudienceKey = 'c-level' | 'strategy-heads' | 'top-management' | 'second-line' | 'ceo-mid'
/** What a link attachment is for (spec 009). */
export type LinkRole = 'working_doc' | 'design'
/** The video sheet's column sets (spec 008 FR-050). */
export type SheetColumnSet = 'editing' | 'copy' | 'full'
/** Every column the video sheet can show, in display order. */
export type SheetColumn =
  | 'title' | 'clipNo' | 'type' | 'status' | 'editor' | 'source' | 'fileName'
  | 'in' | 'out' | 'length' | 'files' | 'published' | 'drop'
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
  /** The project this work serves — the container, not a label. */
  project_id?: string | null
  project?: { id: string; name: string } | null
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
  /** The plan step this task is the delivery of, when it is linked to one. */
  plan_step?: { id: string; name: string; projectId: string; projectName: string } | null
  parent_task_id?: string | null
  parent?: { id: string; name: string } | null
  subtasks?: { id: string; name: string; status: StageId; dropped_at?: string | null }[]
  comments?: TaskComment[]
  attachments?: TaskAttachment[]
  /** The live post's link (spec 008). */
  published_url?: string | null
  /** ISO time the clip was dropped; absent or null while live (spec 008). */
  dropped_at?: string | null
  /** Clip details, when this task is a clip with details (spec 008). */
  clip?: ClipDetails | null
  /** The pillar inside its theme (spec 009). */
  pillar_id?: string | null
  /** The social post's link (spec 009). */
  post_url?: string | null
}

/** A theme of the Content sheet: a project flagged as a content stream (spec 009). */
export interface ContentTheme {
  id: string
  name: string
  brand_id: string | null
  owner_id: string | null
  frequency_count: number | null
  frequency_period: FrequencyPeriod | null
  audience: AudienceKey[]
  pillars: { id: string; name: string; sort_order: number }[]
}

/** A clip's own details (spec 008 data-model §2). Length is out − in, never stored. */
export interface ClipDetails {
  clip_no: number | null
  source: string | null
  file_name: string | null
  in_ms: number | null
  out_ms: number | null
  video_id: string | null
  created_at?: string
}

export interface TaskComment {
  id: string
  task_id: string
  author_id: string
  author?: Member
  body: string
  /** Member ids named with @ in the body. */
  mentions?: string[]
  /** Task ids linked with # in the body. */
  task_refs?: string[]
  /** Spec 012: the top-level comment this replies to; null for a top-level comment. */
  parent_id?: string | null
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
  /** Bytes, for files uploaded to the bucket. Imports do not carry a size. */
  size_bytes?: number | null
  content_type?: string | null
  /** On a link attachment: working doc or design (spec 009). */
  link_role?: LinkRole | null
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

/**
 * An attachment delete waiting out its Undo window (spec 007, data-model
 * PendingDelete). Ephemeral: never persisted, and the timer that ends it lives
 * outside the store, in src/lib/pending-deletes.ts.
 */
export interface PendingDelete {
  attachment: TaskAttachment
  taskId: string
  /** When the delete is sent (ms since epoch). */
  deadline: number
  /** In the open panel (ghost tile), or after the panel closed (bottom message). */
  phase: 'in-panel' | 'after-close'
  label: 'deleted' | 'replaced'
  /** For "Replace it": the new file to delete if this one is restored. */
  pairedNewId?: string
}

export interface UIStore {
  celebration: CelebrationPayload | null
  selectedTaskId: string | null
  showTaskForm: boolean
  profileOpen: boolean
  /** Keyed by attachment id. */
  pendingDeletes: Record<string, PendingDelete>

  setCelebration: (payload: CelebrationPayload | null) => void
  selectTask: (id: string | null) => void
  setShowTaskForm: (show: boolean) => void
  setProfileOpen: (open: boolean) => void
  putPendingDelete: (entry: PendingDelete) => void
  dropPendingDelete: (attachmentId: string) => void
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

// ─── Spec 012: task notifications ────────────────────────────────────────────

/** What happened. The sentence is built at display time from these facts. */
export type NotificationKind =
  | 'comment' | 'reply' | 'attachment' | 'task_created_in_stage' | 'task_moved_to_stage'
  | 'assigned' | 'mention' | 'due_soon' | 'overdue'
export const NOTIFICATION_KINDS: NotificationKind[] = [
  'mention', 'assigned', 'comment', 'reply', 'attachment', 'task_created_in_stage', 'task_moved_to_stage', 'due_soon', 'overdue',
]
/** Where a member hears about it. */
export type NotificationChannel = 'in_app' | 'push' | 'email'
export type EmailMode = 'instant' | 'daily' | 'off'

export interface NotificationMeta {
  /** The task's name when the event happened, so a deleted task still reads. */
  task_name: string
  /** Up to 100 characters of the comment or reply. */
  snippet?: string
  /** Tasks added by one paste (Paste plan, Paste clips). */
  paste_count?: number
  due_date?: string
}

/** A notification as the browser sees it. */
export interface AppNotification {
  id: string
  kind: NotificationKind
  taskId: string | null
  commentId: string | null
  attachmentId: string | null
  stageId: string | null
  /** Newest first. */
  actorIds: string[]
  count: number
  meta: NotificationMeta
  read: boolean
  lastEventAt: string
}

