# Research: A Calmer Board Header

Each entry gives the decision, the reasons, and the options set aside. The facts about today's code come from reading `KanbanBoard.tsx`, `BoardFilters.tsx`, `InboxButton.tsx`, `ViewMenu.tsx`, `UserMenu.tsx`, `VideoSheet.tsx`, `ContentSheet.tsx` and `globals.css` on main at merge 7217d11.

## R1. One header above all three views

**Decision.** A new `BoardHeader` renders the top bar and the title row once, above the Board, Sheet and Content views. `KanbanBoard` becomes one page column:
1. `BoardHeader`;
2. the view's own third row;
3. the view's body.

The sheets stop filling `100dvh` themselves. They take the height left under the header: `.fx-sheet` becomes `flex: 1; min-height: 0` inside the page column, which is `100dvh`, or `100dvh` minus the tab bar on phones.

**Rationale.**
- Today `view === 'sheet'` and `view === 'content'` return early from `KanbanBoard`. Each sheet then draws its own bar with its own Board | Sheet | Content switch, and no tabs, search, Inbox or New task.
- The spec's tabs (FR-010) and title (FR-004) must show on every view, so the header has to sit above them all.
- It also gives the Inbox and New task to the sheet views, which today hide them.

**Alternatives.**
- **Copy the top bar into each sheet.** That makes three copies to keep in step. Rejected.
- **Keep the header on Board only.** The Content tab would then have no tabs to return by. Rejected.

## R2. The third row belongs to the view

**Decision.**

| View | Row 3 |
|---|---|
| Pipeline · Board | `BoardToolbar`: My tasks \| Team tasks, divider, `BrandMenu`, Filters, the "N no project assigned" note, then on the far end `ViewPair`, divider, Display options |
| Pipeline · Sheet | The video sheet's existing bar. Its three-way switch is replaced by the same `ViewPair`, placed at the bar's end. Everything else stays: Back to all videos, the Editing / Copy / Full sets, Columns, + Column, Mine, Show dropped, Paste clips |
| Content | The Content sheet's existing bar, with its three-way switch removed: Columns, + Column, Mine, Show archived, + Theme, Paste plan |

**Rationale.**
- The spec says the sheet's own controls stay in its own bar (edge case), and that Content's toolbar shows its own controls (FR-036).
- Using the same `ViewPair` in the Board toolbar and the Sheet bar puts Board | Sheet in the same kind of control on both pipeline views.

**Alternatives.**
- **Fold the sheet controls into `BoardToolbar`.** It would double the toolbar, and change sheet code that the scope keeps. Rejected.

## R3. The brand filter: `BrandMenu` on `FieldPill`

**Decision.** `BrandMenu` is a `FieldPill` (the popover the Filter menu already uses).
- **The trigger reads:**
  - "All brands";
  - one brand's mark (logo or initial on its colour, today's `BrandMark`) and its name, cut with an ellipsis at 200 px;
  - or "N brands".
- **The list:** "All brands", a divider, then each brand with its mark, name and a check mark.
- **Selection logic:** today's `toggleBrand` from `BoardFilters`. An empty list means "all", and choosing every brand clears back to empty.
- **The "N no project assigned" note** keeps its rule (exactly one brand selected) and sits after Filters.

**Rationale.**
- `FieldPill` already does outside-click and Escape, and it already places itself on the correct side in Arabic.
- The selection rules exist and are correct. Moving them keeps FR-003.

**Alternatives.**
- **A new listbox primitive.** It would duplicate `FieldPill`. Rejected.
- **Keep the logo row and add a dropdown.** The row is what wraps the toolbar (spec Context). Rejected.

