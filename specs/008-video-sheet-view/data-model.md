# Data Model: Video Sheet View

**Feature**: spec 008 · **Plan**: [plan.md](./plan.md) · **Research**: [research.md](./research.md)

The schema change is applied with `prisma db push` (`scripts/migrate.sh`). Every new field is nullable or new, so existing rows need no backfill.

## 1. Schema changes

### `Task` (existing): two new columns

| Field | Type | Meaning |
|---|---|---|
| `published_url` | `String?` (`@db.Text`) | The live post's link, once published (FR-047, FR-048). Any task may have one; the sheet shows and asks for it. |
| `dropped_at` | `DateTime?` (`@db.Timestamptz(6)`) | Set while a clip is dropped (FR-060). A dropped task is left out of the board, overview, capacity, projects, metrics and alerts (research R6). |
| `clip` | relation `TaskClip?` | The clip details, when this task is a clip. |
| `video_clips` | relation `TaskClip[] @relation("VideoClips")` | On a video: the details of its clips. Used for the uniqueness rule. |

### `TaskClip` (new): `@@map("task_clips")`

| Field | Type | Rule |
|---|---|---|
| `task_id` | `String @id @db.Uuid` | The clip's task. Relation `onDelete: Cascade`: deleting the clip deletes its details. |
| `video_id` | `String? @db.Uuid` | The parent video, equal to the clip task's `parent_task_id` when created. Relation `"VideoClips"`, `onDelete: SetNull`: deleting a video keeps its clips as standalone Reels with their details. |
| `clip_no` | `Int?` | 0–9999. Repeats allowed (re-cuts). |
| `source` | `String?` | The recording it was cut from, such as `IMG_0296`. At most 120 characters. |
| `file_name` | `String?` | Such as `30_IMG_0296_6m12.4s-7m20.9s.mp4`. At most 200 characters. Matches `FILE_RE` when set by paste; free text when edited. |
| `in_ms` | `Int?` | ≥ 0. |
| `out_ms` | `Int?` | Greater than `in_ms` when both are set (FR-038). |
| `created_at` | `DateTime @default(now())` | The tie-break for rows with the same clip number. |

Indexes:
- `@@unique([video_id, file_name])` stops the same clip file being added twice under one video, even by two people at the same moment. NULL file names don't clash.
- `@@index([video_id])`.

**Derived, never stored**:
- `length_ms = out_ms − in_ms`, when both are set.
- `is_clip = clip != null`.
- `is_video = content_type_label === 'Video' && parent_task_id == null`.

### `TaskAttachment` (existing): no schema change

A **link** is a row with:
- `url` set;
- `data` and `storage_key` null;
- `content_type = 'text/uri-list'`;
- `filename` = `Google Drive` or the link's host name (research R7).

## 2. Client types (`src/types/index.ts`, updated first per §VI)

```ts
export type SheetColumnSet = 'editing' | 'copy' | 'full'
export type BoardView      = 'board' | 'sheet'
export type SheetColumn =
  | 'title' | 'clipNo' | 'type' | 'status' | 'editor' | 'source' | 'fileName'
  | 'in' | 'out' | 'length' | 'files' | 'published' | 'drop'

export interface ClipDetails {
  clip_no: number | null
  source: string | null
  file_name: string | null
  in_ms: number | null
  out_ms: number | null
  video_id: string | null
}

// Task gains:
//   published_url?: string | null
//   dropped_at?: string | null      // ISO
//   clip?: ClipDetails | null
//   subtasks?: { id; name; status; dropped_at?: string | null }[]
// TaskAttachment gains:
//   content_type?: string | null     // already present on loaded rows; now also on board rows
```

`mapTask` in `src/lib/mappers.ts` maps the new fields.

## 3. Client-only entities

### Sheet row (derived in `src/components/sheet/rows.ts`, pure)

```ts
type SheetRow =
  | { kind: 'video'; task: Task; clips: Task[]; collapsed: boolean }
  | { kind: 'clip';  task: Task; video: Task; n: number /* row number */ }
  | { kind: 'draft'; key: string; video: Task }            // + Clip before its title is saved
```

- **Clip order**: `clip_no` ascending (nulls last), then `clip.created_at`, then `task.created_at`.
- **Filters**:
  - **Mine** keeps clips where `assignee_id === me || task_owner_id === me`. The video row always shows (FR-053).
  - With **Show dropped** off, rows with `dropped_at` are hidden.

