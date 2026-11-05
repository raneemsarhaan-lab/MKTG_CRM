# Feature Specification: A Calmer Board Header

**Feature Branch**: `claude/nice-noether-x4rgei`

**Created**: 2026-11-05

**Status**: Draft

**Input**: User description: "improve the UI of this section", with a reference image of the target header (`reference.webp` in this folder). Today's header is in `current-desktop.png` and `current-phone.png`.

## Context

The Board's header is the band above the pipeline columns. Today it holds, from top to bottom:

1. A handwritten greeting ("Hey, Raneem 👋") and a tagline.
2. One crowded line:
   - a small Board / Sheet / Content switch;
   - search;
   - a large filled purple Inbox pill with a count and a summary line;
   - the member's avatar, name and role;
   - **+ New task**.
3. A filter line:
   - Only me / Team;
   - an **All brands** pill followed by one round logo per brand;
   - a dark **Board** button that does nothing (it only labels the view);
   - **Filter** and **View**.
4. A handwritten **PIPELINE** heading.

The problems:

- **Too much height.** On a 1440 × 900 screen the first pipeline column starts about 355 px down. On a 390 px phone it starts about 540 px down, past three quarters of the screen.
- **The same thing in several places.** "Board" appears twice: in the switch, and as the dark button that does nothing. The page is named twice: by the greeting, and by PIPELINE.
- **No order.** Navigation, search, notifications, identity, the main action, scope and filters all sit side by side, with equal weight.
- **Brand logos grow with the brand list.** One logo per brand pushes Filter and View onto a new line once there are more brands.
- **The Inbox shouts.** It is the largest object on the page, even when its count is routine.

The reference image puts the same functions in three calm rows:

1. **A top bar**:
   - page tabs **Pipeline | Content**;
   - search in the middle;
   - **Inbox** with a count badge;
   - a divider, then the avatar.
2. **A title row**: **Pipeline**, with the brand's purple tick accent, and **+ New task** on the far end.
3. **A toolbar**:
   - **My tasks | Team tasks**;
   - a divider, then an **All brands ▾** dropdown and **Filters**;
   - on the far end, **Board | Sheet**, a divider, then **Display options**.

This feature changes how the header is laid out and how it looks. It doesn't change what any control does.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - A header that reads in three rows (Priority: P1)

A team member opens the Board. They see three rows:

1. **Where am I, and what's waiting for me**: tabs, search, Inbox and avatar.
2. **This page and its main action**: "Pipeline" and + New task.
3. **How the board is shown**: whose tasks, which brands, filters, Board or Sheet, and display options.

The pipeline columns start right below.

**Why this priority**: It is the request itself. It also gives the space back to the board, which is what people come to the page for.

**Independent Test**: Open the Board at 1440 × 900. Compare with the reference image. Every row matches, in its order, and the first column starts higher than today. Then check that each of the functions the header has today is still there and works.

**Acceptance Scenarios**:

1. **Given** a member on the Board, **When** the page loads, **Then** the header shows three rows in this order:
   - the top bar: tabs, search, Inbox, avatar;
   - the title row: Pipeline, + New task;
   - the toolbar: scope, brands, Filters, Board | Sheet, Display options.
2. **Given** the old header, **When** the new one replaces it, **Then** the greeting, the tagline, the handwritten PIPELINE heading and the dark Board label are gone, and nothing they did is lost.
3. **Given** a 1440 × 900 screen, **When** the Board loads, **Then** the first pipeline column starts no lower than 280 px from the top of the page.
4. **Given** a member who may not create tasks, **When** they open the Board, **Then** the title row shows "Pipeline" with no + New task, as today.
5. **Given** any control in the new header, **When** it is used, **Then** it does exactly what its counterpart does today:
   - the same search;
   - the same Inbox panel;
   - the same filter menu;
   - the same Display options (the View menu: "Show your week", "Columns before design");
   - the same New task form.

---

### User Story 2 - Brands in a dropdown (Priority: P1)

Instead of one round logo per brand, the toolbar has one **All brands ▾** button. It opens a list of brands, each with its logo and name and a check mark. The member can pick one brand or several. The button then names the brand ("Forefront"), or counts them ("2 brands"). "All brands" in the list turns every brand back on.

**Why this priority**: The logo row is what pushes the toolbar onto two lines, and it gets longer with every brand. Brands are the filter people use most, so the toolbar can't be fixed without this.

**Independent Test**: With four brands, open the dropdown. Pick one: the button shows its name and the board shows only that brand. Pick a second: the button reads "2 brands". Choose "All brands": every task is back.

