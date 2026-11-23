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

/** Spec 021 (T081): 'tasks:<node>' is a Space's, brand's or My tasks' Tasks sheet. */
export type SheetId = 'content' | 'video' | `tasks:${string}`
export type ColumnKind = 'text' | 'number' | 'date' | 'link' | 'person' | 'choice' | 'checkbox' | 'task'
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
/** Spec 012 R12: Mentions and Team moved to the notification bell. */
export type InboxTab = 'todo' | 'done'
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
/** 'sheet': the redesigned Video sheet's one set (design/video-sheet-v2.html); the other three are kept for saved layouts. */
export type SheetColumnSet = 'editing' | 'copy' | 'full' | 'sheet'
/** Every column the video sheet can show, in display order. */
export type SheetColumn =
  | 'title' | 'clipNo' | 'type' | 'status' | 'editor' | 'source' | 'fileName'
  | 'in' | 'out' | 'length' | 'files' | 'published' | 'drop'
  | 'reviewer' | 'due' | 'inStage' | 'doc' | 'design' | 'task' | 'post'
export type AlertStatus = 'On Track' | 'At Risk' | 'Will Miss' | 'Stuck' | 'Idle' | 'Overdue'
/** Spec 023 (D7): Medium became Normal. */
export type Priority = 'Urgent' | 'High' | 'Normal' | 'Low' | 'None'

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
  /** Spec 012 R13: the language phone alerts and emails use. */
  locale?: 'en' | 'ar'
  /** Spec 012 R6: for Arabic grammar; absent is the neutral phrasing. */
  gender?: 'f' | 'm'
  /** The stage-move celebration is on (off by default). */
  celebrations?: boolean
}

export interface Brand {
  id: string
  name: string
  color: string
  logo_url?: string
  description?: string
  /** Spec 021 (R11): feature switch overrides; a missing key means the workspace default. */
  features?: BrandFeatures
  /** Spec 021 (R11): the brand's own overrides, when `features` holds the resolved switches. */
  own_features?: BrandFeatures
  /** Spec 021 (R11): the brand's "with C-Check" default for new tasks; null = the workspace default. */
  nine_stage_default?: boolean | null
}

// ─── Spec 021: brands, team Spaces and views ─────────────────────────────────

/** A task's workflow (R1). Fixed at creation. */
export type TaskKind = 'pipeline' | 'simple'

/** A simple task's status: To Do › In progress › Done. */
export type SimpleStatus = 's-todo' | 's-doing' | 's-done'

/** The per-brand feature switches (US4). */
export type BrandFeatureKey = 'priorities' | 'platform' | 'type' | 'pillars' | 'hours' | 'covers' | 'clips' | 'sla' | 'tags'
/** Spec 023: a switchable task field's switch is `f:<field id>`. */
export type BrandFeatures = Partial<Record<BrandFeatureKey, boolean>> & { [field: `f:${string}`]: boolean | undefined }

/** A brand's four fixed Folders. */
export type BrandFolderKey = 'cal' | 'assets' | 'sheet' | 'lib'

/** Why a task shows in a Space. */
export type TaskSpaceVia = 'created' | 'assignee' | 'handoff' | 'manual' | 'migration'

/** A team Space: a lens on one team's work across every brand. */
export interface TeamSpace {
  id: string
  key: string
  name: string
  color: string
  is_production: boolean
  default_kind: TaskKind
  /** { [stageId | simpleStatus]: words } — unused for 'content' and 'video' (R5). */
  words: Record<string, string[]>
  sort_order: number
  archived_at: string | null
  /** Spec 022 (R9): the role new tasks made in this Space are assigned to. */
  default_assignee_role?: string | null
  /** Spec 022: this Space is the Design or Video media board. */
  media_board?: MediaBoard | null
}

/** Spec 022: a media board. */
export type MediaBoard = 'design' | 'video'

/** Spec 022 (R7): a Space's name for one original stage (one of possibly several). */
export interface SpaceStage {
  id: string
  space_id: string
  stage_id: StageId
  /** Null shows the original stage's name. */
  name: string | null
  position: number
  aliases: string[]
}

