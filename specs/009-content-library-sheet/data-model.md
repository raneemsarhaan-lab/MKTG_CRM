# Data Model: Content Library Sheet

**Feature**: spec 009 · **Plan**: [plan.md](./plan.md) · **Research**: [research.md](./research.md)

Applied with `prisma db push`. Every new field is nullable or has a default, so existing rows need no backfill. The seed adds three content types.

## 1. Schema changes

### `Project` (existing)

| Field | Type | Meaning |
|---|---|---|
| `is_theme` | `Boolean @default(false)` | Shown in the Content sheet as a theme (R1) |
| `owner_id` | `String? @db.Uuid` → `Member` (`ThemeOwner`, SetNull) | The theme's owner |
| `frequency_count` | `Int?` | 1–50 |
| `frequency_period` | `String?` | `week` or `month` |
| `audience` | `String[] @default([])` | Audience keys (§3) |
| `pillars` | relation `ContentPillar[]` | |

### `ContentPillar` (new): `@@map("content_pillars")`

| Field | Type | Rule |
|---|---|---|
| `id` | `String @id @default(uuid()) @db.Uuid` | |
| `project_id` | `String @db.Uuid` → `Project` (Cascade) | |
| `name` | `String` | 1–80 characters; unique per theme ignoring case (checked in the actions) |
| `sort_order` | `Int @default(0)` | Creation order |
| `created_at` | `DateTime @default(now())` | |

### `Task` (existing)

| Field | Type | Meaning |
|---|---|---|
| `pillar_id` | `String? @db.Uuid` → `ContentPillar` (SetNull) | The piece's pillar |
| `post_url` | `String? @db.Text` | The social post link (LinkedIn) |

(`published_url` and `dropped_at` come from spec 008.)

### `TaskAttachment` (existing)

| Field | Type | Meaning |
|---|---|---|
| `link_role` | `String?` | `working_doc` or `design` on link attachments; null otherwise |

### Content types (seed)

Article, Report and Framework/Model are added, each with SLA rows equal to Post's.

## 2. Client types (`src/types/index.ts`, first per §VI)

```ts
export type BoardView = 'board' | 'sheet' | 'content'
export type FrequencyPeriod = 'week' | 'month'
export type AudienceKey = 'c-level' | 'strategy-heads' | 'top-management' | 'second-line' | 'ceo-mid'
export type LinkRole = 'working_doc' | 'design'

export interface ContentTheme {
  id: string; name: string; brand_id: string | null
  owner_id: string | null; frequency_count: number | null; frequency_period: FrequencyPeriod | null
  audience: AudienceKey[]; pillars: { id: string; name: string; sort_order: number }[]
}
// Task gains: pillar_id?: string | null; post_url?: string | null
// TaskAttachment gains: link_role?: LinkRole | null
```

## 3. Fixed lists

| Audience key | Label (en) |
|---|---|
| `c-level` | C-Level of large companies |
| `strategy-heads` | Strategy Heads |
| `top-management` | Top Management |
| `second-line` | 2nd Line Management |
| `ceo-mid` | CEO of medium-sized companies |

## 4. Derived (pure, `src/components/content/`)

- **Rows** (`rows.ts`). In order:
  - a theme row;
  - for each pillar in order: a pillar row, then its pieces (by due date, nulls last, then `created_at`);
  - pieces without a pillar;
  - drafts;
  - the "+ Piece" row.

  An expanded video piece is followed by its clips (spec 008 order). Filters: Mine (owner or assignee) and Show archived.
- **Summary** (`summary.ts`), over the themes shown:
  - pieces: live, not clips;
  - published;
  - in design: `r-design`, `d-prog`, `d-check`, `final-check`;
  - published without a published link;
  - archived.
- **Cadence** (`cadence.ts`): `{ done, target, met }` for the current period (research R6).
- **Paste preview** (`parse-plan.ts`): `PlanPreview { themes: {name, isNew}[], pillars, fresh, linked, existing, problems }`, with each row carrying its problems.

## 5. State transitions

- **Pieces**: like clips (spec 008 data-model §4), with "Archive" for drop.
- **Paste plan**: preview → (fix or leave out) → add → `{ created, updated, skipped, themesCreated, pillarsCreated }`.

## 6. Validation (the server is authoritative)

| Rule | Where |
|---|---|
| New theme: admin or superuser | `addPlan`, `addTheme` |
| Add piece: admin, superuser, the theme owner, or a member owning or assigned a live piece in the theme | `addPlan`, `addPiece` |
| Edit theme or pillars: admin, superuser, the theme owner | `saveTheme`, `savePillar`, `removePillar` |
| Edit piece: `canAct` (owner, assignee, admin, superuser) | `updatePiece`, `setPieceLink`, `updateTask` |
| Links: http(s), at most 2,000 characters | everywhere |
| Frequency 1–50 per week or month; audience keys from §3 only | `saveTheme`, `addPlan` |
| Same title in a theme without a Task Link: skipped | `addPlan` |
| Task Link to a missing task: listed as a problem, row skipped | `addPlan` |