**Acceptance Scenarios**:

1. **Given** no brand filter, **When** the member looks at the toolbar, **Then** the button reads "All brands".
2. **Given** the dropdown is open, **When** the member picks one brand, **Then** the board shows only that brand's tasks, and the button shows that brand's logo and name.
3. **Given** one brand is selected, **When** the member picks a second one, **Then** the button reads "2 brands", and the board shows both.
4. **Given** one brand is selected, **When** some of its tasks have no project, **Then** the "N no project assigned" note still shows beside the toolbar, as it does today.
5. **Given** some brands are selected, **When** the member picks "All brands", **Then** the filter clears.
6. **Given** a brand with no logo, **When** it is listed, **Then** it shows its initial on its colour, as it does today.

---

### User Story 3 - A quieter Inbox (Priority: P2)

The Inbox becomes a compact button: an inbox icon, the word "Inbox", and a round count badge, as in the reference. The summary line ("2 reviews waiting · 1 due today") moves into the button's tooltip and its accessible name. The panel it opens is unchanged.

**Why this priority**: Today it is the loudest thing on the page. The count is still visible at a glance, and urgency still shows through the badge colour.

**Independent Test**: With 8 items, 1 of them late: the button reads "Inbox 8" with the badge in the urgent colour. Hovering shows the summary line. A screen reader reads the count and the summary. With nothing waiting: no badge, and the tooltip reads "All clear".

**Acceptance Scenarios**:

1. **Given** items need the member, **When** they look at the top bar, **Then** they see the inbox icon, "Inbox" and a badge with the number.
2. **Given** at least one of those items is late or due today, **When** the badge shows, **Then** it uses the "urgent" colour from spec 006. Otherwise it uses the brand purple.
3. **Given** nothing needs the member, **When** they look at the top bar, **Then** there is no badge, and the tooltip reads "All clear".
4. **Given** the button, **When** it is hovered, focused or read by a screen reader, **Then** the summary line is available ("2 reviews waiting · 1 due today").
5. **Given** the button, **When** it is clicked, **Then** the Inbox panel opens as today, pinning still works, and the count updates as it does today.

---

### User Story 4 - Pipeline and Content as page tabs, Board and Sheet in the toolbar (Priority: P2)

The three-way switch splits in two:

- **Pipeline | Content** are the page tabs in the top bar.
- **Board | Sheet** is a pair in the toolbar. It changes how the pipeline is shown.

The title follows the tab: "Pipeline" or "Content".

**Why this priority**: Content is a different page: its own plan, themes and pieces. Board and Sheet are two ways of showing the same pipeline. Splitting the switch makes that clear, and removes the "Board" label that does nothing.

**Independent Test**: From Pipeline · Board, choose Sheet: the video sheet shows, the Pipeline tab stays selected, and the address bar shows the sheet view. Choose the Content tab: the Content sheet shows, with its own toolbar. Go back with the browser: the earlier view returns. Open a saved link to the sheet: the Sheet view opens.

**Acceptance Scenarios**:

1. **Given** the Board, **When** the member looks at the top bar, **Then** "Pipeline" is the selected tab and "Board" is the selected view in the toolbar.
2. **Given** Pipeline, **When** the member chooses Sheet, **Then** the video sheet shows, the Pipeline tab stays selected, and the address changes as it does today.
3. **Given** any view, **When** the member chooses the Content tab, **Then**:
   - the title reads "Content";
   - the toolbar shows the Content sheet's own controls (Columns, + Column, Mine, Show archived, + Theme, Paste plan) in place of the pipeline toolbar;
   - nothing else from the pipeline toolbar shows there.
4. **Given** links saved before this change (Board, Sheet, Content), **When** they are opened, **Then** they open the same view as before.
5. **Given** the old dark "Board" label, **When** the new toolbar shows, **Then** it is gone. Board | Sheet is the only view control.

---

### User Story 5 - The header on a phone (Priority: P2)

On a 390 px phone, the header keeps the same order, made compact:

1. **The top bar**: the tabs, a search icon that opens the search field, the Inbox icon with its badge, and the avatar.
2. **The title row**: "Pipeline" and + New task.
3. **The toolbar**: one row that scrolls sideways, without wrapping.

**Why this priority**: Today the phone header takes three quarters of the first screen.

**Independent Test**: At 390 × 700, open the Board. The first pipeline column starts in the top half of the screen. Every control from the desktop header can be reached. Search opens from its icon and closes with Esc or ✕.

**Acceptance Scenarios**:

1. **Given** a 390 px wide screen, **When** the Board loads, **Then** the first pipeline column starts no lower than 320 px from the top.
2. **Given** a phone, **When** the member taps the search icon, **Then** a search field opens over the top bar with the cursor in it. Esc or ✕ closes it and keeps the search text.
3. **Given** the toolbar on a phone, **When** its controls are wider than the screen, **Then** they scroll sideways in one row, and no control is cut in half when scrolling stops at either end.
4. **Given** a phone, **When** the header shows, **Then** every control has a touch target of at least 44 × 44 px.

---

### User Story 6 - Arabic and keyboard (Priority: P3)

In Arabic, the header mirrors: the tabs are on the right and the avatar on the left, and dropdowns open toward the start side. With the keyboard alone, Tab moves through the controls in the order they appear on screen, and every dropdown opens with Enter or ↓ and closes with Esc.

**Why this priority**: The team works in both languages, and every earlier spec holds this bar.

**Independent Test**: Switch to Arabic. The header is a mirror of the English one, and all its words are in Arabic. Then, with the keyboard only, reach and use every control, top bar first.

**Acceptance Scenarios**:

1. **Given** Arabic, **When** the Board loads, **Then** the header mirrors, and every label is in Arabic (brand names and member names as typed).
2. **Given** the keyboard only, **When** the member presses Tab from the page start, **Then** focus moves through the controls in this order:
   - the top bar: tabs, search, Inbox, avatar;
   - the title row: New task;
   - the toolbar, from start to end.
3. **Given** any dropdown (brands, Filters, Display options, avatar), **When** it is opened with the keyboard, **Then** focus moves into it, ↑↓ move, Enter or Space chooses, and Esc closes it and returns focus to its button.

---

### Edge Cases

- **Many brands (10 or more)**: the dropdown list scrolls. The button never grows beyond one brand name; with several selected it reads "N brands".
- **A very long brand name**: it is cut with an ellipsis on the button, and shown in full in the list and the tooltip.
- **Filters active**: the Filters button shows how many filters are on ("Filters · 2"), as Filter does today. Brands and search don't count toward it, as today.
- **Inbox count over 99**: the badge reads "99+".
- **A member who may not create tasks**: no + New task. The title row keeps its height, so the layout doesn't jump.
- **Inbox pinned beside the board** (spec 006): the header spans the full width above both the board and the pinned panel.
- **"Show your week" on**: the week cards sit between the toolbar and the pipeline, as they do today below the header.
- **Narrow desktop windows (1024–1279 px)**: search narrows first. Then the button labels in the toolbar's far-end group shorten to their icons, keeping their names as tooltips and accessible names. Nothing wraps onto a fourth row.
- **The Sheet view's own controls** (Editing / Copy / Full, Paste clips…) stay in the sheet's own bar under the header, as they are today.
- **The sidebar is collapsed**: the header uses the extra width. No control moves to another row.

## Requirements *(mandatory)*

### Functional Requirements

**Structure**

- **FR-001**: The Board header MUST be three rows, in this order:
  - the top bar: page tabs, search, Inbox, avatar;
  - the title row: page title, + New task;
  - the toolbar: scope, brands, Filters, view, Display options.
- **FR-002**: The greeting, the tagline, the handwritten PIPELINE heading and the dark "Board" label MUST be removed from the Board. My Day keeps its own greeting.
- **FR-003**: Every function the header has today MUST still be reachable from the new header, and MUST behave exactly as today. That means:
  - search;
  - the Inbox, including pinning;
  - New task;
  - Only me / Team;
  - the brand filter;
  - the "no project assigned" note;
  - Filter;
  - the View menu ("Show your week", "Columns before design");
  - Board / Sheet / Content.
- **FR-004**: The page title MUST follow the selected tab ("Pipeline" or "Content"). It MUST be the page's main heading for screen readers, and carry the brand's purple tick accent shown in the reference.

**Top bar**

- **FR-010**: The tabs MUST be **Pipeline** and **Content**, with the selected one shown as a filled pill, as in the reference.
- **FR-011**: Search MUST sit in the middle of the top bar, with today's placeholder and behaviour.
- **FR-012**: The Inbox MUST be a compact button: icon, "Inbox" and a count badge.
  - The badge MUST use the urgent colour when an item is late or due today, and the brand purple otherwise.
  - With nothing waiting, there MUST be no badge.
  - The summary line MUST be the button's tooltip and part of its accessible name.
  - This replaces spec 006 FR-012a (a filled purple button, at least as tall as + New task). Everything else in spec 006 stands.