/** Spec 022 (R7): a task's sub-stage in one Space, valid while its stage is still stage_id. */
export interface TaskSpaceStage {
  task_id: string
  space_id: string
  space_stage_id: string
  stage_id: StageId
}

export interface SpaceMember {
  space_id: string
  member_id: string
}

/** One Shows in row. */
export interface TaskSpace {
  task_id: string
  space_id: string
  added_via: TaskSpaceVia
}

export type ViewType = 'list' | 'board' | 'sheet' | 'calendar' | 'workload' | 'files' | 'gallery'

/** 'everything' | 'me' | 'space:<id>' | 'brand:<id>' | 'brand:<id>:<folder>' */
export type ViewNode = string

export interface SavedView {
  id: string
  node: ViewNode
  type: ViewType
  name: string
  config: Record<string, unknown>
  /** Null for a shared view. */
  owner_id: string | null
  position: number
  /** The reader created it (may edit a shared view). */
  mine?: boolean
}

/** What the hand-off box needs to open (contracts/handoff.md). */
export interface HandoffDefaults {
  /** Production Spaces pre-ticked for this task. */
  spaceIds: string[]
  /** Members of each production Space, by Space id. */
  candidates: Record<string, string[]>
  /** Spec 022: each media board with its Space and suggested person (the Space's default assignee). */
  boards?: { board: MediaBoard; spaceId: string; suggested: string | null }[]
}

export interface ContentType {
  id: string
  label: string
  /** Spec 022 (R6): the media boards a task of this type is linked to at Ready For Design. */
  media_boards?: string[]
  /** Spec 023 (R1): a task type's Arabic name, icon, colour and defaults. */
  name_ar?: string | null
  icon?: string
  color?: string
  default_priority?: string | null
  default_tag_ids?: string[]
  default_template_id?: string | null
  position?: number
}
/** Spec 023: task types are the content types, extended. */
export type TaskType = ContentType

/** Spec 023 (R2): a field's kind. */
export type FieldKind = 'text' | 'number' | 'money' | 'date' | 'link' | 'person' | 'choice' | 'multi' | 'checkbox' | 'rating' | 'task'
export interface FieldOption { id: string; en: string; ar?: string | null; color?: string | null }
export interface TaskFieldDef {
  id: string
  name_en: string
  name_ar: string | null
  kind: FieldKind
  /** place: where the task panel shows it — the top rows, or above / below the Description (default above). */
  options: { choices?: FieldOption[]; currency?: string; max?: number; place?: 'top' | 'above' | 'below'; hint?: { en: string; ar?: string | null } }
  on_card: boolean
  switchable: boolean
  position: number
  retired: boolean
}
export interface TaskTypeFieldLink { type_label: string; field_id: string; required_from: StageId | null; default_value: unknown; position: number }
export interface TaskFieldValueRow { task_id: string; field_id: string; value: unknown }
/** Spec 023 (R8): a workspace tag. */
export interface Tag { id: string; name: string; color: string }
/** My tasks: a personal to-do, private to its owner. */
export interface Todo { id: string; name: string; note: string | null; day: string | null; flagged: boolean; done_at: string | null; created_at: string }
/** Spec 023 (R6): a brand's calendar marker — not a task. */
export interface Milestone { id: string; brand_id: string; name: string; day: string }

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
  /** Spec 023 (R9): every assignee, the lead first (the lead is also assignee_id). */
  assignee_ids?: string[]
  /** Spec 023: hours set per person; others share the rest evenly. */
  assignee_hours?: Record<string, number>
  /** Spec 023 (R8): the task's tags. */
  tag_ids?: string[]
  assignee?: Member
  task_owner?: Member
  initiator_role: string
  nine_stage: boolean
  status: StageId
  stage_date: string
  due_date: string | null
  /** Spec 023 (US6): optional start; never after the due date. */
  start_date?: string | null
  /** The day the content goes live (Africa/Cairo). */
  publish_date?: string | null
  /** The due date was set by hand: a new publishing date doesn't move it. */
  due_manual?: boolean
  /** Spec 022 (R1): 'design' | 'video' for a media task; null for a content task. */
  media_board?: MediaBoard | null
  /** Spec 022: the content task a media task is linked to; null when unlinked. */
  content_task_id?: string | null
  /** Spec 022: the stage the task began at ('r-design' when made on a media board). */
  entry_stage?: StageId
  /** Spec 022 (R5): when the automatic link at Ready For Design ran (content tasks). */
  auto_linked_at?: string | null
  /** Spec 022: migrated from a simple task (never celebrates). */
  migrated_simple?: boolean
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
  /** Spec 021: 'pipeline' unless created as a simple task. */
  kind?: TaskKind
  /** Spec 021: a simple task's status; null for pipeline tasks. */
  simple_status?: SimpleStatus | null
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
  /** The member turned celebrations on (off by default); while off, setCelebration ignores new ones. */
  celebrationsOn: boolean
  /** Spec 021: the hand-off box, when open. */
  handoff: HandoffRequest | null

  setCelebration: (payload: CelebrationPayload | null) => void
  setCelebrationsOn: (on: boolean) => void
  selectTask: (id: string | null) => void
  setShowTaskForm: (show: boolean) => void
  setProfileOpen: (open: boolean) => void
  putPendingDelete: (entry: PendingDelete) => void
  dropPendingDelete: (attachmentId: string) => void
  /** Opens the hand-off box; false (and nothing changes) when one is already open. */
  openHandoff: (req: HandoffRequest) => boolean
  closeHandoff: () => void
}