### Summary (pure, `summarise(clips)`)

| Figure | Rule |
|---|---|
| clips | Clips not dropped. |
| total length | The sum of `length_ms` over those clips that have both times. |
| editing | Status in `VIDEO_EDITING_STAGES` (`r-design`, `d-prog`, `d-check`, `final-check`). |
| published | Status `publish`. |
| no link | Published, and `published_url` empty. |
| dropped | Clips with `dropped_at`. Left out of every other figure (FR-004). |

The summary is computed over every clip of the video, whatever the Mine and Show dropped settings, so it always describes the video (SC-004).

### Paste preview (pure, `parseClipRows`)

```ts
interface ParsedClip {
  file_name: string; clip_no: number; source: string
  in_ms: number; out_ms: number; title: string; link: string | null
}
interface UnmatchedRow { cells: string[]; link: string | null; title: string; file_name: string }   // editable
interface PastePreview { fresh: ParsedClip[]; existing: ParsedClip[]; unmatched: UnmatchedRow[]; overflow: number }
```

An unmatched row fixed in place is re-parsed. If its file name now matches, it joins `fresh`. If it is still unmatched with a title, it can be added with blank details. **Leave out** drops it.

### Files cell state (local)

```ts
type FilesCellState =
  | { kind: 'idle' }
  | { kind: 'uploading'; name: string; progress: number | null }
  | { kind: 'failed'; name: string; error: string; retryable: boolean; file: File }
  | { kind: 'tooLarge'; name: string; size: number }
```

### Preferences (localStorage, research R12)

| Key | Value | Default |
|---|---|---|
| `momentum.sheet.columns.<memberId>` | `SheetColumnSet` | `defaultColumnSet(member.role)` |
| `momentum.sheet.dropped` | `'1'` / `'0'` | `'1'` (on) |

## 4. State transitions

### Clip life

```text
(paste / + Clip) ──addClips──▶ live @ todo ──setTaskStage (allowedStages)──▶ live @ any stage in path
        live ──dropClip──▶ dropped (status, stage_date unchanged; off the board)
     dropped ──restoreClip──▶ live (status unchanged; stage_date shifted so business days elapsed are as at drop)
```

- Moving a clip doesn't move its video, and moving the video doesn't move its clips (FR-024).
- A dropped clip can't be moved. Its status cell is read-only until it is restored. `setTaskStage` refuses with `dropped`.

### Status cell

```text
idle ──open──▶ menu(allowedStages) ──choose──▶ saving (optimistic) ──ok──▶ idle [+ celebration if own stage & forward]
                                                         └──refused──▶ idle (previous stage) + note (FR-022)
saving ──ok & target = publish──▶ published-link prompt ──save/skip──▶ idle
```

### Files cell

```text
idle ──paste URL──▶ addLinkAttachment ──▶ idle ("Drive"/"Link")
idle ──Upload──▶ size check ──over──▶ tooLarge (offer link) ──paste link──▶ idle
                     └──ok──▶ uploading ──stored──▶ idle (+ cover thumb) │ ──failed──▶ failed ──Retry──▶ uploading
```

## 5. Validation rules (server is authoritative)

| Rule | Where |
|---|---|
| The parent is a Video, not itself a clip, and not dropped | `addClips` |
| ≤ 200 rows per call; each title 1–200 characters after trimming (a blank title becomes the file name, or `Clip {n}`) | `addClips` |
| `in_ms`, `out_ms`, `clip_no` and `source` re-derived from `file_name` by `FILE_RE` on the server; the client's values are ignored for pasted rows | `addClips` |
| `0 ≤ in_ms < out_ms ≤ 24 h` | `updateClip`, client |
| A link is `http:` or `https:`, ≤ 2,000 characters | `addClips`, `addLinkAttachment`, `updateClip(published_url)` |
| Edit, upload, drop and restore require `canAct` (owner, assignee, admin, superuser) | `updateTask`, `updateClip`, `addLinkAttachment`, upload route, `dropClip`, `restoreClip` |
| Moves require `allowedStages(task, member)` to contain the target, and the task not dropped | `setTaskStage`, `moveTask` |
| Duplicate `(video_id, file_name)` is skipped and reported, not an error | `addClips` (unique index, P2002) |