**As built (two changes from the decision above).**
- **A small `HeaderMenu`, not `FieldPill`.** `FieldPill` places its panel with a fixed `left`, so it doesn't mirror in Arabic. It also has no arrow-key movement, which contract §3 requires. `src/components/board/HeaderMenu.tsx` is a small button-and-panel primitive for the brand menu and Filters. The panel opens from the start side, focus moves inside, and Esc returns focus to the button. `FieldPill` is unchanged for the task form.
- **The pick rule fits a dropdown.** The old logo row started from "everything on", and clicking a logo turned that brand off. In a list with "All brands" at the top, picking a brand has to mean only that brand (US2, scenario 2). Further picks add brands, and picking a ticked brand removes it. Choosing every brand, or removing the last one, goes back to empty. Empty still means every brand everywhere `brandIds` is read. The rule is `pickBrand` in `BrandMenu.tsx`.

## R4. The Filters and Display options triggers

**Decision.**
- **Filters:** the Filter popover content moves unchanged into an exported `FiltersButton`. It has the same sections, the same `behindButton` count, and the label "Filters · 2" when filters are on.
- **Display options:** the trigger is `ViewMenu`'s own button, relabelled "Display options" (`header.display`) and restyled. Its two items and their saving are unchanged.
- Both triggers use the toolbar button style from the design: a 42 px high, 12 px radius outline with an icon.

**Rationale.** Only the triggers change, so nothing a member set up is lost (FR-032, FR-034).

## R5. A compact Inbox and the avatar's menu

**Decision.**
- **`InboxButton` gets `variant="compact"`:**
  - it shows the tray icon, "Inbox" and the badge, using today's badge and its `is-urgent` rule;
  - the summary line moves to the button's `title` and stays in the accessible name;
  - the `data-inbox-summary` element is kept, visually hidden, so screen readers and the inbox lab still read it;
  - the ring pulse, the "All clear" state (`is-zero`, now with no badge and an "All clear" title), `aria-controls`, and pinning are unchanged.
- **`UserMenu` gets `variant="header"`:**
  - an avatar trigger: photo or initials, 40 px, purple ring;
  - its panel opens downward from the trigger, positioned by `top`;
  - the profile, password and sign-out panels are reused as they are.