/** Spec 021: everything the hand-off box needs, gathered by whoever got `needs_handoff`. */
export interface HandoffRequest {
  taskId: string
  taskName: string
  target: StageId
  /** Names of the Spaces the task already shows in. */
  shownIn: string[]
  /** Production Spaces to offer. */
  spaces: { id: string; key: string; name: string; color: string }[]
  /** Pre-ticked Space ids. */
  ticked: string[]
  /** Members of each production Space, by Space id. */
  candidates: Record<string, { id: string; name: string; role: string }[]>
  /** Spec 022: each media board's Space and suggested person (its default assignee). */
  suggested?: Record<string, string | null>
}

export interface MoveTaskResult {
  success: boolean
  shouldCelebrate: boolean
  error?: string
  /** Spec 021: set with error 'needs_handoff' — the stage asked for and what the box pre-ticks. */
  target?: StageId
  handoff?: HandoffDefaults
  /** Spec 023: set with error 'required_fields' — the empty fields (English names) and the stage they're needed by. */
  missing?: string[]
  /** The same fields' Arabic names (the English name where none is set). */
  missing_ar?: string[]
  requiredStage?: StageId
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
  /** Spec 015: a sheet comment mentions you, or someone replies in a thread you're in. */
  | 'sheet_mention' | 'sheet_reply'
  /** Spec 023 (D8): a task you're on became Urgent. */
  | 'urgent'
export const NOTIFICATION_KINDS: NotificationKind[] = [
  'mention', 'assigned', 'urgent', 'comment', 'reply', 'attachment', 'task_created_in_stage', 'task_moved_to_stage', 'due_soon', 'overdue',
  'sheet_mention', 'sheet_reply',
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
  /** Spec 015: sheet comments carry where the cell is, so the link opens it. */
  sheet_id?: string
  folder_id?: string
  sheet_name?: string
  /** The cell as people read it: "B4", or "Ramadan teaser · Status". */
  cell?: string
  row_key?: string
  col_key?: string
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


// ─── Spec 013: Sheets (specs/013-spreadsheet-editing/data-model.md) ─────────

/** A folder in the Sheets section. */
/** Spec 021: 'node' is a Space's or My tasks' own workbook (linked_key 'node:<node>'). */
export type SheetFolderKind = 'content' | 'video' | 'team' | 'brand' | 'node'
/** A tab in a folder: one of the two linked sheets, or a blank sheet. */
/** Spec 021: 'linked_tasks' is a Space's, brand's or My tasks' live Tasks tab (linked_key 'tasks:<node>'). */
export type SheetKind = 'linked_content' | 'linked_video' | 'linked_tasks' | 'blank'
/** Excel-style tab colours (FR-059a), stored as keys, drawn from SHEETS_UI.tabs. */
export const TAB_COLORS = ['red', 'orange', 'yellow', 'green', 'teal', 'blue', 'purple', 'pink', 'gray', 'black'] as const
export type TabColor = typeof TAB_COLORS[number]

export interface FolderSummary {
  id: string
  kind: SheetFolderKind
  /** Null for linked folders: the name comes from the translations. */
  name: string | null
  sheetCount: number
  updatedAt: string
  updatedBy: string | null
}

/** A folder pinned under Sheets in the sidebar. */
export interface PinnedFolder {
  id: string
  kind: SheetFolderKind
  name: string | null
  sheetCount: number
}

export interface SheetSummary {
  id: string
  folderId: string
  kind: SheetKind
  /** Null for linked sheets: the name comes from the translations. */
  name: string | null
  position: number
  color: TabColor | null
  hidden: boolean
  protectedBy: string | null
  rowCount: number
  colCount: number
  /** Spec 021: a linked_tasks sheet's key ('tasks:<node>'), for comments and formats. */
  linkedKey?: string | null
}

/** A blank sheet as the client holds it (data-model §4). */
export interface SheetDoc {
  id: string
  updatedAt: string
  rows: { id: string; position: number; height: number | null }[]
  cols: { id: string; position: number; width: number | null }[]
  /** Filled cells only: rowId → colId → text. */
  cells: Record<string, Record<string, string>>
  /** Spec 015: formatting, merges, view and comment markers. */
  extras?: SheetExtras
}

/** One saved batch of changes to a blank sheet (contracts/server.md). */
export interface SheetChanges {
  cells?: { rowId: string; colId: string; value: string }[]
  insertRows?: { id: string; position: number; height?: number | null }[]
  deleteRows?: string[]
  insertCols?: { id: string; position: number; width?: number | null }[]
  deleteCols?: string[]
  rowHeights?: { id: string; height: number | null }[]
  colWidths?: { id: string; width: number | null }[]
  /** Spec 015 (contracts/server.md). */
  formats?: FormatWrite[]
  merges?: { add?: SheetMergeRecord[]; remove?: string[] }
  /** Spec 015 stage 2: frozen panes and hidden rows and columns. */
  view?: ViewWrite
  /** Stage 3: conditional formatting rules put (whole records) or removed; tables likewise (blank sheets only). */
  rules?: { put?: ConditionalRule[]; remove?: string[] }
  tables?: { put?: SheetTableRecord[]; remove?: string[] }
  /** Spec 020: data validation rules put (whole records) or removed (blank sheets only). */
  validations?: { put?: ValidationRecord[]; remove?: string[] }
  /** Spec 020: comment threads moved with their cells (border drag): one group per drag, in order; each group at once. By row and column ids. */
  commentMoves?: { from: [string, string]; to: [string, string] }[][]
  /** Stage 3: Sort moves rows by rewriting their positions. */
  rowPositions?: { id: string; position: number }[]
  /** Spec 019: dragging a column rewrites its position. */
  colPositions?: { id: string; position: number }[]
  /** Spec 016: the column mapping (null unlinks the sheet), and rows' tasks (null unlinks a row). */
  taskMap?: SheetTaskMap | null
  rowTasks?: { rowId: string; taskId: string | null }[]
}
export interface ViewWrite {
  frozenRows?: number
  frozenCols?: number
  hideRows?: string[]
  showRows?: string[]
  hideCols?: string[]
  showCols?: string[]
  /** Stage 3: null removes them. */
  filterArea?: FilterArea | null
  filter?: Record<string, ColFilter> | null
  sort?: SortKey[] | null
  /** Spec 019: null removes it. */
  groupBy?: GroupBy | null
  /** Spec 019 stage 2 (linked sheets): this sheet's words; null removes them. */
  words?: SheetTaskMap['words'] | null
  show?: SheetTaskMap['show'] | null
  look?: 'content' | 'grid' | null
  /** Spec 020: null removes them. */
  slicers?: SlicerRecord[] | null
  advanced?: AdvancedFilter | null
  outline?: OutlineGroupRecord[] | null
  /** The Video sheet: custom column key → the board field it follows (design/video-sheet-v5.html); null removes them all. */
  colFields?: Record<string, string> | null
}

// ─── Spec 015: formatting and comments (specs/015-sheet-formatting-comments) ─

/** One side of a cell's border (research R3). */
export interface BorderSide { w: 'thin' | 'medium' | 'thick' | 'dashed' | 'dotted' | 'double'; c: string }
export const CURRENCIES = ['EGP', 'USD', 'EUR', 'GBP', 'SAR', 'AED'] as const
export type Currency = typeof CURRENCIES[number]
/** How a cell's text is shown. Values stay as typed (R2). */
export interface NumberFormat {
  kind: 'general' | 'number' | 'currency' | 'accounting' | 'percent' | 'scientific' | 'date' | 'time' | 'text' | 'custom'
  /** Decimal places, 0–10. */
  dp?: number
  /** Thousands separator. */
  sep?: boolean
  cur?: Currency
  neg?: 'minus' | 'paren' | 'red' | 'paren-red'
  /** Dates: the long form (Mon, 16 Nov 2026) rather than the short one. */
  long?: boolean
  /** A custom date pattern: d, dd, ddd, dddd, m, mm, mmm, mmmm, yy, yyyy; or, with kind 'custom', Excel's number code (spec 020, sheet-numfmt). */
  pattern?: string
}
/** A cell's look (research R3). Every field is optional; layers override field by field. */
export interface CellStyle {
  font?: string
  /** Points, 6–72. */
  size?: number
  b?: boolean
  i?: boolean
  s?: boolean
  /** 'none' turns a lower layer's underline off. */
  u?: 'single' | 'double' | 'none'
  /** '#RRGGBB'. */
  color?: string
  fill?: string
  bt?: BorderSide | null
  br?: BorderSide | null
  bb?: BorderSide | null
  bl?: BorderSide | null
  /** 'across': Center Across Selection (spec 020 tip 26), shown over the next empty cells that also carry it, with no merge. */
  ha?: 'general' | 'left' | 'center' | 'right' | 'justify' | 'across'
  va?: 'top' | 'middle' | 'bottom'
  wrap?: boolean
  /** 0–15 levels. */
  indent?: number
  /** Degrees, −90…90, or vertical stacked text. */
  rot?: number | 'vertical'
  num?: NumberFormat
  /** Spec 020 tip 95: an input cell that stays open while the sheet is protected (Format Cells › Protection › Locked off). */
  unlocked?: boolean
}
/** A style on a cell, a row (colKey ''), a column (rowKey '') or the sheet (both ''). */
export interface SheetFormatRecord { rowKey: string; colKey: string; style: CellStyle }
/** Merged cells, by the row and column ids at the edges (R4). */
export interface SheetMergeRecord { id: string; top: string; left: string; bottom: string; right: string }
export interface SheetCommentItem {
  id: string
  authorId: string | null
  body: string
  mentions: string[]
  createdAt: string
  editedAt: string | null
  /** Soft-deleted: the body is gone and the item reads "Comment deleted". */
  deleted: boolean
}
export interface SheetCommentThread {
  id: string
  rowKey: string
  colKey: string
  resolved: { at: string; by: string | null } | null
  /** The first comment, then the replies, oldest first. */
  comments: SheetCommentItem[]
}
/** What the grid needs to draw markers and the panel's counts. */
export interface SheetThreadSummary { id: string; rowKey: string; colKey: string; count: number; resolved: boolean }
/** Frozen panes, hidden rows and columns and the filter (stage 2–3). */
export interface SheetView {
  frozenRows: number
  frozenCols: number
  /** Stage 3: the filter buttons' area (blank sheets: a header row and columns; linked sheets: every column). */
  filterArea?: FilterArea | null
  /** Stage 3: what each filtered column keeps, by column key. */
  filter?: Record<string, ColFilter>
  /** Stage 3, linked sheets only: the sort applied within each group (blank sheets move the rows instead). */
  sort?: SortKey[]
  hiddenRows?: string[]
  hiddenCols?: string[]
  /** Spec 019: rows grouped under headings: by a task's theme (and pillar), stage, assignee or type, or by a column's value. 'none' is the Content sheet's flat list (its default is theme). */
  groupBy?: GroupBy | null
  /** Spec 019 stage 2, linked sheets: this sheet's words for stages and types, and which name cells show. */
  words?: SheetTaskMap['words']
  show?: SheetTaskMap['show']
  /** Spec 019 (approved design team-sheet-content-style): a team sheet in the Content sheet's look, or as a spreadsheet. Unset: content when linked to the board. */
  look?: 'content' | 'grid'
  /** Spec 020 (blank sheets): slicers, the advanced filter in place, and outline groups. */
  slicers?: SlicerRecord[]
  advanced?: AdvancedFilter | null
  outline?: OutlineGroupRecord[]
}
/** Spec 021 (T081): 'brand' groups a Tasks sheet by brand. */
export type GroupBy = { by: 'theme' | 'stage' | 'assignee' | 'type' | 'brand' | 'none' } | { by: 'col'; col: string }

// ─── Spec 015 stage 3: sort, filter, tables, conditional formatting ─────────

/** Where the filter buttons are: the header row (blank sheets) and the columns; rows below it are filtered. */
export interface FilterArea { header: string | null; cols: string[]; last?: string | null }
export type FilterOp = 'contains' | 'notContains' | 'begins' | 'ends' | 'eq' | 'neq' | 'gt' | 'lt' | 'between' | 'before' | 'after' | 'blank' | 'notBlank'
/** A column's filter: ticked values, a fill or text colour, or a condition. Every part set must match. */
export interface ColFilter {
  values?: string[]
  /** '#RRGGBB' the cell's fill (or text colour, with `on: 'color'`) must be; '' = no fill. */
  color?: string
  on?: 'fill' | 'color'
  cond?: { op: FilterOp; a?: string; b?: string }
}
export interface SortKey {
  col: string
  dir: 'asc' | 'desc'
  /** Sort on the values (default), or put cells with this fill / text colour first. */
  on?: 'value' | 'fill' | 'color'
  color?: string
}
export const RULE_KINDS = ['gt', 'lt', 'between', 'eq', 'contains', 'date', 'dup', 'unique', 'top', 'bottom', 'bar', 'scale', 'icons'] as const
/** Spec 020 tip 28: Excel's three-icon sets. */
export const ICON_SETS = ['arrows3', 'flags3', 'lights3'] as const
export type IconSet = typeof ICON_SETS[number]
export type RuleKind = typeof RULE_KINDS[number]
export interface RuleArgs {
  /** The value (gt, lt, eq, contains) or the low end (between). */
  a?: string
  /** The high end (between). */
  b?: string
  /** date: which dates match. */
  when?: 'past' | 'today' | 'future' | 'yesterday' | 'tomorrow' | 'last7' | 'next7'
  /** top, bottom: how many, or what percent with `percent`. */
  n?: number
  percent?: boolean
  /** bar: the bar's colour; scale: low, middle, high colours (middle may be ''). */
  colors?: string[]
  /** Spec 020 tip 27 (blank sheets): test this column and give the look to the rule's whole row. */
  row?: boolean
  col?: string
  /** Spec 020 tip 28, icons: the set, the two cuts (≥ cuts[0] the first icon, ≥ cuts[1] the second), as percents of the range or numbers. */
  set?: IconSet
  cuts?: [number, number]
  by?: 'percent' | 'number'
  reverse?: boolean
  iconOnly?: boolean
}
export interface ConditionalRule {
  id: string
  /** Blank sheets: row and column ids; linked sheets: 'all' rows and column keys. */
  range: { rows: string[] | 'all'; cols: string[] }
  kind: RuleKind
  args: RuleArgs
  /** The look for highlight and top/bottom rules; bars and scales have none. */
  style: CellStyle | null
  priority: number
}
// ─── Spec 016: a blank sheet's columns linked to board tasks ────────────────

export const TASK_FIELDS = ['title', 'stage', 'due', 'assignee', 'owner', 'priority', 'platform', 'type', 'theme', 'pillar', 'link:doc', 'link:design', 'link:post', 'link:published', 'task'] as const
/** A task field a column can stand for; `col:<id>` is one of the team's own Content columns (spec 010). */
export type TaskField = typeof TASK_FIELDS[number] | `col:${string}`
/** Spec 019: fields whose values a sheet may call by its own words ("editing in progress" → D-In Progress). */
export const WORD_FIELDS = ['stage', 'type', 'priority'] as const
export type WordField = typeof WORD_FIELDS[number]
export interface SheetTaskMap {
  taskCol: string
  fields: Record<string, TaskField>
  /** Spec 019: this sheet's words for each value, by field then value (a stage id, a type label, a priority). */
  words?: Partial<Record<WordField, Record<string, string[]>>>
  /** Spec 019: cells show this sheet's words (default) or the board's names. */
  show?: 'sheet' | 'board'
}
export type TaskFieldValues = Partial<Record<TaskField, string>>
/** A linked task as a sheet sees it: the shown text of each mapped field. */
export interface LinkedTask {
  id: string
  name: string
  values: TaskFieldValues
  /** Raw values for display: the stage id, member ids. */
  stage: string
  dropped: boolean
  /** This member may change the task's fields (owner, assignee, admin, superuser). */
  editable: boolean
  /** The fields this task has (a video has no theme or pillar). */
  applies: TaskField[]
  /** Spec 019: the stages this member may move it to (the stage menu), and its theme, pillar, stage, assignee and type for grouping. */
  moves?: string[]
  meta?: { theme: string; pillar: string; stage: string; assignee: string; assigneeId: string | null; type: string; ownerId?: string }
}
export interface TaskFieldWrite { rowId: string; field: TaskField; value: string }
export interface TaskFieldResult { rowId: string; field: TaskField; ok: boolean; reason?: string; shown?: string; celebrate?: boolean; stageLabel?: string }

export interface SheetTableRecord {
  id: string; top: string; left: string; bottom: string; right: string; style: string; header: boolean; banded: boolean
  /** Spec 020 tip 73: the Total row, a total per column id; null or unset: no Total row. */
  totals?: Record<string, TotalFn> | null
}
/** The Total row's choices (Excel's SUBTOTAL over the rows the filter shows). */
export const TOTAL_FNS = ['none', 'avg', 'count', 'countNums', 'max', 'min', 'sum'] as const
export type TotalFn = typeof TOTAL_FNS[number]
/** Spec 020 tip 74: a slicer, a box of buttons that sets a table column's filter. */
export interface SlicerRecord { id: string; tableId: string; col: string }
/** Spec 020 tip 78: Data › Advanced Filter, in place, over a list range; the criteria as read from the criteria range. */
export interface AdvancedFilter {
  top: string; left: string; bottom: string; right: string
  groups: { col: string; op: 'eq' | 'ne' | 'gt' | 'lt' | 'ge' | 'le' | 'begins'; value: string }[][]
  unique?: boolean
}
/** Spec 020 tip 80: an outline group, by row or column ids. */
export interface OutlineGroupRecord { kind: 'rows' | 'cols'; from: string; to: string; level: number; collapsed: boolean }

/**
 * Spec 020 (tip 18): Data › Data Validation…, as Excel's three tabs. The range
 * is by row and column ids, like a merge. `allow` 'any' keeps only the input
 * message. Values are checked when typed, pasted, filled or moved.
 */
export type ValidationAllow = 'any' | 'whole' | 'decimal' | 'list' | 'date' | 'time' | 'length'
export type ValidationOp = 'between' | 'notBetween' | 'eq' | 'ne' | 'gt' | 'lt' | 'ge' | 'le'
export interface ValidationRule {
  allow: ValidationAllow
  op?: ValidationOp
  /** Bounds (numbers, dates or times as typed), for every kind but list and any. */
  a?: string
  b?: string
  /** The list's items, in order (1–100, each 1–80 characters). */
  values?: string[]
  ignoreBlank: boolean
  /** List: show the ▾ beside the selected cell. */
  dropdown: boolean
  /** Input Message tab: shown beside the cell when it's selected; null = off. */
  input: { title: string; msg: string } | null
  /** Error Alert tab: null = off (anything may be typed). */
  error: { style: 'stop' | 'warning' | 'info'; title: string; msg: string } | null
}
export interface ValidationRecord extends ValidationRule { id: string; top: string; left: string; bottom: string; right: string }
/** Formatting, merges, view and thread summaries for one sheet (blank or linked). */
export interface SheetExtras {
  formats: SheetFormatRecord[]
  merges: SheetMergeRecord[]
  view: SheetView
  threads: SheetThreadSummary[]
  /** Stage 3. */
  rules?: ConditionalRule[]
  tables?: SheetTableRecord[]
  /** Spec 020: data validation. */
  validations?: ValidationRecord[]
  /** Spec 016: the column mapping, each linked row's task, and those tasks' values. */
  taskMap?: SheetTaskMap | null
  rowTasks?: Record<string, string>
  tasks?: Record<string, LinkedTask>
}
/** A format write: `set` replaces the record's style, `merge` lays the fields over it; null clears it. */
export interface FormatWrite { rowKey: string; colKey: string; style: CellStyle | null; mode: 'set' | 'merge' }

/** A linked-sheet cell write (contracts/server.md `writeTaskCells`). */
export type TaskCellField =
  | 'title' | 'status' | 'assignee' | 'owner' | 'due_date' | 'priority' | 'content_type'
  | 'clip.in' | 'clip.out' | 'clip.file' | 'clip.source'
  | `col:${string}`
export interface TaskCellEntry { taskId: string; field: TaskCellField; value: string }

// ─── Daily working hours (spec 014) ──────────────────────────────────────────

/** One member's day: hours worked, a day off, or (as null) nothing logged. `date` is 'YYYY-MM-DD', the member's own calendar day. */
export interface WorkDayEntry {
  date: string
  hours: number | null
  off: boolean
}

/** What My Day and the reminder need for the member (contracts/server.md `hoursStatus`). */
export interface HoursStatus {
  localDate: string
  /** The last working day before today, when it has no entry and the account existed. */
  remindDay: string | null
  /** Other working days in the last 30 with no entry, newest first (for "Add another day"). */
  missing: string[]
  /** The reminder already opened or was put off today. */
  prompted: boolean
  /** The last 7 days, oldest first, today last. */
  recent: (WorkDayEntry | { date: string; hours: null; off: false; missing: boolean })[]
  /** This week (Sunday to today). */
  weekTotal: number
  capacity: number
  /** The first day this member can be asked about (their account's creation day). */
  since: string
}

export interface HoursWeekRow {
  memberId: string
  name: string
  capacity: number
  days: Record<string, WorkDayEntry | null>
  total: number
  /** Every working day of the week (up to today) has an entry. */
  complete: boolean
}

export interface HoursWeekReport {
  weekStart: string
  /** Sunday to Saturday. */
  days: string[]
  rows: HoursWeekRow[]
  dayTotals: Record<string, number>
  completeCount: number
}

/** Spec 021: what the sidebar's Me / Teams / Brands sections need (contracts/routes.md). */
export interface NavTree {
  /** Open tasks assigned to me or handed off by me. */
  myOpen: number
  /** My tasks page (user, 2026-11-23): open tasks and to-dos that are mine, and how many are overdue. */
  myTasks?: { open: number; overdue: number }
  spaces: { id: string; key: string; name: string; color: string; open: number }[]
  brands: { id: string; name: string; color: string; open: number }[]
  /** Open tasks with no brand; the "No brand" entry shows only when > 0. */
  noBrandOpen: number
}
