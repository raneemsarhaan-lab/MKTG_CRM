# Quickstart Validation Guide: Personal Board — GenZ Redesign

**Feature**: `specs/001-personal-board-genz`
**Date**: 2026-07-15

This guide describes how to validate that the GenZ Personal Board redesign
works end-to-end after implementation. Run these checks in order.

---

## Prerequisites

1. Dev server running: `npm run dev` (defaults to http://localhost:5173)
2. Logged in as **Raneem** (admin user — `raneem@forefront.consulting`)
3. Seed data present in localStorage (cleared + refreshed if stale)

---

## Scenario 1 — Dashboard Loads (US1)

**Steps**:
1. Navigate to the Overview tab (first sidebar icon).
2. Observe the page without clicking anything.

**Expected**:
- Greeting visible: "Good [morning/afternoon/evening], Raneem"
- Four BigStat cards rendered in a 4-column row:
  - Card 1 (danger / red-pink gradient): overdue task count
  - Card 2 (accent / purple gradient): in-progress task count
  - Card 3 (lime / green gradient): published this week count
  - Card 4 (default / amber gradient): capacity percentage
- Dark capacity bar below cards with lime→violet gradient fill
- "My Day" and "Up Next" panels side by side
- No spinner, no loading state

---

## Scenario 2 — Alert Badges (US2)

**Steps**:
1. Find a task in "My Day" whose due date is in the past.
2. Find a task in "Up Next" that is well within SLA.

**Expected**:
- Past-due task shows **Overdue** badge (red background, AlertTriangle icon)
- Within-SLA task shows **On Track** badge (green background, CheckCircle icon)
- Badges are visually distinct with colour + icon + label

**How to force a specific badge** (in browser devtools):

```js
// Force a task to appear overdue
const s = JSON.parse(localStorage.getItem('fluxo-storage'))
s.state.tasks[0].due = '2025-01-01'
localStorage.setItem('fluxo-storage', JSON.stringify(s))
// Reload the page
```

---

## Scenario 3 — Profile Strip & Access Badge (US3)

**Steps**:
1. Observe the profile strip above the stat cards.

**Expected**:
- Current user name displayed in Montserrat bold
- Role "Marketing Manager" displayed in muted colour
- Access badge "Admin" with lime background (`#C3F53D`) and dark text

---

## Scenario 4 — Team Digest + Admin Gate (US3)

**Steps**:
1. Scroll to the team digest section.
2. Observe member cards.
3. Try editing a capacity value.

**Expected** (as admin):
- All team members listed with avatar, name, role, status dot, active task count
- Status dot: lime for Available, coral/red for Busy
- Capacity shows as an editable `<input>` field
- Editing capacity and pressing Enter updates the value (no page reload)

**Steps** (as non-admin):
1. Log out, log in as a User-tier account.
2. Navigate to Overview.

**Expected**:
- Capacity shows as plain text, not an input

---

## Scenario 5 — Task Navigation (US1)

**Steps**:
1. Click any task row in "My Day" or "Up Next".

**Expected**:
- TaskModal opens for the clicked task
- Task name, stage, assignee, comments all visible in the modal
- No console errors

---

## Scenario 6 — Design Token Fidelity (Constitution Article IV)

**Spot-check using browser devtools Computed Styles**:

| Element | Expected colour |
|---------|----------------|
| Page background | `#F7F7F3` or radial-gradient wash |
| Sidebar | `#17181A` |
| Card borders | `#E1E1E0` |
| Stat card 1 gradient | starts at `#FFF0F2` |
| Stat card 3 gradient | starts at `#F4FFD2` |
| Capacity bar bg | `#17181A` |
| Capacity bar fill | `linear-gradient(90deg, #C8F24E, #B79CF5)` |
| "My Day" heading font | Montserrat, weight 700+ |
| Body text | Inter |

---

## Scenario 7 — Empty States

**Steps**:
1. Clear all tasks via Settings or devtools.
2. Return to Overview.

**Expected**:
- "My Day" panel shows empty-state message (not blank, not error)
- "Up Next" panel shows empty-state message
- BigStat cards show `0` values without crashing

---

## Reference

- Component contract: [contracts/component-api.md](contracts/component-api.md)
- Data model: [data-model.md](data-model.md)
- Research decisions: [research.md](research.md)
- Design file: `6c0ca5ca-Fluxo_Personal_Board_GenZ.html`
