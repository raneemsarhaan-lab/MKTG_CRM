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
  /** Spec 012 R13: the language phone alerts and emails use. */
  locale?: 'en' | 'ar'
  /** Spec 012 R6: for Arabic grammar; absent is the neutral phrasing. */
  gender?: 'f' | 'm'
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
  /** Spec 015: a sheet comment mentions you, or someone replies in a thread you're in. */
  | 'sheet_mention' | 'sheet_reply'
export const NOTIFICATION_KINDS: NotificationKind[] = [
  'mention', 'assigned', 'comment', 'reply', 'attachment', 'task_created_in_stage', 'task_moved_to_stage', 'due_soon', 'overdue',
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
export type SheetFolderKind = 'content' | 'video' | 'team'
/** A tab in a folder: one of the two linked sheets, or a blank sheet. */
export type SheetKind = 'linked_content' | 'linked_video' | 'blank'
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
  /** Stage 3: Sort moves rows by rewriting their positions. */
  rowPositions?: { id: string; position: number }[]
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
}

// ─── Spec 015: formatting and comments (specs/015-sheet-formatting-comments) ─

/** One side of a cell's border (research R3). */
export interface BorderSide { w: 'thin' | 'medium' | 'thick' | 'dashed' | 'dotted' | 'double'; c: string }
export const CURRENCIES = ['EGP', 'USD', 'EUR', 'GBP', 'SAR', 'AED'] as const
export type Currency = typeof CURRENCIES[number]
/** How a cell's text is shown. Values stay as typed (R2). */
export interface NumberFormat {
  kind: 'general' | 'number' | 'currency' | 'accounting' | 'percent' | 'scientific' | 'date' | 'time' | 'text'
  /** Decimal places, 0–10. */
  dp?: number
  /** Thousands separator. */
  sep?: boolean
  cur?: Currency
  neg?: 'minus' | 'paren' | 'red' | 'paren-red'
  /** Dates: the long form (Mon, 16 Nov 2026) rather than the short one. */
  long?: boolean
  /** A custom date pattern: d, dd, ddd, dddd, m, mm, mmm, mmmm, yy, yyyy. */
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
  ha?: 'general' | 'left' | 'center' | 'right' | 'justify'
  va?: 'top' | 'middle' | 'bottom'
  wrap?: boolean
  /** 0–15 levels. */
  indent?: number
  /** Degrees, −90…90, or vertical stacked text. */
  rot?: number | 'vertical'
  num?: NumberFormat
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
}

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
export const RULE_KINDS = ['gt', 'lt', 'between', 'eq', 'contains', 'date', 'dup', 'unique', 'top', 'bottom', 'bar', 'scale'] as const
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

export const TASK_FIELDS = ['title', 'stage', 'due', 'assignee', 'owner', 'priority', 'platform', 'type', 'theme', 'pillar', 'link:doc', 'link:design', 'link:post', 'link:published'] as const
/** A task field a column can stand for; `col:<id>` is one of the team's own Content columns (spec 010). */
export type TaskField = typeof TASK_FIELDS[number] | `col:${string}`
export interface SheetTaskMap { taskCol: string; fields: Record<string, TaskField> }
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
}
export interface TaskFieldWrite { rowId: string; field: TaskField; value: string }
export interface TaskFieldResult { rowId: string; field: TaskField; ok: boolean; reason?: string; shown?: string; celebrate?: boolean; stageLabel?: string }

export interface SheetTableRecord { id: string; top: string; left: string; bottom: string; right: string; style: string; header: boolean; banded: boolean }
/** Formatting, merges, view and thread summaries for one sheet (blank or linked). */
export interface SheetExtras {
  formats: SheetFormatRecord[]
  merges: SheetMergeRecord[]
  view: SheetView
  threads: SheetThreadSummary[]
  /** Stage 3. */
  rules?: ConditionalRule[]
  tables?: SheetTableRecord[]
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
