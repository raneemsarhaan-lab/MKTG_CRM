# Data Model: A Calmer Board Header

**No stored data changes.** No schema change and no new server action. This page records the UI state the header reads and writes, and where each piece is kept. All of it already exists, except the two marked **new**.

## Types

```ts
// src/types/index.ts
export type BoardView = 'board' | 'sheet' | 'content'   // existing
export type BoardTab  = 'pipeline' | 'content'          // new: derived, never stored
```

## State

| State | Owner | Kept in | Read by | Written by |
|---|---|---|---|---|
| `view: BoardView` | `KanbanBoard` | address `?view=` (history API), as today | tabs, `ViewPair`, which body renders | tabs, `ViewPair`, "Open video sheet" from Content |
| `tab: BoardTab` | derived: `view === 'content' ? 'content' : 'pipeline'` | — | tabs, title | — |
| `lastPipelineView` (**new**) | `KanbanBoard` | memory (this visit) | the Pipeline tab | whenever `view` is board or sheet |
| `filters.search` | `KanbanBoard` | memory, as today | board filter (as today); `query` prop to both sheets (R6) | the top-bar search box |
| `scope: 'me' \| 'team'` | `KanbanBoard` | `localStorage momentum.board.scope`, as today | the My tasks \| Team tasks pair | the same |
| `filters.brandIds` | `KanbanBoard` | memory, as today | `BrandMenu`, board filter | `BrandMenu` (today's toggle rule) |
| `filters.*` (other) | `KanbanBoard` | memory, as today | `FiltersButton` | `FiltersButton` |
| `showUpstream` | `KanbanBoard` | `localStorage momentum.board.upstream`, as today | Display options | Display options |
| `inbox.showWeek`, `inbox.pinned` | member fields, as today | database, as today | Display options, the page layout | Display options, the Inbox panel |
| Inbox counts and ring keys | `inboxModel`, as today | — | the compact `InboxButton` | — |
| `searchOpen` (**new**, phones only) | `BoardHeader` | memory | top-bar layout | the search icon, ✕, Esc |

## Rules carried over unchanged (FR-003)

- **Brands.** An empty `brandIds` means every brand. Choosing every brand clears back to empty. "N no project assigned" shows only when exactly one brand is chosen.
- **Filters count.** It counts every filter except brands and search.
- **New task.** It shows when `currentUser.access !== 'user'`.
- **Inbox.**
  - Its badge counts `counts.total`, shown as "99+" over 99.
  - The badge is urgent when `counts.urgent` is set.
  - At zero it shows no badge and reads "All clear".

## Search on the sheets (R6)

**Video sheet.** Matching is case-insensitive, on titles.
- A clip whose title or file name matches is kept, with its video row.
- A video whose name matches keeps all its clips.
- Single-video mode and the Show dropped toggle apply first, then the query.

**Content sheet.**
- A piece whose title matches is kept, with its theme and pillar rows.
- A theme whose name matches keeps all its pieces.
- The Mine and Show archived toggles apply first.