- **FR-013**: The avatar MUST show the member's initials or photo, with their name and role as its tooltip and accessible name. Activating it MUST open the same account menu the sidebar's member card opens. A divider separates it from the Inbox.

**Title row**

- **FR-020**: **+ New task** MUST sit at the far end of the title row, in the lime call-to-action style. It MUST be shown only to members who may create tasks, as today.

**Toolbar**

- **FR-030**: **My tasks | Team tasks** MUST replace "Only me | Team", with the same meaning and the same saved choice.
- **FR-031**: The brand filter MUST be one dropdown button:
  - it reads "All brands", one brand's logo and name, or "N brands";
  - its list shows each brand's logo and name with a check mark, plus an "All brands" entry that clears the filter.
- **FR-032**: **Filters** MUST open today's filter menu, and show how many filters are active, as today.
- **FR-033**: **Board | Sheet** MUST be a two-way switch at the far end of the toolbar. It changes the view as today, including the address and the browser's back button.
- **FR-034**: **Display options** MUST open today's View menu, unchanged.
- **FR-035**: Thin vertical dividers MUST separate:
  - scope from the brand and filter group;
  - the view switch from Display options;
  - in the top bar, the Inbox from the avatar.
- **FR-036**: On the Content tab, the toolbar row MUST show the Content sheet's own controls, and the pipeline-only controls MUST be hidden.

**Responsive, language, access**

- **FR-040**: At 1280 px wide and over, each row MUST fit on one line. Between 1024 and 1279 px:
  - search narrows first;
  - then the toolbar's far-end group shows icons only, keeping its names as tooltips and accessible names.
- **FR-041**: On phones (under 768 px), the header MUST follow User Story 5:
  - search behind an icon;
  - a one-row toolbar that scrolls sideways;
  - touch targets of at least 44 × 44 px.
- **FR-042**: Every new word MUST exist in English and Arabic. The header MUST mirror in Arabic.
- **FR-043**: Every control MUST be reachable and usable with the keyboard, in the order it appears on screen. Every control MUST have a visible focus ring.
- **FR-044**: Colours, type, radii and spacing MUST come from the project's design tokens. The look MUST follow a design file made before the UI work, starting from the reference image.

### Key Entities

No new data. The header reads what the Board already has:

- the member and their access;
- the brands;
- the Inbox counts;
- the saved scope, filter and view choices.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: At 1440 × 900, the first pipeline column starts at 280 px or less from the page top (today about 355 px).
- **SC-002**: At 390 × 700, the first pipeline column starts at 320 px or less from the page top (today about 540 px).
- **SC-003**: Every header function listed in FR-003 can be reached and works in the new header: 9 of 9, counting the View menu's two options and the Inbox's pinning with their parents.
- **SC-004**: Placed side by side at 1440 px, the new header matches the reference image's three rows, their contents and their order. Each difference is listed and agreed before release.
- **SC-005**: With 4 or 12 brands, the toolbar stays on one line at 1280 px.
- **SC-006**: A member who knows today's header finds each of these on the first try:
  - Sheet;
  - Content;
  - a brand filter;
  - "Columns before design";
  - the Inbox.
- **SC-007**: No critical or serious accessibility issues in an automated check of the header and its dropdowns, in English and Arabic.

## Assumptions

- **The sidebar stays.** The reference shows only the header band. The left sidebar (My Day, Board, Projects, Team, Capacity, Settings) keeps the app's navigation and logo, so the top bar shows no logo of its own on desktop. If the reference meant to replace the sidebar with a top bar, that is a separate, app-wide change.
- **"Pipeline" is the Board page.** The sidebar's "Board" item still leads here. Only the in-page labels change.
- **The greeting moves away from the Board, not out of the app.** My Day keeps its greeting. The Board's title is plain "Pipeline" in the heading font, with the purple tick accent from the reference.
- **Content keeps its own toolbar.** Spec 009 and 010 controls are unchanged; they take the toolbar row on the Content tab.
- **No behaviour changes.** Search, filtering, scope, the Inbox panel and its pinning, the View menu, New task and the saved preferences all keep their current rules. This spec moves and restyles them.
- **The reference is the visual target.** Its exact sizes are read from the image. Where it doesn't show something (Arabic, phones, a selected brand, the badge's urgent colour), the design file fills it in, following the existing tokens.

## Out of Scope

- New filters, new views or changes to the Inbox panel.
- The sidebar, My Day and the other pages' headers.
- Keyboard shortcuts for search or New task.