**Rationale.**
- The spec replaces spec 006 FR-012a with FR-012, and keeps the urgent colour and "All clear".
- `UserMenu` is the only account menu (FR-013 asks for the same one as the sidebar's).

## R6. Search on every view

**Decision.** The top bar's search box is the existing `filters.search`.
- **Board:** it filters cards as today: name, owner, project, brand.
- **Sheet:** the value goes to `VideoSheet` as `query`. A clip whose title or file name matches is kept with its video row, and a video whose name matches keeps all its clips.
- **Content:** the value goes to `ContentSheet` as `query`. A piece whose title matches is kept with its theme and pillar rows, and a theme whose name matches keeps all its pieces.
- **An empty query** changes nothing.

**Rationale.**
- After R1 the search box is visible on all three views, and a box that does nothing on two of them would be a bug.
- Filtering by title is the plain meaning of the placeholder.
- It is the only behaviour this feature adds. It is recorded here, and it doesn't touch stored data.

**Alternatives.**
- **Hide search on the sheet views.** The top bar would then change shape between tabs, against the reference. Rejected.
- **Switch to Board when someone types.** That would be surprising. Rejected.

## R7. The title row

**Decision.**
- **The title:** an `<h1>` reading `header.pipeline` or `header.content`, in Montserrat 800 at 38 px (28 px on phones), with the `TitleTicks` accent (purple stroke, mirrored in Arabic).
- **+ New task:** today's lime pill (`PIPE.limeCta`, 48 px), the same `setShowTaskForm(true)`, and the same gate.
- **The row's height** is fixed (92 px on desktop, 64 px on phones), so hiding New task doesn't move the toolbar.

**Removed:**
- the greeting state and its time-of-day effect;
- the tagline;
- the PIPELINE heading;
- the dark "Board" label.

My Day's `GreetingHeader` is untouched.

## R8. Strings: a `header` namespace

**Decision.** New keys in `messages/en.json` and `messages/ar.json`:
- `pipeline`, `content`, `tabsLabel`;
- `search`, `searchOpen`, `searchClose`;
- `mine`, `team`, `scopeLabel`;
- `allBrands`, `oneBrand`, `nBrands`, `brandsLabel`;
- `filters`, `filtersN`;
- `display`;
- `board`, `sheet`, `viewLabel`;
- `newTask`;
- `noProject`, `allAttached`;
- `account`.

The Arabic follows the existing words:
- البراندات (brands);
- الجدول (Sheet);
- اللوح (Board);
- الوارد (Inbox);
- المحتوى (Content).

**Rationale.** Today the header's English is hard-coded ("Only me", "Filter", "Search tasks, campaigns, assets...", "New task"), which fails FR-042. The labs' messages-parity check covers the new namespace.

## R9. Responsive behaviour, in CSS where possible

**Decision.** A new `/* ─── board header (spec 011)` block in `globals.css`, using the project's breakpoints (`src/lib/breakpoints.ts`: 1279, 1023, 767).

- **1280 px and wider:** each row is one line.
- **1024–1279 px:**
  - search shrinks to 200 px;
  - then the toolbar's far-end group (Board | Sheet and Display options) shows icons only, with names as `title` and `aria-label`.
- **767 px and narrower:**
  - the top bar: tabs, a search icon, the Inbox icon with its corner badge, and the avatar;
  - opening search makes the field fill the top bar, with a ✕ to close;
  - the title row is 64 px;
  - the toolbar is one row with `overflow-x: auto` and scroll snapping;
  - controls are at least 44 px high;
  - the "no project" note is hidden.

Only the phone search's open or closed state is JavaScript (local `useState`). The old `.fx-board-head` and `.fx-board-tools` phone rules are removed with the markup they styled.

## R10. Tab and view mapping, and links

**Decision.**
- `BoardTab` is derived: `view === 'content'` gives `content`; otherwise it is `pipeline`.
- Choosing **Pipeline** returns to the last pipeline view this session (board or sheet; board by default).
- Choosing **Content** sets `view = 'content'`.
- `ViewPair` sets `board` or `sheet`.
- The address handling is today's: `?view=sheet|content`, `&video`, `&row`, written with the history API. Saved links keep working (US4, scenario 4).

## R11. Testing without a database: `lab:header`

**Decision.** A new lab at `scripts/header-lab/`, following the inbox lab's pattern (esbuild bundle, stub host, Playwright).

**Setup.** The lab mounts `BoardHeader`, `BoardToolbar` and both sheet bars. It has:
- four brands;
- an Inbox count that can be switched between urgent, normal and clear;
- a member that can be switched between admin and user.

**Scenarios, one or more per acceptance scenario:**
- the three-row order and the removed items;
- the brand dropdown (one brand, two brands, All brands, the note);
- the Inbox states, its tooltip and accessible name;
- tabs and the view pair, with the address;
- the phone layout (390 px), search open and closed, 44 px targets;
- Arabic mirroring;
- the Tab order;
- the dropdown keyboard (Enter or ↓, ↑↓, Esc returning focus);
- axe;
- messages parity.

**Regressions:**
- `lab:inbox`: the button's selectors keep working, and the summary assertion reads the hidden summary;
- `lab:sheet`: scenarios that used the three-way switch move to `ViewPair`, or drop the Content button.

**Running app.** SC-001 and SC-002 (positions) and SC-005 (12 brands on one line) are measured with Playwright against `next dev` on local PostgreSQL.

## R12. What stays as it is

These are the user's confirmed scope:
- the pipeline columns and cards;
- the left sidebar and the phone tab bar;
- the sheet grids and their popups;
- the Inbox panel and its pinning;
- the task form;
- `HeroCards` ("Show your week"), which sits between the toolbar and the pipeline as it does today below the header.
