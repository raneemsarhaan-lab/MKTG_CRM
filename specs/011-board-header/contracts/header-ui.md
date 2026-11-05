# UI Contract: The Board Header

The look follows `design/board-header.html`. This contract fixes the components, their props, the data attributes the labs rely on, the keyboard behaviour and the breakpoints.

## 1. Components

```ts
// src/components/board/BoardHeader.tsx: rows 1 and 2, on every view
BoardHeader(props: {
  tab: BoardTab
  onTab(tab: BoardTab): void
  search: string
  onSearch(q: string): void
  inbox: { counts: InboxCounts; ringKeys: string[]; open: boolean; onToggle(): void; buttonRef: Ref<HTMLButtonElement> }
  member: Member                 // avatar + UserMenu variant "header"
  canCreate: boolean             // access !== 'user'
  onNewTask(): void
})

// src/components/board/BoardToolbar.tsx: row 3 on Pipeline · Board
BoardToolbar(props: {
  scope: 'me' | 'team'; onScope(s): void
  brands: Brand[]; brandIds: string[]; onBrandIds(ids: string[]): void
  noProject: number | null       // shown only when exactly one brand is chosen
  filters: ReactNode             // <FiltersButton …/> from BoardFilters
  view: 'board' | 'sheet'; onView(v): void
  display: ReactNode             // <ViewMenu …/> (Display options)
})

// src/components/board/ViewPair.tsx: Board | Sheet (toolbar and video sheet bar)
ViewPair(props: { view: 'board' | 'sheet'; onView(v): void })

// src/components/board/BrandMenu.tsx
BrandMenu(props: { brands: Brand[]; selected: string[]; onChange(ids: string[]): void })

// Changed
InboxButton(props: …today's…, variant?: 'full' | 'compact')      // compact on the header
UserMenu(props: …today's…, variant?: 'sidebar' | 'rail' | 'header')
VideoSheet(props: …today's…, query?: string)                     // the 3-way switch → <ViewPair/> at the bar's end
ContentSheet(props: …today's…, query?: string)                   // the 3-way switch removed
```

## 2. Data attributes (for the labs)

| Attribute | On |
|---|---|
| `data-board-header` | the header wrapper (rows 1–2) |
| `data-top-bar`, `data-title-row`, `data-toolbar` | the three rows (the sheet bars also get `data-toolbar`) |
| `data-tab="pipeline\|content"` | the tab buttons (`role="tab"`, `aria-selected`) |
| `data-header-search` | the search input; `data-search-open` and `data-search-close` on phones |
| `data-inbox-button`, `data-inbox-badge`, `data-inbox-summary` | kept from spec 006 (summary visually hidden in the compact variant) |
| `data-account` | the avatar trigger |
| `data-page-title` | the `<h1>` |
| `data-new-task` | + New task |
| `data-scope="me\|team"` | the scope pair buttons (`aria-pressed`) |
| `data-brand-menu` (trigger), `data-brand-option="<id>\|all"` | the brand dropdown |
| `data-filters` | the Filters trigger |
| `data-no-project` | the "N no project assigned" note |
| `data-view-pair`, `data-view="board\|sheet"` | `ViewPair` buttons (`aria-pressed`) |
| `data-display-options` | the Display options trigger (the `ViewMenu` items keep `data-view` and `menuitemcheckbox`) |

These are removed: the greeting, the PIPELINE heading, the brand logo buttons, the dark Board label, and `data-view-switch` (the three-way switch).

## 3. Keyboard

- **Tab order** follows the screen:
  1. the tabs;
  2. search;
  3. Inbox;
  4. avatar;
  5. New task;
  6. the scope pair;
  7. brands;
  8. Filters;
  9. Board | Sheet;
  10. Display options.
  In Arabic this is the same order, visually mirrored.
- **Tabs.** ←/→ move between Pipeline and Content (mirrored in Arabic); Enter or Space chooses.
- **Dropdowns** (brands, Filters, Display options, avatar):
  - Enter, Space or ↓ opens, and focus moves to the first item;
  - ↑ and ↓ move;
  - Enter or Space chooses (the brand and filter lists stay open, so several can be ticked);
  - Esc closes and returns focus to the trigger;
  - Tab leaves and closes.
- **Phone search.** The icon opens the field with focus in it. Esc or ✕ closes it and returns focus to the icon; the text is kept.
- **Focus rings.** Every control has a visible 2.5 px purple focus ring.

## 4. Breakpoints and sizes

| Width | Top bar | Title row | Toolbar |
|---|---|---|---|
| ≥ 1280 | tabs · search (up to 520 px, centred) · Inbox · divider · avatar, one line, 70 px | 92 px; title 38 px | one line; far-end group with labels |
| 1024–1279 | search 200–360 px | same | far-end group shows icons only (names as `title` and `aria-label`) |
| ≤ 767 | tabs · search icon · Inbox icon with corner badge · avatar; search opens over the bar | 64 px; title 28 px; New task 44 px | one row, `overflow-x: auto`, snap; targets ≥ 44 px; no-project note hidden |

Colours: `PIPE.limeCta` (New task), `--purple`/`#F0EBFE` (selected tab and pair), `INBOX_UI.urgent` (urgent badge), `PIPE.borderInput` (outlines), `PIPE.border` (dividers). Fonts: `--font-heading` (title, tabs, New task), `--font-body` (the rest).

## 5. Removed from the Board

- the greeting ("Hey, Raneem 👋") and its tagline;
- the identity chip (name and role);
- the PIPELINE heading;
- the brand logo row;
- the dark "Board" label;
- the three-way switch, in the header and in both sheet bars.
