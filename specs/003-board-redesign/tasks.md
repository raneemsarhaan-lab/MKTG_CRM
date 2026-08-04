# Tasks: Board redesign — Portfolio & Team Tasks

**Input**: `handoff_fluxo_boards/` — "Fluxo Portfolio - Design Spec.md" and
"Fluxo Team Tasks - Design Spec.md", each an exact-value spec for a `.dc.html`
reference file.

**Scope**: the two planning boards only — `/projects` and `/team`. The pipeline
board, its data and every permission rule are untouched. This is presentation.

**Assumptions taken** (the specs describe a mock; the app has real data):
- Sample avatars and the Omnisight icon in `assets/` are the mock's stand-ins
  for `member.avatar_url` and `brand.logo_url`. Real values are used; the files
  are not copied in.
- Fixed content tables (14 projects, "76%", "+12% vs last 7 days", the 21 bar
  heights) are the mock's data. Structure, sizing and colour are implemented
  literally; numbers come from the database.
- Sidebar nav is renamed to the spec's names — Home · Portfolio · Pipeline ·
  Team tasks · Settings — keeping existing routes.

---

## Phase 1 — Foundation

- [X] T001 Replace `src/lib/board-ui.ts` with the handoff palette and type
      scale, exactly as tabulated in both specs §1.

## Phase 2 — Portfolio (`/projects`)

- [X] T002 Header: eyebrow, 46×7 lime rule, Caveat 52 title, subtitle, and the
      segmented Focus/Aspiring toggle (§4).
- [X] T003 KPI row — 5 cards, tile tints, stroked icons, captions, and the
      progress bar on STEPS DONE (§5).
- [X] T004 Workload Horizon chart — y-axis 15/10/5/0, dashed gridlines,
      baseline, bars on the 15-units = 108px scale, day labels with today in
      ink, "Daily view" control (§6).
- [X] T005 View tabs — bordered pill group, active `#F1FAD6` (§7).
- [X] T006 Brand group card and the 3-column project grid: icon tile, star,
      kebab, STANDING chip, progress, footer meta and status chip (§8).
- [X] T007 Derive the On track / At risk / Behind status the footer chip needs
      (§8) in `src/lib/projects.ts`.

## Phase 3 — Team tasks (`/team`)

- [X] T008 Header — title with ticks, member chips, card-stack illustration,
      and the Today's progress card with sparkline and delta (§4).
- [X] T009 KPI row — 4 cards with value + unit and per-card fill (§5).
- [X] T010 Filter row — four 48px controls (§6).
- [X] T011 Month label, expanded brand group, project blocks with the left rail
      (§7, §8).
- [X] T012 Task row — checkbox, title, avatar, fixed-width duration and date,
      board pill (§8).
- [X] T013 Collapsed brand group with the equal-total-width segment bar (§9).

## Phase 4 — Validation

- [X] T014 `npm run typecheck` and `npm run build` clean.
- [X] T015 Drive both pages in a browser at 1536 wide: no horizontal overflow,
      every editing and permission behaviour from PR #29/#30 still works.
